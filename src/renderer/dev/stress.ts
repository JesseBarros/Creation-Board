import { boundsOfFlatPoints, inflate, type Rect } from '@shared/geometry/rect';
import { simplifyFlat } from '@shared/geometry/simplify';
import { createId } from '@shared/model/id';
import { keyBetween } from '@shared/model/fractional';
import type {
  BoardObject,
  NoteObject,
  ShapeKind,
  ShapeObject,
  StrokeObject,
  TextObject,
  Transform,
} from '@shared/model/types';
import { STROKE_STRIDE } from '../render/painters/stroke';

/**
 * Gerador de carga para validar a meta de performance (60fps com 10.000+
 * objetos). Nao faz parte do app final -- e ferramenta de medicao.
 *
 * PRNG com semente fixa (mulberry32) para que duas execucoes produzam
 * exatamente o mesmo quadro: comparar medicoes so faz sentido sobre a mesma cena.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PALETTE = [
  '#1f2933',
  '#e03131',
  '#1971c2',
  '#2f9e44',
  '#f08c00',
  '#9c36b5',
  '#0c8599',
  '#c2255c',
];
const NOTE_BG = ['#fff3bf', '#d3f9d8', '#d0ebff', '#ffe3e3', '#f3d9fa', '#e9ecef'];
const SHAPE_KINDS: ShapeKind[] = [
  'rect',
  'ellipse',
  'triangle',
  'diamond',
  'line',
  'arrow',
  'square',
  'circle',
];
const WORDS = [
  'derivada', 'integral', 'limite', 'teorema', 'lema', 'corolario', 'hipotese',
  'prova', 'contraexemplo', 'matriz', 'autovalor', 'gradiente', 'entropia',
  'revisar', 'duvida', 'importante', 'resumo', 'formula', 'exemplo', 'exercicio',
];

function identity(x: number, y: number): Transform {
  return { x, y, rotation: 0, scaleX: 1, scaleY: 1 };
}

/**
 * Gera `count` objetos espalhados numa area quadrada de lado `span` centrada na
 * origem. A densidade acompanha a contagem para o quadro nao virar uma mancha
 * solida nem um deserto conforme a carga muda.
 */
export function generateStressObjects(count: number, seed = 1337): BoardObject[] {
  const out: BoardObject[] = [];
  for (const batch of generateStressBatches(count, count, seed)) out.push(...batch);
  return out;
}

/**
 * Mesma geracao, entregue em lotes.
 *
 * Existe porque gerar 50.000 objetos de uma vez leva segundos e, sendo
 * JavaScript de thread unica, congela a janela inteira nesse intervalo -- sem
 * repintura, sem resposta ao mouse. Consumindo lote a lote com uma pausa entre
 * eles, o navegador recupera o controle e consegue desenhar progresso.
 */
export function* generateStressBatches(
  count: number,
  batchSize: number,
  seed = 1337,
): Generator<BoardObject[]> {
  const rnd = mulberry32(seed);
  const span = Math.sqrt(count) * 260;
  const now = Date.now();
  let z = '';

  let batch: BoardObject[] = [];
  for (let i = 0; i < count; i++) {
    z = keyBetween(z, null);
    const x = (rnd() - 0.5) * span;
    const y = (rnd() - 0.5) * span;
    const roll = rnd();

    if (roll < 0.55) batch.push(makeStroke(rnd, x, y, z, now));
    else if (roll < 0.82) batch.push(makeShape(rnd, x, y, z, now));
    else if (roll < 0.94) batch.push(makeNote(rnd, x, y, z, now));
    else batch.push(makeText(rnd, x, y, z, now));

    if (batch.length >= batchSize) {
      yield batch;
      batch = [];
    }
  }
  if (batch.length > 0) yield batch;
}

function makeStroke(
  rnd: () => number,
  x: number,
  y: number,
  z: string,
  now: number,
): StrokeObject {
  // Traco em arco com ruido, imitando escrita a mao.
  const n = 24 + Math.floor(rnd() * 56);
  const len = 40 + rnd() * 260;
  const angle = rnd() * Math.PI * 2;
  const curvature = (rnd() - 0.5) * 1.6;

  const points: number[] = new Array(n * STROKE_STRIDE);
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const a = angle + curvature * t;
    const px = Math.cos(a) * len * t + (rnd() - 0.5) * 4;
    const py = Math.sin(a) * len * t + (rnd() - 0.5) * 4;
    points[i * STROKE_STRIDE] = px;
    points[i * STROKE_STRIDE + 1] = py;
    points[i * STROKE_STRIDE + 2] = 0.4 + rnd() * 0.6;
  }

  const highlighter = rnd() < 0.12;
  const width = highlighter ? 12 + rnd() * 10 : 1.5 + rnd() * 3.5;

  // O AABB precisa incluir a espessura, senao metade do traco fica fora do
  // retangulo e o culling o descarta cedo demais na borda da tela.
  const local = inflate(boundsOfFlatPoints(points, STROKE_STRIDE), width / 2);

  return {
    id: createId(),
    type: 'stroke',
    variant: highlighter ? 'highlighter' : 'pen',
    parentId: null,
    z,
    transform: identity(x, y),
    bbox: { x: x + local.x, y: y + local.y, w: local.w, h: local.h },
    opacity: 1,
    locked: false,
    hidden: false,
    rev: 0,
    createdAt: now,
    updatedAt: now,
    points,
    lod: simplifyFlat(points, STROKE_STRIDE, 2.5),
    color: highlighter ? '#ffd43b' : PALETTE[Math.floor(rnd() * PALETTE.length)]!,
    width,
  };
}

function makeShape(rnd: () => number, x: number, y: number, z: string, now: number): ShapeObject {
  const w = 40 + rnd() * 180;
  const h = 30 + rnd() * 140;
  const strokeWidth = 1 + rnd() * 3;
  const color = PALETTE[Math.floor(rnd() * PALETTE.length)]!;

  return {
    id: createId(),
    type: 'shape',
    kind: SHAPE_KINDS[Math.floor(rnd() * SHAPE_KINDS.length)]!,
    parentId: null,
    z,
    transform: identity(x, y),
    bbox: { x: x - strokeWidth, y: y - strokeWidth, w: w + strokeWidth * 2, h: h + strokeWidth * 2 },
    opacity: 1,
    locked: false,
    hidden: false,
    rev: 0,
    createdAt: now,
    updatedAt: now,
    w,
    h,
    stroke: color,
    strokeWidth,
    fill: rnd() < 0.45 ? `${color}22` : null,
  };
}

function makeNote(rnd: () => number, x: number, y: number, z: string, now: number): NoteObject {
  const w = 150 + rnd() * 60;
  const h = 110 + rnd() * 50;
  const isAlert = rnd() < 0.25;
  const levels = ['importante', 'duvida', 'revisar'] as const;

  return {
    id: createId(),
    type: 'note',
    parentId: null,
    z,
    transform: identity(x, y),
    bbox: { x, y, w, h },
    opacity: 1,
    locked: false,
    hidden: false,
    rev: 0,
    createdAt: now,
    updatedAt: now,
    w,
    h,
    bg: NOTE_BG[Math.floor(rnd() * NOTE_BG.length)]!,
    content: [{ text: phrase(rnd, 3 + Math.floor(rnd() * 6)) }],
    alert: isAlert ? { level: levels[Math.floor(rnd() * 3)]!, icon: '!' } : null,
    pinned: false,
  };
}

function makeText(rnd: () => number, x: number, y: number, z: string, now: number): TextObject {
  const fontSize = 14 + Math.floor(rnd() * 16);
  const w = 180 + rnd() * 200;
  const h = fontSize * 1.4 * (1 + Math.floor(rnd() * 4));

  return {
    id: createId(),
    type: 'text',
    parentId: null,
    z,
    transform: identity(x, y),
    bbox: { x, y, w, h },
    opacity: 1,
    locked: false,
    hidden: false,
    rev: 0,
    createdAt: now,
    updatedAt: now,
    w,
    h,
    autoHeight: true,
    content: [{ text: phrase(rnd, 4 + Math.floor(rnd() * 8)) }],
    fontFamily: "'Segoe UI', sans-serif",
    fontSize,
    lineHeight: 1.4,
    align: 'left',
    color: PALETTE[Math.floor(rnd() * PALETTE.length)]!,
    list: 'none',
  };
}

function phrase(rnd: () => number, words: number): string {
  const out: string[] = [];
  for (let i = 0; i < words; i++) out.push(WORDS[Math.floor(rnd() * WORDS.length)]!);
  return out.join(' ');
}

/** AABB de um conjunto de objetos, para o "ajustar a tela" pos-geracao. */
export function boundsOf(objects: readonly BoardObject[]): Rect | null {
  if (objects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const o of objects) {
    if (o.bbox.x < minX) minX = o.bbox.x;
    if (o.bbox.y < minY) minY = o.bbox.y;
    if (o.bbox.x + o.bbox.w > maxX) maxX = o.bbox.x + o.bbox.w;
    if (o.bbox.y + o.bbox.h > maxY) maxY = o.bbox.y + o.bbox.h;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
