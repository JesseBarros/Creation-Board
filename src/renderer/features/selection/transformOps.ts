import type { Vec2 } from '@shared/geometry/vec2';
import type { BoardObject, ObjectId } from '@shared/model/types';
import type { ObjectPatch } from '../../commands/patch';
import { frameToWorld, worldToFrame, type SelectionFrame } from './frame';

/**
 * Mover, escalar e girar, sempre pelo `transform`.
 *
 * A escala vai para `scaleX`/`scaleY` e nao para a largura/altura do objeto, por
 * um motivo: assim existe UM caminho de codigo que serve para todos os tipos.
 * Traco e tinta importada nem tem largura/altura -- a geometria deles sao
 * pontos e um caminho SVG, e reescalar isso significaria reescrever milhares de
 * coordenadas por frame de arraste. Pelo transform e O(1) e o `.wbd` continua
 * guardando a geometria original.
 *
 * Todas as funcoes recebem os objetos como estavam no INICIO do arraste e o
 * deslocamento TOTAL desde entao, nunca o incremento do frame. Aplicar
 * incrementos acumularia o erro de arredondamento ao longo do arraste, e um
 * unico frame perdido deixaria o objeto fora do lugar para sempre.
 */

/** Escala nunca chega a zero: um objeto de tamanho zero tem AABB vazio e some
 *  do indice espacial, ficando impossivel de clicar de volta. */
const MIN_SCALE = 1e-3;

export function moveObjects(
  originals: readonly BoardObject[],
  dx: number,
  dy: number,
): Map<ObjectId, ObjectPatch> {
  const out = new Map<ObjectId, ObjectPatch>();
  for (const o of originals) {
    out.set(o.id, { transform: { ...o.transform, x: o.transform.x + dx, y: o.transform.y + dy } });
  }
  return out;
}

export function rotateObjects(
  originals: readonly BoardObject[],
  center: Vec2,
  delta: number,
): Map<ObjectId, ObjectPatch> {
  const cos = Math.cos(delta);
  const sin = Math.sin(delta);
  const out = new Map<ObjectId, ObjectPatch>();

  for (const o of originals) {
    const t = o.transform;
    // A origem do objeto orbita o centro do quadro, alem de o objeto girar em
    // torno de si. Sem a orbita, girar uma selecao multipla empilharia todos os
    // objetos girando no lugar em vez de rodar o conjunto.
    const dx = t.x - center.x;
    const dy = t.y - center.y;
    out.set(o.id, {
      transform: {
        ...t,
        x: center.x + dx * cos - dy * sin,
        y: center.y + dx * sin + dy * cos,
        rotation: t.rotation + delta,
      },
    });
  }
  return out;
}

/**
 * Escala a selecao por (fx, fy) em torno de `anchor`, dado em espaco de frame.
 *
 * Exato quando os eixos do objeto coincidem com os do quadro -- sempre o caso
 * com um objeto so, e com varios quando nenhum esta girado. Ver
 * `requiresUniformScale` para o caso em que nao coincidem.
 */
export function scaleObjects(
  originals: readonly BoardObject[],
  frame: SelectionFrame,
  anchor: Vec2,
  fx: number,
  fy: number,
): Map<ObjectId, ObjectPatch> {
  const sx = clampScale(fx);
  const sy = clampScale(fy);
  const out = new Map<ObjectId, ObjectPatch>();

  for (const o of originals) {
    const t = o.transform;
    const p = worldToFrame(frame, t.x, t.y);
    const moved = frameToWorld(
      frame,
      anchor.x + (p.x - anchor.x) * sx,
      anchor.y + (p.y - anchor.y) * sy,
    );
    out.set(o.id, {
      transform: {
        ...t,
        x: moved.x,
        y: moved.y,
        scaleX: clampScale(t.scaleX * sx),
        scaleY: clampScale(t.scaleY * sy),
      },
    });
  }
  return out;
}

/**
 * A selecao exige escala uniforme?
 *
 * Esticar so um eixo de um objeto girado nao e uma escala: e um cisalhamento, e
 * o modelo nao tem onde guardar isso (`Transform` so tem x, y, rotacao e duas
 * escalas). Em vez de aplicar uma conta errada e deixar o objeto entortar em
 * relacao ao que a alca prometeu, o arraste vira uniforme. Nao aparece com um
 * objeto so, porque ai o quadro gira junto com ele e os eixos coincidem.
 */
export function requiresUniformScale(
  originals: readonly BoardObject[],
  frame: SelectionFrame,
): boolean {
  if (originals.length <= 1) return false;
  return originals.some((o) => Math.abs(normalizeAngle(o.transform.rotation - frame.rotation)) > 1e-6);
}

function clampScale(s: number): number {
  const mag = Math.max(Math.abs(s), MIN_SCALE);
  return s < 0 ? -mag : mag;
}

/** Angulo reduzido a (-pi, pi], para comparar rotacoes que deram voltas. */
export function normalizeAngle(a: number): number {
  const TAU = Math.PI * 2;
  const r = ((a % TAU) + TAU) % TAU;
  return r > Math.PI ? r - TAU : r;
}
