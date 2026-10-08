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
import { PatchObjects, RestyleNotes, TransformObjects, type NoteStyle } from './commands';
import { snapshotPatch, type ObjectPatch } from './commands/patch';
import type { Rect } from '@shared/geometry/rect';
import { contentHeight, styleOf } from './render/text/layout';
import type { ObjectId, TextAlign, TextObject } from '@shared/model/types';
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
import { invalidateLibraryIndex } from './features/search/libraryQuery';
import { paintSearchHighlight } from './render/SearchHighlight';
import { ToolBar } from './ui/ToolBar';
import { ViewportBar, zoomDaEscala } from './ui/ViewportBar';
import { ContextMenu, type MenuEntry } from './ui/ContextMenu';
import { Lobby } from './ui/Lobby';
import { ShortcutsModal } from './ui/ShortcutsModal';
import { LayersPanel } from './ui/LayersPanel';
import { dismissBootScreen } from './bootScreen';
import {
  exportDialog,
  newBoardDialog,
  promptText,
  settingsDialog,
  toast,
  unsavedDialog,
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
import type { ExportPart, FundoImagem, TemaFundo } from '@shared/ipc-contract';
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
import { importBoardHtml } from './features/import/boardHtml';
import type { ImportReport, ImportSource } from '@shared/importer';
import type { SaveBoardResult } from '@shared/wbd';
import { generateStressBatches } from './features/carga/stress';
import { resolve as resolveShortcut, type ShortcutId } from './shortcuts';
import { esquecerVidro, fotoDoPalco, vidroDe } from './ui/vidroPronto';
import { nivelInicial, type NivelDeMovimento } from './ui/movimento';
import { iniciarTour } from './ui/Tour';
import {
  esquecerTutoriais,
  marcarTutorialVisto,
  passosDoMenu,
  passosDoQuadro,
  tutorialVisto,
} from './ui/tutoriais';
// As mesmas fotos do `--lobby-foto` do base.css, para a miniatura de
// Configuracoes. O Vite junta as duas referencias num arquivo so.
import fotoPraia from './assets/fundos/praia.webp';
import fotoGalaxia from './assets/fundos/galaxia.webp';
import { idiomaAtual, t } from '@shared/i18n';
import { escolherIdioma, IDIOMA_KEY } from './idioma';

/**
 * Os instrumentos de desenvolvimento -- auto-teste, medicoes, verificacoes e
 * quadros de exemplo --, carregados SO SE a pasta `dev/` existir.
 *
 * Ela nao vai para o repositorio publico nem para o instalador publicado: la
 * este mapa sai vazio, os modos de verificacao nao fazem nada, e o app compila
 * igual. Os tipos sao descritos aqui, e nao importados, pelo mesmo motivo -- um
 * `import type` de um arquivo ausente quebraria a compilacao.
 */
const instrumentos = import.meta.glob('./dev/*.ts');

async function instrumento<T>(nome: string): Promise<T | null> {
  const carregar = instrumentos[`./dev/${nome}.ts`];
  return carregar ? ((await carregar()) as T) : null;
}

const THEMES: Record<'light' | 'dark', RenderTheme> = {
  /*
    O quadro claro e um BRANCO QUEBRADO, e nao branco puro.

    Ele era `#ffffff` ate 20/09/2026, e cansava a vista. A razao e fisica e nao gosto -- o
    quadro ocupa a tela inteira, e uma tela e fonte de luz: branco maximo em area
    maxima e brilho maximo na cara de quem estuda por horas.

    A primeira tentativa foi `#f2f4f7` -- 0,90 de luminancia contra 1,00 do
    branco --, e continuou ofuscando: 10% nao se sente numa superficie que
    ocupa a tela toda.

    `#e3e7ee` fica em 0,80. O numero nao e chutado: e onde o macOS poe o fundo de
    janela, que e a referencia de tela clara que se usa por horas sem queixa.
    Medido na foto da janela, e nao no editor de cores -- a grade e o desfoque
    das barras mudam o que o olho recebe.

    Isso resolve junto a segunda metade da queixa, "as caixas ficam com menos
    destaque": os paineis continuam claros, entao agora eles SALTAM do fundo em
    vez de se dissolverem nele. Duas queixas, um numero.

    O arquivo exportado continua branco puro: ver `exportBg` em RenderTheme.
  */
  light: { boardBg: '#e3e7ee', exportBg: '#ffffff', gridColor: '#bfc8d7' },
  // No modo escuro o quadro escurece de verdade; as cores das marcas sao
  // adaptadas na exibicao (ver render/colorAdapt.ts). O arquivo guarda sempre a
  // cor original que o autor escolheu.
  dark: { boardBg: '#14161b', exportBg: '#14161b', gridColor: '#282d38' },
};

/**
 * Cores das reguas. Ficam aqui, e nao no RenderTheme, porque regua e cromo de
 * interface: ela nao pertence ao quadro nem entra na miniatura gravada.
 */
const RULER_THEMES: Record<'light' | 'dark', RulerTheme> = {
  light: { bg: '#dce1ea', fg: '#414b5c', line: '#b3bdcd', cursor: '#3b6ff0' },
  dark: { bg: '#1d2027', fg: '#8b93a3', line: '#333947', cursor: '#5b87f5' },
};

/** Margem em volta do conteudo exportado, em unidades de mundo. */
const EXPORT_PADDING = 24;

/** Ocioso antes de gravar sozinho, e o teto para quem nao para de desenhar. */
const AUTOSAVE_IDLE_MS = 3_000;
const AUTOSAVE_MAX_MS = 30_000;

const THEME_KEY = 'qb.theme';

/**
 * O tema com que o app abre: o forcado por `QB_THEME`, senao o escolhido pelo
 * botao de tema, senao O DO WINDOWS (06/10/2026: antes, com o Windows no
 * escuro, o app abria claro). O Electron segue o modo de aplicativos do Windows
 * no `prefers-color-scheme` (`nativeTheme.themeSource` e 'system' por padrao).
 */
export function temaInicial(
  forcado: string | null,
  gravado: string | null,
  windowsEscuro: boolean,
): 'light' | 'dark' {
  if (forcado === 'light' || forcado === 'dark') return forcado;
  if (gravado === 'light' || gravado === 'dark') return gravado;
  return windowsEscuro ? 'dark' : 'light';
}
const ANIM_KEY = 'qb.animacoes';
/**
 * Só o RÓTULO da imagem de fundo escolhida, por tema — nunca os bytes.
 *
 * A verdade é o disco: existe `fundo-claro.*` na pasta do app, há imagem
 * personalizada. Isto aqui é o nome original do arquivo, para o diálogo de
 * Configurações ter o que mostrar. Guardar a imagem em `localStorage` seria
 * inviável de qualquer forma (teto de ~5 MB), mas o motivo principal é outro:
 * duas fontes de verdade acabam discordando, e aí o app diz que há fundo e não
 * há, ou o contrário.
 */
const FUNDO_KEY = { claro: 'qb.fundo.claro', escuro: 'qb.fundo.escuro' } as const;
const RULERS_KEY = 'qb.rulers';
/**
 * O pontilhado de fundo do quadro, como preferencia DO APP, e nao de cada
 * quadro (07/10/2026): desligado no primeiro uso, gravado na hora
 * em que muda, e o mesmo em todo quadro que abrir depois.
 *
 * Antes morava no `prefs.grid.enabled` de cada quadro, ligado por padrao, e nem
 * marcava o quadro como alterado: a escolha ora ficava, ora se perdia, e um
 * quadro novo herdava o estado do anterior. O campo continua no arquivo (o
 * formato nao muda, e versoes antigas o leem), mas a tela nao o obedece mais.
 */
const GRADE_KEY = 'qb.grade';

/**
 * Regua e pontilhado no primeiro uso: DESLIGADOS. So liga o que foi gravado
 * como ligado; ausente ou qualquer outra coisa vale desligado.
 */
export function preferenciaDeExibicao(gravado: string | null): boolean {
  return gravado === '1';
}
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
  /** Temporizador do redesenho de parada; ver `#agendarRedesenhoDeParada`. */
  #redesenhoDeParada = 0;

  #rulers: boolean;
  #grade: boolean;
  /** Levantar dos botões, transições e o movimento do menu. Ver `#applyAnimacoes`. */
  #animacoes: NivelDeMovimento;
  /**
   * URL `blob:` da foto personalizada de cada tema, ou null para usar a que vem
   * com o app. Os bytes chegam por IPC — a CSP não permite `file:`.
   */
  #fundos: { light: string | null; dark: string | null } = { light: null, dark: null };
  /** Execucao automatica (selftest, capturas, bancadas): sem tutorial. */
  #automatizado = false;
  /** O aviso do X ja esta na tela (B36). */
  #perguntandoAoFechar = false;
  /** A pagina ja decidiu fechar: o proximo `beforeunload` deixa passar. */
  #fechandoDeVez = false;
  /**
   * Fecha a janela de vez. Publico e substituivel de proposito: o selftest
   * troca por um contador, senao conferir o aviso do X fecharia o proprio teste.
   */
  fecharJanela: () => void = () => void window.quadro.fecharJanela();
  /** Conta os pedidos de vidro pronto: so o ULTIMO pode escrever. Ver `#aplicarVidro`. */
  #vidroPedido = 0;
  /** `QB_FUNDO=off`: sem foto nenhuma nesta execução. Ver `#aplicarFundo`. */
  #semFundo = false;
  /**
   * Geracao da leitura de imagens em curso (Fase 7.5).
   *
   * Trocar de quadro incrementa, e o lote antigo se descarta ao ver que a
   * geracao mudou. Sem isto, a resposta de um quadro fechado escreveria texto
   * em objetos do quadro seguinte -- os ids sao unicos, mas o custo de descobrir
   * isso seria um bug intermitente e difícil de reproduzir.
   */
  #ocrGen = 0;
  #view: View = 'lobby';
  #session: Session = { path: null, name: t('quadro.semNome'), dirty: false };
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
    // HTML do dicionario, e nao da pessoa: texto fixo do app, sem nada de fora.
    this.#hint.innerHTML = t('quadro.dicaVazioHtml');
    this.#boardView.append(this.#hint);

    this.#progress = document.createElement('div');
    this.#progress.className = 'qb-progress';
    this.#progress.hidden = true;
    this.#boardView.append(this.#progress);

    this.#bar = new ViewportBar({
      // O + vai ate o teto do app (6400%); o menu de niveis e que para em 100%.
      zoomIn: () => this.#zoomCenter(1.25),
      zoomOut: () => this.#zoomCenter(1 / 1.25),
      zoomTo: (z) => this.#setZoomCenter(z),
      fitToContent: () => this.centralizarConteudo(),
      toggleGrid: () => this.toggleGrid(),
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
        setTextAlign: (align) => this.setTextAlign(align),
        retomarEdicao: () => this.#retomarEdicao(),
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
    // Uma barra so: a fila de ferramentas entra DENTRO da barra inferior em vez
    // de flutuar sozinha na borda esquerda. Ver `ViewportBar.mountTools`.
    this.#bar.mountTools(this.#toolbar.el);

    // A barra de tamanho do menu de Texto vale para o texto aberto ou
    // selecionado, e nao so para o proximo (ver `setTextFontSize`). So reage
    // quando o tamanho do TEXTO mudou: mexer na cor, ou na espessura da caneta,
    // nao toca em caixa nenhuma.
    let tamanhoDoTexto = this.drawStyle.width('text');
    this.drawStyle.onChange(() => {
      const agora = this.drawStyle.width('text');
      if (agora === tamanhoDoTexto) return;
      tamanhoDoTexto = agora;
      this.setTextFontSize(agora);
    });
    // A COR da paleta do Texto, do mesmo jeito: vale para o trecho selecionado
    // na caixa aberta, ou para as caixas selecionadas (ver `setTextColor`).
    let corDoTexto = this.drawStyle.color('text');
    this.drawStyle.onChange(() => {
      const agora = this.drawStyle.color('text');
      if (agora === corDoTexto) return;
      corDoTexto = agora;
      this.setTextColor(agora);
    });

    /*
      O B/I/U precisa acompanhar o cursor, e `selectionchange` e o unico evento
      que avisa quando ele anda dentro de um `contentEditable`.

      Ele dispara no DOCUMENTO e nao no elemento -- por isso o ouvinte esta aqui,
      e nao no TextEditor. Andar uma letra para dentro de um trecho em negrito
      tem de acender o botao, e nenhuma tecla especifica avisa isso: seta,
      clique, arraste e atalho de selecao produzem o mesmo efeito.

      `#syncTextFormat` sai cedo quando nao ha edicao nem caixa selecionada,
      entao o custo em repouso e uma comparacao.
    */
    document.addEventListener('selectionchange', () => this.#syncTextFormat());
    // Selecionar uma caixa no quadro tambem muda o que os botoes relatam.
    this.selection.onChange(() => this.#syncTextFormat());

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
      toggleTheme: () => this.toggleTheme(),
      openSettings: () => void this.#openSettings(),
      importBoards: () => void this.#pickAndImport(),
      openBoardAt: (path, id) => void this.openBoardAt(path, id),
    });

    this.#help = new ShortcutsModal();
    this.#menu = new ContextMenu();

    root.append(this.#lobby.el, this.#boardView, this.#help.el, this.#menu.el);

    // ------------------------------------------------------------- setup
    //
    // `QB_THEME=light|dark` manda no tema desta execucao e NAO grava nada: o
    // tema e preferencia de quem usa, e um modo de verificacao que a sobrescrevesse
    // devolveria o app com outra cara depois de conferir. Sem isto, "conferir o
    // tema claro" dependia do que estava no `localStorage` da maquina -- ou
    // seja, nao era repetivel, que e justamente o que os modos QB_* existem
    // para resolver.
    const temaForcado = new URLSearchParams(location.search).get('theme');
    this.#theme = temaInicial(
      temaForcado,
      localStorage.getItem(THEME_KEY),
      matchMedia('(prefers-color-scheme: dark)').matches,
    );
    this.#rulers = preferenciaDeExibicao(localStorage.getItem(RULERS_KEY));
    this.#grade = preferenciaDeExibicao(localStorage.getItem(GRADE_KEY));
    this.#renderer.grade = this.#grade;
    // LIGADO por padrao, e de propósito independente do Windows -- decisão de
    // produto em 21/09/2026. Só desliga quem gravou 'off' aqui, pelo diálogo de
    // Configurações. O porquê está no comentário do `[data-anim]` no base.css.
    //
    // Três níveis desde 30/09/2026 ('off' | 'on' | 'max'), e desde 06/10 o
    // padrão é o MÁXIMO (ver `nivelInicial`). O que já estava gravado continua
    // valendo como está; qualquer outra coisa é o padrão.
    //
    // `QB_ANIM=off|on|max` manda no nível desta execução sem gravar nada,
    // pelo mesmo motivo do `QB_THEME`: medir o menu com as animações máximas
    // não pode depender do que está no `localStorage` da máquina.
    const animForcada = new URLSearchParams(location.search).get('anim');
    const animGravada = localStorage.getItem(ANIM_KEY);
    this.#animacoes = nivelInicial(animForcada, animGravada);
    this.#applyAnimacoes();
    // Mesmo criterio do tema: o modo forcado vale para esta execucao e nao
    // grava nada, para a foto de conferencia nao depender da maquina.
    // QB_BLUR=0: desliga todo `backdrop-filter`. Ver main/index.ts.
    if (new URLSearchParams(location.search).get('blur') === '0') {
      document.documentElement.dataset['noblur'] = '1';
    }
    // QB_FUNDO=off: sem foto no lobby, para captura repetível. Ver main/index.ts.
    this.#semFundo = new URLSearchParams(location.search).get('fundo') === 'off';

    this.#applyTheme();
    this.#bar.setRulers(this.#rulers);

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
    // Texto ainda com o bitmap de outra escala (B31) ou o quadro meio pixel fora
    // do lugar depois de deslizar (B32): mais um quadro, ate assentar.
    this.#renderer.aoPrecisarDeOutroQuadro = () => this.#scheduler.invalidate();

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
    // Os tutoriais nunca aparecem por cima de uma execucao automatica: o
    // balao bloqueia cliques e entraria na foto. `tour=off` vem do main com
    // QB_SHOT ou QB_TOUR=off.
    this.#automatizado =
      modoDeVerificacao ||
      ['exemplos', 'config', 'benchquadro', 'benchlobby'].some((k) => params.get(k) !== null) ||
      params.get('boot') === 'hold' ||
      params.get('tour') === 'off';

    if (importPath) {
      this.#enterBoard();
      void instrumento<{ runImportCheck(path: string, app: App, save: boolean): Promise<void> }>(
        'importCheck',
      ).then((m) => m?.runImportCheck(importPath, this, params.get('save') === '1'));
    } else if (params.get('paste')) {
      this.#enterBoard();
      void instrumento<{ runPasteCheck(app: App): Promise<void> }>('pasteCheck').then((m) =>
        m?.runPasteCheck(this),
      );
    } else if (params.get('export')) {
      this.#enterBoard();
      void instrumento<{ runExportCheck(prefix: string, app: App): Promise<void> }>(
        'exportCheck',
      ).then((m) => m?.runExportCheck(params.get('export') ?? '', this));
    } else if (params.get('selftest')) {
      // Precisa do quadro montado e medido para os eventos caírem no canvas.
      this.#enterBoard();
      void instrumento<{ runSelfTest(host: HTMLElement, app: App): Promise<void> }>(
        'selftest',
      ).then((m) => m?.runSelfTest(this.#host, this));
    } else if (bench) {
      void this.#runAutoBenchmark(Number(bench));
    } else if (params.get('benchquadro')) {
      dismissBootScreen(true);
      void instrumento<{ runQuadroBench(host: HTMLElement, app: App): Promise<void> }>(
        'quadroBench',
      ).then((m) => m?.runQuadroBench(this.#host, this));
    } else if (params.get('exemplos')) {
      // QB_EXEMPLOS=1: grava quadros de exemplo e mostra o menu com eles -- para
      // as capturas do README.
      this.#enterBoard();
      void instrumento<{ gerarExemplos(app: App): Promise<void> }>('exemplos').then(async (m) => {
        await m?.gerarExemplos(this);
        await Promise.all([this.goToLobby(), this.#carregarFundos()]);
        dismissBootScreen(true);
      });
    } else if (params.get('benchlobby')) {
      // O menu de verdade, com a foto de fundo, e a abertura fora da frente --
      // ela cobre a janela inteira e seria ELA a composta.
      void Promise.all([this.goToLobby(), this.#carregarFundos()]).then(async () => {
        dismissBootScreen(true);
        const m = await instrumento<{ runLobbyBench(): Promise<void> }>('lobbyBench');
        await m?.runLobbyBench();
      });
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
      // O fundo entra ANTES da tela de abertura sair, pelo mesmo motivo que a
      // lista de quadros: a foto aparecendo depois seria uma troca visível de
      // tela -- exatamente o susto que a tela de abertura existe para evitar.
      void Promise.all([this.goToLobby(), this.#carregarFundos()]).then(() => {
        if (!segurar) dismissBootScreen();
        // QB_CONFIG=1 abre Configuracoes sozinho, para o QB_SHOT fotografa-la
        // (o redesenho de 06/10/2026 foi escolhido por prancha, nos dois temas).
        if (params.get('config')) void this.#openSettings();
        // Meio segundo: a tela de abertura sai com um esmaecer, e o tutorial
        // nascendo por baixo dele pareceria um piscar.
        else if (!segurar) setTimeout(() => this.#talvezTutorialDoMenu(), 500);
      });
    }
  }

  // ----------------------------------------------------------------- views

  async goToLobby(): Promise<void> {
    if (this.#view === 'board' && !(await this.#confirmDiscard())) return;

    this.#view = 'lobby';
    this.#boardView.hidden = true;
    this.#lobby.el.hidden = false;
    this.#lobby.retomarDesempenho();
    void window.quadro.board.folder().then((p) => this.#lobby.setFolder(p));
    await this.#lobby.refresh();
  }

  /** Primeira abertura: o passo a passo do menu, que termina criando o primeiro quadro. */
  #talvezTutorialDoMenu(): void {
    if (this.#automatizado || this.#view !== 'lobby' || tutorialVisto('menu')) return;
    iniciarTour(passosDoMenu(), {
      rotuloFinal: t('tour.menu.final'),
      aoTerminar: (completo) => {
        marcarTutorialVisto('menu');
        if (completo) void this.newBoard();
      },
    });
  }

  /** Primeira vez dentro de um quadro: um passo por ferramenta. */
  #talvezTutorialDoQuadro(): void {
    if (this.#automatizado || this.#view !== 'board' || tutorialVisto('quadro')) return;
    // Visto JA ao abrir: se a pessoa sair do quadro no meio, ele nao volta a
    // cada quadro aberto -- "Ver de novo" em Configuracoes e o caminho.
    marcarTutorialVisto('quadro');
    iniciarTour(passosDoQuadro(), { rotuloFinal: t('tour.quadro.final'), aoTerminar: () => {} });
  }

  #enterBoard(): void {
    this.#view = 'board';
    // Depois do primeiro quadro desenhado: a barra precisa estar medida para
    // o destaque cair em cima de cada ferramenta.
    setTimeout(() => this.#talvezTutorialDoQuadro(), 450);
    this.#lobby.el.hidden = true;
    // O laco de medicao do F3 do menu nao pode continuar rodando por baixo do
    // quadro: ele pediria um quadro de animacao por vsync a toa, e o F3 do
    // quadro mediria a sobra dele.
    this.#lobby.pausarDesempenho();
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
    // A escolha do papel vem ANTES de o quadro existir: é a única hora em que
    // ela é barata. Cancelar aqui não cria nada e devolve ao lobby.
    const escolha = await newBoardDialog();
    if (escolha === null) return;
    // Pelo Ctrl+N dentro de um quadro: o papel vem antes, e so depois o aviso
    // do quadro atual -- cancelar o papel nao pode ter mexido em nada.
    if (this.#view === 'board' && !(await this.#confirmDiscard())) return;

    this.doc.clear();
    this.doc.setPrefs({ background: escolha.papel });
    this.#resetEditingState();
    this.#session = { path: null, name: t('quadro.semNome'), dirty: false };
    this.#enterBoard();
    // O papel entra no tema do renderizador, e com ele no adaptador de cor: as
    // marcas passam a ser conferidas contra o fundo que existe de verdade.
    this.#applyTheme();
    this.camera.reset(this.#renderer.viewportW, this.#renderer.viewportH);
    this.#onCameraChanged();
    // Com nome, ja nasce salvo: tem arquivo, entra no autosave, e o X nunca
    // pergunta por ele. Um nome repetido vira "(2)" no disco (wbdFile).
    if (escolha.nome && (await this.gravarNovo(escolha.nome))) this.#updateTitle();
  }

  async openBoard(summary: BoardSummary): Promise<void> {
    try {
      const result = await window.quadro.board.load(summary.path);
      // Os assets precisam estar decodificados antes dos objetos entrarem, senao
      // o primeiro frame desenha marcadores no lugar das imagens.
      await this.assets.load(result.assets);
      applyBoard(this.doc, this.camera, result.document);
      this.#resetEditingState();
      this.#session = { path: result.path, name: result.name, dirty: false };
      this.#enterBoard();
      // O papel gravado no arquivo entra no tema: sem isto o quadro abriria com
      // o papel do quadro ANTERIOR, porque o tema só é montado na inicialização.
      this.#applyTheme();
      this.#bar.setZoom(this.camera.zoom);
      this.#onCameraChanged();
      this.readImagesInBackground();
    } catch (err) {
      toast(t('quadro.erroAbrirNome', summary.name, String(err)), 'error');
    }
  }

  /**
   * Le o texto das imagens do quadro, sem travar nada (Fase 7.5).
   *
   * Comeca DEPOIS de o quadro estar na tela, e nao antes: a leitura das 36
   * imagens do resumo real custa 1,65 s, e esperar por ela atrasaria em quase
   * tres vezes uma abertura que hoje leva 642 ms. Quem chega buscando texto pode
   * digitar no `Ctrl+F` enquanto isso; os resultados vao aparecendo por lote.
   *
   * **Marca o quadro como alterado quando le alguma coisa, e isso e deliberado.**
   * O documento mudou de verdade -- ganhou texto que nao tinha --, e e o autosave
   * que grava isso no .wbd. Sem a marca, a leitura seria refeita a cada abertura,
   * para sempre. O ponto ao lado do nome aparece uma vez por quadro na vida dele.
   *
   * Publico porque o auto-teste chama direto: passar pelo caminho de abrir um
   * arquivo de verdade so para exercitar isto seria testar o disco, nao o OCR.
   */
  readImagesInBackground(): void {
    if (!window.quadro?.ocr) return;
    const geracao = ++this.#ocrGen;
    void import('./features/ocr/recognizeBoard')
      .then((m) =>
        m.recognizeBoardImages(
          this.doc,
          this.assets,
          () => this.#scheduler.invalidate(),
          // Sair do quadro ou abrir outro cancela: o que voltar depois disso
          // pertence a um documento que nao esta mais na tela.
          () => geracao !== this.#ocrGen || this.#view !== 'board',
        ),
      )
      .then((lidas) => {
        if (lidas > 0 && geracao === this.#ocrGen) this.#markDirty();
      })
      .catch(() => {
        // OCR e conforto: uma falha aqui nao pode aparecer para quem so queria
        // abrir um quadro.
      });
  }

  /**
   * Abre um quadro pelo caminho e leva a camera ate um objeto.
   *
   * E o clique num resultado da busca da biblioteca. Se o quadro ja e o que esta
   * aberto, nao recarrega -- so navega: reabrir descartaria alteracoes ainda nao
   * salvas e piscaria a tela por nada.
   */
  async openBoardAt(path: string, objectId: string): Promise<void> {
    if (this.#view === 'board' && this.#session.path === path) {
      this.focusObject(objectId);
      return;
    }
    try {
      const result = await window.quadro.board.load(path);
      await this.assets.load(result.assets);
      applyBoard(this.doc, this.camera, result.document);
      this.#resetEditingState();
      this.#session = { path: result.path, name: result.name, dirty: false };
      this.#enterBoard();
      this.#bar.setZoom(this.camera.zoom);
      this.focusObject(objectId);
      this.readImagesInBackground();
    } catch (err) {
      toast(t('quadro.erroAbrir', String(err)), 'error');
    }
  }

  /**
   * Enquadra um objeto e o seleciona.
   *
   * O MESMO caminho que o `Ctrl+F` de dentro do quadro usa, e de proposito:
   * chegar num resultado tem de parecer igual, venha ele da busca daqui ou da
   * busca da biblioteca.
   */
  focusObject(id: ObjectId): void {
    const obj = this.doc.get(id);
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
    this.selection.set([obj.id]);
    this.#onCameraChanged();
  }

  /** Quadro de demonstracao, para ter conteudo sem precisar desenhar nada ainda. */
  async openDemo(): Promise<void> {
    this.#session = { path: null, name: t('quadro.nomeDemonstracao'), dirty: true };
    this.#enterBoard();
    await this.seed(DEMO_SEED, false);
  }

  // -------------------------------------------------------------- conteudo

  /**
   * Gera carga de teste em lotes, cedendo o controle ao navegador entre eles.
   * Sem isso, 50.000 objetos travam a janela por vários segundos.
   */
  async seed(count: number, refit = true, semente?: number): Promise<void> {
    this.doc.clear();
    this.#resetEditingState();
    this.#showProgress(t('progresso.gerando', count), 0);

    let done = 0;
    for (const batch of generateStressBatches(count, SEED_BATCH, semente)) {
      this.doc.add(batch);
      done += batch.length;
      this.#showProgress(t('progresso.gerando', count), done / count);
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
   * Importa quadros exportados por outros aplicativos, criando um quadro por arquivo.
   *
   * Cada arquivo vira um .wbd salvo direto no disco, e nao um quadro aberto na
   * tela: importar tres resumos de uma vez e a situacao normal, e abrir todos
   * simultaneamente nao faria sentido.
   *
   * `save: false` interpreta sem gravar. Existe para a verificacao automatizada:
   * ela roda a importacao muitas vezes seguidas, e gravando deixava a pasta de
   * quadros do usuario cheia de copias numeradas do mesmo resumo.
   */
  async importBoards(
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

      const result = await importBoardHtml(source.name, source.html, this.assets);
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

  /** Fluxo do botao de importar, no lobby. */
  async #pickAndImport(): Promise<void> {
    const sources = await window.quadro.importer.pick();
    if (sources.length === 0) return; // cancelado

    // A importacao precisa do canvas medido para enquadrar e gerar a miniatura,
    // mas o usuario nao deve ver o quadro piscando entre um arquivo e outro.
    const wasLobby = this.#view === 'lobby';
    this.#enterBoard();
    this.#showProgress(t('progresso.importando', sources.length), 0);

    let reports;
    try {
      reports = await this.importBoards(sources);
    } finally {
      this.#hideProgress();
    }

    // Volta ao lobby: o resultado sao varios quadros, nao um.
    this.doc.clear();
    this.assets.clear();
    this.#resetEditingState();
    this.#session = { path: null, name: t('quadro.semNome'), dirty: false };
    if (wasLobby) await this.goToLobby();

    const total = reports.reduce(
      (n, r) => n + r.textos + r.tracos + r.imagens + r.postits,
      0,
    );
    const falhas = reports.filter((r) => r.avisos.length > 0).length;
    toast(t('importar.resultado', reports.length, total, falhas), falhas > 0 ? 'error' : 'ok');
  }

  async save(): Promise<boolean> {
    if (this.#saving) return false;

    let name = this.#session.name;
    if (!this.#session.path) {
      const input = await promptText({
        title: t('quadro.salvarTitulo'),
        label: t('quadro.salvarNome'),
        value: name === t('quadro.semNome') ? '' : name,
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

  /**
   * Grava o quadro atual como um quadro NOVO e o da por salvo. Devolve o
   * caminho, ou null se falhou. Usado pelos quadros de exemplo (`QB_EXEMPLOS`):
   * sem marcar como salvo, voltar ao menu abriria o aviso de alteracoes
   * pendentes, e a execucao automatica pararia nele.
   */
  async gravarNovo(nome: string): Promise<string | null> {
    const r = await this.#writeBoard(null, nome);
    if (!r) return null;
    // O nome GRAVADO, que pode ter ganhado um "(2)" se o pedido ja existia.
    this.#session = { path: r.path, name: r.name, dirty: false };
    return r.path;
  }

  /** Grava o estado atual em disco. Devolve null em caso de falha. */
  async #writeBoard(path: string | null, name: string): Promise<SaveBoardResult | null> {
    // O texto guardado da busca da biblioteca acabou de ficar velho. Derrubar o
    // cache aqui -- e nao so no salvamento manual -- cobre tambem o autosave, que
    // e por onde a maior parte das gravacoes deste app acontece.
    invalidateLibraryIndex();
    try {
      const used = usedAssetIds(this.doc);
      const preview = await renderThumbnail(this.doc, this.#themeComPapel(), (id) =>
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
      toast(t('quadro.erroSalvar', String(err)), 'error');
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
  /** JavaScript inteiro do ultimo quadro (desenhar + camada de cima) -- para as medicoes. */
  get quadroMs(): number {
    return this.#scheduler.quadroMs;
  }

  /** O ultimo quadro deixou algo para depois (B31/B32) -- para o selftest. */
  get precisaDeOutroQuadro(): boolean {
    return this.#renderer.precisaDeOutroQuadro;
  }

  /** Liga e desliga o deslizar (B32) -- para as medicoes compararem. */
  set deslizarLigado(v: boolean) {
    this.#renderer.deslizarLigado = v;
  }

  /** Quadros deslizados em vez de redesenhados (B32) -- para as medicoes. */
  get quadrosDeslizados(): number {
    return this.#renderer.deslizes;
  }

  /** Numeros do cache de bitmap do renderizador -- para as medicoes. */
  get estatisticasDoCache(): { entradas: number; mb: number; acertos: number; erros: number } {
    return this.#renderer.estatisticasDoCache;
  }

  /** O quadro aberto tem alteracoes nao salvas. */
  get alteracoesPendentes(): boolean {
    return this.#session.dirty;
  }

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
    // arquivo aberto, com titulos longos ("Resumo do curso de exemplo,
    // modulos 4 a 9 — Creation Board") empurrando o nome do app
    // para fora da barra de tarefas.
    //
    // Nada se perde: o nome do quadro e o ponto de sujeira continuam na barra
    // inferior, que e onde se olha enquanto se trabalha. A barra de titulo passa
    // a responder so "que aplicativo e este", que e a pergunta dela.
    document.title = 'Creation Board';
  }

  /**
   * Pergunta o que fazer com alteracoes pendentes antes de sair.
   *
   * Devolve `true` quando pode seguir. SALVAR tambem devolve `true`, e so depois
   * de a gravacao terminar -- por isso o `await`: sair antes de o arquivo fechar
   * perderia exatamente o que a pessoa pediu para guardar.
   *
   * Se a gravacao falhar ou for cancelada no dialogo de arquivo, a saida e
   * ABORTADA. Um erro ao salvar nao pode virar um descarte silencioso.
   */
  async #confirmDiscard(): Promise<boolean> {
    if (!this.#session.dirty || this.doc.size === 0) return true;

    const escolha = await unsavedDialog(this.#session.name);
    if (escolha === 'cancelar') return false;
    if (escolha === 'descartar') {
      // Descartado e DESCARTADO: sem isto o quadro largado continuava marcado
      // como sujo na memoria, e ja no menu o X da janela era cancelado em
      // silencio -- o app "nao fechava mais" (B36).
      this.#session = { ...this.#session, dirty: false };
      return true;
    }

    await this.save();
    return !this.#session.dirty;
  }

  /**
   * O X da janela com um quadro nao salvo aberto (B36).
   *
   * O `beforeunload` cancelado, num navegador, mostra um aviso; no Electron ele
   * so CANCELA o fechamento, calado -- e o X parecia quebrado. Agora o
   * cancelamento abre o aviso do proprio app (o mesmo de voltar ao menu):
   * salvar e sair, perder o progresso, ou cancelar. Decidido, a pagina pede ao
   * processo principal para fechar, e esta funcao deixa passar.
   *
   * So vale com um QUADRO na tela: no menu nao ha o que perder, e recarregar
   * (Configuracoes) ou reabrir o app nao pode esbarrar num quadro largado.
   */
  #guardUnsavedOnClose(): void {
    window.addEventListener('beforeunload', (e) => {
      if (this.#fechandoDeVez || this.#view !== 'board') return;
      if (!this.#session.dirty || this.doc.size === 0) return;
      e.preventDefault();
      e.returnValue = '';
      if (this.#perguntandoAoFechar) return; // dois cliques no X: um aviso so
      this.#perguntandoAoFechar = true;
      void this.#confirmDiscard()
        .then((pode) => {
          if (!pode) return;
          this.#fechandoDeVez = true;
          this.fecharJanela();
        })
        .finally(() => {
          this.#perguntandoAoFechar = false;
        });
    });
    // A cor e a ferramenta esperam 400 ms para ir ao disco (ver DrawStyle).
    // Fechar o app logo depois de trocar perdia a escolha -- o `flush` existia
    // para isto, mas ninguem o chamava (achado em 06/10/2026). `pagehide`, e nao
    // `beforeunload`: so dispara quando a janela de fato vai embora.
    window.addEventListener('pagehide', () => this.drawStyle.flush());
  }

  // ----------------------------------------------------------------- visao

  /**
   * Todo o conteudo na tela, com o zoom que for preciso. E o que as medicoes e
   * o `selftest` usam ("tudo na tela"); o botao da barra e o Ctrl+1 usam
   * `centralizarConteudo`.
   */
  fitToContent(): void {
    const b = this.doc.contentBounds();
    if (!b) return;
    this.camera.fitTo(b, this.#renderer.viewportW, this.#renderer.viewportH);
    this.#onCameraChanged();
  }

  /**
   * O botao "Centralizar" da barra e o Ctrl+1 (07/10/2026): o
   * conteudo no meio da tela, com o zoom em 50% da barra -- perto do tamanho
   * real. Encaixar tudo afastava para 12% num quadro espalhado. Num quadro
   * grande, aparece a parte do meio; o resto se ve arrastando ou com o -.
   */
  centralizarConteudo(): void {
    const b = this.doc.contentBounds();
    if (!b) return;
    const zoom = zoomDaEscala(50);
    this.camera.zoom = zoom;
    this.camera.x = b.x + b.w / 2 - this.#renderer.viewportW / 2 / zoom;
    this.camera.y = b.y + b.h / 2 - this.#renderer.viewportH / 2 / zoom;
    this.#onCameraChanged();
  }

  toggleGrid(): void {
    this.#grade = !this.#grade;
    localStorage.setItem(GRADE_KEY, this.#grade ? '1' : '0');
    this.#renderer.grade = this.#grade;
    this.#bar.setGridEnabled(this.#grade);
    this.#scheduler.invalidate();
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

  /*
    O acabamento vitrificado foi um MODO, com interruptor na barra e no lobby, e
    virou o padrao unico em 21/09/2026. Saiu daqui o par `toggleGlass`/
    `#applyGlass`, a chave no localStorage e o `data-glass` na raiz: com um
    acabamento so, nao ha o que alternar nem o que lembrar.

    O CSS do vidro esta em styles/base.css, agora nos tokens de base.
  */

  toggleBenchmark(): void {
    const next = !this.#scheduler.continuous;
    this.#scheduler.resetSamples();
    this.#scheduler.setContinuous(next);
  }

  /**
   * O tema do renderizador, já com o PAPEL escolhido para este quadro.
   *
   * O papel vale só no tema claro, e a razão é o propósito dele: a cor existe
   * para destacar o que está por cima, e isso é uma questão de papel claro. No
   * tema escuro o quadro já é escuro, e pintá-lo de rosa-claro desfaria o tema.
   *
   * `exportBg` acompanha o papel, e não fica branco: um resumo montado sobre
   * papel azul exportado em branco não é o mesmo documento -- as cores que o
   * autor escolheu foram escolhidas CONTRA aquele fundo.
   */
  #themeComPapel(): RenderTheme {
    const base = THEMES[this.#theme];
    if (this.#theme === 'dark') return base;
    const papel = this.doc.prefs.background;
    return { ...base, boardBg: papel, exportBg: papel };
  }

  /**
   * Configurações do aplicativo, abertas pelo menu principal.
   *
   * Aplica a cada clique, e não ao fechar: o efeito aparece na própria tela
   * atrás do diálogo, e é isso que torna a escolha conferível sem sair dela.
   */
  async #openSettings(): Promise<void> {
    // A opcao de compatibilidade mora no processo principal (vale antes de a
    // janela existir), entao e a unica que precisa ser perguntada.
    const graficos = await window.quadro.graficos.ler();
    settingsDialog(
      {
        // O escolhido pode ainda nao estar em uso: grava na hora, vale ao
        // recarregar. A tela mostra o escolhido e acende o "Aplicar".
        idioma: escolherIdioma(),
        idiomaEmUso: idiomaAtual(),
        graficos,
        animacoes: this.#animacoes,
        fundos: {
          claro: localStorage.getItem(FUNDO_KEY.claro),
          escuro: localStorage.getItem(FUNDO_KEY.escuro),
        },
      },
      {
        onChange: (c) => {
          // O IDIOMA grava na hora e vale ao recarregar -- pelo "Aplicar
          // alteracoes" ou na proxima abertura (06/10/2026). Os
          // textos sao escritos quando cada tela e montada, e redesenhar tudo
          // no lugar arriscaria sobrar texto no idioma antigo.
          localStorage.setItem(IDIOMA_KEY, c.idioma);
          this.#animacoes = c.animacoes;
          localStorage.setItem(ANIM_KEY, this.#animacoes);
          this.#applyAnimacoes();
        },
        escolherFundo: (tema) => this.#escolherFundo(tema),
        restaurarFundo: (tema) => this.#restaurarFundo(tema),
        previaDoFundo: (tema) =>
          tema === 'claro' ? (this.#fundos.light ?? fotoPraia) : (this.#fundos.dark ?? fotoGalaxia),
        gravarCompatibilidade: async (ligada) => {
          try {
            await window.quadro.graficos.gravar(ligada);
          } catch (err) {
            toast(App.#mensagemDeIpc(err), 'error');
          }
        },
        // A cor e a ferramenta pendentes vao ao disco no `pagehide` do
        // fechamento (ver `#guardUnsavedOnClose`), que os dois tambem disparam.
        // As Configuracoes so abrem no menu principal: nao ha quadro aberto.
        reabrir: () => void window.quadro.graficos.reabrir(),
        recarregar: () => void window.quadro.recarregar(),
        verTutorial: () => {
          esquecerTutoriais();
          this.#talvezTutorialDoMenu();
        },
      },
    );
  }

  /**
   * A frase que o main escreveu, sem o embrulho do Electron.
   *
   * Uma exceção lançada dentro de um `ipcMain.handle` chega aqui como
   * `Error invoking remote method 'fundo:escolher': Error: <a frase>`. Mostrar
   * isso num toast entrega ao usuário o nome do canal de IPC e a palavra
   * "Error" duas vezes, para depois dizer que a imagem é grande demais. A
   * mensagem foi escrita para ser lida; o embrulho não.
   */
  static #mensagemDeIpc(err: unknown): string {
    const cru = String(err instanceof Error ? err.message : err);
    const semCanal = cru.replace(/^Error invoking remote method '[^']*':\s*/, '');
    return semCanal.replace(/^(?:Uncaught )?Error:\s*/, '');
  }

  async #escolherFundo(tema: TemaFundo): Promise<string | null> {
    try {
      const img = await window.quadro.fundo.escolher(tema);
      if (!img) return null; // cancelou

      this.#trocarFundo(tema === 'claro' ? 'light' : 'dark', img);
      localStorage.setItem(FUNDO_KEY[tema], img.nome);
      this.#aplicarFundo();
      return img.nome;
    } catch (err) {
      // O main recusa arquivo grande demais, que não é imagem, ou com pixels
      // demais — e escreve a mensagem para ser lida. Engolir isso deixaria o
      // clique sem resposta nenhuma, que é o pior desfecho.
      toast(App.#mensagemDeIpc(err), 'error');
      return null;
    }
  }

  async #restaurarFundo(tema: TemaFundo): Promise<void> {
    await window.quadro.fundo.limpar(tema);
    this.#trocarFundo(tema === 'claro' ? 'light' : 'dark', null);
    localStorage.removeItem(FUNDO_KEY[tema]);
    this.#aplicarFundo();
  }

  /**
   * O interruptor vira um `data-anim` na raiz, e o resto é CSS.
   *
   * Mesmo desenho do tema: um atributo num lugar, e as folhas reagem. A
   * alternativa -- percorrer os elementos desligando transições no estilo
   * embutido -- teria de rodar de novo a cada botão criado depois, e o app
   * cria botões o tempo todo (painel de opções, camadas, busca).
   */
  #applyAnimacoes(): void {
    // Ligado é a AUSÊNCIA do atributo: é o padrão, e o CSS de sempre vale sem
    // seletor nenhum. Desligado e máximo são as exceções.
    if (this.#animacoes === 'on') delete document.documentElement.dataset['anim'];
    else document.documentElement.dataset['anim'] = this.#animacoes;
  }

  /**
   * A foto de fundo do menu principal, do tema em vigor.
   *
   * Mora pendurada no `#applyTheme` porque ele já é o ponto único que sabe qual
   * tema vale agora — e a foto é por tema. Duplicar essa decisão em outro lugar
   * abriria espaço para os dois discordarem.
   *
   * O CSS resolve sozinho o caso do PADRÃO: `--lobby-foto` já tem um `url()`
   * por tema em `base.css`. Aqui só se escreve a variável quando há imagem
   * **personalizada**, e o que sempre se escreve é o `data-fundo` — que é como o
   * CSS descobre que há foto, já que seletor não consegue perguntar pelo valor
   * de uma variável.
   */
  /**
   * Lê do disco a imagem de fundo escolhida para cada tema.
   *
   * Vira `blob:`, e não data URL. O preview dos cards usa data URL e está certo
   * lá — são dezenas de imagens de 20 a 60 KB. Aqui é UMA imagem que pode ter
   * vários megabytes: em base64 ela incharia 33%, atravessaria o IPC como texto,
   * ficaria viva dentro do CSSOM e seria reanalisada a cada troca de tema. Um
   * `blob:` deixa no CSS uma URL de ~50 caracteres, e é **revogável** — que é
   * como a memória volta quando a imagem é trocada.
   *
   * Falha em silêncio de propósito: sem fundo personalizado, a imagem que vem
   * com o aplicativo assume. Um erro aqui não pode impedir o lobby de abrir.
   */
  async #carregarFundos(): Promise<void> {
    for (const [tema, chave] of [
      ['light', 'claro'],
      ['dark', 'escuro'],
    ] as const) {
      try {
        const img = await window.quadro.fundo.ler(chave);
        this.#trocarFundo(tema, img);
      } catch {
        this.#trocarFundo(tema, null);
      }
    }
    this.#aplicarFundo();
  }

  /** Troca o blob de um tema, revogando o anterior. Ver `#carregarFundos`. */
  #trocarFundo(tema: 'light' | 'dark', img: FundoImagem | null): void {
    const antigo = this.#fundos[tema];
    if (antigo) {
      // A versao desfocada dela vai junto -- ver `ui/vidroPronto.ts`.
      esquecerVidro(antigo);
      URL.revokeObjectURL(antigo);
    }
    this.#fundos[tema] = img ? URL.createObjectURL(new Blob([img.bytes], { type: img.mime })) : null;
  }

  #aplicarFundo(): void {
    const raiz = document.documentElement;
    if (this.#semFundo) {
      delete raiz.dataset['fundo'];
      delete raiz.dataset['vidro'];
      return;
    }

    const propria = this.#fundos[this.#theme];
    if (propria) raiz.style.setProperty('--lobby-foto', `url("${propria}")`);
    else raiz.style.removeProperty('--lobby-foto'); // volta ao padrão do CSS

    raiz.dataset['fundo'] = 'foto';
    void this.#aplicarVidro();
  }

  /**
   * O painel do menu com a foto desfocada UMA VEZ, em vez do desfoque ao vivo.
   * A razao e os numeros estao em `ui/vidroPronto.ts`.
   *
   * Enquanto a versao pronta nao existe, o `data-vidro` sai e o desfoque ao
   * vivo volta a valer: e mais lento, mas e a MESMA foto. Deixar a versao
   * anterior no lugar mostraria, por um instante, a galaxia desfocada sobre a
   * praia.
   *
   * Falha em silencio: sem a versao pronta, o vidro ao vivo continua funcionando,
   * so mais caro. Um erro aqui nao pode deixar o painel sem fundo.
   */
  async #aplicarVidro(): Promise<void> {
    const raiz = document.documentElement;
    const pedido = ++this.#vidroPedido;
    delete raiz.dataset['vidro'];
    const fonte = fotoDoPalco(this.#lobby.el);
    if (!fonte) return;
    try {
      const pronto = await vidroDe(fonte);
      // Um tema trocado no meio do caminho ja pediu outro; este chegou tarde.
      if (pedido !== this.#vidroPedido || raiz.dataset['fundo'] !== 'foto') return;
      raiz.style.setProperty('--lobby-foto-desfocada', `url("${pronto}")`);
      raiz.dataset['vidro'] = 'pronto';
    } catch {
      // Fica o vidro ao vivo. Ver acima.
    }
  }

  #applyTheme(): void {
    document.documentElement.dataset['theme'] = this.#theme;
    // O fundo da janela vai junto (ver `shared/abertura.ts`).
    void window.quadro.temaDaJanela(this.#theme);
    this.#aplicarFundo();
    this.#renderer.theme = this.#themeComPapel();
    this.#bar.setGridEnabled(this.#grade);
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
    this.#agendarRedesenhoDeParada();
  }

  /**
   * UM redesenho extra logo depois que a camera para de se mexer.
   *
   * Existe por causa do rastro relatado em 20/09/2026: rolando a tela DEVAGAR,
   * pedacos do frame anterior ficam na tela -- e ficam varios segundos. A
   * duplicacao aparece nas duas camadas ao mesmo tempo (o traco na estatica, o
   * rotulo da regua no overlay), o que descarta erro de desenho: as duas sao
   * limpas por inteiro a cada frame. O que sobra e a composicao deixando tiles
   * velhos, a mesma familia do B8.
   *
   * Por que ele fica TANTO tempo, e e isto que este metodo ataca: o loop so
   * desenha quando algo invalidou o frame (ver core/Scheduler.ts). Parou de
   * rolar, parou de desenhar -- e sem frame novo nao ha troca de tela que
   * corrija o que ficou velho. O rastro so some quando outra coisa qualquer
   * pede um desenho, e o primeiro candidato costuma ser o autosave, ocioso por
   * tres segundos. Bate com "fica alguns segundos".
   *
   * Um frame a mais por gesto, e nao por tique: o temporizador e reiniciado a
   * cada movimento, entao rolar continuamente nao agenda nada. O custo e
   * exatamente um frame depois que a pessoa parou -- o momento mais barato que
   * existe para gastar um.
   *
   * ISTO NAO E A CAUSA, E NAO SE FINGE QUE E. A conta de regiao suja continua
   * errada; o que muda e que o erro dura um frame em vez de segundos. A causa
   * esta sendo isolada com `QB_BLUR=0` (ver main/index.ts).
   */
  #agendarRedesenhoDeParada(): void {
    clearTimeout(this.#redesenhoDeParada);
    this.#redesenhoDeParada = window.setTimeout(() => {
      this.#scheduler.invalidate();
      this.#scheduler.invalidateOverlay();
    }, 120);
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
      toast(t('exportar.quadroVazio'), 'error');
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
      toast(t('exportar.erroMedir'), 'error');
      return;
    }

    const theme = this.#themeComPapel();
    // `exportBg` e nao `boardBg`: o quadro claro da tela e um branco quebrado
    // para nao cansar a vista, e esse cinza no arquivo so pareceria sujo.
    const background = choice.background ? theme.exportBg : null;
    const name = this.#session.name === t('quadro.semNome') ? t('quadro.nomeDeArquivo') : this.#session.name;

    this.#showProgress(t('progresso.exportando', choice.format.toUpperCase()), 0.4);
    try {
      let data: Uint8Array;
      let widthPx: number | undefined;
      let heightPx: number | undefined;
      let aviso = '';
      let parts: ExportPart[] | undefined;

      if (choice.format === 'png') {
        // PNG honra a escala pedida, custe quantos arquivos custar (B13). O
        // quadro real de estudo daria 1,6 gigapixel a 1x -- nao existe imagem unica para
        // isso, e reduzir calado era o defeito.
        const plan = planTiles(area, EXPORT_PADDING, choice.scale);
        const total = plan.cols * plan.rows;
        const tiles: RenderedPng[] = [];
        for (let row = 0; row < plan.rows; row++) {
          for (let col = 0; col < plan.cols; col++) {
            this.#showProgress(
              total > 1 ? t('progresso.exportandoParte', tiles.length + 1, total) : t('progresso.exportando', 'PNG'),
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
          adaptAgainst: background ?? theme.exportBg,
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
          background: background ?? theme.exportBg,
          theme,
        });
        data = png.bytes;
        widthPx = png.width;
        heightPx = png.height;
        if (png.scale < choice.scale - 0.001) {
          aviso = t('exportar.avisoPdf', png.scale, choice.scale);
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
        toast(t('exportar.feito', result.path, aviso));
      }
    } catch (err) {
      toast(t('exportar.erro', String(err)), 'error');
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
    // A imagem que ACABOU de entrar tambem e lida (B28). Ate 30/09/2026 a
    // leitura so acontecia ao abrir o quadro, e uma print colada com o quadro
    // aberto ficava fora do Ctrl+F ate ele ser reaberto. Le so o que ainda nao
    // foi lido, entao chamar a mais nao custa nada.
    if (objects.length > 0) this.readImagesInBackground();
    if (rejected.length > 0) {
      toast(
        rejected.length === files.length
          ? t('imagem.erroInserir', rejected.map((r) => r.name).join(', '))
          : t('imagem.recusadas', rejected.length, rejected.map((r) => r.name).join(', ')),
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
    // Selecionar junto deixa o resultado pronto para `Delete`, `Ctrl+C` ou uma
    // arrastada -- achar quase sempre e o passo anterior a mexer. Quem faz isso
    // e `focusObject`, compartilhado com a busca da biblioteca.
    if (hit) this.focusObject(hit.id);
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
      // O `execCommand` nao move o cursor, entao `selectionchange` pode nao
      // disparar -- e sem ele o interruptor aplicaria o formato e continuaria
      // apagado, que e justamente o defeito que ele veio consertar.
      this.#syncTextFormat();
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
    this.#syncTextFormat();
  }

  /**
   * Manda para a barra qual formatacao esta em vigor agora.
   *
   * "Em vigor" tem duas fontes, e a ordem entre elas importa:
   *
   * 1. DIGITANDO, quem responde e o proprio Chromium, por `queryCommandState`.
   *    E a unica fonte que sabe a diferenca entre "o cursor esta dentro de um
   *    trecho em negrito" e "o negrito foi ligado e ainda nao se digitou nada" --
   *    os dois significam negrito para a proxima letra, e nenhuma leitura do
   *    modelo enxergaria o segundo, porque ele ainda nao existe no documento.
   *
   * 2. COM UMA CAIXA SELECIONADA, quem responde e o documento: o formato vale
   *    para a caixa inteira, e so conta como ligado se TODOS os trechos tiverem
   *    -- a mesma regra que `toggleTextFormat` usa para decidir se aplica ou
   *    tira.
   *
   * Fora desses dois casos a linha B/I/U nem aparece, entao nao ha o que dizer.
   */
  #syncTextFormat(): void {
    if (this.#editor.isEditing) {
      this.#toolbar.setTextFormat({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
      });
      this.#toolbar.setTextAlign(this.#editingText()?.align ?? null);
      return;
    }

    const caixas = this.selection
      .objects(this.doc)
      .filter((o): o is TextObject => o.type === 'text');
    const ligado = (what: 'bold' | 'italic' | 'underline'): boolean =>
      caixas.length > 0 && caixas.every((o) => o.content.every((s) => s[what] === true));

    this.#toolbar.setTextFormat({
      bold: ligado('bold'),
      italic: ligado('italic'),
      underline: ligado('underline'),
    });
    // So acende quando TODAS as caixas concordam; com alinhamentos diferentes
    // nao ha resposta certa para "qual esta ligado".
    const primeiro = caixas[0]?.align ?? null;
    this.#toolbar.setTextAlign(
      caixas.length > 0 && caixas.every((o) => o.align === primeiro) ? primeiro : null,
    );
  }

  /** A caixa de texto em edicao, quando o que se edita e texto e nao post-it. */
  #editingText(): TextObject | null {
    const id = this.#editor.editingId;
    if (!id) return null;
    const obj = this.doc.get(id);
    return obj && obj.type === 'text' ? obj : null;
  }

  /**
   * Alinha as caixas de texto -- a esquerda, centralizado ou a direita.
   *
   * Vale para a CAIXA inteira, e nao para um trecho: nao existe "meia linha
   * centrada". Por isso ele nao passa pelo `execCommand` como o B/I/U; ele
   * patcha o objeto, mesmo com a caixa aberta para edicao.
   *
   * A ALTURA e remedida junto, e isso nao e detalhe: alinhar nao muda onde as
   * linhas quebram, mas muda quando o texto tem lista (o recuo do marcador entra
   * na conta). Deixar a altura velha faria a caixa cortar a ultima linha.
   */
  setTextAlign(align: TextAlign): void {
    // Com a caixa aberta, o alvo e ela; fora da edicao, a selecao.
    const emEdicao = this.#editingText();
    const alvos = emEdicao
      ? [emEdicao]
      : this.selection
          .objects(this.doc)
          .filter((o): o is TextObject => o.type === 'text' && !o.locked);
    if (alvos.length === 0) return;

    const before = new Map<string, ObjectPatch>();
    const after = new Map<string, ObjectPatch>();
    for (const obj of alvos) {
      if (obj.align === align) continue;
      before.set(obj.id, { align: obj.align, h: obj.h });
      after.set(obj.id, {
        align,
        h: obj.autoHeight ? contentHeight(obj.content, { ...styleOf(obj), align }) : obj.h,
      });
    }
    if (after.size === 0) return;

    this.history.push(new PatchObjects(this.doc, before, after, 'Alinhar texto'));
    this.history.seal();
    this.#markDirty();
    this.#scheduler.invalidate();
    // O editor desenha o proprio texto; sem isto ele continuaria alinhado como
    // estava ate a caixa fechar.
    this.#editor.refreshStyle();
    this.#syncTextFormat();
  }

  /**
   * O tamanho do texto pela barra do menu de Texto.
   *
   * A barra mudava so o tamanho do PROXIMO texto, e parecia nao funcionar
   * (06/10/2026): quem a move esta olhando para o texto que acabou de
   * escrever, ou para o selecionado. Agora ela vale para eles, pelo mesmo caminho
   * do alinhamento -- a caixa aberta, senao a selecao -- e continua definindo o
   * tamanho dos proximos.
   *
   * Um passo de desfazer por arraste: o `TransformObjects` se funde com o
   * seguinte dentro da janela do historico, como mover um objeto. A altura e
   * remedida junto; a largura fica, e o texto reflui nela.
   */
  /**
   * A cor escolhida na paleta do Texto (07/10/2026: antes, dava para mudar
   * quase tudo no texto ja escrito, menos a cor).
   *
   * - **digitando**: pinta o trecho selecionado, ou o texto todo com `Ctrl+A`
   *   (ver `TextEditor.aplicarCor`). Se o foco esta no seletor de cor do
   *   Windows, a cor espera ele fechar (`#retomarEdicao`).
   * - **com caixas selecionadas**: a caixa inteira muda de cor, e a cor de
   *   trecho que houvesse nela sai -- e o que "mudar a cor do texto" quer dizer
   *   para quem selecionou a caixa. Um passo de desfazer.
   * - sem nada disso: so a cor do proximo texto, como sempre foi.
   */
  setTextColor(cor: string): void {
    if (this.#editor.isEditing) {
      if (!this.#editor.temFoco) {
        this.#corPendente = cor;
        return;
      }
      this.#editor.aplicarCor(cor);
      return;
    }

    const alvos = this.selection
      .objects(this.doc)
      .filter((o): o is TextObject => o.type === 'text' && !o.locked);
    const before = new Map<string, ObjectPatch>();
    const after = new Map<string, ObjectPatch>();
    for (const obj of alvos) {
      if (obj.color === cor && obj.content.every((s) => s.color === undefined)) continue;
      before.set(obj.id, { color: obj.color, content: obj.content });
      after.set(obj.id, {
        color: cor,
        content: obj.content.map(({ color: _cor, ...resto }) => resto),
      });
    }
    if (after.size === 0) return;

    this.history.push(new PatchObjects(this.doc, before, after, 'Cor do texto'));
    this.history.seal();
    this.#markDirty();
    this.#scheduler.invalidate();
  }

  /** A cor escolhida no seletor do Windows, esperando a caixa voltar a ter foco. */
  #corPendente: string | null = null;

  /** Devolve o foco a caixa aberta, e aplica a cor que esperava por ela. */
  #retomarEdicao(): void {
    this.#editor.retomarFoco();
    const cor = this.#corPendente;
    this.#corPendente = null;
    if (cor !== null && this.#editor.isEditing) this.#editor.aplicarCor(cor);
  }

  setTextFontSize(size: number): void {
    if (this.#editor.setNewFontSize(size)) return;
    const emEdicao = this.#editingText();
    const alvos = emEdicao
      ? [emEdicao]
      : this.selection
          .objects(this.doc)
          .filter((o): o is TextObject => o.type === 'text' && !o.locked);
    if (alvos.length === 0) return;

    const before = new Map<string, ObjectPatch>();
    const after = new Map<string, ObjectPatch>();
    for (const obj of alvos) {
      if (obj.fontSize === size) continue;
      before.set(obj.id, { fontSize: obj.fontSize, h: obj.h });
      after.set(obj.id, {
        fontSize: size,
        h: obj.autoHeight ? contentHeight(obj.content, { ...styleOf(obj), fontSize: size }) : obj.h,
      });
    }
    if (after.size === 0) return;

    this.history.push(new TransformObjects(this.doc, before, after, 'Tamanho do texto'));
    this.#markDirty();
    this.#scheduler.invalidate();
    this.#editor.refreshStyle();
  }

  /**
   * Avisa quando a cor escolhida a mao nao vai aparecer como escolhida.
   *
   * A pergunta util nao e "ela some?" -- o adaptador de tema impede isso --, e
   * sim "ela vai ser exibida diferente?". Um cinza bem claro e resgatado por
   * inversao e aparece escuro; descobrir isso ao trocar de tema, dias depois,
   * seria pior que ler um aviso agora. Avisa e nao impede: a paleta e conferida
   * pela paleta do app, mas a escolha livre e de quem usa.
   */
  warnIfLowContrast(color: string): void {
    const trocada = (['light', 'dark'] as const).filter(
      (t) => displayedAs(color, THEMES[t].boardBg).toLowerCase() !== color.toLowerCase(),
    );
    if (trocada.length === 0) return;

    const onde =
      trocada.length === 2
        ? t('cor.ondeAmbos')
        : trocada[0] === 'light'
          ? t('cor.ondeClaro')
          : t('cor.ondeEscuro');
    const exibida = displayedAs(color, THEMES[trocada[0]!].boardBg);
    toast(t('cor.contrasteBaixo', color, onde, exibida), 'error');
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
   * ENGENHARIA.md. Travar e esconder nao merecem comando proprio: sao mudanca de
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

  get gridEnabled(): boolean {
    return this.#grade;
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
    // Colar de outro quadro pode trazer imagem que la nunca foi lida (B28).
    this.readImagesInBackground();
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
              label: t('menu.editarTexto'),
              hint: 'F2',
              onSelect: () => this.editSelection(),
            },
            ...(selecionados[0]?.type === 'text'
              ? [
                  {
                    label:
                      selecionados[0].list === 'bullet'
                        ? t('menu.tirarMarcadores')
                        : t('menu.listaComMarcadores'),
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
              label: todosFixados ? t('menu.desafixar') : t('menu.fixar'),
              onSelect: () => this.togglePinSelectedNotes(),
            },
            'separator',
          ] as MenuEntry[])
        : []),
      ...(imagem
        ? ([
            {
              label: t('menu.cortarImagem'),
              hint: t('menu.duploClique'),
              onSelect: () => this.beginCrop(imagem),
            },
            ...(imagem.crop
              ? [{ label: t('menu.removerCorte'), onSelect: () => this.removeCrop() }]
              : []),
            'separator',
          ] as MenuEntry[])
        : []),
      {
        label: t('menu.desfazer'),
        hint: 'Ctrl+Z',
        disabled: !this.history.canUndo,
        onSelect: () => this.undo(),
      },
      {
        label: t('menu.refazer'),
        hint: 'Ctrl+Shift+Z',
        disabled: !this.history.canRedo,
        onSelect: () => this.redo(),
      },
      'separator',
      {
        label: t('menu.copiar'),
        hint: 'Ctrl+C',
        disabled: nada,
        onSelect: () => this.copySelection(),
      },
      {
        label: t('menu.recortar'),
        hint: 'Ctrl+X',
        disabled: nada,
        onSelect: () => this.cutSelection(),
      },
      {
        label: t('menu.colarAqui'),
        hint: 'Ctrl+V',
        disabled: this.clipboard.isEmpty,
        onSelect: () =>
          void this.clipboard.paste(this.#toolCtx, this.assets, world).then(() => this.readImagesInBackground()),
      },
      {
        label: t('menu.duplicar'),
        hint: 'Ctrl+D',
        disabled: nada,
        onSelect: () => void duplicateSelection(this.#toolCtx),
      },
      {
        label: t('menu.trazerParaFrente'),
        hint: 'Ctrl+Shift+]',
        disabled: nada,
        onSelect: () => void reorderSelection(this.#toolCtx, 'front'),
      },
      {
        label: t('menu.enviarParaTras'),
        hint: 'Ctrl+Shift+[',
        disabled: nada,
        onSelect: () => void reorderSelection(this.#toolCtx, 'back'),
      },
      'separator',
      {
        label: t('menu.selecionarTudo'),
        hint: 'Ctrl+A',
        disabled: this.doc.size === 0,
        onSelect: () => selectAll(this.#toolCtx),
      },
      {
        label: t('menu.excluir', n),
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
      fit: () => this.centralizarConteudo(),
      zoomIn: () => this.#zoomCenter(1.25),
      zoomOut: () => this.#zoomCenter(1 / 1.25),
      undo: () => this.undo(),
      redo: () => this.redo(),
      selectAll: () => selectAll(this.#toolCtx),
      find: () => this.openSearch(),
      findLibrary: () => this.#lobby.focusSearch(),
      newBoard: () => void this.newBoard(),
      saveLobby: () => toast(t('lobby.nadaParaSalvar')),
      debugLobby: () => this.#lobby.alternarDesempenho(),
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
