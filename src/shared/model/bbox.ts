import { boundsOfFlatPoints, inflate, type Rect } from '../geometry/rect';
import { pathBounds } from '../geometry/svgPath';
import type { BoardObject, Transform } from './types';

/**
 * Calculo do AABB de um objeto.
 *
 * O `bbox` guardado em cada objeto e sempre em coordenadas de MUNDO e sempre
 * derivado -- nunca editado a mao. Quem muda transform, tamanho ou pontos
 * precisa recalcular por aqui, senao o indice espacial passa a mentir e o
 * objeto some do culling ou nao responde ao clique.
 */

/** Passo do array achatado de pontos de traco: [x, y, pressao]. */
const STROKE_STRIDE = 3;

/** Retangulo que envolve o objeto em ESPACO LOCAL, antes do transform. */
export function localBounds(obj: BoardObject): Rect {
  switch (obj.type) {
    case 'stroke':
      // A espessura extrapola a linha de centro dos pontos para os dois lados.
      return inflate(boundsOfFlatPoints(obj.points, STROKE_STRIDE), obj.width / 2);
    case 'path':
      // O contorno ja inclui a espessura; nao ha o que inflar.
      return pathBounds(obj.d);
    case 'shape': {
      // Contorno centrado na borda: metade dele fica para fora.
      const half = obj.stroke ? obj.strokeWidth / 2 : 0;
      return { x: -half, y: -half, w: obj.w + half * 2, h: obj.h + half * 2 };
    }
    case 'text':
    case 'note':
    case 'image':
      return { x: 0, y: 0, w: obj.w, h: obj.h };
    case 'group':
      // Grupos nao tem geometria propria; o AABB vem dos filhos, calculado por
      // quem tem acesso ao documento.
      return { ...obj.bbox };
  }
}

/** AABB em mundo: aplica o transform aos quatro cantos e envolve o resultado. */
export function computeBbox(obj: BoardObject): Rect {
  return transformRect(localBounds(obj), obj.transform);
}

export function transformRect(r: Rect, t: Transform): Rect {
  const x0 = r.x * t.scaleX;
  const y0 = r.y * t.scaleY;
  const x1 = (r.x + r.w) * t.scaleX;
  const y1 = (r.y + r.h) * t.scaleY;

  if (t.rotation === 0) {
    // Caminho rapido: sem rotacao o AABB e o proprio retangulo escalado.
    // Escala negativa inverte os cantos, por isso o min/max.
    return {
      x: t.x + Math.min(x0, x1),
      y: t.y + Math.min(y0, y1),
      w: Math.abs(x1 - x0),
      h: Math.abs(y1 - y0),
    };
  }

  const cos = Math.cos(t.rotation);
  const sin = Math.sin(t.rotation);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const [px, py] of [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ] as const) {
    const wx = t.x + px * cos - py * sin;
    const wy = t.y + px * sin + py * cos;
    if (wx < minX) minX = wx;
    if (wy < minY) minY = wy;
    if (wx > maxX) maxX = wx;
    if (wy > maxY) maxY = wy;
  }

  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Converte um ponto de mundo para o espaco local do objeto. Base do hit-test preciso. */
export function worldToLocal(t: Transform, wx: number, wy: number): { x: number; y: number } {
  const dx = wx - t.x;
  const dy = wy - t.y;
  const cos = Math.cos(-t.rotation);
  const sin = Math.sin(-t.rotation);
  return {
    x: (dx * cos - dy * sin) / (t.scaleX || 1),
    y: (dx * sin + dy * cos) / (t.scaleY || 1),
  };
}

/** Os quatro cantos do objeto em mundo, em ordem horaria a partir do topo-esquerda. */
export function corners(obj: BoardObject): Array<{ x: number; y: number }> {
  const r = localBounds(obj);
  const t = obj.transform;
  const cos = Math.cos(t.rotation);
  const sin = Math.sin(t.rotation);
  return (
    [
      [r.x, r.y],
      [r.x + r.w, r.y],
      [r.x + r.w, r.y + r.h],
      [r.x, r.y + r.h],
    ] as const
  ).map(([lx, ly]) => {
    const px = lx * t.scaleX;
    const py = ly * t.scaleY;
    return { x: t.x + px * cos - py * sin, y: t.y + px * sin + py * cos };
  });
}
