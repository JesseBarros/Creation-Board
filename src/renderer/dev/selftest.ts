import type { Vec2 } from '@shared/geometry/vec2';
import { computeBbox } from '@shared/model/bbox';
import type { BoardObject, ShapeObject, StrokeObject } from '@shared/model/types';
import type { WbdDocument } from '@shared/model/document';
import type { App } from '../App';
import { MAX_ZOOM, MIN_ZOOM, type Camera } from '../core/Camera';
import { applyPatches } from '../commands/patch';
import { computeFrame } from '../features/selection/frame';
import { moveObjects } from '../features/selection/transformOps';
import { applyBoard, serializeBoard } from '../features/storage/boardIO';
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

  runCameraTests(host, camera, check, reset);
  await runSelectionTests(host, app, check, reset);

  // Deixa o cenario montado e selecionado no fim. Com QB_SHOT a janela nao
  // fecha ao terminar, entao a foto vira a conferencia do cromo de selecao --
  // contorno, alcas e alca de rotacao -- que nenhum numero daqui verifica.
  reset();
  app.selection.clear();
  app.history.clear();
  app.doc.clear();
  app.doc.add(scene());
  app.selection.set(['A', 'B']);
  app.fitToContent();
  // Sem isto o quadro fica marcado como sujo, o guarda de `beforeunload`
  // recusa o fechamento e a execucao automatizada nunca termina.
  app.markClean();

  const falhas = results.filter((r) => !r.ok).length;
  const linhas = results.map((r) => `  ${r.ok ? 'OK  ' : 'FALHA'} ${r.nome} — ${r.detalhe}`);
  console.log(`SELFTEST\n${linhas.join('\n')}\nSELFTEST_FIM ${falhas === 0 ? 'tudo passou' : `${falhas} falha(s)`}`);
}

type Check = (nome: string, ok: boolean, detalhe: string) => void;

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
