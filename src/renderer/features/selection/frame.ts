import type { Vec2 } from '@shared/geometry/vec2';
import { localBounds } from '@shared/model/bbox';
import type { BoardObject } from '@shared/model/types';

/**
 * Quadro de manipulacao desenhado em volta da selecao.
 *
 * Com UM objeto selecionado o quadro acompanha a rotacao dele. Com varios, o
 * quadro e o AABB e nao gira: nao existe uma orientacao unica que sirva para um
 * conjunto de objetos com rotacoes diferentes, e escolher a de um deles faria o
 * quadro pular ao trocar a selecao.
 *
 * O sistema de coordenadas do quadro ("espaco de frame") tem origem no canto
 * `x,y`, eixos girados por `rotation` e a mesma unidade do mundo. Redimensionar
 * e girar sao resolvidos nesse espaco, onde viram contas de retangulo alinhado.
 */
export interface SelectionFrame {
  /** Canto de origem, em mundo. */
  x: number;
  y: number;
  /** Tamanho ja em unidades de mundo, medido nos eixos girados do quadro. */
  w: number;
  h: number;
  rotation: number;
}

export type ScaleHandleId = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export type HandleId = ScaleHandleId | 'rotate';

/** Lado do quadradinho de alca, em px de TELA -- nao acompanha o zoom. */
export const HANDLE_PX = 9;

/** Area clicavel da alca, em px de tela. Maior que o desenho, de proposito. */
const HANDLE_HIT_PX = 11;

/** Distancia da alca de rotacao ate a borda de cima, em px de tela. */
export const ROTATE_GAP_PX = 22;

/** Posicao normalizada de cada alca de escala dentro do quadro. */
export const SCALE_HANDLES: ReadonlyArray<{ id: ScaleHandleId; u: number; v: number }> = [
  { id: 'nw', u: 0, v: 0 },
  { id: 'n', u: 0.5, v: 0 },
  { id: 'ne', u: 1, v: 0 },
  { id: 'e', u: 1, v: 0.5 },
  { id: 'se', u: 1, v: 1 },
  { id: 's', u: 0.5, v: 1 },
  { id: 'sw', u: 0, v: 1 },
  { id: 'w', u: 0, v: 0.5 },
];

/** A mesma tabela indexada pelo id, para consulta direta. */
export const SCALE_UV = Object.fromEntries(
  SCALE_HANDLES.map((h) => [h.id, { u: h.u, v: h.v }]),
) as Record<ScaleHandleId, { u: number; v: number }>;

export function computeFrame(objects: readonly BoardObject[]): SelectionFrame | null {
  if (objects.length === 0) return null;

  if (objects.length === 1) {
    const obj = objects[0]!;
    const t = obj.transform;
    const lb = localBounds(obj);
    const sx = t.scaleX;
    const sy = t.scaleY;
    // Escala negativa troca os cantos de lugar; o min devolve o canto que de
    // fato e o "inicio" do quadro depois do espelhamento.
    const x0 = Math.min(lb.x * sx, (lb.x + lb.w) * sx);
    const y0 = Math.min(lb.y * sy, (lb.y + lb.h) * sy);
    const cos = Math.cos(t.rotation);
    const sin = Math.sin(t.rotation);
    return {
      x: t.x + x0 * cos - y0 * sin,
      y: t.y + x0 * sin + y0 * cos,
      w: Math.abs(lb.w * sx),
      h: Math.abs(lb.h * sy),
      rotation: t.rotation,
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const o of objects) {
    const b = o.bbox;
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x + b.w > maxX) maxX = b.x + b.w;
    if (b.y + b.h > maxY) maxY = b.y + b.h;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY, rotation: 0 };
}

/** Ponto do mundo na posicao normalizada (u,v) do quadro. */
export function framePoint(f: SelectionFrame, u: number, v: number): Vec2 {
  const lx = f.w * u;
  const ly = f.h * v;
  const cos = Math.cos(f.rotation);
  const sin = Math.sin(f.rotation);
  return { x: f.x + lx * cos - ly * sin, y: f.y + lx * sin + ly * cos };
}

/** Ponto de mundo levado ao espaco do quadro (origem no canto, eixos alinhados). */
export function worldToFrame(f: SelectionFrame, wx: number, wy: number): Vec2 {
  const dx = wx - f.x;
  const dy = wy - f.y;
  const cos = Math.cos(-f.rotation);
  const sin = Math.sin(-f.rotation);
  return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
}

/** Inverso de `worldToFrame`: leva um ponto do espaco do quadro para o mundo. */
export function frameToWorld(f: SelectionFrame, fx: number, fy: number): Vec2 {
  const cos = Math.cos(f.rotation);
  const sin = Math.sin(f.rotation);
  return { x: f.x + fx * cos - fy * sin, y: f.y + fx * sin + fy * cos };
}

/** Centro do quadro, em mundo. Eixo de rotacao e ancora do Alt+redimensionar. */
export function frameCenter(f: SelectionFrame): Vec2 {
  return framePoint(f, 0.5, 0.5);
}

/** Posicao em mundo da alca de rotacao, acima da borda de cima. */
export function rotateHandlePoint(f: SelectionFrame, zoom: number): Vec2 {
  const top = framePoint(f, 0.5, 0);
  // O afastamento e em px de tela, entao vira unidade de mundo dividido pelo
  // zoom -- assim a alca nao encosta na borda quando o zoom esta afastado nem
  // voa para longe quando esta aproximado.
  const gap = ROTATE_GAP_PX / zoom;
  const cos = Math.cos(f.rotation);
  const sin = Math.sin(f.rotation);
  // Direcao "para cima" no espaco do quadro e (0,-1), girada pela rotacao.
  return { x: top.x + gap * sin, y: top.y - gap * cos };
}

/** Qual alca esta sob o ponto, ou null. `zoom` porque as alcas tem tamanho de tela. */
export function hitHandle(
  f: SelectionFrame,
  world: Vec2,
  zoom: number,
  allowRotate: boolean,
): HandleId | null {
  const reach = HANDLE_HIT_PX / zoom;

  if (allowRotate) {
    const r = rotateHandlePoint(f, zoom);
    if (Math.hypot(world.x - r.x, world.y - r.y) <= reach) return 'rotate';
  }

  for (const h of SCALE_HANDLES) {
    const p = framePoint(f, h.u, h.v);
    if (Math.abs(world.x - p.x) <= reach && Math.abs(world.y - p.y) <= reach) return h.id;
  }
  return null;
}

/**
 * Cursor de cada alca, girado junto com o quadro.
 *
 * Sem o giro, a alca do canto de um objeto virado 90 graus mostraria a seta
 * diagonal errada -- apontando para fora do lado que ela de fato estica.
 */
export function handleCursor(id: HandleId, rotation: number): string {
  if (id === 'rotate') return 'grab';
  const base: Record<ScaleHandleId, number> = {
    n: 0,
    ne: 45,
    e: 90,
    se: 135,
    s: 180,
    sw: 225,
    w: 270,
    nw: 315,
  };
  const deg = (base[id] + (rotation * 180) / Math.PI + 360) % 360;
  // Oito setores de 45 graus, e cada seta serve para dois lados opostos.
  const cursors = ['ns', 'nesw', 'ew', 'nwse', 'ns', 'nesw', 'ew', 'nwse'];
  return `${cursors[Math.round(deg / 45) % 8]}-resize`;
}

/**
 * Que lados a alca move: -1, 0 ou 1 em cada eixo.
 *
 * Derivado da posicao normalizada (0 -> -1, 0.5 -> 0, 1 -> 1) em vez de lido do
 * nome, para nao existir uma segunda tabela capaz de discordar da primeira.
 */
export function handleDirection(id: ScaleHandleId): { dx: number; dy: number } {
  const { u, v } = SCALE_UV[id];
  return { dx: u * 2 - 1, dy: v * 2 - 1 };
}
