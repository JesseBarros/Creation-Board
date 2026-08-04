import type { Vec2 } from '@shared/geometry/vec2';
import { computeBbox } from '@shared/model/bbox';
import type {
  BoardObject,
  NoteObject,
  PathObject,
  ShapeKind,
  ShapeObject,
  StrokeObject,
  TextObject,
} from '@shared/model/types';
import type { WbdDocument } from '@shared/model/document';
import type { App } from '../App';
import { MAX_ZOOM, MIN_ZOOM, type Camera } from '../core/Camera';
import { applyPatches } from '../commands/patch';
import { computeFrame } from '../features/selection/frame';
import { moveObjects } from '../features/selection/transformOps';
import { snapRect } from '../features/snapping/snap';
import { applyBoard, serializeBoard } from '../features/storage/boardIO';
import { plainText } from '../features/text/spans';
import { searchBoard } from '../features/search/search';
import { layoutOf, layoutText } from '../render/text/layout';
import { offscreenPinnedNotes } from '../render/PinnedNotes';
import { generateStressObjects } from './stress';

/**
 * Auto-teste de entrada: navegacao da camera e ferramenta de selecao.
 *
 * Roda com `npm run selftest` e imprime o resultado no terminal.
 *
 * Por que existe: verificar isto por screenshot exige que a janela esteja em
 * primeiro plano e captura a tela inteira -- fragil e invasivo. Aqui os eventos
 * de ponteiro e de teclado sao despachados direto no app, exercitando
 * ViewportInput, ToolManager e o registro de atalhos de ponta a ponta, sem
 * depender de foco nem de captura de tela.
 *
 * O que isto NAO cobre: a traducao que o sistema operacional faz do botao fisico
 * para `PointerEvent.button`. Esse mapeamento e padrao (0=esquerdo, 1=meio,
 * 2=direito) e nao varia entre plataformas.
 */

interface Result {
  nome: string;
  ok: boolean;
  detalhe: string;
}

interface Modifiers {
  shift?: boolean;
  alt?: boolean;
  ctrl?: boolean;
  /** Pressao da caneta, 0..1. Sem isto o evento sintetico chega com 0. */
  pressure?: number;
}

function pointer(
  host: HTMLElement,
  type: string,
  x: number,
  y: number,
  button: number,
  mod: Modifiers = {},
): void {
  host.dispatchEvent(
    new PointerEvent(type, {
      pointerId: 1,
      clientX: x,
      clientY: y,
      button,
      // `buttons` e um bitmask: 1=esquerdo, 2=direito, 4=meio.
      buttons: type === 'pointerup' ? 0 : button === 2 ? 2 : button === 1 ? 4 : 1,
      pressure: mod.pressure ?? 0.5,
      shiftKey: mod.shift ?? false,
      altKey: mod.alt ?? false,
      ctrlKey: mod.ctrl ?? false,
      bubbles: true,
      cancelable: true,
    }),
  );
}

function drag(
  host: HTMLElement,
  button: number,
  fromX: number,
  fromY: number,
  dx: number,
  dy: number,
  mod: Modifiers = {},
): void {
  pointer(host, 'pointerdown', fromX, fromY, button, mod);
  // Varios passos: o primeiro serve para cruzar o limiar de arrasto.
  for (let i = 1; i <= 4; i++) {
    pointer(host, 'pointermove', fromX + (dx * i) / 4, fromY + (dy * i) / 4, button, mod);
  }
  pointer(host, 'pointerup', fromX + dx, fromY + dy, button, mod);
}

/**
 * Traco a mao livre, com pressao variando ao longo do gesto.
 *
 * Diferente de `drag`: mais passos e pressao, porque o que se exercita aqui e a
 * captura de pontos da caneta, nao o limiar de arrasto.
 */
function freehand(
  host: HTMLElement,
  fromX: number,
  fromY: number,
  dx: number,
  dy: number,
  steps = 6,
  pressureAt: (t: number) => number = () => 0.5,
): void {
  pointer(host, 'pointerdown', fromX, fromY, 0, { pressure: pressureAt(0) });
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    pointer(host, 'pointermove', fromX + dx * t, fromY + dy * t, 0, { pressure: pressureAt(t) });
  }
  pointer(host, 'pointerup', fromX + dx, fromY + dy, 0, { pressure: pressureAt(1) });
}

/** Clique sem arrasto: fica abaixo do limiar de propósito. */
function click(host: HTMLElement, x: number, y: number, mod: Modifiers = {}): void {
  pointer(host, 'pointerdown', x, y, 0, mod);
  pointer(host, 'pointermove', x + 1, y, 0, mod);
  pointer(host, 'pointerup', x + 1, y, 0, mod);
}

function wheel(host: HTMLElement, x: number, y: number, deltaY: number, ctrl: boolean): void {
  host.dispatchEvent(
    new WheelEvent('wheel', { clientX: x, clientY: y, deltaY, ctrlKey: ctrl, bubbles: true, cancelable: true }),
  );
}

function key(k: string, mod: Modifiers = {}): void {
  window.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: k,
      ctrlKey: mod.ctrl ?? false,
      shiftKey: mod.shift ?? false,
      altKey: mod.alt ?? false,
      bubbles: true,
      cancelable: true,
    }),
  );
}

const near = (a: number, b: number, tol = 0.5): boolean => Math.abs(a - b) <= tol;

// ------------------------------------------------------------------ cenario

const BASE = {
  parentId: null,
  opacity: 1,
  locked: false,
  hidden: false,
  rev: 0,
  createdAt: 0,
  updatedAt: 0,
} as const;

function shape(id: string, x: number, y: number, z: string): ShapeObject {
  const o: ShapeObject = {
    ...BASE,
    id,
    type: 'shape',
    kind: 'rect',
    z,
    transform: { x, y, rotation: 0, scaleX: 1, scaleY: 1 },
    bbox: { x: 0, y: 0, w: 0, h: 0 },
    w: 100,
    h: 100,
    stroke: null,
    strokeWidth: 0,
    fill: '#cccccc',
  };
  o.bbox = computeBbox(o);
  return o;
}

/** Traco na diagonal: o AABB dele cobre um quadrado quase todo vazio. */
function diagonal(id: string, x: number, y: number, z: string): StrokeObject {
  const o: StrokeObject = {
    ...BASE,
    id,
    type: 'stroke',
    variant: 'pen',
    z,
    transform: { x, y, rotation: 0, scaleX: 1, scaleY: 1 },
    bbox: { x: 0, y: 0, w: 0, h: 0 },
    points: [0, 0, 1, 200, 200, 1],
    color: '#222222',
    width: 4,
  };
  o.bbox = computeBbox(o);
  return o;
}

/**
 * Tinta importada: contorno preenchido, como a caligrafia que vem do Whiteboard.
 * Nao e produzida por nenhuma ferramenta do app -- so pela importacao.
 */
function inkPath(id: string, x: number, y: number, z: string): PathObject {
  const o: PathObject = {
    ...BASE,
    id,
    type: 'path',
    z,
    transform: { x, y, rotation: 0, scaleX: 1, scaleY: 1 },
    bbox: { x: 0, y: 0, w: 0, h: 0 },
    d: 'M0 0 L120 0 L120 24 L0 24 Z',
    fill: '#1f2933',
  };
  o.bbox = computeBbox(o);
  return o;
}

function scene(): BoardObject[] {
  return [
    shape('A', 100, 100, 'a1'),
    shape('B', 300, 100, 'a2'),
    shape('C', 500, 100, 'a3'),
    diagonal('INK', 100, 300, 'a4'),
  ];
}

// -------------------------------------------------------------------- testes

export async function runSelfTest(host: HTMLElement, app: App): Promise<void> {
  const camera = app.camera;
  const results: Result[] = [];
  const check = (nome: string, ok: boolean, detalhe: string): void => {
    results.push({ nome, ok, detalhe });
  };

  const reset = (): void => {
    camera.x = 0;
    camera.y = 0;
    camera.zoom = 1;
  };

  /**
   * Roda um bloco de verificacoes sem deixar uma excecao derrubar o resto.
   *
   * Sem isto, um erro dentro de um bloco aborta `runSelfTest` inteiro: o
   * relatorio nunca e impresso, `markClean` nunca roda, o guarda de
   * `beforeunload` recusa o fechamento e a execucao automatizada fica pendurada
   * ate alguem fechar a janela na mao. Um bloco que explode tem de virar FALHA
   * com a mensagem, como qualquer outra.
   */
  const block = async (nome: string, fn: () => void | Promise<void>): Promise<void> => {
    try {
      await fn();
    } catch (err) {
      const stack = err instanceof Error ? (err.stack ?? err.message) : String(err);
      check(`bloco "${nome}" terminou sem explodir`, false, stack.split('\n').slice(0, 3).join(' | '));
    }
  };

  await block('camera', () => runCameraTests(host, camera, check, reset));
  await block('selecao', () => runSelectionTests(host, app, check, reset));
  await block('desenho', () => runDrawingTests(host, app, check, reset));
  await block('formas e encaixe', () => runShapeAndSnapTests(host, app, check, reset));
  await block('texto e post-its', () => runTextTests(host, app, check, reset));
  await block('busca', () => runSearchTests(app, check, reset));

  // Deixa o cenario montado no fim. Com QB_SHOT a janela nao fecha ao terminar,
  // entao a foto vira a conferencia do que nenhum numero daqui verifica: o cromo
  // de selecao, a aparencia das tres variantes de traco, as formas, as reguas e a
  // guia de encaixe. Tudo produzido pelas ferramentas de verdade, e nao montado a
  // mao, para a foto mostrar o que o usuario veria.
  await block('cena da foto', () => {
    reset();
    app.selection.clear();
    app.history.clear();
    app.doc.clear();
    app.doc.setPrefs({ snapToGrid: false, unit: 'px' });
    app.doc.add(scene());
    paintSampleStrokes(host, app);
    paintSampleShapes(host, app);
    writeSampleText(host, app);
    app.setTool('select');
    app.history.clear();
    if (!app.rulersEnabled) app.toggleRulers();
    snapAgainstNeighbor(host, app);
    // A busca aberta com um resultado destacado entra na foto: o painel, o
    // trecho com o pedaco marcado e o contorno roxo em volta do objeto sao
    // justamente o que numero nenhum verifica.
    showSearchForShot(app);
  });
  // Sem isto o quadro fica marcado como sujo, o guarda de `beforeunload`
  // recusa o fechamento e a execucao automatizada nunca termina.
  app.markClean();

  const falhas = results.filter((r) => !r.ok).length;
  const linhas = results.map((r) => `  ${r.ok ? 'OK  ' : 'FALHA'} ${r.nome} — ${r.detalhe}`);
  console.log(`SELFTEST\n${linhas.join('\n')}\nSELFTEST_FIM ${falhas === 0 ? 'tudo passou' : `${falhas} falha(s)`}`);
}

type Check = (nome: string, ok: boolean, detalhe: string) => void;

/**
 * Um traco de cada variante, para a foto do QB_SHOT.
 *
 * O marca-texto passa por cima do texto de propósito: e ali que se ve se ele
 * entrou por baixo (grifo) ou por cima (borrao). O lapis vai com pressao
 * crescente, que e a unica forma de ver a modulacao de espessura.
 */
function paintSampleStrokes(host: HTMLElement, app: App): void {
  const box = host.getBoundingClientRect();
  const draw = (
    tool: 'pen' | 'highlighter' | 'pencil',
    x: number,
    y: number,
    dx: number,
    dy: number,
    pressureAt?: (t: number) => number,
  ): void => {
    app.setTool(tool);
    freehand(host, x + box.left, y + box.top, dx, dy, 24, pressureAt);
  };

  draw('pen', 700, 140, 160, 90);
  // Cruza o traco preto da cena: e ali que se ve o grifo passando POR BAIXO da
  // tinta que ja estava no quadro, em vez de borra-la.
  draw('highlighter', 110, 400, 420, 0);
  draw('pencil', 700, 320, 170, 60, (t) => 0.15 + 0.85 * t);

  // Um buraco de borracha no meio do traco de caneta: e o que a foto tem a
  // mostrar da Fase 5.5, porque nenhum numero prova que o pedaco sumiu com a
  // borda certa e sem deixar mancha da cor do fundo.
  app.setTool('eraser');
  app.drawStyle.setEraserMode('peca');
  app.drawStyle.setWidth('eraser', 28);
  freehand(host, 760 + box.left, 160 + box.top, 20, 60, 12);
}

/** Uma forma fechada e uma aberta, tambem para a foto. */
function paintSampleShapes(host: HTMLElement, app: App): void {
  const box = host.getBoundingClientRect();
  app.setTool('shape');

  app.drawStyle.setShapeKind('ellipse');
  app.drawStyle.setShapeFilled(true);
  drag(host, 0, 620 + box.left, 480 + box.top, 200, 120);

  app.drawStyle.setShapeKind('arrow');
  app.drawStyle.setShapeFilled(false);
  drag(host, 0, 560 + box.left, 560 + box.top, -180, -90);
}

/**
 * Uma caixa de texto e um post-it com alerta, para a foto do QB_SHOT.
 *
 * Escritos pelas ferramentas de verdade, passando pelo editor: e a unica forma
 * de a foto mostrar o texto como ele fica DEPOIS de a edicao terminar -- que e
 * o momento em que o canvas volta a desenhar e onde um erro de layout apareceria.
 */
function writeSampleText(host: HTMLElement, app: App): void {
  const box = host.getBoundingClientRect();

  app.setTool('text');
  click(host, 120 + box.left, 480 + box.top);
  // Em HTML porque e assim que o negrito chega do editor de verdade (Ctrl+B):
  // a foto tem de mostrar formatacao real, e nao asterisco desenhado.
  typeInEditor('Fase 5: <b>texto</b> com <u>formatacao</u>,<br>quebra de linha e cursor.', {
    html: true,
  });

  app.setTool('select');
  const listado = [...app.doc.all()].find((o) => o.type === 'text');
  if (listado) {
    app.selection.set([listado.id]);
    app.toggleBulletList();
    app.selection.clear();
  }

  app.setTool('note');
  app.drawStyle.setNoteBg('#ffdeeb');
  app.drawStyle.setNoteAlert('importante');
  click(host, 900 + box.left, 120 + box.top);
  typeInEditor('Post-it com alerta.');
  app.drawStyle.setNoteAlert(null);
}

/**
 * Deixa a busca aberta, com resultado, para a foto do QB_SHOT.
 *
 * A camera NAO e movida: o enquadramento da cena e o que mostra o resto das
 * fases, e levar a camera ate o resultado esvaziaria a foto.
 */
function showSearchForShot(app: App): void {
  app.openSearch();
  const campo = document.querySelector<HTMLInputElement>('.qb-search__input');
  if (!campo) return;
  campo.value = 'texto';
  campo.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Encosta A em C pelo encaixe, e deixa o resultado na tela.
 *
 * O gesto para a 5px da borda de C e o encaixe completa o resto -- na foto, as
 * duas bordas coincidem exatamente. A GUIA nao aparece aqui: ela existe so
 * enquanto o botao esta pressionado, e um gesto deixado em aberto e desfeito
 * pelo proprio guarda de `blur` do ToolManager assim que a janela perde o foco
 * (que e o comportamento certo -- gesto pendurado nao pode sobreviver). Quem
 * verifica a guia e a checagem numerica sobre `snapRect`.
 */
function snapAgainstNeighbor(host: HTMLElement, app: App): void {
  const box = host.getBoundingClientRect();
  app.setTool('select');
  app.selection.set(['A']);
  drag(host, 0, 150 + box.left, 150 + box.top, 395, 0);
  app.history.clear();
}

function runCameraTests(host: HTMLElement, camera: Camera, check: Check, reset: () => void): void {
  // --- pan com o botao direito
  reset();
  drag(host, 2, 400, 300, 120, 80);
  // Arrastar 120px para a direita com zoom 1 move a camera 120 unidades para a
  // esquerda: o conteudo acompanha o cursor.
  check(
    'pan com botao direito',
    near(camera.x, -120) && near(camera.y, -80),
    `camera=(${camera.x.toFixed(1)}, ${camera.y.toFixed(1)}) esperado=(-120.0, -80.0)`,
  );

  // --- clique direito sem arrastar nao pode mover
  reset();
  pointer(host, 'pointerdown', 400, 300, 2);
  pointer(host, 'pointermove', 401, 301, 2); // 1.4px: abaixo do limiar
  pointer(host, 'pointerup', 401, 301, 2);
  check(
    'clique direito parado nao move (abre o menu de contexto)',
    camera.x === 0 && camera.y === 0,
    `camera=(${camera.x.toFixed(1)}, ${camera.y.toFixed(1)}) esperado=(0.0, 0.0)`,
  );

  // --- pan com o botao do meio continua funcionando
  reset();
  drag(host, 1, 400, 300, -60, 40);
  check(
    'pan com botao do meio',
    near(camera.x, 60) && near(camera.y, -40),
    `camera=(${camera.x.toFixed(1)}, ${camera.y.toFixed(1)}) esperado=(60.0, -40.0)`,
  );

  // --- botao esquerdo nao pode mover a camera (pertence as ferramentas)
  reset();
  drag(host, 0, 400, 300, 100, 100);
  check(
    'botao esquerdo nao move o quadro',
    camera.x === 0 && camera.y === 0,
    `camera=(${camera.x.toFixed(1)}, ${camera.y.toFixed(1)}) esperado=(0.0, 0.0)`,
  );

  // --- zoom mantem fixo o ponto do mundo sob o cursor
  reset();
  const anchor = { x: 500, y: 400 };
  const worldBefore = camera.screenToWorld(anchor);
  wheel(host, anchor.x, anchor.y, -100, true);
  const worldAfter = camera.screenToWorld(anchor);
  check(
    'zoom fica ancorado no cursor',
    camera.zoom > 1 && near(worldBefore.x, worldAfter.x, 0.01) && near(worldBefore.y, worldAfter.y, 0.01),
    `zoom=${camera.zoom.toFixed(3)} mundo antes=(${worldBefore.x.toFixed(2)}, ${worldBefore.y.toFixed(2)}) depois=(${worldAfter.x.toFixed(2)}, ${worldAfter.y.toFixed(2)})`,
  );

  // --- limite superior de zoom
  reset();
  for (let i = 0; i < 400; i++) wheel(host, 500, 400, -100, true);
  check(
    `zoom maximo chega a ${MAX_ZOOM * 100}%`,
    near(camera.zoom, MAX_ZOOM, 1e-6),
    `zoom=${(camera.zoom * 100).toFixed(0)}% esperado=${MAX_ZOOM * 100}%`,
  );

  // --- limite inferior de zoom
  reset();
  for (let i = 0; i < 400; i++) wheel(host, 500, 400, 100, true);
  check(
    `zoom minimo chega a ${MIN_ZOOM * 100}%`,
    near(camera.zoom, MIN_ZOOM, 1e-6),
    `zoom=${(camera.zoom * 100).toFixed(2)}% esperado=${MIN_ZOOM * 100}%`,
  );

  // --- roda sem ctrl rola em vez de dar zoom
  reset();
  wheel(host, 500, 400, 120, false);
  check(
    'roda sem Ctrl rola na vertical',
    camera.zoom === 1 && near(camera.y, 120),
    `zoom=${camera.zoom} camera.y=${camera.y.toFixed(1)} esperado=(1, 120.0)`,
  );
}

async function runSelectionTests(
  host: HTMLElement,
  app: App,
  check: Check,
  reset: () => void,
): Promise<void> {
  const { doc, selection, history } = app;

  /** Repoe o cenario. Cada teste comeca do mesmo estado conhecido. */
  const setup = (): void => {
    reset();
    selection.clear();
    history.clear();
    doc.clear();
    doc.add(scene());
  };

  // Com a camera zerada, mundo e tela coincidem; so falta o canto do host.
  const box = host.getBoundingClientRect();
  const at = (w: Vec2): Vec2 => ({ x: w.x + box.left, y: w.y + box.top });
  const clickAt = (w: Vec2, mod: Modifiers = {}): void => {
    const p = at(w);
    click(host, p.x, p.y, mod);
  };
  const dragFrom = (w: Vec2, dx: number, dy: number, mod: Modifiers = {}): void => {
    const p = at(w);
    drag(host, 0, p.x, p.y, dx, dy, mod);
  };
  const sel = (): string => `[${selection.ids().sort().join(',')}]`;
  const xOf = (id: string): number => doc.get(id)?.transform.x ?? NaN;

  // --- clique seleciona o objeto sob o cursor
  setup();
  clickAt({ x: 150, y: 150 });
  check('clique seleciona o objeto sob o cursor', sel() === '[A]', `selecao=${sel()} esperado=[A]`);

  // --- clique no vazio limpa
  clickAt({ x: 750, y: 550 });
  check('clique no vazio limpa a selecao', selection.isEmpty, `selecao=${sel()} esperado=[]`);

  // --- Shift soma a selecao
  setup();
  clickAt({ x: 150, y: 150 });
  clickAt({ x: 350, y: 150 }, { shift: true });
  check('Shift+clique soma a selecao', sel() === '[A,B]', `selecao=${sel()} esperado=[A,B]`);

  // --- Shift tira da selecao
  clickAt({ x: 150, y: 150 }, { shift: true });
  check('Shift+clique tira da selecao', sel() === '[B]', `selecao=${sel()} esperado=[B]`);

  // --- o hit-test segue a geometria, nao o retangulo
  // O traco vai de (100,300) a (300,500). O ponto abaixo esta DENTRO do AABB
  // dele e a 127px da linha: selecionar ali seria selecionar o vazio.
  setup();
  const dentroDoAabb = { x: 110, y: 490 };
  const ink = doc.get('INK')!;
  const cobreOPonto =
    dentroDoAabb.x >= ink.bbox.x &&
    dentroDoAabb.x <= ink.bbox.x + ink.bbox.w &&
    dentroDoAabb.y >= ink.bbox.y &&
    dentroDoAabb.y <= ink.bbox.y + ink.bbox.h;
  clickAt(dentroDoAabb);
  check(
    'clique no vazio dentro do retangulo do traco nao seleciona',
    cobreOPonto && selection.isEmpty,
    `ponto no AABB=${cobreOPonto} selecao=${sel()} esperado=[]`,
  );

  clickAt({ x: 200, y: 400 });
  check('clique em cima do traco seleciona', sel() === '[INK]', `selecao=${sel()} esperado=[INK]`);

  // --- laco por area
  setup();
  dragFrom({ x: 60, y: 60 }, 360, 200);
  check('laco seleciona por area', sel() === '[A,B]', `selecao=${sel()} esperado=[A,B]`);

  // --- mover a selecao
  setup();
  clickAt({ x: 150, y: 150 });
  dragFrom({ x: 150, y: 150 }, 40, 20);
  const movidoX = xOf('A');
  const movidoY = doc.get('A')!.transform.y;
  check(
    'arrastar move a selecao',
    near(movidoX, 140) && near(movidoY, 120),
    `A=(${movidoX.toFixed(1)}, ${movidoY.toFixed(1)}) esperado=(140.0, 120.0)`,
  );

  // --- um arraste inteiro e um unico passo de undo
  check(
    'um arraste = um passo de undo',
    history.depth === 1,
    `passos=${history.depth} esperado=1`,
  );
  history.undo();
  check(
    'desfazer devolve o objeto ao lugar',
    near(xOf('A'), 100),
    `A.x=${xOf('A').toFixed(1)} esperado=100.0`,
  );

  // --- Shift trava o arraste num eixo
  setup();
  clickAt({ x: 150, y: 150 });
  dragFrom({ x: 150, y: 150 }, 60, 12, { shift: true });
  check(
    'Shift trava o arraste no eixo dominante',
    near(xOf('A'), 160) && near(doc.get('A')!.transform.y, 100),
    `A=(${xOf('A').toFixed(1)}, ${doc.get('A')!.transform.y.toFixed(1)}) esperado=(160.0, 100.0)`,
  );

  // --- redimensionar pela alca
  setup();
  clickAt({ x: 150, y: 150 });
  // A alca 'se' de A fica exatamente no canto (200,200); dobrar a distancia
  // ate a ancora (100,100) deve dobrar o objeto.
  dragFrom({ x: 200, y: 200 }, 100, 100);
  const escalado = doc.get('A')!;
  check(
    'arrastar a alca redimensiona',
    near(escalado.transform.scaleX, 2, 0.02) && near(escalado.bbox.w, 200, 1),
    `escala=${escalado.transform.scaleX.toFixed(2)} largura=${escalado.bbox.w.toFixed(1)} esperado=(2.00, 200.0)`,
  );
  check(
    'a ancora oposta fica parada ao redimensionar',
    near(escalado.bbox.x, 100, 0.5) && near(escalado.bbox.y, 100, 0.5),
    `canto=(${escalado.bbox.x.toFixed(1)}, ${escalado.bbox.y.toFixed(1)}) esperado=(100.0, 100.0)`,
  );

  // --- girar pela alca de cima
  setup();
  clickAt({ x: 150, y: 150 });
  // Centro de A e (150,150) e a alca de rotacao fica 22px acima do meio da
  // borda de cima, em (150,78) -- ou seja, a -90 graus do centro. Soltar em
  // (222,150), que esta a 0 grau do centro, e exatamente um quarto de volta.
  dragFrom({ x: 150, y: 100 - 22 }, 72, 72);
  const girado = doc.get('A')!.transform.rotation;
  check(
    'arrastar a alca de cima gira',
    near(Math.abs(girado), Math.PI / 2, 0.08),
    `rotacao=${((girado * 180) / Math.PI).toFixed(1)}graus esperado=~90graus`,
  );

  // --- excluir e desfazer
  setup();
  clickAt({ x: 150, y: 150 });
  key('Delete');
  // Os totais vao para variaveis porque `doc.size` e lido antes e depois do
  // undo: comparado direto, o compilador estreita o segundo teste pelo primeiro
  // e acusa que 3 e 4 nunca coincidem.
  const depoisDoDelete = doc.size;
  const apagou = depoisDoDelete === 3 && doc.get('A') === undefined;
  key('z', { ctrl: true });
  const depoisDoUndo = doc.size;
  check(
    'Delete exclui e Ctrl+Z traz de volta',
    apagou && depoisDoUndo === 4 && doc.get('A') !== undefined,
    `apagou=${apagou} depois do undo=${depoisDoUndo} objetos esperado=4`,
  );

  // --- a selecao nao sobrevive a exclusao do que estava nela
  setup();
  clickAt({ x: 150, y: 150 });
  key('Delete');
  check(
    'excluir limpa a selecao (sem alcas orfas)',
    selection.isEmpty,
    `selecao=${sel()} esperado=[]`,
  );

  // --- duplicar
  setup();
  clickAt({ x: 150, y: 150 });
  key('d', { ctrl: true });
  const copia = selection.ids()[0];
  check(
    'Ctrl+D duplica e seleciona a copia',
    doc.size === 5 && selection.size === 1 && copia !== 'A' && doc.get(copia ?? '') !== undefined,
    `objetos=${doc.size} selecao=${sel()} esperado=5 objetos e 1 copia nova`,
  );

  // --- as setas movem
  setup();
  clickAt({ x: 150, y: 150 });
  key('ArrowRight');
  const umPasso = xOf('A');
  key('ArrowRight', { shift: true });
  check(
    'setas movem 1 px e Shift+setas movem 10 px',
    near(umPasso, 101) && near(xOf('A'), 111),
    `depois de 1 seta=${umPasso.toFixed(1)} depois do Shift=${xOf('A').toFixed(1)} esperado=(101.0, 111.0)`,
  );

  // --- selecionar tudo e limpar com Esc
  setup();
  key('a', { ctrl: true });
  const todos = selection.size;
  key('Escape');
  check(
    'Ctrl+A seleciona tudo e Esc limpa',
    todos === 4 && selection.isEmpty,
    `Ctrl+A=${todos} objetos, depois do Esc=${selection.size} esperado=(4, 0)`,
  );

  // --- ordem de camadas
  setup();
  clickAt({ x: 150, y: 150 });
  key(']', { ctrl: true, shift: true });
  const aZ = doc.get('A')!.z;
  const cZ = doc.get('C')!.z;
  check(
    'trazer para frente poe o objeto acima dos demais',
    aZ > cZ,
    `A.z=${aZ} C.z=${cZ} esperado=A.z > C.z`,
  );

  // --- objeto travado nao entra na selecao
  setup();
  const travado = { ...doc.get('B')!, locked: true };
  doc.replace(travado);
  clickAt({ x: 350, y: 150 });
  check(
    'objeto travado nao pode ser selecionado',
    selection.isEmpty,
    `selecao=${sel()} esperado=[]`,
  );

  // --- copiar e colar na posicao do cursor
  setup();
  clickAt({ x: 150, y: 150 });
  app.copySelection();
  // Move o cursor antes de colar: e ele que decide onde a copia cai.
  const alvo = at({ x: 700, y: 400 });
  pointer(host, 'pointermove', alvo.x, alvo.y, 0);
  await app.pasteClipboard();
  const colado = selection.ids()[0];
  const colada = colado ? doc.get(colado) : undefined;
  const centro = colada
    ? { x: colada.bbox.x + colada.bbox.w / 2, y: colada.bbox.y + colada.bbox.h / 2 }
    : { x: NaN, y: NaN };
  check(
    'Ctrl+C e Ctrl+V colam centrado no cursor',
    doc.size === 5 && colado !== 'A' && near(centro.x, 700) && near(centro.y, 400),
    `objetos=${doc.size} centro da copia=(${centro.x.toFixed(1)}, ${centro.y.toFixed(1)}) esperado=(700.0, 400.0)`,
  );

  // --- recortar tira agora e devolve ao colar
  setup();
  clickAt({ x: 150, y: 150 });
  app.cutSelection();
  const depoisDoCut = doc.size;
  await app.pasteClipboard();
  check(
    'Ctrl+X recorta e Ctrl+V devolve',
    depoisDoCut === 3 && doc.size === 4,
    `depois do recorte=${depoisDoCut} depois de colar=${doc.size} esperado=(3, 4)`,
  );

  // --- custo de arrastar uma selecao muito grande
  // O caso real: abrir um resumo importado, Ctrl+A e reorganizar tudo de uma
  // vez. Cada frame do arraste recalcula o bbox e reposiciona no R-tree cada
  // objeto selecionado, entao o custo cresce com a selecao, nao com o zoom --
  // o culling nao ajuda aqui.
  {
    const N = 10000;
    reset();
    selection.clear();
    history.clear();
    doc.clear();
    doc.add(generateStressObjects(N));
    selection.set([...doc.all()].map((o) => o.id));

    const originais = selection.objects(doc);
    applyPatches(doc, moveObjects(originais, 1, 1)); // aquecimento do JIT

    const FRAMES = 20;
    const t0 = performance.now();
    for (let i = 1; i <= FRAMES; i++) applyPatches(doc, moveObjects(originais, i, i));
    const msArraste = (performance.now() - t0) / FRAMES;

    // O overlay refaz esta lista a cada frame para saber o que contornar.
    const t1 = performance.now();
    for (let i = 0; i < FRAMES; i++) computeFrame(selection.objects(doc));
    const msOverlay = (performance.now() - t1) / FRAMES;

    // Reparticao do custo, para nao otimizar por palpite.
    let msBbox = 0;
    let msIndex = 0;
    let msRebuild = 0;
    {
      const objs = [...doc.all()];
      const a = performance.now();
      for (let i = 0; i < FRAMES; i++) for (const o of objs) computeBbox(o);
      msBbox = (performance.now() - a) / FRAMES;
      const b = performance.now();
      for (let i = 0; i < FRAMES; i++) for (const o of objs) doc.index.update(o);
      msIndex = (performance.now() - b) / FRAMES;
      const c = performance.now();
      for (let i = 0; i < FRAMES; i++) doc.index.rebuild(objs);
      msRebuild = (performance.now() - c) / FRAMES;
    }
    const total = msArraste + msOverlay;
    check(
      `arrastar ${N.toLocaleString('pt-BR')} objetos selecionados fica acima de 30fps`,
      total < 33,
      `${total.toFixed(1)} ms/frame (mover ${msArraste.toFixed(1)} + overlay ${msOverlay.toFixed(1)}), ` +
        `teto 33 ms | reparticao: bbox ${msBbox.toFixed(1)} · indice em lote ${msRebuild.toFixed(1)} ` +
        `(seria ${msIndex.toFixed(1)} um a um)`,
    );
  }

  // --- o que a manipulacao produz sobrevive ao formato gravado
  // Move, redimensiona e gira A, depois passa o documento pelo mesmo JSON que
  // vai para dentro do .wbd. Se `transform` nao sobrevivesse, salvar um quadro
  // reorganizado devolveria tudo para as posicoes originais na proxima abertura.
  setup();
  clickAt({ x: 150, y: 150 });
  dragFrom({ x: 150, y: 150 }, 40, 20);
  dragFrom({ x: 240, y: 220 }, 100, 100);
  const antes = doc.get('A')!.transform;
  const gravado = JSON.parse(
    JSON.stringify(serializeBoard(doc, app.camera, app.assets)),
  ) as WbdDocument;
  applyBoard(doc, app.camera, gravado);
  const depois = doc.get('A')?.transform;
  check(
    'mover e redimensionar sobrevivem ao formato do .wbd',
    depois !== undefined &&
      near(depois.x, antes.x, 0.01) &&
      near(depois.y, antes.y, 0.01) &&
      near(depois.scaleX, antes.scaleX, 0.001) &&
      near(depois.scaleY, antes.scaleY, 0.001),
    `antes=(${antes.x.toFixed(1)}, ${antes.y.toFixed(1)}, escala ${antes.scaleX.toFixed(2)}) ` +
      `depois=(${depois?.x.toFixed(1)}, ${depois?.y.toFixed(1)}, escala ${depois?.scaleX.toFixed(2)})`,
  );
}

// ---------------------------------------------------------------- desenho

function runDrawingTests(host: HTMLElement, app: App, check: Check, reset: () => void): void {
  const { doc, selection, history } = app;

  const setup = (tool: 'select' | 'pen' | 'highlighter' | 'pencil' | 'eraser'): void => {
    reset();
    selection.clear();
    history.clear();
    doc.clear();
    doc.add(scene());
    app.setTool(tool);
  };

  // Camera zerada: mundo e tela coincidem, so falta o canto do host.
  const box = host.getBoundingClientRect();
  const drawAt = (
    w: Vec2,
    dx: number,
    dy: number,
    steps = 6,
    pressureAt?: (t: number) => number,
  ): void => {
    freehand(host, w.x + box.left, w.y + box.top, dx, dy, steps, pressureAt);
  };
  /** O traco criado agora: o unico do tipo alem do INK do cenario. */
  const drawn = (): StrokeObject | undefined =>
    [...doc.all()].find((o): o is StrokeObject => o.type === 'stroke' && o.id !== 'INK');

  // --- a caneta produz um traco na geometria certa
  setup('pen');
  drawAt({ x: 700, y: 200 }, 120, 80);
  const traco = drawn();
  const ultimoX = traco ? traco.points[traco.points.length - 3] : NaN;
  const ultimoY = traco ? traco.points[traco.points.length - 2] : NaN;
  check(
    'a caneta cria um traco ancorado onde o gesto comecou',
    traco !== undefined &&
      traco.variant === 'pen' &&
      near(traco.transform.x, 700) &&
      near(traco.transform.y, 200) &&
      near(ultimoX ?? NaN, 120) &&
      near(ultimoY ?? NaN, 80),
    `objetos=${doc.size} ancora=(${traco?.transform.x.toFixed(1)}, ${traco?.transform.y.toFixed(1)}) ` +
      `ultimo ponto local=(${ultimoX?.toFixed(1)}, ${ultimoY?.toFixed(1)}) esperado=(700, 200) e (120, 80)`,
  );

  // --- um traco = um passo de undo
  const antesDoUndo = doc.size;
  const passos = history.depth;
  key('z', { ctrl: true });
  check(
    'um traco = um passo de undo',
    passos === 1 && antesDoUndo === 5 && doc.size === 4,
    `passos=${passos} objetos antes=${antesDoUndo} depois do Ctrl+Z=${doc.size} esperado=(1, 5, 4)`,
  );

  // --- o AABB do traco inclui a espessura
  // Sem isso o culling corta o traco cedo demais na borda da tela e o clique na
  // extremidade dele nao pega.
  setup('pen');
  drawAt({ x: 700, y: 200 }, 120, 80);
  const comEspessura = drawn();
  const meia = (comEspessura?.width ?? 0) / 2;
  check(
    'o AABB do traco inclui a espessura',
    comEspessura !== undefined &&
      meia > 0 &&
      near(comEspessura.bbox.x, 700 - meia) &&
      near(comEspessura.bbox.w, 120 + meia * 2),
    `bbox=(${comEspessura?.bbox.x.toFixed(1)}, largura ${comEspessura?.bbox.w.toFixed(1)}) ` +
      `espessura=${comEspessura?.width} esperado=(${(700 - meia).toFixed(1)}, ${(120 + meia * 2).toFixed(1)})`,
  );

  // --- o traco recem-criado responde ao clique onde foi desenhado
  app.setTool('select');
  click(host, 760 + box.left, 240 + box.top);
  check(
    'o traco desenhado e clicavel no lugar onde foi feito',
    selection.size === 1 && selection.ids()[0] === comEspessura?.id,
    `selecao=[${selection.ids().join(',')}] esperado=[${comEspessura?.id ?? '?'}]`,
  );

  // --- ferramenta de desenho nao seleciona
  setup('pen');
  clickWorld(host, box, { x: 150, y: 150 });
  check(
    'com a caneta ativa, clicar num objeto nao o seleciona (faz um pingo)',
    selection.isEmpty && doc.size === 5,
    `selecao=[${selection.ids().join(',')}] objetos=${doc.size} esperado=([], 5)`,
  );

  // --- marca-texto entra por baixo do que ja estava
  setup('highlighter');
  drawAt({ x: 120, y: 150 }, 400, 0);
  const grifo = drawn();
  const aZ = doc.get('A')?.z ?? '';
  check(
    'o marca-texto entra por baixo do conteudo, para grifar em vez de cobrir',
    grifo !== undefined && grifo.variant === 'highlighter' && grifo.z < aZ,
    `z do grifo=${grifo?.z} z do objeto grifado=${aZ} esperado=grifo menor`,
  );

  // --- a pressao chega ao traco (e o que o lapis usa para variar a espessura)
  setup('pencil');
  drawAt({ x: 700, y: 200 }, 120, 0, 8, (t) => 0.2 + 0.6 * t);
  const lapis = drawn();
  const primeira = lapis?.points[2] ?? NaN;
  const ultima = lapis?.points[lapis.points.length - 1] ?? NaN;
  check(
    'a pressao da caneta chega ao traco',
    lapis !== undefined && lapis.variant === 'pencil' && ultima > primeira + 0.3,
    `pressao inicial=${primeira?.toFixed(2)} final=${ultima?.toFixed(2)} esperado=crescente`,
  );

  // --- pan com o botao direito no meio do traco
  // E a fronteira de botoes que justifica a divisao inteira: quem esta
  // escrevendo perto da borda precisa puxar o quadro sem largar o traco.
  setup('pen');
  const p0 = { x: 700 + box.left, y: 200 + box.top };
  pointer(host, 'pointerdown', p0.x, p0.y, 0);
  pointer(host, 'pointermove', p0.x + 40, p0.y + 20, 0);
  drag(host, 2, p0.x + 40, p0.y + 20, 100, 60); // pan no meio do traco
  pointer(host, 'pointermove', p0.x + 60, p0.y + 30, 0);
  pointer(host, 'pointerup', p0.x + 60, p0.y + 30, 0);
  const durantePan = drawn();
  check(
    'arrastar o quadro com o botao direito nao corta o traco em andamento',
    durantePan !== undefined &&
      history.depth === 1 &&
      near(durantePan.transform.x, 700) &&
      near(app.camera.x, -100) &&
      near(app.camera.y, -60),
    `tracos criados=${doc.size - 4} passos=${history.depth} ancora.x=${durantePan?.transform.x.toFixed(1)} ` +
      `camera=(${app.camera.x.toFixed(1)}, ${app.camera.y.toFixed(1)}) esperado=(1, 1, 700.0, -100.0, -60.0)`,
  );

  // --- a borracha apaga tinta e desfazer devolve
  setup('eraser');
  app.drawStyle.setEraserMode('objeto');
  // O traco INK vai de (100,300) a (300,500); a borracha cruza o meio dele.
  drawAt({ x: 150, y: 420 }, 120, -60, 10);
  // Os totais vao para variaveis pelo mesmo motivo do teste de Delete: lidos
  // direto, o compilador estreita o segundo pelo primeiro e acusa que 3 e 4
  // nunca coincidem.
  const depoisDaBorracha = doc.size;
  const apagou = doc.get('INK') === undefined && depoisDaBorracha === 3;
  key('z', { ctrl: true });
  const depoisDoUndoDaBorracha = doc.size;
  check(
    'a borracha apaga o traco inteiro e Ctrl+Z devolve',
    apagou && depoisDoUndoDaBorracha === 4 && doc.get('INK') !== undefined,
    `apagou=${apagou} depois do Ctrl+Z=${depoisDoUndoDaBorracha} objetos esperado=4`,
  );

  // --- a borracha nao come texto, post-it nem imagem
  setup('eraser');
  drawAt({ x: 110, y: 150 }, 400, 0, 12);
  check(
    'a borracha passa por cima de forma e texto sem apaga-los',
    doc.size === 4 && doc.get('A') !== undefined && doc.get('C') !== undefined,
    `objetos=${doc.size} esperado=4 (so tinta e apagavel)`,
  );

  // --- modo peca: o traco perde um pedaco e CONTINUA no quadro
  // E a diferenca que define a Fase 5.5: antes, cruzar o traco apagava o traco.
  setup('eraser');
  app.drawStyle.setEraserMode('peca');
  app.drawStyle.setWidth('eraser', 28);
  drawAt({ x: 150, y: 420 }, 120, -60, 10);
  const cortado = doc.get('INK') as StrokeObject | undefined;
  const marcas = cortado?.erased?.length ?? 0;
  key('z', { ctrl: true });
  const devolvido = doc.get('INK') as StrokeObject | undefined;
  check(
    'a borracha por peca abre buraco no traco sem remove-lo, e Ctrl+Z devolve a tinta',
    cortado !== undefined &&
      doc.size === 4 &&
      marcas > 0 &&
      (devolvido?.erased?.length ?? 0) === 0,
    `objetos=${doc.size} rastros=${marcas} depois do Ctrl+Z=${devolvido?.erased?.length ?? 0} ` +
      `esperado=(4, mais de 0, 0)`,
  );

  // --- o buraco nao responde ao clique
  // Sem isto sobraria tinta invisivel agarrando o cursor -- o mesmo problema do
  // AABB que o hit-test por geometria existe para evitar.
  setup('eraser');
  app.drawStyle.setEraserMode('peca');
  drawAt({ x: 150, y: 420 }, 120, -60, 10);
  app.setTool('select');
  // (200, 400) esta sobre a diagonal do INK, dentro do rastro que acabou de passar.
  clickWorld(host, box, { x: 200, y: 400 });
  const pegouNoBuraco = selection.size;
  clickWorld(host, box, { x: 280, y: 480 });
  const pegouNaTinta = selection.size;
  check(
    'clicar no buraco nao seleciona; clicar na tinta que sobrou seleciona',
    pegouNoBuraco === 0 && pegouNaTinta === 1,
    `no buraco=${pegouNoBuraco} na tinta=${pegouNaTinta} esperado=(0, 1)`,
  );

  // --- apagar tudo aos poucos remove o objeto
  // Senao sobraria um objeto invisivel no indice espacial, entrando no laco e
  // contando no Ctrl+A.
  setup('eraser');
  app.drawStyle.setEraserMode('peca');
  app.drawStyle.setWidth('eraser', 56);
  drawAt({ x: 100, y: 300 }, 200, 200, 24);
  // Os totais vao para variaveis pelo mesmo motivo dos outros testes de
  // contagem: lidos direto, o compilador estreita o segundo pelo primeiro e
  // acusa que 3 e 4 nunca coincidem.
  const depoisDeVarrer = doc.size;
  const varreu = doc.get('INK') === undefined && depoisDeVarrer === 3;
  key('z', { ctrl: true });
  const depoisDoUndoDaVarrida = doc.size;
  check(
    'apagar o traco todo por peca remove o objeto, e Ctrl+Z devolve',
    varreu && doc.get('INK') !== undefined && depoisDoUndoDaVarrida === 4,
    `removeu=${varreu} depois do Ctrl+Z=${depoisDoUndoDaVarrida} objetos esperado=(true, 4)`,
  );
  app.drawStyle.setWidth('eraser', 28);

  // --- a caligrafia importada tambem se apaga por peca
  // E o caso que decidiu a arquitetura: PathObject e contorno preenchido, e
  // recortar um pedaco dele exigiria subtracao booleana de contornos.
  setup('eraser');
  app.drawStyle.setEraserMode('peca');
  doc.add([inkPath('TINTA', 700, 600, 'a5')]);
  drawAt({ x: 760, y: 612 }, 0, 40, 8);
  const tinta = doc.get('TINTA') as PathObject | undefined;
  check(
    'a caligrafia importada aceita apagamento por peca',
    tinta !== undefined && (tinta.erased?.length ?? 0) > 0 && doc.size === 5,
    `rastros=${tinta?.erased?.length ?? 0} objetos=${doc.size} esperado=(mais de 0, 5)`,
  );

  // --- o rastro sobrevive ao arquivo
  const gravadoComRastro = JSON.parse(
    JSON.stringify(serializeBoard(doc, app.camera, app.assets)),
  ) as WbdDocument;
  applyBoard(doc, app.camera, gravadoComRastro);
  const relido = doc.get('TINTA') as PathObject | undefined;
  check(
    'o rastro da borracha sobrevive ao formato do .wbd',
    relido !== undefined &&
      (relido.erased?.length ?? 0) === (tinta?.erased?.length ?? -1) &&
      (relido.erased?.[0]?.points.length ?? 0) > 0,
    `rastros=${relido?.erased?.length ?? 0} pontos no primeiro=${relido?.erased?.[0]?.points.length ?? 0}`,
  );

  // --- os dois modos convivem, e a escolha e da barra
  setup('eraser');
  app.drawStyle.setEraserMode('objeto');
  const modoObjeto = app.drawStyle.eraserMode;
  drawAt({ x: 150, y: 420 }, 120, -60, 10);
  const sumiuInteiro = doc.get('INK') === undefined;
  app.drawStyle.setEraserMode('peca');
  check(
    'o modo traco inteiro continua disponivel na barra',
    modoObjeto === 'objeto' && sumiuInteiro && app.drawStyle.eraserMode === 'peca',
    `modo=${modoObjeto} apagou inteiro=${sumiuInteiro} voltou para=${app.drawStyle.eraserMode}`,
  );

  // --- objeto travado sobrevive a borracha
  setup('eraser');
  doc.replace({ ...doc.get('INK')!, locked: true });
  drawAt({ x: 150, y: 420 }, 120, -60, 10);
  check(
    'objeto travado nao pode ser apagado',
    doc.get('INK') !== undefined,
    `INK=${doc.get('INK') === undefined ? 'apagado' : 'intacto'} esperado=intacto`,
  );

  // --- as teclas trocam de ferramenta
  setup('select');
  key('p');
  const depoisDoP = app.activeTool;
  key('m');
  const depoisDoM = app.activeTool;
  key('e');
  const depoisDoE = app.activeTool;
  key('v');
  check(
    'V, P, M e E trocam a ferramenta ativa',
    depoisDoP === 'pen' &&
      depoisDoM === 'highlighter' &&
      depoisDoE === 'eraser' &&
      app.activeTool === 'select',
    `P=${depoisDoP} M=${depoisDoM} E=${depoisDoE} V=${app.activeTool}`,
  );

  // --- a espessura anda pelos degraus e volta
  setup('pen');
  const larguraInicial = app.drawStyle.width('pen');
  key(']');
  const maisGrosso = app.drawStyle.width('pen');
  key('[');
  key('[');
  const maisFino = app.drawStyle.width('pen');
  app.drawStyle.setWidth('pen', larguraInicial);
  check(
    '] engrossa e [ afina o traco',
    maisGrosso > larguraInicial && maisFino < larguraInicial,
    `inicial=${larguraInicial} depois de ]=${maisGrosso} depois de [[=${maisFino}`,
  );

  // --- o traco desenhado sobrevive ao formato gravado
  setup('pen');
  drawAt({ x: 700, y: 200 }, 120, 80, 8, (t) => 0.3 + 0.5 * t);
  const original = drawn();
  const gravado = JSON.parse(
    JSON.stringify(serializeBoard(doc, app.camera, app.assets)),
  ) as WbdDocument;
  applyBoard(doc, app.camera, gravado);
  const recuperado = original ? doc.get(original.id) : undefined;
  const iguais =
    original !== undefined &&
    recuperado !== undefined &&
    recuperado.type === 'stroke' &&
    recuperado.variant === original.variant &&
    recuperado.color === original.color &&
    recuperado.width === original.width &&
    recuperado.points.length === original.points.length &&
    recuperado.points.every((v, i) => near(v, original.points[i]!, 0.001));
  check(
    'o traco desenhado sobrevive ao formato do .wbd',
    iguais,
    `pontos gravados=${original?.points.length} recuperados=${
      recuperado?.type === 'stroke' ? recuperado.points.length : 'nenhum'
    } cor/espessura preservadas=${iguais}`,
  );

  app.setTool('select');
}

/** Clique num ponto de MUNDO, com a camera zerada. */
function clickWorld(host: HTMLElement, box: DOMRect, w: Vec2, mod: Modifiers = {}): void {
  click(host, w.x + box.left, w.y + box.top, mod);
}

/** Duplo clique, o gesto que abre uma caixa de texto sem trocar de ferramenta. */
function doubleClick(host: HTMLElement, x: number, y: number): void {
  click(host, x, y);
  host.dispatchEvent(
    new MouseEvent('dblclick', { clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true }),
  );
}

function editorEl(): HTMLElement | null {
  return document.querySelector<HTMLElement>('.qb-text-edit');
}

/**
 * Escreve na caixa aberta e sai dela.
 *
 * Escrever aqui e mexer no DOM do `contentEditable`, que e exatamente o que o
 * navegador faz quando alguem digita -- e o caminho de volta (DOM -> spans) e o
 * que este teste exercita. `Escape` no proprio editor e como se fecha a caixa.
 */
function typeInEditor(text: string, { commit = true, html = false } = {}): void {
  const el = editorEl();
  if (!el) return;
  if (html) el.innerHTML = text;
  else el.textContent = text;
  if (!commit) return;
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
}

// ----------------------------------------------------------- formas e encaixe

function runShapeAndSnapTests(
  host: HTMLElement,
  app: App,
  check: Check,
  reset: () => void,
): void {
  const { doc, selection, history, drawStyle } = app;

  const setup = (tool: 'select' | 'shape', kind: ShapeKind = 'rect'): void => {
    reset();
    selection.clear();
    history.clear();
    doc.clear();
    // As preferencias sobrevivem ao `clear` -- elas sao do quadro, nao dos
    // objetos. Sem zerar aqui, um teste que liga a grade magnetica contaminaria
    // todos os seguintes.
    doc.setPrefs({ snapToGrid: false, unit: 'px' });
    doc.add(scene());
    drawStyle.setShapeKind(kind);
    drawStyle.setShapeFilled(false);
    app.setTool(tool);
  };

  const box = host.getBoundingClientRect();
  const dragWorld = (w: Vec2, dx: number, dy: number, mod: Modifiers = {}): void => {
    drag(host, 0, w.x + box.left, w.y + box.top, dx, dy, mod);
  };
  const madeShape = (): ShapeObject | undefined =>
    [...doc.all()].find(
      (o): o is ShapeObject => o.type === 'shape' && !['A', 'B', 'C'].includes(o.id),
    );

  // --- arrastar cria a forma escolhida
  setup('shape');
  dragWorld({ x: 700, y: 300 }, 120, 80);
  const forma = madeShape();
  check(
    'arrastar com a ferramenta de formas cria a forma escolhida',
    forma !== undefined &&
      forma.kind === 'rect' &&
      near(forma.transform.x, 700) &&
      near(forma.transform.y, 300) &&
      near(forma.w, 120) &&
      near(forma.h, 80) &&
      history.depth === 1,
    `tipo=${forma?.kind} pos=(${forma?.transform.x.toFixed(1)}, ${forma?.transform.y.toFixed(1)}) ` +
      `tamanho=${forma?.w.toFixed(1)}x${forma?.h.toFixed(1)} passos=${history.depth} ` +
      `esperado=rect (700, 300) 120x80 e 1 passo`,
  );

  // --- clique sem arraste nao deixa forma de tamanho zero
  setup('shape');
  clickWorld(host, box, { x: 700, y: 300 });
  check(
    'clique sem arrastar nao cria forma',
    doc.size === 4 && madeShape() === undefined,
    `objetos=${doc.size} esperado=4`,
  );

  // --- Shift trava o quadrado
  setup('shape');
  dragWorld({ x: 700, y: 300 }, 120, 40, { shift: true });
  const quadrado = madeShape();
  check(
    'Shift trava a forma em quadrado, pelo maior lado',
    quadrado !== undefined && quadrado.kind === 'square' && near(quadrado.w, 120) && near(quadrado.h, 120),
    `tipo=${quadrado?.kind} tamanho=${quadrado?.w.toFixed(1)}x${quadrado?.h.toFixed(1)} esperado=square 120x120`,
  );

  // --- Alt cresce a partir do centro
  setup('shape');
  dragWorld({ x: 700, y: 300 }, 60, 40, { alt: true });
  const doCentro = madeShape();
  check(
    'Alt faz a forma crescer a partir do centro',
    doCentro !== undefined &&
      near(doCentro.transform.x, 640) &&
      near(doCentro.transform.y, 260) &&
      near(doCentro.w, 120) &&
      near(doCentro.h, 80),
    `pos=(${doCentro?.transform.x.toFixed(1)}, ${doCentro?.transform.y.toFixed(1)}) ` +
      `tamanho=${doCentro?.w.toFixed(1)}x${doCentro?.h.toFixed(1)} esperado=(640, 260) 120x80`,
  );

  // --- linha guarda a direcao em w/h
  // Normalizar a linha para o canto superior esquerdo, como se faz com as formas
  // fechadas, viraria uma seta apontando sempre para baixo e para a direita.
  setup('shape', 'arrow');
  dragWorld({ x: 800, y: 400 }, -100, -60);
  const seta = madeShape();
  check(
    'seta guarda a direcao do gesto, e nao o retangulo',
    seta !== undefined &&
      near(seta.transform.x, 800) &&
      near(seta.transform.y, 400) &&
      near(seta.w, -100) &&
      near(seta.h, -60),
    `pos=(${seta?.transform.x.toFixed(1)}, ${seta?.transform.y.toFixed(1)}) ` +
      `w=${seta?.w.toFixed(1)} h=${seta?.h.toFixed(1)} esperado=(800, 400) w=-100 h=-60`,
  );

  // --- preenchimento translucido na cor do contorno
  setup('shape');
  drawStyle.setShapeFilled(true);
  dragWorld({ x: 700, y: 300 }, 120, 80);
  const cheia = madeShape();
  drawStyle.setShapeFilled(false);
  check(
    'a forma preenchida usa o proprio contorno em translucido',
    cheia !== undefined && cheia.fill === `${cheia.stroke}22`,
    `contorno=${cheia?.stroke} preenchimento=${cheia?.fill} esperado=contorno + "22"`,
  );

  // --- encaixe: mover alinha com a borda do vizinho
  // A esta em x=100 e B em x=300. Arrastar A 195px para a direita deixa a borda
  // dele a 5px da borda de B -- dentro do limiar, entao ele completa sozinho.
  setup('select');
  clickWorld(host, box, { x: 150, y: 150 });
  dragWorld({ x: 150, y: 150 }, 195, 0);
  check(
    'mover encaixa na borda do vizinho',
    near(doc.get('A')!.transform.x, 300),
    `A.x=${doc.get('A')!.transform.x.toFixed(1)} esperado=300.0 (arraste levaria a 295.0)`,
  );

  // --- o encaixe vale DURANTE o gesto, e nao so ao soltar
  // Se ele so agisse no pointerup, o objeto pularia para a posicao alinhada
  // depois de o usuario ja ter soltado -- e a guia teria mostrado uma promessa
  // que so se cumpre depois.
  setup('select');
  clickWorld(host, box, { x: 150, y: 150 });
  const inicio = { x: 150 + box.left, y: 150 + box.top };
  pointer(host, 'pointerdown', inicio.x, inicio.y, 0);
  for (const passo of [100, 250, 395]) {
    pointer(host, 'pointermove', inicio.x + passo, inicio.y, 0);
  }
  const noMeioDoGesto = doc.get('A')!.transform.x;
  pointer(host, 'pointerup', inicio.x + 395, inicio.y, 0);
  check(
    'o encaixe ja age durante o arraste, antes de soltar',
    near(noMeioDoGesto, 500),
    `A.x no meio do gesto=${noMeioDoGesto.toFixed(1)} esperado=500.0 (arraste levaria a 495.0)`,
  );

  // --- Ctrl ignora o encaixe
  setup('select');
  clickWorld(host, box, { x: 150, y: 150 });
  dragWorld({ x: 150, y: 150 }, 195, 0, { ctrl: true });
  check(
    'Ctrl durante o arraste ignora o encaixe',
    near(doc.get('A')!.transform.x, 295),
    `A.x=${doc.get('A')!.transform.x.toFixed(1)} esperado=295.0`,
  );

  // --- grade magnetica
  // Com um objeto so no quadro nao ha vizinho para atrair: quem responde e a
  // grade, e so quando ela esta ligada.
  const soloDrag = (): number => {
    reset();
    selection.clear();
    history.clear();
    doc.clear();
    doc.add([scene()[0]!]);
    app.setTool('select');
    clickWorld(host, box, { x: 150, y: 150 });
    dragWorld({ x: 150, y: 150 }, 17, 0);
    return doc.get('A')!.transform.x;
  };

  doc.setPrefs({ snapToGrid: false });
  const semGrade = soloDrag();
  doc.setPrefs({ snapToGrid: true });
  const comGrade = soloDrag();
  doc.setPrefs({ snapToGrid: false });
  check(
    'a grade magnetica arredonda a posicao, e so quando ligada',
    near(semGrade, 117) && near(comGrade, 120),
    `desligada=${semGrade.toFixed(1)} ligada=${comGrade.toFixed(1)} esperado=(117.0, 120.0)`,
  );

  // --- a guia sai junto com o encaixe
  // Sem guia o encaixe seria magica invisivel: o objeto pula e nada explica por que.
  setup('select');
  const encaixe = snapRect(
    { x: 295, y: 100, w: 100, h: 100 },
    {
      doc,
      zoom: 1,
      exclude: new Set(['A']),
      snapToGrid: false,
      gridSize: doc.prefs.grid.size,
    },
  );
  const guiaX = encaixe.guides.find((g) => g.axis === 'x');
  check(
    'o encaixe devolve a guia que explica o alinhamento',
    near(encaixe.dx, 5) && guiaX !== undefined && near(guiaX.at, 300),
    `dx=${encaixe.dx.toFixed(1)} guias=${encaixe.guides.length} linha=${guiaX?.at.toFixed(1)} esperado=(5.0, linha em 300.0)`,
  );

  // --- F escolhe formas; regua e unidade nos atalhos
  setup('select');
  key('f');
  const depoisDoF = app.activeTool;
  const reguaAntes = app.rulersEnabled;
  key('r');
  const reguaDepois = app.rulersEnabled;
  key('u');
  const unidade = doc.prefs.unit;
  key('u');
  key('r');
  check(
    'F escolhe formas, R liga as reguas e U troca a unidade',
    depoisDoF === 'shape' &&
      reguaDepois !== reguaAntes &&
      unidade === 'cm' &&
      doc.prefs.unit === 'px' &&
      app.rulersEnabled === reguaAntes,
    `F=${depoisDoF} regua ${reguaAntes}->${reguaDepois} unidade=${unidade} (voltou a ${doc.prefs.unit})`,
  );

  // --- a forma sobrevive ao formato gravado
  setup('shape');
  dragWorld({ x: 700, y: 300 }, 120, 80);
  const antes = madeShape();
  const gravado = JSON.parse(
    JSON.stringify(serializeBoard(doc, app.camera, app.assets)),
  ) as WbdDocument;
  applyBoard(doc, app.camera, gravado);
  const depois = antes ? doc.get(antes.id) : undefined;
  check(
    'a forma sobrevive ao formato do .wbd',
    antes !== undefined &&
      depois?.type === 'shape' &&
      depois.kind === antes.kind &&
      near(depois.w, antes.w, 0.001) &&
      near(depois.h, antes.h, 0.001) &&
      depois.stroke === antes.stroke &&
      near(depois.strokeWidth, antes.strokeWidth, 0.001),
    `antes=${antes?.kind} ${antes?.w.toFixed(1)}x${antes?.h.toFixed(1)} depois=${
      depois?.type === 'shape' ? `${depois.kind} ${depois.w.toFixed(1)}x${depois.h.toFixed(1)}` : 'nenhuma'
    }`,
  );

  app.setTool('select');
}

// --------------------------------------------------------- texto e post-its

function runTextTests(host: HTMLElement, app: App, check: Check, reset: () => void): void {
  const { doc, selection, history, drawStyle } = app;
  const box = host.getBoundingClientRect();

  const setup = (tool: 'select' | 'text' | 'note'): void => {
    reset();
    selection.clear();
    history.clear();
    doc.clear();
    doc.setPrefs({ snapToGrid: false, unit: 'px' });
    doc.add(scene());
    app.setTool(tool);
  };

  const madeText = (): TextObject | undefined =>
    [...doc.all()].find((o): o is TextObject => o.type === 'text');
  const madeNote = (): NoteObject | undefined =>
    [...doc.all()].find((o): o is NoteObject => o.type === 'note');

  const estilo = (width: number, align: 'left' | 'right', list: 'none' | 'bullet') => ({
    width,
    fontSize: 16,
    fontFamily: "'Segoe UI', sans-serif",
    lineHeight: 1.35,
    align,
    list,
  });

  // --- clicar abre a caixa, mas ainda nao cria objeto
  setup('text');
  clickWorld(host, box, { x: 700, y: 300 });
  check(
    'clicar com a ferramenta de texto abre a caixa sem criar objeto',
    app.isEditingText && doc.size === 4,
    `editando=${app.isEditingText} objetos=${doc.size} esperado=(true, 4)`,
  );

  // --- o texto digitado vira objeto ao sair da caixa
  typeInEditor('Resumo da aula');
  const criado = madeText();
  check(
    'o texto digitado vira objeto em um passo de undo, ja selecionado',
    criado !== undefined &&
      plainText(criado.content) === 'Resumo da aula' &&
      history.depth === 1 &&
      selection.has(criado.id) &&
      app.activeTool === 'select',
    `conteudo="${criado ? plainText(criado.content) : '-'}" passos=${history.depth} ` +
      `rotulo=${history.undoLabel} objetos=${doc.size} ` +
      `ferramenta=${app.activeTool} esperado=("Resumo da aula", 1 passo, select)`,
  );

  key('z', { ctrl: true });
  check(
    'Ctrl+Z desfaz a caixa recem-criada inteira',
    doc.size === 4 && madeText() === undefined,
    `objetos=${doc.size} esperado=4`,
  );

  // --- caixa aberta e abandonada em branco nao deixa rastro
  // Ela nunca chegou a entrar no documento: nao ha objeto invisivel para o laco
  // pegar depois, nem passo de undo para atravessar.
  setup('text');
  clickWorld(host, box, { x: 700, y: 300 });
  typeInEditor('   ');
  check(
    'caixa aberta e deixada em branco nao cria objeto nem passo de undo',
    doc.size === 4 && history.depth === 0 && !app.isEditingText,
    `objetos=${doc.size} passos=${history.depth} editando=${app.isEditingText} esperado=(4, 0, false)`,
  );

  // --- duplo clique abre a caixa existente sem trocar de ferramenta
  setup('text');
  clickWorld(host, box, { x: 700, y: 300 });
  typeInEditor('primeiro');
  const alvo = madeText()!;
  history.clear();
  app.setTool('select');
  doubleClick(host, alvo.transform.x + 10 + box.left, alvo.transform.y + 8 + box.top);
  const editandoId = app.editingObjectId;
  check(
    'duplo clique abre a caixa existente, que sai do canvas enquanto se edita',
    app.isEditingText && editandoId === alvo.id,
    `editando=${app.isEditingText} oculto=${editandoId ?? 'nenhum'} esperado=(true, o proprio objeto)`,
  );

  // --- editar grava o conteudo novo; Ctrl+Z devolve o anterior
  typeInEditor('segundo texto');
  const depoisDaEdicao = doc.get(alvo.id) as TextObject | undefined;
  key('z', { ctrl: true });
  const desfeito = doc.get(alvo.id) as TextObject | undefined;
  check(
    'editar troca o conteudo, e Ctrl+Z devolve o texto anterior',
    plainText(depoisDaEdicao?.content ?? []) === 'segundo texto' &&
      plainText(desfeito?.content ?? []) === 'primeiro' &&
      app.editingObjectId === null,
    `depois="${plainText(depoisDaEdicao?.content ?? [])}" ` +
      `desfeito="${plainText(desfeito?.content ?? [])}" esperado=("segundo texto", "primeiro")`,
  );

  // --- esvaziar uma caixa existente a remove
  // Uma caixa sem texto e invisivel e inclicavel; deixa-la no quadro criaria
  // objetos fantasma que so aparecem no laco e no Ctrl+A.
  history.clear();
  app.setTool('select');
  doubleClick(host, alvo.transform.x + 10 + box.left, alvo.transform.y + 8 + box.top);
  typeInEditor('');
  const sumiu = doc.get(alvo.id) === undefined;
  key('z', { ctrl: true });
  check(
    'esvaziar uma caixa existente a remove, e Ctrl+Z devolve',
    sumiu && doc.get(alvo.id) !== undefined,
    `removida=${sumiu} devolvida=${doc.get(alvo.id) !== undefined} esperado=(true, true)`,
  );

  // --- arrastar define a largura; a altura vem do texto
  setup('text');
  drawStyle.setWidth('text', 16);
  drag(host, 0, 700 + box.left, 300 + box.top, 120, 0);
  typeInEditor('uma frase longa o bastante para quebrar em varias linhas dentro desta caixa estreita');
  const alta = madeText();
  const linhas = alta ? layoutOf(alta).lines.length : 0;
  check(
    'a caixa arrastada guarda a largura, e a altura acompanha as linhas',
    alta !== undefined &&
      near(alta.w, 120, 1) &&
      linhas > 3 &&
      near(alta.h, layoutOf(alta).height, 0.001),
    `largura=${alta?.w.toFixed(1)} linhas=${linhas} altura=${alta?.h.toFixed(1)} ` +
      `esperado=(120, mais de 3 linhas)`,
  );

  // --- a propriedade em que a importacao se apoia
  // Encolher a caixa ate a maior linha nao pode mudar a quebra: e ela que
  // permite gravar a largura do TEXTO em vez do teto de quebra do original.
  const frase = [{ text: 'palavras curtas e outras nem tanto para quebrar isto em varias linhas' }];
  const largo = layoutText(frase, estilo(400, 'left', 'none'));
  const encolhido = layoutText(frase, estilo(largo.width, 'left', 'none'));
  const mesmaQuebra =
    largo.lines.length === encolhido.lines.length &&
    largo.lines.every((l, i) => textOf(l) === textOf(encolhido.lines[i]!));
  check(
    'encolher a caixa ate a maior linha preserva a quebra',
    largo.lines.length > 1 && mesmaQuebra && near(largo.height, encolhido.height, 0.001),
    `linhas ${largo.lines.length}->${encolhido.lines.length} maior linha=${largo.width.toFixed(1)} ` +
      `mesma quebra=${mesmaQuebra}`,
  );

  // --- formatacao por trecho
  const misto = layoutText(
    [
      { text: 'normal ' },
      { text: 'negrito', bold: true },
      { text: ' e ' },
      { text: 'sublinhado', underline: true },
    ],
    estilo(600, 'left', 'none'),
  );
  const runs = misto.lines[0]?.runs ?? [];
  check(
    'cada formatacao vira um trecho proprio na mesma linha',
    misto.lines.length === 1 &&
      runs.length === 4 &&
      runs[1]?.bold === true &&
      runs[3]?.underline === true,
    `linhas=${misto.lines.length} trechos=${runs.length} negrito=${runs[1]?.bold} ` +
      `sublinhado=${runs[3]?.underline} esperado=(1, 4, true, true)`,
  );

  // --- lista e alinhamento
  const comLista = layoutText([{ text: 'item' }], estilo(300, 'left', 'bullet'));
  const aDireita = layoutText([{ text: 'fim' }], estilo(300, 'right', 'none'));
  const linhaDireita = aDireita.lines[0]!;
  check(
    'a lista recua o texto e o alinhamento a direita encosta na borda',
    comLista.indent > 0 &&
      near(comLista.lines[0]!.x, comLista.indent, 0.001) &&
      near(linhaDireita.x + linhaDireita.width, 300, 0.5),
    `recuo=${comLista.indent.toFixed(1)} fim da linha a direita=` +
      `${(linhaDireita.x + linhaDireita.width).toFixed(1)} esperado=300.0`,
  );

  // --- marcadores de lista mexem no recuo e, com ele, na altura
  setup('text');
  clickWorld(host, box, { x: 700, y: 300 });
  typeInEditor('primeiro item do resumo que ocupa mais de uma linha nesta largura');
  const paraLista = madeText()!;
  app.selection.set([paraLista.id]);
  history.clear();
  app.toggleBulletList();
  const comMarcador = doc.get(paraLista.id) as TextObject | undefined;
  key('z', { ctrl: true });
  const semMarcador = doc.get(paraLista.id) as TextObject | undefined;
  check(
    'marcadores recuam o texto e a altura segue o layout; Ctrl+Z devolve',
    comMarcador?.list === 'bullet' &&
      layoutOf(comMarcador).indent > 0 &&
      near(comMarcador.h, layoutOf(comMarcador).height, 0.001) &&
      semMarcador?.list === 'none' &&
      near(semMarcador.h, paraLista.h, 0.001),
    `lista=${comMarcador?.list} recuo=${comMarcador ? layoutOf(comMarcador).indent.toFixed(1) : '-'} ` +
      `altura ${paraLista.h.toFixed(1)}->${comMarcador?.h.toFixed(1)}->${semMarcador?.h.toFixed(1)}`,
  );

  // --- post-it com papel e alerta escolhidos na barra
  setup('note');
  drawStyle.setNoteBg('#d0ebff');
  drawStyle.setNoteAlert('revisar');
  clickWorld(host, box, { x: 700, y: 300 });
  typeInEditor('conferir depois');
  const postit = madeNote();
  drawStyle.setNoteAlert(null);
  check(
    'o post-it nasce com o papel e o alerta escolhidos na barra',
    postit !== undefined &&
      postit.bg === '#d0ebff' &&
      postit.alert?.level === 'revisar' &&
      plainText(postit.content) === 'conferir depois',
    `papel=${postit?.bg} alerta=${postit?.alert?.level ?? 'nenhum'} ` +
      `conteudo="${postit ? plainText(postit.content) : '-'}" esperado=(#d0ebff, revisar)`,
  );

  // --- os mesmos botoes reestilizam o que ja existe
  app.setTool('select');
  selection.set([postit!.id]);
  history.clear();
  app.restyleSelectedNotes({ bg: '#fff3bf' });
  const trocado = doc.get(postit!.id) as NoteObject | undefined;
  key('z', { ctrl: true });
  const voltou = doc.get(postit!.id) as NoteObject | undefined;
  check(
    'a barra reestiliza o post-it selecionado, e Ctrl+Z devolve o papel',
    trocado?.bg === '#fff3bf' && voltou?.bg === '#d0ebff',
    `depois=${trocado?.bg} desfeito=${voltou?.bg} esperado=(#fff3bf, #d0ebff)`,
  );

  // --- fixar so mostra ficha quando o post-it esta FORA da tela
  app.togglePinSelectedNotes();
  const aVista = offscreenPinnedNotes(doc, app.camera, 1200, 800).length;
  app.camera.x = 20000;
  app.camera.y = 20000;
  const foraDaTela = offscreenPinnedNotes(doc, app.camera, 1200, 800).length;
  reset();
  check(
    'post-it fixado ganha ficha no canto so quando esta fora da tela',
    aVista === 0 && foraDaTela === 1,
    `a vista=${aVista} fora da tela=${foraDaTela} esperado=(0, 1)`,
  );

  // --- atalhos das duas ferramentas novas
  setup('select');
  key('t');
  const depoisDoT = app.activeTool;
  key('n');
  const depoisDoN = app.activeTool;
  key('v');
  check(
    'T escolhe texto e N escolhe post-it',
    depoisDoT === 'text' && depoisDoN === 'note' && app.activeTool === 'select',
    `T=${depoisDoT} N=${depoisDoN} V=${app.activeTool}`,
  );

  // --- o texto formatado sobrevive ao arquivo
  setup('text');
  clickWorld(host, box, { x: 700, y: 300 });
  typeInEditor('comum <b>negrito</b>', { html: true });
  const antesDoArquivo = madeText();
  const gravadoTexto = JSON.parse(
    JSON.stringify(serializeBoard(doc, app.camera, app.assets)),
  ) as WbdDocument;
  applyBoard(doc, app.camera, gravadoTexto);
  const depoisDoArquivo = antesDoArquivo
    ? (doc.get(antesDoArquivo.id) as TextObject | undefined)
    : undefined;
  check(
    'o texto formatado sobrevive ao formato do .wbd',
    antesDoArquivo !== undefined &&
      depoisDoArquivo !== undefined &&
      plainText(depoisDoArquivo.content) === plainText(antesDoArquivo.content) &&
      depoisDoArquivo.content.length === 2 &&
      depoisDoArquivo.content[1]?.bold === true &&
      near(depoisDoArquivo.h, antesDoArquivo.h, 0.001),
    `trechos=${depoisDoArquivo?.content.length} negrito no segundo=` +
      `${depoisDoArquivo?.content[1]?.bold} conteudo="${plainText(depoisDoArquivo?.content ?? [])}"`,
  );

  app.setTool('select');
}

/** Texto de uma linha do layout, para comparar quebras. */
function textOf(line: { runs: ReadonlyArray<{ text: string }> }): string {
  return line.runs.map((r) => r.text).join('');
}

// -------------------------------------------------------------------- busca

function runSearchTests(app: App, check: Check, reset: () => void): void {
  const { doc, selection, history } = app;

  /** Caixa de texto pronta, sem passar pelas ferramentas. */
  const textBox = (id: string, x: number, y: number, texto: string, z: string): TextObject => {
    const o: TextObject = {
      ...BASE,
      id,
      type: 'text',
      z,
      transform: { x, y, rotation: 0, scaleX: 1, scaleY: 1 },
      bbox: { x: 0, y: 0, w: 0, h: 0 },
      w: 300,
      h: 40,
      autoHeight: true,
      content: [{ text: texto }],
      fontFamily: "'Segoe UI', sans-serif",
      fontSize: 16,
      lineHeight: 1.35,
      align: 'left',
      color: '#1f2933',
      list: 'none',
    };
    o.bbox = computeBbox(o);
    return o;
  };

  const setup = (): void => {
    reset();
    selection.clear();
    history.clear();
    doc.clear();
    doc.setPrefs({ snapToGrid: false, unit: 'px' });
    doc.add([
      textBox('T1', 200, 600, 'A matriz de revisão precisa de atenção', 'a1'),
      textBox('T2', 200, 200, 'Teorema da matriz inversa', 'a2'),
      textBox('T3', 900, 200, 'Nada a ver com o resto', 'a3'),
    ]);
    app.setTool('select');
  };

  // --- acha por trecho, ignorando acento e caixa
  // Num resumo em portugues escrito a duas maos -- digitado aqui e importado do
  // Whiteboard -- procurar "revisao" e nao achar "revisão" seria inutilizavel.
  setup();
  const semAcento = searchBoard(doc, 'REVISAO');
  check(
    'a busca ignora acento e caixa',
    semAcento.length === 1 && semAcento[0]?.id === 'T1',
    `resultados=${semAcento.length} primeiro=${semAcento[0]?.id ?? 'nenhum'} esperado=(1, T1)`,
  );

  // --- ordem de leitura do quadro, e nao ordem de criacao
  const doisHits = searchBoard(doc, 'matriz');
  check(
    'os resultados saem na ordem de leitura do quadro (de cima para baixo)',
    doisHits.length === 2 && doisHits[0]?.id === 'T2' && doisHits[1]?.id === 'T1',
    `ordem=${doisHits.map((h) => h.id).join(', ')} esperado=T2, T1 (T2 esta acima)`,
  );

  // --- o trecho traz o contexto com o casamento marcado
  const hit = doisHits[0];
  const marcado = hit ? hit.snippet.slice(hit.at, hit.at + hit.length) : '';
  check(
    'o trecho do resultado marca o pedaco que casou',
    hit !== undefined && marcado.toLowerCase() === 'matriz' && hit.snippet.includes('Teorema'),
    `trecho="${hit?.snippet}" marcado="${marcado}" esperado=marcar "matriz" com contexto`,
  );

  // --- Ctrl+F abre, Esc fecha
  setup();
  key('f', { ctrl: true });
  const abriu = app.isSearchOpen;
  const campo = document.querySelector<HTMLInputElement>('.qb-search__input');
  if (campo) {
    campo.value = 'matriz';
    campo.dispatchEvent(new Event('input', { bubbles: true }));
  }
  const achouPelaTela = app.searchHit?.id;
  check(
    'Ctrl+F abre a busca e digitar ja lista os resultados',
    abriu && achouPelaTela === 'T2',
    `aberta=${abriu} primeiro resultado=${achouPelaTela ?? 'nenhum'} esperado=(true, T2)`,
  );

  // --- Enter leva a camera ate o resultado e seleciona
  // Zoom em 100% ou o que fizer caber, o que for menor: manter o zoom de onde se
  // estava resolveria "centralizar" e nao "encontrar".
  app.camera.zoom = 0.08;
  app.camera.x = 40000;
  app.camera.y = 40000;
  campo?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  const alvo = doc.get('T2')!;
  const centroX = app.camera.x + 1200 / 2 / app.camera.zoom;
  const perto =
    Math.abs(centroX - (alvo.bbox.x + alvo.bbox.w / 2)) < alvo.bbox.w &&
    app.camera.zoom > 0.5;
  check(
    'Enter leva a camera ate o resultado, com zoom legivel, e o seleciona',
    perto && selection.has('T2'),
    `zoom=${app.camera.zoom.toFixed(2)} selecionado=${selection.has('T2')} ` +
      `esperado=(zoom acima de 0.5, T2 selecionado)`,
  );

  // --- Enter de novo anda para o proximo, e da a volta
  app.stepSearch(1);
  const segundo = app.searchHit?.id;
  app.stepSearch(1);
  const voltou = app.searchHit?.id;
  check(
    'os resultados andam com Enter e dao a volta no fim da lista',
    segundo === 'T1' && voltou === 'T2',
    `segundo=${segundo} depois da volta=${voltou} esperado=(T1, T2)`,
  );

  // --- Esc fecha e o destaque some junto
  key('Escape');
  check(
    'Escape fecha a busca e o destaque some',
    !app.isSearchOpen && app.searchHit === null,
    `aberta=${app.isSearchOpen} destaque=${app.searchHit === null ? 'nenhum' : 'ainda ha'}`,
  );

  // --- o post-it tambem entra na busca
  setup();
  doc.add([
    {
      ...BASE,
      id: 'N1',
      type: 'note',
      z: 'a4',
      transform: { x: 1400, y: 200, rotation: 0, scaleX: 1, scaleY: 1 },
      bbox: { x: 1400, y: 200, w: 180, h: 180 },
      w: 180,
      h: 180,
      bg: '#fff3bf',
      content: [{ text: 'conferir a integral depois' }],
      alert: null,
      pinned: false,
    } as NoteObject,
  ]);
  const noPostit = searchBoard(doc, 'integral');
  check(
    'a busca acha texto dentro de post-it',
    noPostit.length === 1 && noPostit[0]?.id === 'N1' && noPostit[0]?.kind === 'note',
    `resultados=${noPostit.length} tipo=${noPostit[0]?.kind ?? '-'} esperado=(1, note)`,
  );

  // --- MEDICAO: a varredura aguenta sem indice invertido?
  //
  // E a medicao que decidiu o desenho do modulo. Dobrar o texto de todos os
  // objetos a cada tecla custava 20,8 ms -- mais que um frame. Com o texto
  // dobrado em cache por `id:rev`, a primeira busca ainda paga a dobra e as
  // seguintes (que sao a experiencia real de quem digita) ficam baratas.
  //
  // As duas saem separadas de proposito: uma media escondendo a primeira daria
  // um numero bonito e mentiroso.
  const N = 10_000;
  doc.clear();
  doc.add(generateStressObjects(N));

  const t0 = performance.now();
  const encontrados = searchBoard(doc, 'matriz', 100_000).length;
  const msFria = performance.now() - t0;

  const REPS = 8;
  // Consultas diferentes a cada volta: repetir a mesma mediria o cache de uma
  // busca so, e nao o de todos os objetos.
  const termos = ['matri', 'matriz', 'teorema', 'revis', 'revisar', 'integral', 'limite', 'prova'];

  // Piso: varrer tudo sem casar com nada. Separa o custo de PROCURAR do custo
  // de MONTAR o resultado -- sem isso, "10 ms" nao diz onde otimizar.
  const t1 = performance.now();
  for (let i = 0; i < REPS; i++) searchBoard(doc, `zzz${i}`, 100_000);
  const msVarredura = (performance.now() - t1) / REPS;

  // O caminho de verdade da interface, que para no teto de resultados.
  const t2 = performance.now();
  for (let i = 0; i < REPS; i++) searchBoard(doc, termos[i % termos.length]!);
  const msInterface = (performance.now() - t2) / REPS;

  check(
    `buscar em ${N.toLocaleString('pt-BR')} objetos custa menos que um frame`,
    msInterface < 16,
    `${msInterface.toFixed(1)} ms por tecla (varredura pura ${msVarredura.toFixed(1)} ms, ` +
      `primeira busca ${msFria.toFixed(1)} ms com ${encontrados} acertos), teto 16 ms — ` +
      `e o numero que justifica varrer sem indice invertido`,
  );

  reset();
  doc.clear();
  app.setTool('select');
}
