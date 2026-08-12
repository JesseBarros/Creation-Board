import type { BoardSummary } from '@shared/wbd';
import { Camera, MAX_ZOOM, MIN_ZOOM } from './core/Camera';
import { Document } from './core/Document';
import { History } from './core/History';
import { Scheduler, type FrameStats } from './core/Scheduler';
import { Selection } from './core/Selection';
import { ViewportInput } from './input/ViewportInput';
import { Renderer, type RenderStats, type RenderTheme } from './render/Renderer';
import { paintRulers, RULER_PX, type RulerTheme } from './render/Rulers';
import { paintPinnedNotes } from './render/PinnedNotes';
import { displayedAs } from './render/colorAdapt';
import { ToolManager } from './tools/ToolManager';
import { ALERT_ICONS, DrawStyle } from './tools/DrawStyle';
import { hasStyle, type EditableObject, type ToolContext, type ToolId } from './tools/types';
import { TextEditor } from './features/text/TextEditor';
import { PatchObjects, RestyleNotes, type NoteStyle } from './commands';
import { snapshotPatch, type ObjectPatch } from './commands/patch';
import type { Rect } from '@shared/geometry/rect';
import { contentHeight, styleOf } from './render/text/layout';
import type { TextObject } from '@shared/model/types';
import { hitTest } from './features/selection/hitTest';
import { BoardClipboard } from './features/selection/clipboard';
import {
  deleteSelection,
  duplicateSelection,
  nudgeSelection,
  reorderSelection,
  selectAll,
} from './features/selection/actions';
import { DebugPanel } from './ui/DebugPanel';
import { SearchBar } from './ui/SearchBar';
import { searchBoard, type SearchHit } from './features/search/search';
import { paintSearchHighlight } from './render/SearchHighlight';
import { ToolBar } from './ui/ToolBar';
import { ViewportBar } from './ui/ViewportBar';
import { ContextMenu, type MenuEntry } from './ui/ContextMenu';
import { Lobby } from './ui/Lobby';
import { ShortcutsModal } from './ui/ShortcutsModal';
import { LayersPanel } from './ui/LayersPanel';
import { dismissBootScreen } from './bootScreen';
import {
  confirmDialog,
  exportDialog,
  promptText,
  toast,
  type ExportChoice,
} from './ui/dialogs';
import {
  exportBounds,
  planTiles,
  renderPng,
  renderPngTile,
  type RenderedPng,
  type TilePlan,
} from './features/export/exportBoard';
import type { ExportPart } from '@shared/ipc-contract';
import { renderSvg } from './features/export/exportSvg';
import {
  applyBoard,
  renderThumbnail,
  serializeBoard,
  usedAssetIds,
} from './features/storage/boardIO';
import { AssetStore } from './features/images/AssetStore';
import { autosaveVerdict } from './features/storage/autosave';
import { imageFilesFrom, insertImages } from './features/images/insert';
import { uncropPatch } from './tools/CropTool';
import type { ImageObject } from '@shared/model/types';
import type { Vec2 } from '@shared/geometry/vec2';
import { importWhiteboardHtml } from './features/import/whiteboard';
import type { ImportReport, ImportSource } from '@shared/importer';
import type { SaveBoardResult } from '@shared/wbd';
import { generateStressBatches } from './dev/stress';
import { resolve as resolveShortcut, type ShortcutId } from './shortcuts';

const THEMES: Record<'light' | 'dark', RenderTheme> = {
  light: { boardBg: '#ffffff', gridColor: '#dde2ea' },
  // No modo escuro o quadro escurece de verdade; as cores das marcas sao
  // adaptadas na exibicao (ver render/colorAdapt.ts). O arquivo guarda sempre a
  // cor original que o autor escolheu.
  dark: { boardBg: '#14161b', gridColor: '#282d38' },
};

/**
 * Cores das reguas. Ficam aqui, e nao no RenderTheme, porque regua e cromo de
 * interface: ela nao pertence ao quadro nem entra na miniatura gravada.
 */
const RULER_THEMES: Record<'light' | 'dark', RulerTheme> = {
  light: { bg: '#f5f7fa', fg: '#667085', line: '#d9dee8', cursor: '#3b6ff0' },
  dark: { bg: '#1d2027', fg: '#8b93a3', line: '#333947', cursor: '#5b87f5' },
};

/** Margem em volta do conteudo exportado, em unidades de mundo. */
const EXPORT_PADDING = 24;

/** Ocioso antes de gravar sozinho, e o teto para quem nao para de desenhar. */
const AUTOSAVE_IDLE_MS = 3_000;
const AUTOSAVE_MAX_MS = 30_000;

const THEME_KEY = 'qb.theme';
const RULERS_KEY = 'qb.rulers';
const DEMO_SEED = 2000;
/** Lote da geracao de carga: grande o bastante para ser eficiente, pequeno o
 *  bastante para a janela repintar entre um e outro. */
const SEED_BATCH = 2500;

type View = 'lobby' | 'board';

/** Estado do quadro aberto no momento. */
interface Session {
  /** Caminho do .wbd, ou null se o quadro ainda nunca foi salvo. */
  path: string | null;
  name: string;
  dirty: boolean;
}

/**
 * Shell da aplicacao: alterna entre o lobby e o quadro, e cuida dos atalhos
 * globais e do ciclo de salvamento.
 */
export class App {
  readonly doc = new Document();
  readonly camera = new Camera();
  readonly assets = new AssetStore();
  readonly selection = new Selection();
  readonly history = new History();
  /** Sobrevive a troca de quadro de proposito: copiar de um e colar noutro. */
  readonly clipboard = new BoardClipboard();
  /** Cor e espessura correntes; e preferencia do usuario, nao conteudo do quadro. */
  readonly drawStyle = new DrawStyle();

  #renderer: Renderer;
  #scheduler: Scheduler;
  #input: ViewportInput;
  #tools: ToolManager;
  #toolCtx: ToolContext;
  #editor: TextEditor;
  #toolbar: ToolBar;
  #bar: ViewportBar;
  #debug: DebugPanel;
  #lobby: Lobby;
  #help: ShortcutsModal;
  #menu: ContextMenu;
  #search: SearchBar;
  #layers: LayersPanel;

  #boardView: HTMLElement;
  #host: HTMLElement;
  #hint: HTMLElement;
  #progress: HTMLElement;
  #theme: 'light' | 'dark';

  #rulers: boolean;
  #view: View = 'lobby';
  #session: Session = { path: null, name: 'Quadro sem nome', dirty: false };
  #saving = false;
  #benchPhase = 0;
  /** O evento `paste` do sistema ja resolveu esta tecla? Ver `#pasteFromKeyboard`. */
  #systemPasteHandled = false;
  #autosaveIdle = 0;
  #autosaveDeadline = 0;

  constructor(root: HTMLElement) {
    root.replaceChildren();
    root.className = 'qb-app';

    // ------------------------------------------------------------ quadro
    this.#boardView = document.createElement('div');
    this.#boardView.className = 'qb-view';
    this.#boardView.hidden = true;

    this.#host = document.createElement('div');
    this.#host.className = 'qb-canvas-host';
    this.#boardView.append(this.#host);

    this.#renderer = new Renderer(this.#host, this.doc, this.camera);
    this.#renderer.resolveImage = (id) => this.assets.bitmap(id);

    this.#hint = document.createElement('div');
    this.#hint.className = 'qb-hint';
    this.#hint.innerHTML =
      '<strong>Quadro vazio.</strong> Escolha a caneta (<kbd>P</kbd>) e desenhe.<br>' +
      'Importe um quadro do Whiteboard pelo lobby, ou use <kbd>F3</kbd> para gerar ' +
      'carga de teste e <kbd>F1</kbd> para ver os atalhos.';
    this.#boardView.append(this.#hint);

    this.#progress = document.createElement('div');
    this.#progress.className = 'qb-progress';
    this.#progress.hidden = true;
    this.#boardView.append(this.#progress);

    this.#bar = new ViewportBar({
      zoomIn: () => this.#zoomCenter(1.25),
      zoomOut: () => this.#zoomCenter(1 / 1.25),
      zoomTo: (z) => this.#setZoomCenter(z),
      fitToContent: () => this.fitToContent(),
      toggleGrid: () => this.toggleGrid(),
      toggleSnap: () => this.toggleSnapToGrid(),
      toggleRulers: () => this.toggleRulers(),
      toggleLayers: () => this.toggleLayers(),
      toggleTheme: () => this.toggleTheme(),
      save: () => void this.save(),
      exportBoard: () => void this.exportBoard(),
      backToLobby: () => void this.goToLobby(),
      showShortcuts: () => this.#help.toggle(),
      undo: () => this.undo(),
      redo: () => this.redo(),
    });
    this.#boardView.append(this.#bar.el);

    this.#toolbar = new ToolBar(
      {
        setTool: (id) => this.setTool(id),
        // A barra fala em nivel de alerta; o objeto guarda nivel e simbolo. A
        // traducao mora aqui para o simbolo sair de um lugar so (DrawStyle).
        warnIfLowContrast: (color) => this.warnIfLowContrast(color),
        toggleTextFormat: (what) => this.toggleTextFormat(what),
        restyleNotes: ({ bg, alert }) =>
          this.restyleSelectedNotes({
            ...(bg !== undefined ? { bg } : {}),
            ...(alert !== undefined
              ? { alert: alert ? { level: alert, icon: ALERT_ICONS[alert] } : null }
              : {}),
          }),
      },
      this.drawStyle,
    );
    this.#boardView.append(this.#toolbar.el);

    this.#search = new SearchBar({
      search: (q) => this.#search.setHits(searchBoard(this.doc, q)),
      goTo: () => this.#focusSearchHit(),
      close: () => this.closeSearch(),
    });
    this.#boardView.append(this.#search.el);

    this.#layers = new LayersPanel({
      // Clicar no nome seleciona MESMO travado: o painel e a unica porta de
      // volta para um objeto que o cadeado tirou do alcance do clique.
      select: (id, add) => {
        if (add) this.selection.toggle(id);
        else this.selection.set([id]);
        this.#scheduler.invalidate();
      },
      setLocked: (id, locked) => this.#patchOne(id, { locked }, locked ? 'Travar' : 'Destravar'),
      setHidden: (id, hidden) => this.#patchOne(id, { hidden }, hidden ? 'Esconder' : 'Mostrar'),
      reorder: (id, dir) => {
        this.selection.set([id]);
        void reorderSelection(this.#toolCtx, dir === 'up' ? 'front' : 'back');
      },
      close: () => this.toggleLayers(),
    });
    this.#boardView.append(this.#layers.root);

    this.#debug = new DebugPanel({
      seed: (n) => void this.seed(n),
      clear: () => this.clearBoard(),
      toggleBenchmark: () => this.toggleBenchmark(),
      isBenchmarking: () => this.#scheduler.continuous,
    });
    this.#boardView.append(this.#debug.el);

    // ------------------------------------------------------------- lobby
    this.#lobby = new Lobby({
      newBoard: () => void this.newBoard(),
      openBoard: (s) => void this.openBoard(s),
      openDemo: () => void this.openDemo(),
      showShortcuts: () => this.#help.toggle(),
      toggleTheme: () => this.toggleTheme(),
      importWhiteboard: () => void this.#pickAndImport(),
    });

    this.#help = new ShortcutsModal();
    this.#menu = new ContextMenu();

    root.append(this.#lobby.el, this.#boardView, this.#help.el, this.#menu.el);

    // ------------------------------------------------------------- setup
    this.#theme = (localStorage.getItem(THEME_KEY) as 'light' | 'dark' | null) ?? 'light';
    this.#rulers = localStorage.getItem(RULERS_KEY) === '1';
    this.#applyTheme();
    this.#bar.setRulers(this.#rulers);
    this.#bar.setSnap(this.doc.prefs.snapToGrid);

    this.#scheduler = new Scheduler(
      () => {
        if (this.#scheduler.continuous) this.#stepBenchmark();
        const stats = this.#renderer.render();
        // O cromo da selecao vai na camada de cima, no mesmo frame: desenhado na
        // camada estatica, ele entraria no cache de conteudo e continuaria
        // aparecendo depois de a selecao mudar.
        this.#paintOverlay();
        return stats;
      },
      // Frame so de overlay: o traco em andamento e o circulo da borracha mudam
      // a cada evento de ponteiro sem tocar em nenhum objeto do documento.
      () => this.#paintOverlay(),
    );

    this.#input = new ViewportInput(
      this.#host,
      this.camera,
      () => this.#onCameraChanged(),
      (e) => this.#openContextMenu(e),
    );

    this.#toolCtx = {
      doc: this.doc,
      camera: this.camera,
      selection: this.selection,
      history: this.history,
      adapt: (color) => this.#renderer.adapt(color),
      invalidate: () => this.#scheduler.invalidate(),
      invalidateOverlay: () => this.#scheduler.invalidateOverlay(),
      markDirty: () => this.#markDirty(),
      beginEdit: (obj, opts) => this.#editor.begin(obj, opts),
      beginCrop: (obj) => this.beginCrop(obj),
    };

    this.#editor = new TextEditor(this.#host, this.#toolCtx, {
      onEditingChanged: (id) => {
        this.#renderer.hiddenId = id;
        this.#scheduler.invalidate();
      },
      // Caixa nova confirmada: a ferramenta volta para a selecao com ela
      // destacada. Continuar no modo texto faria o clique seguinte -- o de quem
      // so quer conferir o resultado -- abrir outra caixa vazia.
      onCreated: (obj) => {
        this.selection.set([obj.id]);
        this.setTool('select');
      },
    });

    this.#tools = new ToolManager(this.#host, this.#toolCtx, this.drawStyle);
    // Atalho de teclado tambem troca a ferramenta; a barra precisa acompanhar.
    this.#tools.onToolChange(() => this.#toolbar.setActive(this.#tools.activeId));

    this.doc.on('objects', () => {
      this.#hint.hidden = this.doc.size > 0;
      // Desfazer uma exclusao (ou refaze-la) nao passa pela selecao: sem podar
      // aqui, o quadro de manipulacao continuaria em volta de objetos que ja
      // sairam do documento.
      this.selection.prune(this.doc);
      this.#refreshLayers();
      this.#scheduler.invalidate();
    });
    this.doc.on('prefs', () => this.#scheduler.invalidate());
    this.selection.onChange(() => {
      this.#refreshLayers();
      this.#scheduler.invalidate();
    });
    this.history.onChange(() => this.#bar.setHistory(this.history.canUndo, this.history.canRedo));

    this.#observeSize();
    this.#bindShortcuts();
    this.#bindImageInput();
    this.#guardUnsavedOnClose();

    // Loop de atualizacao do painel, separado do loop de render: o painel nao
    // deve nem forcar frames nem ser desenhado dentro da medicao.
    const pollStats = (): void => {
      this.#debug.update(this.#scheduler.stats(), this.camera.zoom, performance.now());
      requestAnimationFrame(pollStats);
    };
    requestAnimationFrame(pollStats);

    this.#scheduler.start();

    const params = new URLSearchParams(location.search);
    const bench = params.get('bench');
    const importPath = params.get('import');

    // Os modos de verificacao dispensam a abertura NA HORA, e isso nao e
    // cosmetico: ela cobre a janela inteira (`inset: 0`), entao um evento de
    // ponteiro do auto-teste cairia nela em vez de no canvas, e a foto do
    // QB_SHOT sairia dela em vez do quadro.
    const modoDeVerificacao =
      importPath !== null ||
      params.get('paste') !== null ||
      params.get('export') !== null ||
      params.get('selftest') !== null ||
      bench !== null;
    if (modoDeVerificacao) dismissBootScreen(true);

    if (importPath) {
      this.#enterBoard();
      void import('./dev/importCheck').then((m) =>
        m.runImportCheck(importPath, this, params.get('save') === '1'),
      );
    } else if (params.get('paste')) {
      this.#enterBoard();
      void import('./dev/pasteCheck').then((m) => m.runPasteCheck(this));
    } else if (params.get('export')) {
      this.#enterBoard();
      void import('./dev/exportCheck').then((m) =>
        m.runExportCheck(params.get('export') ?? '', this),
      );
    } else if (params.get('selftest')) {
      // Precisa do quadro montado e medido para os eventos caírem no canvas.
      this.#enterBoard();
      void import('./dev/selftest').then((m) => m.runSelfTest(this.#host, this));
    } else if (bench) {
      void this.#runAutoBenchmark(Number(bench));
    } else {
      // A tela de abertura sai quando a BIBLIOTECA esta listada, e nao quando o
      // JavaScript termina de carregar: ler a pasta e gerar as miniaturas e o
      // trabalho de verdade da abertura, e sumir antes disso mostraria um lobby
      // vazio por um instante -- exatamente o susto que ela existe para evitar.
      //
      // `QB_BOOT=hold` a mantem na tela, para poder ser fotografada com o
      // QB_SHOT. Sem isso ela seria a unica parte da interface que nao se
      // confere por terminal: ela dura 642 ms e some sozinha.
      const segurar = params.get('boot') === 'hold';
      void this.goToLobby().then(() => {
        if (!segurar) dismissBootScreen();
      });
    }
  }

  // ----------------------------------------------------------------- views

  async goToLobby(): Promise<void> {
    if (this.#view === 'board' && !(await this.#confirmDiscard())) return;

    this.#view = 'lobby';
    this.#boardView.hidden = true;
    this.#lobby.el.hidden = false;
    void window.quadro.board.folder().then((p) => this.#lobby.setFolder(p));
    await this.#lobby.refresh();
  }

  #enterBoard(): void {
    this.#view = 'board';
    this.#lobby.el.hidden = true;
    this.#boardView.hidden = false;
    this.#updateTitle();
    // O host estava com display:none e portanto media 0x0; o ResizeObserver so
    // dispara depois. Forcamos a medicao agora para o primeiro frame ja sair certo.
    this.#measure();
    // E pinta AGORA, em vez de esperar o proximo frame de animacao: ate o rAF
    // chegar, as duas camadas ainda tem os pixels do quadro anterior, e e isso
    // que aparecia como "residuo do frame anterior" ao alternar entre o lobby e
    // o quadro. Um frame com o fundo do tema custa nada; o quadro de outra
    // pessoa por um instante custa confianca.
    this.#renderer.render();
    this.#paintOverlay();
  }

  /**
   * Zera o que e especifico do quadro aberto.
   *
   * Historico junto com a selecao de proposito: um passo de undo guarda objetos
   * do quadro anterior, e aplica-lo depois de trocar de quadro ressuscitaria
   * conteudo de outro arquivo dentro deste.
   */
  #resetEditingState(): void {
    // A edicao aberta e descartada, e nao gravada: o objeto que ela edita
    // pertence ao quadro que esta saindo, e gravar agora escreveria num
    // documento que ja foi trocado.
    this.#editor.abort();
    // A busca aponta para objetos deste quadro; mante-la aberta na troca
    // deixaria uma lista de resultados que nao existem mais.
    this.#search.close();
    this.selection.clear();
    this.history.clear();
    this.#tools.cancel();
  }

  async newBoard(): Promise<void> {
    this.doc.clear();
    this.#resetEditingState();
    this.#session = { path: null, name: 'Quadro sem nome', dirty: false };
    this.#enterBoard();
    this.camera.reset(this.#renderer.viewportW, this.#renderer.viewportH);
    this.#onCameraChanged();
  }

  async openBoard(summary: BoardSummary): Promise<void> {
    try {
      const result = await window.quadro.board.load(summary.path);
      // Os assets precisam estar decodificados antes dos objetos entrarem, senao
      // o primeiro frame desenha marcadores no lugar das imagens.
      await this.assets.load(result.assets, result.document.assets);
      applyBoard(this.doc, this.camera, result.document);
      this.#resetEditingState();
      this.#session = { path: result.path, name: result.name, dirty: false };
      this.#enterBoard();
      this.#bar.setZoom(this.camera.zoom);
      this.#onCameraChanged();
    } catch (err) {
      toast(`Nao foi possivel abrir "${summary.name}": ${String(err)}`, 'error');
    }
  }

  /** Quadro de demonstracao, para ter conteudo sem precisar desenhar nada ainda. */
  async openDemo(): Promise<void> {
    this.#session = { path: null, name: 'Demonstracao', dirty: true };
    this.#enterBoard();
    await this.seed(DEMO_SEED, false);
  }

  // -------------------------------------------------------------- conteudo

  /**
   * Gera carga de teste em lotes, cedendo o controle ao navegador entre eles.
   * Sem isso, 50.000 objetos travam a janela por vários segundos.
   */
  async seed(count: number, refit = true): Promise<void> {
    this.doc.clear();
    this.#resetEditingState();
    this.#showProgress(`Gerando ${count.toLocaleString('pt-BR')} objetos…`, 0);

    let done = 0;
    for (const batch of generateStressBatches(count, SEED_BATCH)) {
      this.doc.add(batch);
      done += batch.length;
      this.#showProgress(`Gerando ${count.toLocaleString('pt-BR')} objetos…`, done / count);
      // Devolve o controle ao navegador para ele repintar a barra de progresso.
      await nextFrame();
    }

    this.#hideProgress();
    this.#markDirty();

    if (refit) {
      const b = this.doc.contentBounds();
      if (b) this.camera.fitTo(b, this.#renderer.viewportW, this.#renderer.viewportH);
    } else {
      this.camera.reset(this.#renderer.viewportW, this.#renderer.viewportH);
    }

    this.#scheduler.resetSamples();
    this.#onCameraChanged();
  }

  clearBoard(): void {
    this.doc.clear();
    this.#resetEditingState();
    this.#markDirty();
    this.#scheduler.resetSamples();
    this.#scheduler.invalidate();
  }

  // ------------------------------------------------------------ salvamento

  /**
   * Ctrl+S. Na primeira vez pergunta o nome; depois grava por cima em silencio.
   */
  /**
   * Importa exportacoes do Microsoft Whiteboard, criando um quadro por arquivo.
   *
   * Cada arquivo vira um .wbd salvo direto no disco, e nao um quadro aberto na
   * tela: importar tres resumos de uma vez e a situacao normal, e abrir todos
   * simultaneamente nao faria sentido.
   *
   * `save: false` interpreta sem gravar. Existe para a verificacao automatizada:
   * ela roda a importacao muitas vezes seguidas, e gravando deixava a pasta de
   * quadros do usuario cheia de copias numeradas do mesmo resumo.
   */
  async importWhiteboard(
    sources: readonly ImportSource[],
    { save = true }: { save?: boolean } = {},
  ): Promise<ImportReport[]> {
    const reports: ImportReport[] = [];

    for (const source of sources) {
      if (source.error || !source.html) {
        reports.push(emptyReport(source.name, [source.error ?? 'arquivo vazio']));
        continue;
      }

      // Cada quadro precisa do proprio conjunto de assets, senao imagens de um
      // resumo vazariam para o .wbd de outro.
      this.doc.clear();
      this.assets.clear();
      this.#resetEditingState();

      const result = await importWhiteboardHtml(source.name, source.html, this.assets);
      this.doc.add(result.objects);
      if (result.background) this.doc.setPrefs({ background: result.background });

      const bounds = this.doc.contentBounds();
      if (bounds) {
        this.camera.fitTo(bounds, this.#renderer.viewportW, this.#renderer.viewportH);
        // Sem isto o indicador de zoom continua mostrando o valor anterior.
        this.#onCameraChanged();
      }

      if (save) {
        const saved = await this.#writeBoard(null, source.name);
        if (!saved) result.report.avisos.push('falha ao gravar o arquivo .wbd');
      }
      reports.push(result.report);
    }

    return reports;
  }

  /** Fluxo do botao "Importar do Whiteboard" no lobby. */
  async #pickAndImport(): Promise<void> {
    const sources = await window.quadro.importer.pick();
    if (sources.length === 0) return; // cancelado

    // A importacao precisa do canvas medido para enquadrar e gerar a miniatura,
    // mas o usuario nao deve ver o quadro piscando entre um arquivo e outro.
    const wasLobby = this.#view === 'lobby';
    this.#enterBoard();
    this.#showProgress(`Importando ${sources.length} arquivo(s)…`, 0);

    let reports;
    try {
      reports = await this.importWhiteboard(sources);
    } finally {
      this.#hideProgress();
    }

    // Volta ao lobby: o resultado sao varios quadros, nao um.
    this.doc.clear();
    this.assets.clear();
    this.#resetEditingState();
    this.#session = { path: null, name: 'Quadro sem nome', dirty: false };
    if (wasLobby) await this.goToLobby();

    const total = reports.reduce(
      (n, r) => n + r.textos + r.tracos + r.imagens + r.postits,
      0,
    );
    const falhas = reports.filter((r) => r.avisos.length > 0).length;
    toast(
      falhas > 0
        ? `${reports.length} quadro(s) importados, ${total} objetos — ${falhas} com avisos.`
        : `${reports.length} quadro(s) importados — ${total} objetos.`,
      falhas > 0 ? 'error' : 'ok',
    );
  }

  async save(): Promise<boolean> {
    if (this.#saving) return false;

    let name = this.#session.name;
    if (!this.#session.path) {
      const input = await promptText({
        title: 'Salvar quadro',
        label: 'Nome do quadro',
        value: name === 'Quadro sem nome' ? '' : name,
      });
      if (!input) return false;
      name = input;
    }

    this.#saving = true;
    try {
      const result = await this.#writeBoard(this.#session.path, name);
      if (!result) return false;
      this.#session = { path: result.path, name: result.name, dirty: false };
      this.#updateTitle();
      toast(`"${result.name}" salvo.`);
      return true;
    } finally {
      this.#saving = false;
    }
  }

  /** Grava o estado atual em disco. Devolve null em caso de falha. */
  async #writeBoard(path: string | null, name: string): Promise<SaveBoardResult | null> {
    try {
      const used = usedAssetIds(this.doc);
      const preview = await renderThumbnail(this.doc, THEMES[this.#theme], (id) =>
        this.assets.bitmap(id),
      );
      return await window.quadro.board.save({
        path,
        name,
        document: serializeBoard(this.doc, this.camera, this.assets),
        preview,
        assets: this.assets.serialize(used),
      });
    } catch (err) {
      toast(`Falha ao salvar: ${String(err)}`, 'error');
      return null;
    }
  }

  #markDirty(): void {
    this.#scheduleAutosave();
    if (this.#session.dirty) return;
    this.#session.dirty = true;
    this.#updateTitle();
  }

  // --------------------------------------------------------------- autosave

  /**
   * Salvamento automatico.
   *
   * Duas condicoes, e as duas importam:
   *
   * 1. **So depois do primeiro salvamento manual.** Um quadro sem caminho nao
   *    tem nome, e inventar um encheria a pasta de "Quadro sem nome (3)" toda
   *    vez que alguem rabiscasse para experimentar. Ate o primeiro `Ctrl+S`,
   *    quem protege o trabalho e o aviso ao fechar a janela.
   * 2. **So com o usuario parado.** O gatilho e ocioso (3s sem mexer), com um
   *    teto de 30s para quem desenha sem parar. Gravar no meio de um arraste
   *    disputaria CPU com o gesto -- e o `.wbd` e reescrito por inteiro, nao em
   *    pedacos.
   */
  #scheduleAutosave(): void {
    if (!this.#session.path) return;

    clearTimeout(this.#autosaveIdle);
    this.#autosaveIdle = window.setTimeout(() => void this.#autosave(), AUTOSAVE_IDLE_MS);
    // O teto so e armado uma vez por rajada: rearma-lo a cada alteracao faria
    // ele nunca disparar enquanto o usuario continuasse desenhando.
    if (this.#autosaveDeadline === 0) {
      this.#autosaveDeadline = window.setTimeout(() => void this.#autosave(), AUTOSAVE_MAX_MS);
    }
  }

  async #autosave(): Promise<void> {
    clearTimeout(this.#autosaveIdle);
    clearTimeout(this.#autosaveDeadline);
    this.#autosaveIdle = 0;
    this.#autosaveDeadline = 0;

    const path = this.#session.path;
    const verdict = autosaveVerdict({
      hasPath: path !== null,
      dirty: this.#session.dirty,
      saving: this.#saving,
      editing: this.#editor.isEditing,
    });
    if (verdict === 'nao' || !path) return;
    if (verdict === 'adiar') {
      this.#scheduleAutosave();
      return;
    }

    this.#saving = true;
    try {
      const result = await this.#writeBoard(path, this.#session.name);
      if (!result) return; // `#writeBoard` ja avisou
      this.#session = { path: result.path, name: result.name, dirty: false };
      this.#updateTitle();
      this.#bar.setAutosaved(new Date());
    } finally {
      this.#saving = false;
    }
  }

  /**
   * Declara que nao ha nada a gravar.
   *
   * Usado pelo auto-teste: o que ele deixa na tela e cenario descartavel, e com
   * o quadro marcado como sujo o guarda de `beforeunload` recusa o fechamento --
   * `app.quit()` nao surte efeito e a execucao automatizada fica pendurada
   * esperando alguem clicar no X.
   */
  markClean(): void {
    if (!this.#session.dirty) return;
    this.#session.dirty = false;
    this.#updateTitle();
  }

  #updateTitle(): void {
    this.#bar.setBoardName(this.#session.name, this.#session.dirty);
    // A barra de titulo da janela fica FIXA em "Creation Board".
    //
    // Ate 12/08/2026 ela carregava o nome do quadro e o ponto de alteracoes nao
    // salvas -- e o resultado era a identidade do aplicativo trocando a cada
    // arquivo aberto, com titulos longos ("Continuacao cybersec google
    // coursera(curso 4,5,6,7,8,9) — Creation Board") empurrando o nome do app
    // para fora da barra de tarefas.
    //
    // Nada se perde: o nome do quadro e o ponto de sujeira continuam na barra
    // inferior, que e onde se olha enquanto se trabalha. A barra de titulo passa
    // a responder so "que aplicativo e este", que e a pergunta dela.
    document.title = 'Creation Board';
  }

  /** Pergunta antes de descartar alteracoes nao salvas. */
  async #confirmDiscard(): Promise<boolean> {
    if (!this.#session.dirty || this.doc.size === 0) return true;
    const ok = await confirmDialog({
      title: 'Alteracoes nao salvas',
      message: `"${this.#session.name}" tem alteracoes que ainda nao foram gravadas. Sair mesmo assim?`,
      confirmLabel: 'Descartar',
      cancelLabel: 'Continuar aqui',
      danger: true,
    });
    return ok;
  }

  #guardUnsavedOnClose(): void {
    // Aviso do proprio navegador ao fechar a janela. O dialogo nativo do
    // Electron entra na Fase 8, junto com o autosave.
    window.addEventListener('beforeunload', (e) => {
      if (!this.#session.dirty || this.doc.size === 0) return;
      e.preventDefault();
      e.returnValue = '';
    });
  }

  // ----------------------------------------------------------------- visao

  fitToContent(): void {
    const b = this.doc.contentBounds();
    if (!b) return;
    this.camera.fitTo(b, this.#renderer.viewportW, this.#renderer.viewportH);
    this.#onCameraChanged();
  }

  toggleGrid(): void {
    this.doc.setPrefs({ grid: { ...this.doc.prefs.grid, enabled: !this.doc.prefs.grid.enabled } });
    this.#bar.setGridEnabled(this.doc.prefs.grid.enabled);
  }

  /**
   * Grade magnetica. E preferencia do QUADRO, e nao do app: um resumo desenhado
   * a mao livre e um diagrama de caixas querem coisas diferentes, e o `.wbd` ja
   * guardava esse campo desde a Fase 1.
   *
   * As guias de alinhamento entre objetos nao dependem disto -- elas estao
   * sempre ligadas, e o Ctrl durante o arraste e que as desliga.
   */
  toggleSnapToGrid(): void {
    this.doc.setPrefs({ snapToGrid: !this.doc.prefs.snapToGrid });
    this.#bar.setSnap(this.doc.prefs.snapToGrid);
    this.#markDirty();
  }

  toggleRulers(): void {
    this.#rulers = !this.#rulers;
    localStorage.setItem(RULERS_KEY, this.#rulers ? '1' : '0');
    this.#bar.setRulers(this.#rulers);
    this.#scheduler.invalidateOverlay();
  }

  /** Alterna a unidade das reguas entre px e cm. */
  toggleRulerUnit(): void {
    this.doc.setPrefs({ unit: this.doc.prefs.unit === 'px' ? 'cm' : 'px' });
    this.#scheduler.invalidateOverlay();
  }

  toggleTheme(): void {
    this.#theme = this.#theme === 'light' ? 'dark' : 'light';
    localStorage.setItem(THEME_KEY, this.#theme);
    this.#applyTheme();
    this.#scheduler.invalidate();
  }

  toggleBenchmark(): void {
    const next = !this.#scheduler.continuous;
    this.#scheduler.resetSamples();
    this.#scheduler.setContinuous(next);
  }

  #applyTheme(): void {
    document.documentElement.dataset['theme'] = this.#theme;
    this.#renderer.theme = THEMES[this.#theme];
    this.#bar.setGridEnabled(this.doc.prefs.grid.enabled);
    // Os dois interruptores de tema mostram o PROXIMO tema, e por isso trocam de
    // glifo junto. O do lobby existe separado porque o lobby nao tem a barra.
    this.#bar.setTheme(this.#theme);
    this.#lobby.setTheme(this.#theme);
  }

  #zoomCenter(factor: number): void {
    this.camera.zoomAt({ x: this.#renderer.viewportW / 2, y: this.#renderer.viewportH / 2 }, factor);
    this.#onCameraChanged();
  }

  #setZoomCenter(zoom: number): void {
    this.camera.setZoomAt({ x: this.#renderer.viewportW / 2, y: this.#renderer.viewportH / 2 }, zoom);
    this.#onCameraChanged();
  }

  #onCameraChanged(): void {
    this.#bar.setZoom(this.camera.zoom);
    this.#scheduler.invalidate();
  }

  // ------------------------------------------------------- selecao e edicao

  #paintOverlay(): void {
    // A caixa em edicao e um elemento HTML, e nao pixel do canvas: quem a move
    // com o quadro e este acerto de posicao, no mesmo frame do resto.
    this.#editor.sync();

    const ctx = this.#renderer.beginOverlayScreen();
    this.#tools.paintOverlay(ctx, this.camera);
    // O destaque da busca nao depende da ferramenta ativa: procurar no meio de
    // um desenho nao deve obrigar a trocar para a selecao so para ver o achado.
    paintSearchHighlight(ctx, this.camera, this.#searchBbox());
    paintPinnedNotes(
      ctx,
      this.doc,
      this.camera,
      this.#renderer.viewportW,
      this.#renderer.viewportH,
      this.#rulers ? RULER_PX : 0,
    );
    // As reguas vao por ULTIMO: elas sao a moldura da janela, e um traco em
    // andamento passando por cima delas as faria parecer parte do quadro.
    if (this.#rulers) {
      paintRulers(
        ctx,
        this.camera,
        this.#renderer.viewportW,
        this.#renderer.viewportH,
        this.doc.prefs.unit,
        this.#tools.cursorWorld,
        RULER_THEMES[this.#theme],
      );
    }
  }

  /** AABB do resultado destacado, ou null quando a busca esta fechada. */
  #searchBbox(): Rect | null {
    const hit = this.#search.isOpen ? this.#search.current : null;
    return hit ? (this.doc.get(hit.id)?.bbox ?? null) : null;
  }

  // ------------------------------------------------------------- exportacao

  /**
   * Exporta o quadro (ou a selecao) para PNG, SVG ou PDF.
   *
   * Nao entra nada de cromo: regua, alcas, guias, destaque de busca e ficha de
   * post-it fixado sao respostas do app a quem edita, e nao conteudo do quadro.
   */
  async exportBoard(): Promise<void> {
    if (this.doc.size === 0) {
      toast('O quadro esta vazio: nao ha o que exportar.', 'error');
      return;
    }

    // O resumo do dialogo (B13) refaz este calculo a cada clique, por isso ele e
    // uma funcao e nao um valor: escala, formato e "o que exportar" mudam o
    // resultado, e o numero mostrado tem de ser o do estado atual.
    const planFor = (c: ExportChoice): TilePlan | null => {
      const alvo = c.scope === 'selection' ? this.selection.ids() : [];
      const r = exportBounds(this.doc, alvo);
      if (!r || r.w <= 0 || r.h <= 0) return null;
      return planTiles(r, EXPORT_PADDING, c.scale);
    };

    const choice = await exportDialog({
      hasSelection: this.selection.size > 0,
      preview: (c) => {
        const plan = planFor(c);
        if (!plan) return null;
        // O PDF e uma pagina: nao ha onde por o segundo ladrilho, entao ele
        // continua cedendo escala. O PNG nao cede mais.
        if (c.format === 'pdf') {
          const unico = planFor({ ...c, scale: 1 });
          if (!unico) return null;
          const cabe = plan.cols * plan.rows === 1;
          const escala = cabe ? c.scale : c.scale / Math.sqrt(plan.cols * plan.rows);
          return {
            width: Math.round(unico.width * escala),
            height: Math.round(unico.height * escala),
            files: 1,
            scale: escala,
          };
        }
        return {
          width: plan.width,
          height: plan.height,
          files: plan.cols * plan.rows,
          scale: plan.scale,
        };
      },
    });
    if (!choice) return;

    const ids = choice.scope === 'selection' ? this.selection.ids() : [];
    const area = exportBounds(this.doc, ids);
    if (!area || area.w <= 0 || area.h <= 0) {
      toast('Nao foi possivel medir a area a exportar.', 'error');
      return;
    }

    const theme = THEMES[this.#theme];
    const background = choice.background ? theme.boardBg : null;
    const name = this.#session.name === 'Quadro sem nome' ? 'quadro' : this.#session.name;

    this.#showProgress(`Exportando ${choice.format.toUpperCase()}…`, 0.4);
    try {
      let data: Uint8Array;
      let widthPx: number | undefined;
      let heightPx: number | undefined;
      let aviso = '';
      let parts: ExportPart[] | undefined;

      if (choice.format === 'png') {
        // PNG honra a escala pedida, custe quantos arquivos custar (B13). O
        // quadro dele daria 1,6 gigapixel a 1x -- nao existe imagem unica para
        // isso, e reduzir calado era o defeito.
        const plan = planTiles(area, EXPORT_PADDING, choice.scale);
        const total = plan.cols * plan.rows;
        const tiles: RenderedPng[] = [];
        for (let row = 0; row < plan.rows; row++) {
          for (let col = 0; col < plan.cols; col++) {
            this.#showProgress(
              total > 1 ? `Exportando PNG… ladrilho ${tiles.length + 1} de ${total}` : 'Exportando PNG…',
              (tiles.length + 1) / (total + 1),
            );
            // Devolve o controle ao navegador entre ladrilhos: sem isto, uma
            // grade grande congela a janela e a barra de progresso nunca aparece.
            await new Promise((r) => setTimeout(r, 0));
            tiles.push(await renderPngTile(this.doc, this.assets, ids, {
              scale: plan.scale,
              padding: EXPORT_PADDING,
              background,
              theme,
            }, plan, col, row));
          }
        }

        data = tiles[0]!.bytes;
        widthPx = tiles[0]!.width;
        heightPx = tiles[0]!.height;
        if (total > 1) {
          // O sufixo e `-l<linha>c<coluna>`, com base 1: `-l2c3` e a segunda
          // linha, terceira coluna. Ordenar por nome ja remonta a grade.
          parts = tiles.slice(1).map((t, i) => {
            const idx = i + 1;
            return {
              data: t.bytes.slice().buffer,
              suffix: `-l${Math.floor(idx / plan.cols) + 1}c${(idx % plan.cols) + 1}`,
            };
          });
          aviso = ` — ${total} arquivos, a ${choice.scale}x`;
        }
      } else if (choice.format === 'svg') {
        const svg = renderSvg(this.doc, this.assets, area, ids, {
          padding: EXPORT_PADDING,
          background,
          // As marcas sao adaptadas contra o fundo QUE VAI PARA O ARQUIVO. Num
          // SVG transparente, o fundo de referencia continua sendo o do tema:
          // e sobre ele que o quadro foi desenhado.
          adaptAgainst: background ?? theme.boardBg,
        });
        data = new TextEncoder().encode(svg);
      } else {
        // PDF: uma pagina, entao a escala continua cedendo ao teto de pixels --
        // nao ha onde por o segundo ladrilho. O dialogo ja disse isso.
        const png = await renderPng(this.doc, this.assets, area, ids, {
          scale: choice.scale,
          padding: EXPORT_PADDING,
          // Um PDF transparente e branco na pratica; deixar o fundo do tema
          // evita um arquivo que parece certo na tela e sai errado no papel.
          background: background ?? theme.boardBg,
          theme,
        });
        data = png.bytes;
        widthPx = png.width;
        heightPx = png.height;
        if (png.scale < choice.scale - 0.001) {
          aviso = ` (uma pagina so cabe ${png.scale.toFixed(2)}x; para ${choice.scale}x, exporte em PNG)`;
        }
      }

      const result = await window.quadro.exporter.save({
        name,
        format: choice.format,
        // `slice()` desanexa a visao do buffer original: o canal estruturado
        // transfere um ArrayBuffer inteiro, e mandar a visao levaria junto o
        // que estiver ao redor dela.
        data: data.slice().buffer,
        ...(widthPx !== undefined ? { widthPx, heightPx } : {}),
        ...(parts ? { parts, suffix: '-l1c1' } : {}),
      });

      if (result.path) {
        toast(`Exportado para ${result.path}${aviso}`);
      }
    } catch (err) {
      toast(`Falha ao exportar: ${String(err)}`, 'error');
    } finally {
      this.#hideProgress();
    }
  }

  // --------------------------------------------------------------- imagens

  /**
   * Insere arquivos de imagem no ponto indicado (ou no centro da tela).
   *
   * Assincrono porque decodificar imagem grande fora da thread principal e o
   * que evita a janela travar; quem chama nao precisa esperar.
   */
  async insertImageFiles(files: readonly File[], at?: Vec2): Promise<void> {
    if (files.length === 0) return;
    const world =
      at ??
      this.#tools.cursorWorld ??
      this.camera.screenToWorld({
        x: this.#renderer.viewportW / 2,
        y: this.#renderer.viewportH / 2,
      });

    const { objects, rejected } = await insertImages(this.#toolCtx, this.assets, files, world);
    if (objects.length > 0 && this.#tools.activeId !== 'select') this.setTool('select');
    if (rejected.length > 0) {
      toast(
        rejected.length === files.length
          ? `Nao foi possivel inserir: ${rejected.map((r) => r.name).join(', ')}`
          : `${rejected.length} arquivo(s) recusado(s): ${rejected.map((r) => r.name).join(', ')}`,
        'error',
      );
    }
  }

  /** Abre o recorte sobre uma imagem. Duplo clique ou menu de contexto. */
  beginCrop(obj: ImageObject): void {
    if (obj.locked) return;
    this.setTool('crop');
    this.#tools.crop.begin(obj);
  }

  /** Confirma o recorte em curso e volta para a selecao. */
  commitCrop(): void {
    if (this.#tools.activeId !== 'crop') return;
    this.#tools.crop.commit();
    this.setTool('select');
  }

  get isCropping(): boolean {
    return this.#tools.activeId === 'crop' && this.#tools.crop.targetId !== null;
  }

  /** Devolve a imagem selecionada ao arquivo inteiro. */
  removeCrop(): void {
    const alvos = this.selection
      .objects(this.doc)
      .filter((o): o is ImageObject => o.type === 'image' && !o.locked && o.crop !== undefined);
    if (alvos.length === 0) return;

    const before = new Map<string, ObjectPatch>();
    const after = new Map<string, ObjectPatch>();
    for (const obj of alvos) {
      const patch = uncropPatch(obj);
      if (!patch) continue;
      before.set(obj.id, patch.before);
      after.set(obj.id, patch.after);
    }
    if (after.size === 0) return;

    this.history.push(new PatchObjects(this.doc, before, after, 'Remover recorte'));
    this.history.seal();
    this.#markDirty();
    this.#scheduler.invalidate();
  }

  // ------------------------------------------------------------------ busca

  /** `Ctrl+F`. Reabrir com a busca ja aberta apenas devolve o foco ao campo. */
  openSearch(): void {
    this.#search.open();
    this.#scheduler.invalidateOverlay();
  }

  closeSearch(): void {
    this.#search.close();
    this.#scheduler.invalidateOverlay();
    // O foco volta para o quadro, senao a proxima tecla continuaria caindo num
    // campo de texto invisivel e nenhum atalho responderia.
    this.#host.focus({ preventScroll: true });
  }

  get isSearchOpen(): boolean {
    return this.#search.isOpen;
  }

  /** Resultado destacado no momento, ou null. Usado pelo autoteste. */
  get searchHit(): SearchHit | null {
    return this.#search.isOpen ? this.#search.current : null;
  }

  /** Anda pelos resultados sem passar pelo campo de texto. */
  stepSearch(direction: 1 | -1): void {
    this.#search.step(direction);
  }

  /**
   * Leva a camera ate o resultado atual.
   *
   * O zoom vai para 100%, ou para o que fizer o objeto caber -- o que for MENOR.
   * Manter o zoom de onde se estava resolveria "centralizar" e nao "encontrar":
   * num quadro visto a 8%, o resultado chegaria centralizado e ilegivel.
   */
  #focusSearchHit(): void {
    const hit = this.#search.current;
    const obj = hit ? this.doc.get(hit.id) : undefined;
    if (!obj) return;

    const b = obj.bbox;
    const vw = this.#renderer.viewportW;
    const vh = this.#renderer.viewportH;
    const pad = 80;
    const fit = Math.min((vw - pad * 2) / Math.max(b.w, 1), (vh - pad * 2) / Math.max(b.h, 1));
    const zoom = Math.min(1, fit);

    this.camera.zoom = zoom;
    this.camera.x = b.x + b.w / 2 - vw / 2 / zoom;
    this.camera.y = b.y + b.h / 2 - vh / 2 / zoom;

    // Selecionar junto deixa o resultado pronto para `Delete`, `Ctrl+C` ou uma
    // arrastada -- achar quase sempre e o passo anterior a mexer.
    this.selection.set([obj.id]);
    this.#onCameraChanged();
  }

  /**
   * Abre para edicao o objeto selecionado, se ele for de texto.
   *
   * E o caminho de teclado (`F2`, `Enter`) para quem chegou ate a caixa pelas
   * setas ou pelo laco e nao quer voltar ao mouse.
   */
  editSelection(): boolean {
    if (this.selection.size !== 1) return false;
    const obj = this.selection.objects(this.doc)[0];
    if (!obj || (obj.type !== 'text' && obj.type !== 'note') || obj.locked) return false;
    this.#editor.begin(obj as EditableObject);
    return true;
  }

  get isEditingText(): boolean {
    return this.#editor.isEditing;
  }

  /**
   * Objeto que a edicao substituiu no canvas, ou null.
   *
   * Exposto porque e estado observavel do quadro -- e o que o autoteste usa para
   * conferir que a caixa em edicao nao esta sendo desenhada duas vezes.
   */
  get editingObjectId(): string | null {
    return this.#renderer.hiddenId;
  }

  /**
   * Aplica papel ou alerta aos post-its selecionados.
   *
   * Silencioso quando nao ha post-it na selecao: os mesmos botoes servem para
   * escolher como sera o PROXIMO post-it, e nesse uso nao ha o que reestilizar.
   */
  restyleSelectedNotes(style: NoteStyle): void {
    const ids = this.selection
      .objects(this.doc)
      .filter((o) => o.type === 'note' && !o.locked)
      .map((o) => o.id);
    if (ids.length === 0) return;

    this.history.push(new RestyleNotes(this.doc, ids, style));
    this.history.seal();
    this.#markDirty();
    this.#scheduler.invalidate();
  }

  /**
   * Negrito, italico e sublinhado pelos botoes da barra.
   *
   * Dois destinos, conforme o que esta acontecendo:
   *
   * - **digitando**: vale para a selecao dentro da caixa, e quem aplica e o
   *   proprio navegador (`execCommand`), o mesmo caminho do `Ctrl+B`;
   * - **com uma caixa selecionada**: vale para a caixa inteira.
   *
   * Sem o segundo caso, o botao ficaria inerte justamente quando a pessoa
   * acabou de clicar num texto para muda-lo.
   */
  toggleTextFormat(what: 'bold' | 'italic' | 'underline'): void {
    if (this.#editor.isEditing) {
      document.execCommand(what);
      return;
    }

    const alvos = this.selection
      .objects(this.doc)
      .filter((o): o is TextObject => o.type === 'text' && !o.locked);
    if (alvos.length === 0) return;

    const before = new Map<string, ObjectPatch>();
    const after = new Map<string, ObjectPatch>();
    for (const obj of alvos) {
      // Se TUDO ja esta formatado, o botao tira; senao, aplica em tudo. E a
      // mesma regra do negrito de qualquer editor.
      const todos = obj.content.every((s) => s[what] === true);
      const content = obj.content.map((s) => ({ ...s, [what]: !todos }));
      before.set(obj.id, { content: obj.content, h: obj.h });
      after.set(obj.id, {
        content,
        h: obj.autoHeight ? contentHeight(content, styleOf(obj)) : obj.h,
      });
    }

    this.history.push(new PatchObjects(this.doc, before, after, 'Formatar texto'));
    this.history.seal();
    this.#markDirty();
    this.#scheduler.invalidate();
  }

  /**
   * Avisa quando a cor escolhida a mao nao vai aparecer como escolhida.
   *
   * A pergunta util nao e "ela some?" -- o adaptador de tema impede isso --, e
   * sim "ela vai ser exibida diferente?". Um cinza bem claro e resgatado por
   * inversao e aparece escuro; descobrir isso ao trocar de tema, dias depois,
   * seria pior que ler um aviso agora. Avisa e nao impede: a paleta e conferida
   * por `npm run check:colors`, mas a escolha livre e dele.
   */
  warnIfLowContrast(color: string): void {
    const trocada = (['light', 'dark'] as const).filter(
      (t) => displayedAs(color, THEMES[t].boardBg).toLowerCase() !== color.toLowerCase(),
    );
    if (trocada.length === 0) return;

    const onde =
      trocada.length === 2
        ? 'nos dois temas'
        : trocada[0] === 'light'
          ? 'no tema claro'
          : 'no tema escuro';
    const exibida = displayedAs(color, THEMES[trocada[0]!].boardBg);
    toast(
      `${color} tem contraste baixo ${onde} e sera exibida como ${exibida}, para nao sumir.`,
      'error',
    );
  }

  /**
   * Liga ou desliga marcadores de lista nas caixas de texto selecionadas.
   *
   * Mexe na altura junto: o marcador recua o texto, o recuo estreita a coluna e
   * a coluna mais estreita quebra em mais linhas. Trocar so a chave da lista
   * deixaria a caixa curta demais para o proprio conteudo.
   */
  toggleBulletList(): void {
    const alvos = this.selection
      .objects(this.doc)
      .filter((o): o is TextObject => o.type === 'text' && !o.locked);
    if (alvos.length === 0) return;

    const ligar = alvos.some((o) => o.list === 'none');
    const before = new Map<string, ObjectPatch>();
    const after = new Map<string, ObjectPatch>();
    for (const obj of alvos) {
      const list = ligar ? ('bullet' as const) : ('none' as const);
      before.set(obj.id, { list: obj.list, h: obj.h });
      after.set(obj.id, {
        list,
        h: obj.autoHeight ? contentHeight(obj.content, { ...styleOf(obj), list }) : obj.h,
      });
    }

    this.history.push(
      new PatchObjects(this.doc, before, after, ligar ? 'Marcadores' : 'Sem marcadores'),
    );
    this.history.seal();
    this.#markDirty();
    this.#scheduler.invalidate();
  }

  /** Fixa ou solta os post-its selecionados; ver render/PinnedNotes.ts. */
  togglePinSelectedNotes(): void {
    const notes = this.selection.objects(this.doc).filter((o) => o.type === 'note' && !o.locked);
    if (notes.length === 0) return;
    // Se algum ainda nao esta fixado, o comando fixa todos -- assim o botao faz
    // o que o rotulo promete mesmo com a selecao misturada.
    const pinned = notes.every((o) => o.type === 'note' && o.pinned);
    this.history.push(
      new RestyleNotes(
        this.doc,
        notes.map((o) => o.id),
        { pinned: !pinned },
        pinned ? 'Desafixar post-it' : 'Fixar post-it',
      ),
    );
    this.history.seal();
    this.#markDirty();
    this.#scheduler.invalidate();
  }

  // --------------------------------------------------------------- camadas

  /** Abre ou fecha o painel de camadas (M8). */
  toggleLayers(): void {
    this.#layers.toggle();
    this.#bar.setLayers(this.#layers.open);
    this.#refreshLayers();
  }

  get layersOpen(): boolean {
    return this.#layers.open;
  }

  /**
   * Realimenta o painel com o que esta no viewport.
   *
   * Sai barato quando o painel esta fechado, e isso importa: este metodo e
   * chamado a cada mudanca de documento e de selecao, que sao os eventos mais
   * frequentes do app.
   */
  #refreshLayers(): void {
    if (!this.#layers.open) return;
    const view = this.camera.viewportRect(this.#renderer.viewportW, this.#renderer.viewportH);
    this.#layers.render(this.doc.queryVisible(view), new Set(this.selection.ids()));
  }

  /**
   * Muda um campo de um objeto so, com undo.
   *
   * Passa pelo `PatchObjects` como qualquer outra edicao -- ver a decisao 18 do
   * RETOMAR. Travar e esconder nao merecem comando proprio: sao mudanca de
   * campo, e o comando generico ja existe.
   */
  #patchOne(id: string, patch: ObjectPatch, rotulo: string): void {
    const obj = this.doc.get(id);
    if (!obj) return;
    const antes = new Map([[id, snapshotPatch(obj, patch)]]);
    const depois = new Map([[id, patch]]);
    this.history.push(new PatchObjects(this.doc, antes, depois, rotulo));
    this.history.seal();
    this.#markDirty();
    this.#refreshLayers();
    this.#scheduler.invalidate();
  }

  /** Troca a ferramenta ativa, pelo botao da barra ou pelo atalho. */
  setTool(id: ToolId): void {
    this.#tools.setActive(id);
    this.#toolbar.setActive(id);
  }

  get activeTool(): ToolId {
    return this.#tools.activeId;
  }

  get rulersEnabled(): boolean {
    return this.#rulers;
  }

  /**
   * `[` e `]`: um degrau de espessura na ferramenta ativa.
   *
   * Nao faz nada com a selecao ou a borracha ativas -- a alternativa seria
   * mudar em silencio a espessura de uma ferramenta que nao esta a vista.
   */
  stepStrokeWidth(direction: -1 | 1): void {
    const id = this.#tools.activeId;
    if (!hasStyle(id)) return;
    this.drawStyle.stepWidth(id, direction);
  }

  undo(): void {
    if (!this.history.undo()) return;
    this.#markDirty();
    this.#scheduler.invalidate();
  }

  redo(): void {
    if (!this.history.redo()) return;
    this.#markDirty();
    this.#scheduler.invalidate();
  }

  copySelection(): void {
    this.clipboard.copy(this.selection.objects(this.doc), this.assets);
  }

  cutSelection(): void {
    this.clipboard.cut(this.#toolCtx, this.assets);
  }

  /**
   * Cola onde o cursor esta. Se ele ainda nao passou pelo quadro -- colar logo
   * depois de abrir o arquivo, por teclado -- cai no centro da tela, que e o
   * unico ponto que com certeza esta a vista.
   */
  async pasteClipboard(): Promise<void> {
    const at =
      this.#tools.cursorWorld ??
      this.camera.screenToWorld({
        x: this.#renderer.viewportW / 2,
        y: this.#renderer.viewportH / 2,
      });
    await this.clipboard.paste(this.#toolCtx, this.assets, at);
  }

  /** Esc: primeiro aborta o gesto em curso, so depois limpa a selecao. */
  #escape(): void {
    if (this.#menu.isOpen) {
      this.#menu.hide();
      return;
    }
    if (this.#search.isOpen) {
      this.closeSearch();
      return;
    }
    // Recorte aberto: Esc descarta e devolve a imagem como estava. O gesto ja
    // esta todo na ferramenta, entao basta cancelar e voltar para a selecao.
    if (this.isCropping) {
      this.#tools.cancel();
      this.setTool('select');
      return;
    }
    if (this.#tools.cancel()) return;
    this.selection.clear();
  }

  #openContextMenu(e: MouseEvent): void {
    if (this.#view !== 'board') return;

    const rect = this.#host.getBoundingClientRect();
    const world = this.camera.screenToWorld({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    // Clicar com o direito fora da selecao passa a selecao para o que esta sob
    // o cursor. Sem isso o menu agiria sobre algo que o usuario talvez nem
    // esteja vendo -- e "Excluir" seria uma surpresa desagradavel.
    const hit = hitTest(this.doc, world, this.camera.zoom);
    if (hit && !this.selection.has(hit.id)) this.selection.set([hit.id]);
    else if (!hit) this.selection.clear();

    const n = this.selection.size;
    const nada = n === 0;
    const selecionados = this.selection.objects(this.doc);
    const editavel =
      n === 1 && (selecionados[0]?.type === 'text' || selecionados[0]?.type === 'note');
    const notas = selecionados.filter((o) => o.type === 'note');
    const todosFixados = notas.length > 0 && notas.every((o) => o.type === 'note' && o.pinned);
    // Recortar age sobre UMA imagem: o gesto e um retangulo sobre um objeto, e
    // nao existe recorte comum a duas fotos de tamanhos diferentes.
    const imagem =
      n === 1 && selecionados[0]?.type === 'image' && !selecionados[0].locked
        ? selecionados[0]
        : null;

    const entries: MenuEntry[] = [
      ...(editavel
        ? ([
            {
              label: 'Editar texto',
              hint: 'F2',
              onSelect: () => this.editSelection(),
            },
            ...(selecionados[0]?.type === 'text'
              ? [
                  {
                    label:
                      selecionados[0].list === 'bullet'
                        ? 'Tirar os marcadores'
                        : 'Lista com marcadores',
                    onSelect: () => this.toggleBulletList(),
                  },
                ]
              : []),
            'separator',
          ] as MenuEntry[])
        : []),
      ...(notas.length > 0
        ? ([
            {
              label: todosFixados ? 'Desafixar da tela' : 'Fixar na tela',
              onSelect: () => this.togglePinSelectedNotes(),
            },
            'separator',
          ] as MenuEntry[])
        : []),
      ...(imagem
        ? ([
            {
              label: 'Recortar imagem',
              hint: 'Duplo clique',
              onSelect: () => this.beginCrop(imagem),
            },
            ...(imagem.crop
              ? [{ label: 'Remover recorte', onSelect: () => this.removeCrop() }]
              : []),
            'separator',
          ] as MenuEntry[])
        : []),
      {
        label: 'Desfazer',
        hint: 'Ctrl+Z',
        disabled: !this.history.canUndo,
        onSelect: () => this.undo(),
      },
      {
        label: 'Refazer',
        hint: 'Ctrl+Shift+Z',
        disabled: !this.history.canRedo,
        onSelect: () => this.redo(),
      },
      'separator',
      {
        label: 'Copiar',
        hint: 'Ctrl+C',
        disabled: nada,
        onSelect: () => this.copySelection(),
      },
      {
        label: 'Recortar',
        hint: 'Ctrl+X',
        disabled: nada,
        onSelect: () => this.cutSelection(),
      },
      {
        label: 'Colar aqui',
        hint: 'Ctrl+V',
        disabled: this.clipboard.isEmpty,
        onSelect: () => void this.clipboard.paste(this.#toolCtx, this.assets, world),
      },
      {
        label: 'Duplicar',
        hint: 'Ctrl+D',
        disabled: nada,
        onSelect: () => void duplicateSelection(this.#toolCtx),
      },
      {
        label: 'Trazer para frente',
        hint: 'Ctrl+Shift+]',
        disabled: nada,
        onSelect: () => void reorderSelection(this.#toolCtx, 'front'),
      },
      {
        label: 'Enviar para tras',
        hint: 'Ctrl+Shift+[',
        disabled: nada,
        onSelect: () => void reorderSelection(this.#toolCtx, 'back'),
      },
      'separator',
      {
        label: 'Selecionar tudo',
        hint: 'Ctrl+A',
        disabled: this.doc.size === 0,
        onSelect: () => selectAll(this.#toolCtx),
      },
      {
        label: n > 1 ? `Excluir ${n} objetos` : 'Excluir',
        hint: 'Delete',
        danger: true,
        disabled: nada,
        onSelect: () => void deleteSelection(this.#toolCtx),
      },
    ];

    this.#menu.show(e.clientX, e.clientY, entries);
    this.#scheduler.invalidate();
  }

  // -------------------------------------------------------------- progresso

  #showProgress(label: string, ratio: number): void {
    this.#progress.hidden = false;
    this.#progress.innerHTML = '';
    const text = document.createElement('span');
    text.className = 'qb-progress__label';
    text.textContent = `${label} ${Math.round(ratio * 100)}%`;
    const track = document.createElement('div');
    track.className = 'qb-progress__track';
    const fill = document.createElement('div');
    fill.className = 'qb-progress__fill';
    fill.style.width = `${ratio * 100}%`;
    track.append(fill);
    this.#progress.append(text, track);
  }

  #hideProgress(): void {
    this.#progress.hidden = true;
  }

  // -------------------------------------------------------------- medicao

  #stepBenchmark(): void {
    const b = this.doc.contentBounds();
    if (!b) return;
    this.#benchPhase += 0.006;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const ampX = Math.max(0, b.w / 2 - this.#renderer.viewportW / this.camera.zoom / 2);
    const ampY = Math.max(0, b.h / 2 - this.#renderer.viewportH / this.camera.zoom / 2);
    this.camera.x =
      cx + Math.sin(this.#benchPhase) * ampX - this.#renderer.viewportW / this.camera.zoom / 2;
    this.camera.y =
      cy + Math.sin(this.#benchPhase * 0.7) * ampY - this.#renderer.viewportH / this.camera.zoom / 2;
  }

  async #runAutoBenchmark(count: number): Promise<void> {
    this.#enterBoard();
    await this.seed(count);
    const results: string[] = [];

    const phases: Array<{ nome: string; setup: () => void }> = [
      { nome: 'zoom 100%', setup: () => this.#setZoomCenter(1) },
      { nome: 'zoom 40%', setup: () => this.#setZoomCenter(0.4) },
      { nome: 'ajustado a tela', setup: () => this.fitToContent() },
    ];

    for (const phase of phases) {
      phase.setup();
      this.#scheduler.setContinuous(true);
      this.#scheduler.resetSamples();
      // 1s de aquecimento descartado, depois 3s de coleta.
      await delay(1000);
      this.#scheduler.resetSamples();
      await delay(3000);
      const s = this.#scheduler.stats();
      results.push(
        `${phase.nome}: ${s.fps.toFixed(1)} fps | frame ${s.frameMs.toFixed(2)}ms | ` +
          `render ${s.renderMs.toFixed(2)}ms | visiveis ${s.visible} | lod ${s.lod} | heap ${s.heapMB.toFixed(0)}MB`,
      );
      this.#scheduler.setContinuous(false);
    }

    console.log(`BENCH_RESULT ${JSON.stringify({ objetos: count, fases: results })}`);
  }

  // ------------------------------------------------------------------ infra

  #measure(): void {
    const rect = this.#host.getBoundingClientRect();
    // Enquanto a view esta escondida o host mede 0x0; redimensionar para isso
    // destruiria o backing store por nada.
    if (rect.width === 0 || rect.height === 0) return;
    // O ToolManager guarda o retangulo do host em cache para nao forcar layout
    // a cada pointermove; mudar de tamanho invalida esse cache.
    this.#tools.remeasure();
    const mudou = this.#renderer.resize(rect.width, rect.height, window.devicePixelRatio || 1);
    // Repinta SEMPRE, e nao so quando o tamanho mudou. Uma medicao acontece
    // porque algo mexeu na janela, e nesses momentos a tela pode estar com
    // pixels de antes; repintar de graca e melhor que confiar que nao esta.
    // Com o tamanho novo a pintura e sincrona, para nao existir nem um frame
    // com o canvas esticado no tamanho velho.
    if (mudou) {
      this.#renderer.render();
      this.#paintOverlay();
    } else {
      this.#scheduler.invalidate();
    }
  }

  /**
   * Entrada de imagem: colar e arrastar arquivo.
   *
   * As duas portas ficam juntas porque compartilham o mesmo perigo: um arquivo
   * solto na janela do Electron, sem `preventDefault`, faz a janela NAVEGAR ate
   * ele -- o app inteiro some e vira um visualizador de imagem, sem volta.
   */
  #bindImageInput(): void {
    window.addEventListener('paste', (e) => {
      if (this.#view !== 'board') return;
      // Dentro de uma caixa de texto o colar pertence ao editor (que cola texto
      // puro); interceptar aqui colaria a imagem por cima da digitacao.
      const target = e.target as HTMLElement | null;
      if (target?.isContentEditable || target instanceof HTMLInputElement) return;

      const files = imageFilesFrom(e.clipboardData);
      if (files.length === 0) return;
      e.preventDefault();
      this.#systemPasteHandled = true;
      void this.insertImageFiles(files);
    });

    // Fora do quadro, arrastar arquivo nao faz nada -- mas precisa ser barrado.
    for (const type of ['dragover', 'drop']) {
      window.addEventListener(type, (e) => e.preventDefault());
    }

    this.#host.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    });

    this.#host.addEventListener('drop', (e) => {
      e.preventDefault();
      if (this.#view !== 'board') return;
      const files = imageFilesFrom(e.dataTransfer);
      if (files.length === 0) return;
      // A imagem entra ONDE foi solta, e nao no centro da tela: quem arrastou
      // ate um ponto do quadro escolheu esse ponto.
      const rect = this.#host.getBoundingClientRect();
      const at = this.camera.screenToWorld({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      void this.insertImageFiles(files, at);
    });
  }

  /**
   * `Ctrl+V`: decide entre a area de transferencia INTERNA e a do sistema.
   *
   * O evento `paste` do sistema chega logo depois desta tecla e pode trazer uma
   * imagem. O salto de macrotarefa deixa ele decidir primeiro; sem isso, colar
   * uma imagem copiada de fora colaria TAMBEM o que estava na area interna, e o
   * quadro receberia duas coisas por um comando so.
   */
  #pasteFromKeyboard(): void {
    this.#systemPasteHandled = false;
    setTimeout(() => {
      if (this.#systemPasteHandled) return;
      void this.pasteClipboard();
    }, 0);
  }

  #observeSize(): void {
    new ResizeObserver(() => this.#measure()).observe(this.#host);
    // devicePixelRatio muda ao arrastar a janela entre monitores de DPI diferente.
    window.addEventListener('resize', () => this.#measure());
  }

  #bindShortcuts(): void {
    const handlers: Record<ShortcutId, (e: KeyboardEvent) => void> = {
      save: () => void this.save(),
      export: () => void this.exportBoard(),
      lobby: () => void this.goToLobby(),
      help: () => this.#help.toggle(),
      debug: () => this.#debug.toggle(),
      benchmark: () => this.toggleBenchmark(),
      grid: () => this.toggleGrid(),
      zoom100: () => this.#setZoomCenter(1),
      fit: () => this.fitToContent(),
      zoomIn: () => this.#zoomCenter(1.25),
      zoomOut: () => this.#zoomCenter(1 / 1.25),
      undo: () => this.undo(),
      redo: () => this.redo(),
      selectAll: () => selectAll(this.#toolCtx),
      find: () => this.openSearch(),
      duplicate: () => void duplicateSelection(this.#toolCtx),
      copy: () => this.copySelection(),
      cut: () => this.cutSelection(),
      paste: () => this.#pasteFromKeyboard(),
      deleteSelection: () => void deleteSelection(this.#toolCtx),
      deselect: () => this.#escape(),
      bringToFront: () => void reorderSelection(this.#toolCtx, 'front'),
      sendToBack: () => void reorderSelection(this.#toolCtx, 'back'),
      layers: () => this.toggleLayers(),
      toolSelect: () => this.setTool('select'),
      toolPen: () => this.setTool('pen'),
      toolHighlighter: () => this.setTool('highlighter'),
      toolEraser: () => this.setTool('eraser'),
      toolShape: () => this.setTool('shape'),
      toolText: () => this.setTool('text'),
      toolNote: () => this.setTool('note'),
      // Enter confirma o recorte quando ele esta aberto: e a mesma tecla de
      // "terminei aqui" que fecha a caixa de texto.
      editText: () => {
        if (this.isCropping) this.commitCrop();
        else this.editSelection();
      },
      thinner: () => this.stepStrokeWidth(-1),
      thicker: () => this.stepStrokeWidth(1),
      snapToGrid: () => this.toggleSnapToGrid(),
      rulers: () => this.toggleRulers(),
      rulerUnit: () => this.toggleRulerUnit(),
      nudge: (e) => {
        const dx = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        const dy = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
        nudgeSelection(this.#toolCtx, dx, dy, e.shiftKey);
      },
    };

    window.addEventListener('keydown', (e) => {
      const target = e.target as HTMLElement | null;
      if (target?.isContentEditable || target instanceof HTMLInputElement) return;
      // Enquanto a ajuda esta aberta, so Esc (tratado pelo proprio modal) e F1.
      if (this.#help.isOpen && e.key !== 'F1') {
        if (e.key === 'Escape') this.#help.hide();
        return;
      }

      const id = resolveShortcut(e, this.#view);
      if (!id) return;
      // `Ctrl+V` e a excecao, e ela custou um bug: cancelar o padrao aqui
      // impede o navegador de disparar o evento `paste`, e e ele -- o unico --
      // que traz a imagem da area de transferencia do SISTEMA. Com o padrao
      // cancelado, colar imagem simplesmente nunca acontecia: a tecla parecia
      // morta, porque o unico caminho que sobrava era a area interna do app.
      if (id !== 'paste') e.preventDefault();
      handlers[id](e);
    });
  }

  get zoomRange(): [number, number] {
    return [MIN_ZOOM, MAX_ZOOM];
  }

  /** Zoom direto, centrado na tela. Usado pelas medicoes por terminal. */
  setZoom(zoom: number): void {
    this.#setZoomCenter(zoom);
  }

  /**
   * Marca a camada estatica como suja, sem que nada tenha mudado.
   *
   * So para medicao: e a mesma coisa que a interface faz a cada troca de
   * ferramenta, e medir isso separado responde se a repintura completa cabe num
   * frame no quadro de verdade.
   */
  invalidateForMeasurement(): void {
    this.#scheduler.invalidate();
  }

  /**
   * Desenha a camada estatica AGORA e devolve o custo, sem passar pelo rAF.
   *
   * Existe porque toda medicao de desenho deste projeto dependia do rAF, e o rAF
   * mente em dois casos que aparecem o tempo todo:
   *
   * - **Janela encoberta.** O Chromium para de entregar frames quando a janela
   *   esta atras de outra, e `backgroundThrottling: false` nao cobre isso. Em
   *   12/08/2026 o `QB_BENCH` devolveu `0.0 fps` em duas das tres fases por esse
   *   motivo -- com o render medido em 16,5 ms na mesma linha.
   * - **Vsync.** Esperar o frame soma a espera do monitor ao trabalho, e a
   *   espera muda de 8 para 16 ms conforme a taxa do painel (ver o B9).
   *
   * Chamando o renderer direto, o que se mede e o trabalho, e so ele. Nao serve
   * para medir fluidez percebida -- serve para responder "desenhar isto custa
   * quanto?", que e a pergunta de quem otimiza.
   */
  renderNowForMeasurement(): RenderStats {
    return this.#renderer.render();
  }

  get frameStats(): FrameStats {
    return this.#scheduler.stats();
  }

  /** Desmonta o app liberando listeners globais. Usado no HMR do desenvolvimento. */
  dispose(): void {
    this.#scheduler.stop();
    this.#input.dispose();
    this.#tools.dispose();
    this.#editor.dispose();
  }
}

function emptyReport(name: string, avisos: string[]): ImportReport {
  return { name, textos: 0, tracos: 0, imagens: 0, postits: 0, ignorados: {}, avisos };
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
