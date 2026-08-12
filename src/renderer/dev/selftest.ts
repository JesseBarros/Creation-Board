import type { Vec2 } from '@shared/geometry/vec2';
import { computeBbox } from '@shared/model/bbox';
import { keyBetween } from '@shared/model/fractional';
import type {
  BoardObject,
  ImageObject,
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
import { paintObject } from '../render/painters';
import { displayedAs } from '../render/colorAdapt';
import {
  exportBounds,
  planTiles,
  renderPng,
  renderPngTile,
  type TilePlan,
} from '../features/export/exportBoard';
import { renderSvg } from '../features/export/exportSvg';
import { autosaveVerdict } from '../features/storage/autosave';
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
  await block('imagens', () => runImageTests(host, app, check, reset));
  await block('exportar e autosave', () => runExportTests(app, check, reset));
  await block('barra e troca de ferramenta', () => runHudTests(app, check, reset));

  // Deixa o cenario montado no fim. Com QB_SHOT a janela nao fecha ao terminar,
  // entao a foto vira a conferencia do que nenhum numero daqui verifica: o cromo
  // de selecao, a aparencia das tres variantes de traco, as formas, as reguas e a
  // guia de encaixe. Tudo produzido pelas ferramentas de verdade, e nao montado a
  // mao, para a foto mostrar o que o usuario veria.
  await block('cena da foto', async () => {
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
    // Uma imagem com o recorte ABERTO: a sombra por fora, as linhas de terco e
    // as alcas laranja sao exatamente o que nenhum numero verifica.
    await showCropForShot(host, app);
    // A busca aberta com um resultado destacado entra na foto: o painel, o
    // trecho com o pedaco marcado e o contorno roxo em volta do objeto sao
    // justamente o que numero nenhum verifica.
    showSearchForShot(app);
    // O painel de camadas aberto (M8): a foto e a unica forma de conferir que os
    // quatro botoes cabem na linha sem serrilhar, que o nome longo corta com
    // reticencias e que o material acrilico combina com as outras barras.
    if (!app.layersOpen) app.toggleLayers();
    // O `reset()` dos blocos mexe na camera direto, sem avisar a barra, entao o
    // rotulo de zoom fica com o valor do ultimo `fitToContent`. Passar pelo
    // caminho normal acerta o numero -- a foto nao pode mentir sobre o estado.
    app.setZoom(1);
    // Termina na ferramenta de texto: e com ela que o painel lateral mostra
    // tudo o que ele tem -- paleta com o seletor de cor livre, a linha B/I/U e
    // a barra de espessura. Nada disso aparece com o recorte ativo.
    app.setTool('text');
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
 * Um traco de cada ferramenta de tinta, para a foto do QB_SHOT.
 *
 * O marca-texto passa por cima do texto de propósito: e ali que se ve se ele
 * entrou por baixo (grifo) ou por cima (borrao).
 */
function paintSampleStrokes(host: HTMLElement, app: App): void {
  const box = host.getBoundingClientRect();
  const draw = (
    tool: 'pen' | 'highlighter',
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
 * Insere uma imagem e deixa o recorte aberto sobre ela, para a foto do QB_SHOT.
 */
async function showCropForShot(host: HTMLElement, app: App): Promise<void> {
  const box = host.getBoundingClientRect();
  await app.insertImageFiles([await fakeImageFile(300, 200, 'foto.png')], { x: 1010, y: 470 });
  const img = [...app.doc.all()].find((o): o is ImageObject => o.type === 'image');
  if (!img) return;

  app.beginCrop(img);
  // Puxa a alca do canto superior esquerdo para dentro, para a sombra do que
  // ficaria de fora aparecer na foto.
  drag(host, 0, img.transform.x + box.left, img.transform.y + box.top, 46, 34);
  app.history.clear();
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

  const setup = (tool: 'select' | 'pen' | 'highlighter' | 'eraser'): void => {
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

  // --- M8: grifar SOBRE UMA IMAGEM tem de ficar por cima dela
  //
  // Ele relatou que grifar numa print colada nao mostra nada, e estava certo: a
  // regra "marca-texto por baixo de tudo" nasceu na Fase 4, quando o app nao
  // tinha imagens. Texto e tinta escura sobre fundo claro e o grifo aparece
  // atras das letras; imagem e OPACA, e nao ha "atras" que se veja.
  setup('highlighter');
  const foto: ImageObject = {
    id: 'IMG',
    type: 'image',
    parentId: null,
    // Acima de todo o cenario, que e o caso que reproduz o problema dele.
    z: keyBetween(doc.topZ(), null),
    transform: { x: 600, y: 400, rotation: 0, scaleX: 1, scaleY: 1 },
    bbox: { x: 600, y: 400, w: 300, h: 200 },
    opacity: 1,
    locked: false,
    hidden: false,
    rev: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    w: 300,
    h: 200,
    assetId: 'nenhum',
    naturalW: 300,
    naturalH: 200,
  };
  doc.add([foto]);
  drawAt({ x: 620, y: 460 }, 240, 0);
  const sobreFoto = drawn();
  check(
    'grifar sobre uma imagem entra POR CIMA dela, senao o grifo some',
    sobreFoto !== undefined && sobreFoto.z > foto.z,
    `z do grifo=${sobreFoto?.z} z da imagem=${foto.z} esperado=grifo maior ` +
      `(imagem e opaca: por baixo, o grifo nao aparece)`,
  );

  // --- e o grifo LONGE da imagem continua indo por baixo
  //
  // O par importa mais que cada um sozinho: se a correcao fosse "subir sempre
  // que houver imagem no quadro", grifar um texto do outro lado passaria a
  // cobri-lo. A regra e local -- so sobe acima do que o traco ENCOSTA.
  drawAt({ x: 120, y: 150 }, 300, 0);
  const longe = [...doc.all()].filter(
    (o): o is StrokeObject => o.type === 'stroke' && o.variant === 'highlighter',
  );
  const distante = longe.find((o) => o.transform.x < 200);
  check(
    'com a imagem no quadro, grifar longe dela continua indo por baixo do texto',
    distante !== undefined && distante.z < aZ && distante.z < foto.z,
    `z do grifo distante=${distante?.z} z do texto=${aZ} z da imagem=${foto.z} ` +
      `esperado=menor que os dois`,
  );

  // --- a pressao chega ao traco
  // O lapis saiu da barra em 04/08/2026 (com mouse era identico a caneta), mas
  // a pressao continua sendo GRAVADA por ponto: e o que uma mesa digitalizadora
  // entrega, e e o que os tracos de lapis ja salvos precisam para continuar
  // sendo desenhados como foram criados.
  setup('pen');
  drawAt({ x: 700, y: 200 }, 120, 0, 8, (t) => 0.2 + 0.6 * t);
  const comPressao = drawn();
  const primeira = comPressao?.points[2] ?? NaN;
  const ultima = comPressao?.points[comPressao.points.length - 1] ?? NaN;
  check(
    'a pressao da caneta chega ao traco',
    comPressao !== undefined && ultima > primeira + 0.3,
    `pressao inicial=${primeira?.toFixed(2)} final=${ultima?.toFixed(2)} esperado=crescente`,
  );

  // --- traco de lapis salvo antes da remocao continua sendo desenhado
  // A ferramenta saiu da barra, mas a variante continua no modelo. Sem esta
  // verificacao, alguem limparia o caminho do lapis no painter por parecer
  // codigo morto -- e os quadros ja salvos perderiam tinta.
  const antigo: StrokeObject = {
    ...BASE,
    id: 'LAPIS',
    type: 'stroke',
    variant: 'pencil',
    z: 'a9',
    transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
    bbox: { x: 0, y: 0, w: 0, h: 0 },
    points: [0, 0, 0.2, 20, 20, 0.6, 40, 40, 1],
    color: '#1f2933',
    width: 6,
  };
  antigo.bbox = computeBbox(antigo);
  check(
    'traco de lapis salvo antes da remocao continua sendo desenhado',
    temTinta(antigo),
    `variante=${antigo.variant} pixels desenhados=${temTinta(antigo)}`,
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

  // --- a espessura anda de 10 em 10% e respeita a faixa
  setup('pen');
  // Parte do MEIO da faixa, e nao do que estiver gravado: `DrawStyle` persiste
  // em localStorage, entao a preferencia deixada por quem usou o app antes
  // entrava no teste -- com a caneta no maximo, `]` nao tinha para onde subir e
  // a verificacao reprovava sem nada estar quebrado.
  const anterior = app.drawStyle.width('pen');
  app.drawStyle.setPercent('pen', 50);
  const larguraInicial = app.drawStyle.width('pen');
  key(']');
  const maisGrosso = app.drawStyle.width('pen');
  key('[');
  key('[');
  const maisFino = app.drawStyle.width('pen');

  // Nas pontas a barra para, em vez de sair da faixa: 0% ainda desenha, e o
  // maximo nao pode passar do que o AABB do traco comporta.
  app.drawStyle.setPercent('pen', 0);
  const noMinimo = app.drawStyle.width('pen');
  app.drawStyle.stepWidth('pen', -1);
  const abaixoDoMinimo = app.drawStyle.width('pen');
  app.drawStyle.setPercent('pen', 100);
  app.drawStyle.stepWidth('pen', 1);
  const acimaDoMaximo = app.drawStyle.width('pen');
  const faixa = app.drawStyle.range('pen');
  app.drawStyle.setWidth('pen', anterior);

  check(
    '] e [ andam de 10 em 10% e a barra para nas pontas da faixa',
    maisGrosso > larguraInicial &&
      maisFino < larguraInicial &&
      noMinimo === faixa.min &&
      abaixoDoMinimo === faixa.min &&
      acimaDoMaximo === faixa.max &&
      noMinimo > 0,
    `meio=${larguraInicial} depois de ]=${maisGrosso} depois de [[=${maisFino} · ` +
      `faixa=${faixa.min}..${faixa.max} minimo=${noMinimo} (nunca zero) maximo=${acimaDoMaximo}`,
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

/**
 * O objeto deixa algum pixel no canvas?
 *
 * Rasteriza pequeno e pergunta se sobrou alfa. E a unica forma de conferir que
 * um painter continua desenhando de verdade, e nao apenas de que ele nao lanca
 * excecao.
 */
function temTinta(obj: BoardObject): boolean {
  const b = obj.bbox;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;

  const escala = 60 / Math.max(b.w, b.h, 1);
  ctx.setTransform(escala, 0, 0, escala, 2 - b.x * escala, 2 - b.y * escala);
  const t = obj.transform;
  ctx.translate(t.x, t.y);
  paintObject(obj, {
    ctx,
    zoom: escala,
    lod: 'full',
    deviceScale: escala,
    objectScale: 1,
    adapt: (c) => c,
  });

  const data = ctx.getImageData(0, 0, 64, 64).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i]! > 8) return true;
  }
  return false;
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

  // --- a interface NAO pode rolar, nunca
  //
  // Bug real relatado em 04/08/2026: digitando perto da borda, a janela
  // aparecia rasgada, com pedacos da interface repetidos. A causa era
  // `overflow: hidden`, que esconde o que passa da borda mas **continua sendo
  // um container rolavel** -- e o navegador rola por programa toda vez que o
  // cursor de texto se mexe, para mante-lo a vista. Como a caixa em edicao e
  // posicionada por `transform`, e area transformada conta como area rolavel,
  // digitar arrastava a interface inteira.
  //
  // O teste tenta rolar na marra, com uma caixa grande aberta na quina.
  setup('text');
  drawStyle.setWidth('text', 72);
  click(host, box.left + box.width - 80, box.top + box.height - 60);
  typeInEditor('linha um\nlinha dois\nlinha tres', { commit: false });

  const roláveis = [document.body, document.querySelector<HTMLElement>('.qb-app')].filter(
    (el): el is HTMLElement => el !== null,
  );
  for (const el of roláveis) {
    el.scrollTop = 400;
    el.scrollLeft = 400;
  }
  const rolou = roláveis.filter((el) => el.scrollTop !== 0 || el.scrollLeft !== 0);
  editorEl()?.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
  );
  drawStyle.setWidth('text', 16);

  check(
    'a interface nao rola, nem quando empurrada — senao digitar entorta a janela',
    rolou.length === 0,
    `tentou rolar body e .qb-app em 400px · rolaram=[${rolou.map((e) => e.className || e.tagName).join(', ')}] ` +
      `esperado=nenhum`,
  );

  // --- o botao de negrito age sobre a caixa selecionada
  // O `Ctrl+B` ja funcionava DENTRO da caixa desde a Fase 5; o que faltava era
  // o controle visivel, e ele tambem precisa valer para quem so selecionou o
  // texto -- senao o botao fica inerte justamente no gesto mais comum.
  setup('text');
  clickWorld(host, box, { x: 700, y: 300 });
  typeInEditor('negrito pelo botao');
  const paraNegrito = madeText()!;
  selection.set([paraNegrito.id]);
  history.clear();
  app.toggleTextFormat('bold');
  const negrito = doc.get(paraNegrito.id) as TextObject | undefined;
  app.toggleTextFormat('bold');
  const semNegrito = doc.get(paraNegrito.id) as TextObject | undefined;
  key('z', { ctrl: true });
  key('z', { ctrl: true });
  const desfeitoNegrito = doc.get(paraNegrito.id) as TextObject | undefined;
  check(
    'o botao de negrito liga e desliga na caixa selecionada, e o Ctrl+Z desfaz',
    negrito?.content.every((s) => s.bold === true) === true &&
      semNegrito?.content.every((s) => s.bold === true) === false &&
      desfeitoNegrito?.content.every((s) => s.bold === true) === false,
    `ligado=${negrito?.content[0]?.bold} desligado=${semNegrito?.content[0]?.bold} ` +
      `depois do Ctrl+Z=${desfeitoNegrito?.content[0]?.bold}`,
  );

  // --- cor livre: aceita, e o app sabe dizer quando ela sera exibida trocada
  const corLivre = '#7f5af0';
  drawStyle.setColor('pen', corLivre);
  const aceitou = drawStyle.color('pen') === corLivre;
  // Um cinza bem claro no tema claro e resgatado por inversao -- ele NAO some,
  // aparece escuro. E disso que o aviso trata.
  const clara = displayedAs('#f2f2f2', '#ffffff');
  const escura = displayedAs('#1f2933', '#ffffff');
  drawStyle.setColor('pen', '#1f2933');
  check(
    'o seletor aceita cor fora da paleta, e o app sabe quando ela sera exibida trocada',
    aceitou && clara.toLowerCase() !== '#f2f2f2' && escura.toLowerCase() === '#1f2933',
    `aceitou ${corLivre}=${aceitou} · cinza claro exibido como ${clara} (trocado) · ` +
      `quase preto exibido como ${escura} (intacto)`,
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

// --------------------------------------------- barra e troca de ferramenta

/**
 * O que o teclado ja cobria, agora pelo BOTAO.
 *
 * A lacuna que isto fecha e concreta: `G`, `A` e `R` sempre passaram no
 * auto-teste, e mesmo assim os tres botoes correspondentes da barra foram
 * relatados como sem efeito. Testar a acao e testar o caminho ate ela sao
 * coisas diferentes.
 */
async function runHudTests(app: App, check: Check, reset: () => void): Promise<void> {
  const { doc } = app;
  reset();

  // Procura por `data-action`, e nao pelo texto: a barra virou icones, e um
  // teste preso ao rotulo quebra a cada renomeacao -- foi o que aconteceu
  // quando o "?" virou "comandos".
  const barButton = (action: string): HTMLButtonElement | null =>
    document.querySelector<HTMLButtonElement>(`.qb-bar__btn[data-action="${action}"]`);

  // --- os tres botoes relatados
  const grade = barButton('grade');
  const gradeAntes = doc.prefs.grid.enabled;
  grade?.click();
  const gradeDepois = doc.prefs.grid.enabled;
  if (gradeDepois !== gradeAntes) grade?.click();

  const ima = barButton('ima');
  const imaAntes = doc.prefs.snapToGrid;
  ima?.click();
  const imaDepois = doc.prefs.snapToGrid;
  if (imaDepois !== imaAntes) ima?.click();

  const regua = barButton('regua');
  const reguaAntes = app.rulersEnabled;
  regua?.click();
  const reguaDepois = app.rulersEnabled;
  if (reguaDepois !== reguaAntes) regua?.click();

  check(
    'os botoes de grade, ima e regua da barra inferior fazem efeito',
    grade !== null &&
      ima !== null &&
      regua !== null &&
      gradeDepois !== gradeAntes &&
      imaDepois !== imaAntes &&
      reguaDepois !== reguaAntes,
    `achados: grade=${grade !== null} ima=${ima !== null} regua=${regua !== null} | ` +
      `mudou: grade=${gradeDepois !== gradeAntes} ima=${imaDepois !== imaAntes} ` +
      `regua=${reguaDepois !== reguaAntes}`,
  );

  // --- M8: o painel de camadas
  //
  // O cadeado e o `hidden` ja existiam no modelo desde a Fase 1/3; o que este
  // painel entrega e ENXERGAR e ALCANCAR. As verificacoes seguem esse recorte:
  // nao re-testam travar (ja coberto), testam que o painel liga o controle.
  doc.clear();
  doc.add(scene());
  app.selection.clear();
  app.history.clear();

  const camadasBtn = barButton('camadas');
  camadasBtn?.click();
  const linhasDoPainel = (): HTMLElement[] => [
    ...document.querySelectorAll<HTMLElement>('.qb-layers__row'),
  ];
  const abriu = !document.querySelector<HTMLElement>('.qb-layers')?.hidden;
  check(
    'o botao de camadas abre o painel, e ele lista o que esta no quadro',
    abriu && linhasDoPainel().length === doc.size,
    `aberto=${abriu} linhas=${linhasDoPainel().length} objetos=${doc.size}`,
  );

  // --- o olho esconde de verdade, e o Ctrl+Z devolve
  //
  // "Esconder" so vale se o objeto sair do desenho. `queryVisible` e o caminho
  // por onde o renderer e a exportacao pedem os objetos -- se ele ainda
  // aparecer ali, o olho e enfeite.
  const alvoId = linhasDoPainel()[0]?.dataset['id'] ?? '';
  const noViewport = (): number =>
    doc.queryVisible({ x: -5000, y: -5000, w: 20_000, h: 20_000 }).length;
  const antesDeEsconder = noViewport();
  linhasDoPainel()[0]?.querySelector<HTMLButtonElement>('[aria-label="Esconder"]')?.click();
  const depoisDeEsconder = noViewport();
  key('z', { ctrl: true });
  check(
    'o olho do painel esconde o objeto do desenho, e o Ctrl+Z devolve',
    depoisDeEsconder === antesDeEsconder - 1 && noViewport() === antesDeEsconder,
    `no viewport: antes=${antesDeEsconder} escondido=${depoisDeEsconder} ` +
      `depois do Ctrl+Z=${noViewport()} esperado=(${antesDeEsconder}, ${antesDeEsconder - 1}, ${antesDeEsconder})`,
  );

  // --- o cadeado do painel e a mesma trava que o hitTest ja respeita
  linhasDoPainel()
    .find((l) => l.dataset['id'] === alvoId)
    ?.querySelector<HTMLButtonElement>('[aria-label="Travar"]')
    ?.click();
  const travou = doc.get(alvoId)?.locked === true;

  // --- e o painel continua alcancando o que travou
  //
  // Esta e a verificacao que da sentido ao painel: travar sem uma lista seria
  // uma porta que fecha por fora. O clique no NOME seleciona mesmo travado, que
  // e o unico caminho de volta.
  app.selection.clear();
  linhasDoPainel()
    .find((l) => l.dataset['id'] === alvoId)
    ?.querySelector<HTMLButtonElement>('.qb-layers__name')
    ?.click();
  check(
    'o cadeado do painel trava, e o painel continua sendo a porta de volta',
    travou && app.selection.ids().includes(alvoId),
    `travado=${travou} selecionado pelo painel=${app.selection.ids().includes(alvoId)} ` +
      `(travado nao responde a clique NO QUADRO; o painel e o unico caminho)`,
  );

  camadasBtn?.click();
  app.selection.clear();
  doc.clear();
  reset();

  // --- B9: o painel do F3 destaca CUSTO, e nao frequencia de atualizacao
  //
  // Ele leu "66 fps" como "o app esta rapido" e "28 fps" como "esta lento",
  // quando o numero so dizia quantas vezes a tela mudou. A verificacao trava as
  // duas metades da correcao: o primeiro numero e o Render (trabalho puro), e o
  // rotulo "FPS" nao existe mais -- e ele que convidava a leitura errada.
  key('F3');
  // O painel so escreve os valores no proximo frame -- ele e alimentado pelo
  // laco de render, e nao pelo atalho. Ler na mesma linha pega o traco inicial.
  await nextFrames(2);
  const chaves = [...document.querySelectorAll<HTMLElement>('.qb-debug__key')].map(
    (e) => e.textContent ?? '',
  );
  const primeiro = document.querySelector<HTMLElement>('.qb-debug__row .qb-debug__val');
  key('F3');
  check(
    'o painel do F3 destaca o custo de desenhar, e nao a frequencia de atualizacao',
    chaves[0] === 'Render' &&
      !chaves.includes('FPS') &&
      chaves.includes('Atualizacoes/s') &&
      /ms$/.test(primeiro?.textContent ?? ''),
    `primeira linha=${chaves[0]} valor=${primeiro?.textContent} · ` +
      `tem "FPS"=${chaves.includes('FPS')} tem "Atualizacoes/s"=${chaves.includes('Atualizacoes/s')}`,
  );

  // --- a barra virou icones, mas continua nomeada e alcancavel
  // Sem texto visivel, o nome do botao vive no `aria-label` -- e e ele que um
  // leitor de tela anuncia. Um icone sem nome e um botao mudo.
  const acoes = ['voltar', 'salvar', 'exportar', 'desfazer', 'refazer', 'grade', 'ima', 'regua', 'camadas', 'ajustar', 'tema', 'comandos', 'zoom-menos', 'zoom-mais'];
  const faltando = acoes.filter((a) => barButton(a) === null);
  const semNome = acoes.filter((a) => {
    const b = barButton(a);
    return b !== null && !b.getAttribute('aria-label');
  });
  const comIcone = acoes.filter((a) => barButton(a)?.querySelector('svg') !== null).length;
  check(
    'todos os botoes da barra existem, tem icone e tem nome acessivel',
    faltando.length === 0 && semNome.length === 0 && comIcone === acoes.length,
    `faltando=[${faltando.join(', ')}] sem nome=[${semNome.join(', ')}] ` +
      `com icone=${comIcone}/${acoes.length}`,
  );

  // --- a barra lateral tambem virou icone, e tambem precisa continuar nomeada
  const ferramentas = ['select', 'pen', 'highlighter', 'text', 'note', 'shape', 'eraser'];
  const railBtn = (id: string): HTMLButtonElement | null =>
    document.querySelector<HTMLButtonElement>(`.qb-tools__btn[data-action="${id}"]`);
  const semIcone = ferramentas.filter((f) => railBtn(f)?.querySelector('svg') == null);
  const semRotulo = ferramentas.filter((f) => !railBtn(f)?.getAttribute('aria-label'));
  // Clicar no botao tem de trocar a ferramenta -- o mesmo caminho que faltava
  // ser testado na barra inferior.
  railBtn('pen')?.click();
  const depoisDoClique = app.activeTool;
  railBtn('select')?.click();

  check(
    'os botoes da barra lateral tem icone, nome e trocam a ferramenta ao clicar',
    semIcone.length === 0 &&
      semRotulo.length === 0 &&
      depoisDoClique === 'pen' &&
      app.activeTool === 'select',
    `sem icone=[${semIcone.join(', ')}] sem nome=[${semRotulo.join(', ')}] ` +
      `clique na caneta=${depoisDoClique} voltou para=${app.activeTool}`,
  );

  // --- trocar de cor NAO pode reconstruir o painel
  // Era isso que deixava o seletor lento: cada clique recriava as quatro linhas
  // de opcao -- cerca de vinte botoes -- e cada elemento novo obriga o
  // navegador a recalcular estilo e layout.
  app.setTool('pen');
  const paleta = app.drawStyle.colorsFor('pen');
  const corAntiga = app.drawStyle.color('pen');
  const corNova = paleta.find((c) => c !== corAntiga)!;
  const botaoAntes = document.querySelector<HTMLElement>('.qb-tools__color');
  app.drawStyle.setColor('pen', corNova);
  const botaoDepois = document.querySelector<HTMLElement>('.qb-tools__color');
  const ativo = document.querySelector<HTMLElement>('.qb-tools__color--active');
  app.drawStyle.setColor('pen', corAntiga);

  check(
    'trocar de cor move o destaque sem recriar os botoes do painel',
    botaoAntes !== null && botaoAntes === botaoDepois && ativo?.dataset['value'] === corNova,
    `mesmo elemento=${botaoAntes === botaoDepois} ` +
      `destaque em=${ativo?.dataset['value'] ?? 'nenhum'} esperado=${corNova}`,
  );

  // --- MEDICAO: quanto custa alternar de ferramenta com o quadro cheio
  // Relato: o app engasga ao trocar de icone rapidamente. A conta abaixo separa
  // o custo do DOM (reconstruir o painel de opcoes) do custo de REDESENHAR o
  // quadro inteiro, que e o que a troca de ferramenta dispara hoje.
  doc.clear();
  doc.add(generateStressObjects(4000));
  app.fitToContent();
  await nextFrames(3);

  const TROCAS = 16;
  const t0 = performance.now();
  for (let i = 0; i < TROCAS; i++) app.setTool(i % 2 === 0 ? 'pen' : 'select');
  const msDom = (performance.now() - t0) / TROCAS;

  // Mede o trabalho SINCRONO da troca, e nada mais.
  //
  // Ate 12/08/2026 esta verificacao comparava dois lacos que esperavam frame --
  // "troca + repintura" menos "so repintura" -- e reprovava. A conta era
  // impossivel, e o registro do B9 ja avisava: esperar o frame soma a espera do
  // vsync ao trabalho. Depois do B12 ficou pior, porque a repintura de 4.000
  // objetos passou de ~8 ms para ~46 ms: dois numeros grandes e quantizados pelo
  // monitor sendo subtraidos para enxergar um efeito de 0,1 ms. O ruido virou
  // dez vezes o teto, sem uma linha do codigo vigiado ter mudado.
  //
  // O que esta verificacao existe para pegar e o B3: alguem voltar a reconstruir
  // o painel inteiro a cada troca. Isso e trabalho de DOM, sincrono, e aparece
  // por completo em `msDom` -- que ja era medido e ja estava certo. Quando o
  // painel era reconstruido, este numero era 5,3 ms; hoje e 0,1 ms.
  const custoDeDesenho = medirRender(app);
  check(
    'trocar de ferramenta nao reconstroi o painel de opcoes',
    msDom < 1,
    `troca sincrona ${msDom.toFixed(2)} ms (teto 1; era 5,3 quando o painel era reconstruido) · ` +
      `desenhar os 4.000 objetos, so trabalho: ${custoDeDesenho.toFixed(1)} ms`,
  );

  // --- MEDICAO: onde o custo de desenhar esta, por tipo de objeto
  //
  // Esta e a repartição que orienta o cache de rasterizacao. Sem ela, "o quadro
  // cheio custa 16 ms" nao diz o que otimizar -- e a decisao registrada no
  // rasterCache.ts ("traco e caminho passam direto, cachea-los economizaria
  // pouco") era deducao, nunca medicao.
  //
  // Duas colunas de proposito, pelo mesmo motivo da medicao da busca: o primeiro
  // desenho paga a rasterizacao e os seguintes colhem o cache. Uma media
  // escondendo o primeiro daria um numero bonito e mentiroso.
  const POR_TIPO = 800;
  const pool = generateStressObjects(14_000, 4242);
  const linhas: string[] = [];
  for (const tipo of ['stroke', 'shape', 'note', 'text'] as const) {
    const amostra = pool.filter((o) => o.type === tipo).slice(0, POR_TIPO);
    if (amostra.length < POR_TIPO) continue;

    doc.clear();
    doc.add(amostra);
    app.fitToContent();

    const frio = medirRender(app, 1);
    const quente = medirRender(app, 6);
    linhas.push(
      `${tipo} ${((quente / POR_TIPO) * 1000).toFixed(2)}/mil (frio ${((frio / POR_TIPO) * 1000).toFixed(2)})`,
    );
  }

  check(
    'a reparticao do custo de desenho por tipo de objeto esta disponivel',
    linhas.length === 4,
    `${linhas.join(' · ')} — ms por mil objetos na tela, sem esperar frame`,
  );

  reset();
  doc.clear();
  app.setTool('select');
}

/**
 * Custo medio de UMA passada de desenho da camada estatica, em ms.
 *
 * Chama o renderer direto: sem rAF, sem vsync, sem depender de a janela estar
 * na frente. Ver `App.renderNowForMeasurement` para o porque.
 */
function medirRender(app: App, reps = 5): number {
  const t = performance.now();
  for (let i = 0; i < reps; i++) app.renderNowForMeasurement();
  return (performance.now() - t) / reps;
}

/** Espera N frames de animacao. */
function nextFrames(count: number): Promise<void> {
  return new Promise((resolve) => {
    let left = count;
    const tick = (): void => {
      if (--left <= 0) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

// ----------------------------------------------------- exportar e autosave

async function runExportTests(app: App, check: Check, reset: () => void): Promise<void> {
  const { doc, selection, history } = app;
  const tema = { boardBg: '#ffffff', gridColor: '#dde2ea' };

  const setup = (): void => {
    reset();
    selection.clear();
    history.clear();
    doc.clear();
    app.assets.clear();
    doc.setPrefs({ snapToGrid: false, unit: 'px' });
    doc.add(scene());
    app.setTool('select');
  };

  // --- PNG: tamanho segue a area, a margem e a escala
  setup();
  const area = exportBounds(doc, [])!;
  const png = await renderPng(doc, app.assets, area, [], {
    scale: 2,
    padding: 10,
    background: '#ffffff',
    theme: tema,
  });
  const esperadoW = Math.round((area.w + 20) * 2);
  check(
    'o PNG exportado sai no tamanho da area, com margem e escala aplicadas',
    png.width === esperadoW && png.bytes.length > 100 && png.scale === 2,
    `${png.width}x${png.height} px, ${png.bytes.length} bytes, escala=${png.scale} ` +
      `esperado=largura ${esperadoW}`,
  );

  // --- exportar so a selecao usa a area da selecao
  const soUm = exportBounds(doc, ['A'])!;
  check(
    'exportar a selecao mede so o que esta selecionado',
    near(soUm.w, 100, 0.01) && near(soUm.x, 100, 0.01) && soUm.w < area.w,
    `area da selecao=${soUm.w.toFixed(0)}x${soUm.h.toFixed(0)} em (${soUm.x.toFixed(0)}) ` +
      `area total=${area.w.toFixed(0)} esperado=100x100 em 100`,
  );

  // --- o teto de pixels reduz a escala em vez de estourar
  // Sem isso, um quadro grande a 3x pediria um canvas que o navegador nao aloca
  // e a exportacao morreria sem explicacao.
  const enorme = { x: 0, y: 0, w: 40_000, h: 30_000 };
  const gigante = await renderPng(doc, app.assets, enorme, [], {
    scale: 3,
    padding: 0,
    background: '#ffffff',
    theme: tema,
  });
  check(
    'o teto de pixels reduz a escala do PNG em vez de estourar o canvas',
    gigante.scale < 3 && gigante.width * gigante.height <= 64_000_000 && gigante.bytes.length > 0,
    `escala pedida=3 usada=${gigante.scale.toFixed(3)} ` +
      `${gigante.width}x${gigante.height} = ${(gigante.width * gigante.height / 1e6).toFixed(1)} MP`,
  );

  // --- B13: os tres botoes de resolucao tem de produzir arquivos DIFERENTES
  //
  // Era este o defeito: num quadro grande o teto de pixels engolia a escolha e
  // 1x, 2x e 3x davam o mesmo arquivo, calado. A verificacao compara os tres
  // planos -- se dois derem o mesmo total de pixels, o botao voltou a mentir.
  const planos = [1, 2, 3].map((s) => planTiles(enorme, 0, s));
  const totais = planos.map((p) => p.width * p.height);
  check(
    'os tres botoes de resolucao produzem tamanhos diferentes, mesmo num quadro grande',
    planos.every((p, i) => p.scale === i + 1) &&
      totais[1]! > totais[0]! * 3.5 &&
      totais[2]! > totais[1]! * 2,
    planos
      .map((p) => `${p.scale}x=${p.width}x${p.height} em ${p.cols * p.rows} ladrilho(s)`)
      .join(' · '),
  );

  // --- nenhum ladrilho pode estourar o que o navegador aloca
  const grande = planTiles(enorme, 0, 3);
  check(
    'nenhum ladrilho passa do teto de pixels nem do lado maximo',
    grande.tileW <= 16_384 && grande.tileH <= 16_384 && grande.tileW * grande.tileH <= 64_000_000,
    `ladrilho=${grande.tileW}x${grande.tileH} = ` +
      `${((grande.tileW * grande.tileH) / 1e6).toFixed(1)} MP (tetos 16.384 e 64 MP)`,
  );

  // --- a grade cobre a area inteira, sem buraco e sem sobra
  const somaW = grande.tileW * (grande.cols - 1) + Math.min(grande.tileW, grande.width - grande.tileW * (grande.cols - 1));
  const somaH = grande.tileH * (grande.rows - 1) + Math.min(grande.tileH, grande.height - grande.tileH * (grande.rows - 1));
  check(
    'os ladrilhos somados dao exatamente a imagem inteira',
    somaW === grande.width && somaH === grande.height,
    `${grande.cols}x${grande.rows} ladrilhos somam ${somaW}x${somaH}, imagem ${grande.width}x${grande.height}`,
  );

  // --- e os ladrilhos mostram partes DIFERENTES do quadro
  //
  // Sem isto, uma transformacao errada gravaria o mesmo pedaco N vezes -- o
  // arquivo sairia, a contagem bateria, e o quadro estaria perdido. Com dois
  // objetos afastados, cada ladrilho tem de pegar um deles.
  setup();
  doc.clear();
  doc.add(scene());
  const dois = { x: 0, y: 0, w: 3000, h: 200 };
  const planoDois = planTiles(dois, 0, 1);
  const forcado: TilePlan = { ...planoDois, cols: 2, tileW: Math.ceil(planoDois.width / 2) };
  const esq = await renderPngTile(doc, app.assets, [], { scale: 1, padding: 0, background: '#ffffff', theme: tema }, forcado, 0, 0);
  const dir = await renderPngTile(doc, app.assets, [], { scale: 1, padding: 0, background: '#ffffff', theme: tema }, forcado, 1, 0);
  check(
    'ladrilhos vizinhos gravam pedacos diferentes do quadro',
    esq.bytes.length !== dir.bytes.length,
    `esquerdo ${esq.width}x${esq.height} (${esq.bytes.length} bytes) · ` +
      `direito ${dir.width}x${dir.height} (${dir.bytes.length} bytes) — ` +
      `bytes iguais significariam o mesmo pedaco gravado duas vezes`,
  );

  // --- SVG: um elemento por objeto, com a geometria certa
  setup();
  const svg = renderSvg(doc, app.assets, area, [], {
    padding: 10,
    background: '#ffffff',
    adaptAgainst: '#ffffff',
  });
  check(
    'o SVG traz os objetos como elementos vetoriais',
    svg.startsWith('<?xml') &&
      svg.includes('<svg ') &&
      svg.includes('<rect') &&
      svg.includes('<polyline') &&
      svg.includes('viewBox='),
    `${svg.length} bytes, tem rect=${svg.includes('<rect')} polyline=${svg.includes('<polyline')} ` +
      `viewBox=${svg.includes('viewBox=')}`,
  );

  // --- SVG escapa o conteudo do usuario
  // Um resumo com "<b>" escrito dentro nao pode virar marcacao no arquivo.
  setup();
  doc.add([
    {
      ...BASE,
      id: 'TX',
      type: 'text',
      z: 'a9',
      transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
      // Alta o bastante para caber tudo: o SVG corta o que passa da caixa, como
      // o painter, e uma caixa baixa esconderia justamente o trecho a conferir.
      bbox: { x: 0, y: 0, w: 400, h: 200 },
      w: 400,
      h: 200,
      autoHeight: true,
      content: [{ text: 'a < b & <script>alert(1)</script>' }],
      fontFamily: "'Segoe UI', sans-serif",
      fontSize: 16,
      lineHeight: 1.35,
      align: 'left',
      color: '#1f2933',
      list: 'none',
    } as TextObject,
  ]);
  const comTexto = renderSvg(doc, app.assets, exportBounds(doc, ['TX'])!, ['TX'], {
    padding: 0,
    background: null,
    adaptAgainst: '#ffffff',
  });
  check(
    'o SVG escapa o texto do usuario em vez de virar marcacao',
    comTexto.includes('&lt;script&gt;') &&
      !comTexto.includes('<script>') &&
      comTexto.includes('&amp;'),
    `${comTexto.length} bytes, tem texto=${comTexto.includes('<text')} ` +
      `escapado=${comTexto.includes('&lt;script&gt;')} cru=${comTexto.includes('<script>')}`,
  );

  // --- B14: cada trecho preso a largura que medimos
  //
  // Sem isto o arquivo depende da fonte de quem abre: um trecho renderizado mais
  // largo que o medido invade o proximo, e sai texto por cima de texto. O guarda
  // e a presenca do par textLength+lengthAdjust, porque e ele que some se alguem
  // simplificar a emissao do <text>.
  const trechos = comTexto.match(/<text\b[^>]*>/g) ?? [];
  const presos = trechos.filter((t) => t.includes('textLength=')).length;
  check(
    'cada trecho de texto do SVG e preso a largura medida, para nao invadir o vizinho',
    trechos.length > 0 && presos === trechos.length && comTexto.includes('spacingAndGlyphs'),
    `${presos} de ${trechos.length} <text> com textLength ` +
      `(lengthAdjust=${comTexto.includes('spacingAndGlyphs')})`,
  );

  // --- SVG: o apagamento da borracha vira mascara
  setup();
  const tinta = doc.get('INK') as StrokeObject;
  doc.replace({ ...tinta, erased: [{ points: [40, 40, 120, 120], width: 30 }], rev: tinta.rev + 1 });
  const comMascara = renderSvg(doc, app.assets, exportBounds(doc, ['INK'])!, ['INK'], {
    padding: 0,
    background: null,
    adaptAgainst: '#ffffff',
  });
  check(
    'o buraco da borracha vira mascara no SVG, e nao mancha da cor do fundo',
    comMascara.includes('<mask') &&
      comMascara.includes('mask="url(#') &&
      comMascara.includes('fill="white"'),
    `tem mask=${comMascara.includes('<mask')} referencia=${comMascara.includes('mask="url(#')}`,
  );

  // --- a regra do autosave
  // Testada como regra, e nao gravando de verdade: um teste que salva encheria
  // a pasta de quadros do usuario a cada execucao.
  const semCaminho = autosaveVerdict({ hasPath: false, dirty: true, saving: false, editing: false });
  const limpo = autosaveVerdict({ hasPath: true, dirty: false, saving: false, editing: false });
  const digitando = autosaveVerdict({ hasPath: true, dirty: true, saving: false, editing: true });
  const gravando = autosaveVerdict({ hasPath: true, dirty: true, saving: true, editing: false });
  const podeSalvar = autosaveVerdict({ hasPath: true, dirty: true, saving: false, editing: false });
  check(
    'o autosave so grava quadro ja salvo, sujo, e com o usuario fora da caixa de texto',
    semCaminho === 'nao' &&
      limpo === 'nao' &&
      digitando === 'adiar' &&
      gravando === 'adiar' &&
      podeSalvar === 'salvar',
    `sem caminho=${semCaminho} limpo=${limpo} digitando=${digitando} gravando=${gravando} ` +
      `pronto=${podeSalvar} esperado=(nao, nao, adiar, adiar, salvar)`,
  );

  // --- B11: a pasta de quadros e UMA so, e ela e a documentada
  //
  // Pedir varias vezes DE UMA VEZ e o ponto: o bug nasceu de duas resolucoes
  // concorrentes discordarem, cada uma sondando a pasta por conta propria e uma
  // delas apagando o arquivo de prova da outra. Uma chamada de cada vez nunca
  // teria pego isto -- foi assim que a biblioteca dele se partiu em duas pastas
  // sem ninguem perceber, entre 30/07 e 08/08/2026.
  const pastas = await Promise.all([
    window.quadro.board.folder(),
    window.quadro.board.folder(),
    window.quadro.board.folder(),
    window.quadro.board.folder(),
  ]);
  const iguais = pastas.every((p) => p === pastas[0]);
  const esperada = 'Resumos-quadrobranco';
  check(
    'a pasta de quadros e uma so, mesmo pedida por varios caminhos ao mesmo tempo',
    iguais && (pastas[0] ?? '').endsWith(esperada),
    `${pastas.length} chamadas concorrentes -> ${iguais ? 'todas iguais' : '*** DIVERGIRAM ***'}: ` +
      `${[...new Set(pastas)].join(' | ')}`,
  );

  setup();
  doc.clear();
}

// ------------------------------------------------------------------ imagens

/**
 * Um PNG de verdade, gerado na hora.
 *
 * Melhor que embutir bytes de um arquivo: o teste exercita o mesmo caminho de
 * decodificacao do app (`createImageBitmap` sobre um Blob real) sem depender de
 * nada no disco.
 */
async function fakeImageFile(w: number, h: number, name = 'teste.png'): Promise<File> {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#1971c2';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#ffd43b';
  ctx.fillRect(0, 0, w / 2, h / 2);

  const blob = await new Promise<Blob | null>((r) => canvas.toBlob((b) => r(b), 'image/png'));
  if (!blob) throw new Error('nao foi possivel gerar o PNG de teste');
  return new File([blob], name, { type: 'image/png' });
}

async function runImageTests(
  host: HTMLElement,
  app: App,
  check: Check,
  reset: () => void,
): Promise<void> {
  const { doc, selection, history } = app;
  const box = host.getBoundingClientRect();

  const setup = (): void => {
    reset();
    selection.clear();
    history.clear();
    doc.clear();
    app.assets.clear();
    doc.setPrefs({ snapToGrid: false, unit: 'px' });
    app.setTool('select');
  };

  const madeImage = (): ImageObject | undefined =>
    [...doc.all()].find((o): o is ImageObject => o.type === 'image');

  // --- arrastar um arquivo para dentro do quadro insere a imagem onde caiu
  setup();
  const arquivo = await fakeImageFile(400, 200);
  const dt = new DataTransfer();
  dt.items.add(arquivo);
  host.dispatchEvent(
    new DragEvent('drop', {
      dataTransfer: dt,
      clientX: 700 + box.left,
      clientY: 400 + box.top,
      bubbles: true,
      cancelable: true,
    }),
  );
  // A insercao decodifica fora da thread principal; esperar o proximo tique e o
  // que o app tambem faz.
  await settle();
  const solta = madeImage();
  check(
    'arrastar um arquivo insere a imagem onde ela foi solta',
    solta !== undefined &&
      near(solta.transform.x + solta.w / 2, 700, 2) &&
      near(solta.transform.y + solta.h / 2, 400, 2) &&
      solta.naturalW === 400 &&
      history.depth === 1,
    `centro=(${solta ? (solta.transform.x + solta.w / 2).toFixed(0) : '-'}, ` +
      `${solta ? (solta.transform.y + solta.h / 2).toFixed(0) : '-'}) ` +
      `natural=${solta?.naturalW}x${solta?.naturalH} passos=${history.depth} esperado=(700, 400)`,
  );

  // --- imagem grande entra em tamanho de tela, e pequena entra no tamanho dela
  setup();
  await app.insertImageFiles([await fakeImageFile(3840, 2160)], { x: 0, y: 0 });
  const grande = madeImage();
  setup();
  await app.insertImageFiles([await fakeImageFile(64, 48)], { x: 0, y: 0 });
  const pequena = madeImage();
  check(
    'imagem grande entra reduzida e imagem pequena nao e ampliada',
    grande !== undefined &&
      grande.w === 720 &&
      near(grande.h, 405, 1) &&
      pequena !== undefined &&
      pequena.w === 64 &&
      pequena.h === 48,
    `grande=${grande?.w}x${grande?.h} (arquivo 3840x2160) pequena=${pequena?.w}x${pequena?.h} ` +
      `(arquivo 64x48) esperado=(720x405, 64x48)`,
  );

  // --- colar do sistema insere imagem, e nao passa pela area interna
  setup();
  const colado = new DataTransfer();
  colado.items.add(await fakeImageFile(200, 200, 'colado.png'));
  window.dispatchEvent(
    new ClipboardEvent('paste', { clipboardData: colado, bubbles: true, cancelable: true }),
  );
  await settle();
  check(
    'colar uma imagem do sistema insere a imagem no quadro',
    madeImage() !== undefined && doc.size === 1,
    `objetos=${doc.size} tipo=${[...doc.all()][0]?.type ?? '-'} esperado=(1, image)`,
  );

  // --- o caminho REAL do colar: a tecla nao pode cancelar o padrao
  //
  // Este e o teste que faltava e que deixou passar um bug de verdade: a
  // verificacao acima despacha o evento `paste` direto, e por isso ela passava
  // enquanto colar imagem NAO funcionava no app. Quem dispara o `paste` e o
  // navegador, em resposta ao Ctrl+V -- e `preventDefault` no keydown cancela
  // essa acao padrao, matando o evento antes de ele existir.
  setup();
  const tecla = new KeyboardEvent('keydown', {
    key: 'v',
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
  window.dispatchEvent(tecla);
  check(
    'Ctrl+V nao cancela o padrao do navegador, senao o evento paste nunca chega',
    !tecla.defaultPrevented,
    `padrao cancelado=${tecla.defaultPrevented} esperado=false ` +
      `(com true, colar imagem do sistema nunca funciona)`,
  );
  // A colagem interna que a tecla agenda cai no proximo tique; espera para nao
  // sujar a verificacao seguinte.
  await settle();

  // --- recorte: compoe, encolhe a caixa e desloca a origem
  setup();
  await app.insertImageFiles([await fakeImageFile(400, 200)], { x: 500, y: 500 });
  const paraRecortar = madeImage()!;
  const x0 = paraRecortar.transform.x;
  const y0 = paraRecortar.transform.y;
  app.beginCrop(paraRecortar);
  const abriuRecorte = app.isCropping;
  // Puxa a alca do canto superior esquerdo em 25% da largura e 25% da altura.
  const nw = { x: x0, y: y0 };
  drag(host, 0, nw.x + box.left, nw.y + box.top, paraRecortar.w / 4, paraRecortar.h / 4);
  app.commitCrop();
  const recortada = doc.get(paraRecortar.id) as ImageObject | undefined;
  check(
    'recortar encolhe a caixa, desloca a origem e compoe o recorte normalizado',
    abriuRecorte &&
      recortada !== undefined &&
      near(recortada.w, paraRecortar.w * 0.75, 2) &&
      near(recortada.transform.x, x0 + paraRecortar.w / 4, 2) &&
      recortada.crop !== undefined &&
      near(recortada.crop.x, 0.25, 0.02) &&
      near(recortada.crop.w, 0.75, 0.02),
    `caixa=${recortada?.w.toFixed(0)}x${recortada?.h.toFixed(0)} ` +
      `origem.x=${recortada?.transform.x.toFixed(0)} (era ${x0.toFixed(0)}) ` +
      `crop=(${recortada?.crop?.x.toFixed(2)}, ${recortada?.crop?.w.toFixed(2)}) esperado=(0.25, 0.75)`,
  );

  // --- Ctrl+Z devolve a imagem inteira
  key('z', { ctrl: true });
  const desfeita = doc.get(paraRecortar.id) as ImageObject | undefined;
  check(
    'Ctrl+Z desfaz o recorte inteiro, incluindo a caixa e a origem',
    desfeita !== undefined &&
      desfeita.crop === undefined &&
      near(desfeita.w, paraRecortar.w, 0.01) &&
      near(desfeita.transform.x, x0, 0.01),
    `crop=${desfeita?.crop ? 'ainda ha' : 'nenhum'} caixa=${desfeita?.w.toFixed(0)} ` +
      `origem.x=${desfeita?.transform.x.toFixed(0)} esperado=(nenhum, ${paraRecortar.w}, ${x0.toFixed(0)})`,
  );

  // --- dois recortes seguidos compoem em vez de reiniciar
  // Sem a composicao, o segundo corte voltaria a medir sobre o arquivo inteiro
  // e pularia para outro pedaco da foto.
  setup();
  await app.insertImageFiles([await fakeImageFile(400, 400)], { x: 500, y: 500 });
  const duplo = madeImage()!;
  for (let i = 0; i < 2; i++) {
    const atual = doc.get(duplo.id) as ImageObject;
    app.beginCrop(atual);
    drag(
      host,
      0,
      atual.transform.x + box.left,
      atual.transform.y + box.top,
      atual.w / 2,
      atual.h / 2,
    );
    app.commitCrop();
  }
  const duasVezes = doc.get(duplo.id) as ImageObject | undefined;
  check(
    'recortar duas vezes compoe os recortes em vez de reiniciar',
    duasVezes?.crop !== undefined &&
      near(duasVezes.crop.x, 0.75, 0.03) &&
      near(duasVezes.crop.w, 0.25, 0.03),
    `crop=(x=${duasVezes?.crop?.x.toFixed(2)}, w=${duasVezes?.crop?.w.toFixed(2)}) ` +
      `esperado=(0.75, 0.25) — metade da metade`,
  );

  // --- remover o recorte devolve o arquivo inteiro
  selection.set([duplo.id]);
  app.removeCrop();
  const inteira = doc.get(duplo.id) as ImageObject | undefined;
  check(
    'remover o recorte devolve a imagem inteira e o tamanho proporcional',
    inteira?.crop === undefined && near(inteira?.w ?? 0, duplo.w, 1),
    `crop=${inteira?.crop ? 'ainda ha' : 'nenhum'} largura=${inteira?.w.toFixed(0)} ` +
      `esperado=(nenhum, ${duplo.w})`,
  );

  // --- a imagem e seus bytes sobrevivem ao formato gravado
  setup();
  await app.insertImageFiles([await fakeImageFile(120, 90, 'guardada.png')], { x: 0, y: 0 });
  const antesDoArquivo = madeImage()!;
  const gravado = JSON.parse(
    JSON.stringify(serializeBoard(doc, app.camera, app.assets)),
  ) as WbdDocument;
  const bytes = app.assets.serialize(new Set([antesDoArquivo.assetId]));
  applyBoard(doc, app.camera, gravado);
  const depoisDoArquivo = doc.get(antesDoArquivo.id) as ImageObject | undefined;
  check(
    'a imagem inserida sobrevive ao formato do .wbd, com os bytes originais',
    depoisDoArquivo !== undefined &&
      depoisDoArquivo.assetId === antesDoArquivo.assetId &&
      bytes.length === 1 &&
      bytes[0]!.data.byteLength > 0 &&
      bytes[0]!.mime === 'image/png',
    `assets gravados=${bytes.length} mime=${bytes[0]?.mime} ` +
      `bytes=${bytes[0]?.data.byteLength ?? 0} esperado=(1, image/png, mais de 0)`,
  );

  setup();
  app.assets.clear();
}

/** Espera o navegador terminar o trabalho assincrono pendente (decodificacao). */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 60));
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
