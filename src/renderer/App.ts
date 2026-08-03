import type { BoardSummary } from '@shared/wbd';
import { Camera, MAX_ZOOM, MIN_ZOOM } from './core/Camera';
import { Document } from './core/Document';
import { History } from './core/History';
import { Scheduler } from './core/Scheduler';
import { Selection } from './core/Selection';
import { ViewportInput } from './input/ViewportInput';
import { Renderer, type RenderTheme } from './render/Renderer';
import { ToolManager } from './tools/ToolManager';
import type { ToolContext } from './tools/types';
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
import { ViewportBar } from './ui/ViewportBar';
import { ContextMenu, type MenuEntry } from './ui/ContextMenu';
import { Lobby } from './ui/Lobby';
import { ShortcutsModal } from './ui/ShortcutsModal';
import { confirmDialog, promptText, toast } from './ui/dialogs';
import {
  applyBoard,
  renderThumbnail,
  serializeBoard,
  usedAssetIds,
} from './features/storage/boardIO';
import { AssetStore } from './features/images/AssetStore';
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

const THEME_KEY = 'qb.theme';
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

  #renderer: Renderer;
  #scheduler: Scheduler;
  #input: ViewportInput;
  #tools: ToolManager;
  #toolCtx: ToolContext;
  #bar: ViewportBar;
  #debug: DebugPanel;
  #lobby: Lobby;
  #help: ShortcutsModal;
  #menu: ContextMenu;

  #boardView: HTMLElement;
  #host: HTMLElement;
  #hint: HTMLElement;
  #progress: HTMLElement;
  #theme: 'light' | 'dark';

  #view: View = 'lobby';
  #session: Session = { path: null, name: 'Quadro sem nome', dirty: false };
  #saving = false;
  #benchPhase = 0;

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
      '<strong>Quadro vazio.</strong> As ferramentas de desenho chegam na Fase 4.<br>' +
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
      toggleTheme: () => this.toggleTheme(),
      save: () => void this.save(),
      backToLobby: () => void this.goToLobby(),
      showShortcuts: () => this.#help.toggle(),
      undo: () => this.undo(),
      redo: () => this.redo(),
    });
    this.#boardView.append(this.#bar.el);

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
    this.#applyTheme();

    this.#scheduler = new Scheduler(() => {
      if (this.#scheduler.continuous) this.#stepBenchmark();
      const stats = this.#renderer.render();
      // O cromo da selecao vai na camada de cima, no mesmo frame: desenhado na
      // camada estatica, ele entraria no cache de conteudo e continuaria
      // aparecendo depois de a selecao mudar.
      this.#paintOverlay();
      return stats;
    });

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
      invalidate: () => this.#scheduler.invalidate(),
      markDirty: () => this.#markDirty(),
    };
    this.#tools = new ToolManager(this.#host, this.#toolCtx);

    this.doc.on('objects', () => {
      this.#hint.hidden = this.doc.size > 0;
      // Desfazer uma exclusao (ou refaze-la) nao passa pela selecao: sem podar
      // aqui, o quadro de manipulacao continuaria em volta de objetos que ja
      // sairam do documento.
      this.selection.prune(this.doc);
      this.#scheduler.invalidate();
    });
    this.doc.on('prefs', () => this.#scheduler.invalidate());
    this.selection.onChange(() => this.#scheduler.invalidate());
    this.history.onChange(() => this.#bar.setHistory(this.history.canUndo, this.history.canRedo));

    this.#observeSize();
    this.#bindShortcuts();
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
    if (importPath) {
      this.#enterBoard();
      void import('./dev/importCheck').then((m) =>
        m.runImportCheck(importPath, this, params.get('save') === '1'),
      );
    } else if (params.get('selftest')) {
      // Precisa do quadro montado e medido para os eventos caírem no canvas.
      this.#enterBoard();
      void import('./dev/selftest').then((m) => m.runSelfTest(this.#host, this));
    } else if (bench) {
      void this.#runAutoBenchmark(Number(bench));
    } else {
      void this.goToLobby();
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
  }

  /**
   * Zera o que e especifico do quadro aberto.
   *
   * Historico junto com a selecao de proposito: um passo de undo guarda objetos
   * do quadro anterior, e aplica-lo depois de trocar de quadro ressuscitaria
   * conteudo de outro arquivo dentro deste.
   */
  #resetEditingState(): void {
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
    if (this.#session.dirty) return;
    this.#session.dirty = true;
    this.#updateTitle();
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
    document.title = `${this.#session.dirty ? '• ' : ''}${this.#session.name} — Creation Board`;
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
    const ctx = this.#renderer.beginOverlayScreen();
    this.#tools.paintOverlay(ctx, this.camera);
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
    const entries: MenuEntry[] = [
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
    if (this.#renderer.resize(rect.width, rect.height, window.devicePixelRatio || 1)) {
      this.#scheduler.invalidate();
    }
  }

  #observeSize(): void {
    new ResizeObserver(() => this.#measure()).observe(this.#host);
    // devicePixelRatio muda ao arrastar a janela entre monitores de DPI diferente.
    window.addEventListener('resize', () => this.#measure());
  }

  #bindShortcuts(): void {
    const handlers: Record<ShortcutId, (e: KeyboardEvent) => void> = {
      save: () => void this.save(),
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
      duplicate: () => void duplicateSelection(this.#toolCtx),
      copy: () => this.copySelection(),
      cut: () => this.cutSelection(),
      paste: () => void this.pasteClipboard(),
      deleteSelection: () => void deleteSelection(this.#toolCtx),
      deselect: () => this.#escape(),
      bringToFront: () => void reorderSelection(this.#toolCtx, 'front'),
      sendToBack: () => void reorderSelection(this.#toolCtx, 'back'),
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
      e.preventDefault();
      handlers[id](e);
    });
  }

  get zoomRange(): [number, number] {
    return [MIN_ZOOM, MAX_ZOOM];
  }

  /** Desmonta o app liberando listeners globais. Usado no HMR do desenvolvimento. */
  dispose(): void {
    this.#scheduler.stop();
    this.#input.dispose();
    this.#tools.dispose();
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
