import type { BoardObject } from '@shared/model/types';
import { paintStroke } from './stroke';
import { paintPath } from './path';
import { paintImage } from './image';
import { paintShape } from './shape';
import { paintNote, paintText } from './text';
import type { PaintContext } from './types';
import type { ColorAdapter } from '../colorAdapt';

/**
 * Despacho por tipo de objeto.
 *
 * Adicionar um tipo novo = escrever o painter e registrar aqui. Nenhum outro
 * ponto do renderer precisa saber que ele existe.
 */
export function paintObject(obj: BoardObject, p: PaintContext): void {
  switch (obj.type) {
    case 'stroke':
      paintStroke(obj, p);
      return;
    case 'path':
      paintPath(obj, p);
      return;
    case 'shape':
      paintShape(obj, p);
      return;
    case 'text':
      paintText(obj, p);
      return;
    case 'note':
      paintNote(obj, p);
      return;
    case 'image':
      paintImage(obj, p);
      return;
    case 'group':
      // Grupos nao desenham nada: os filhos sao objetos proprios no indice.
      return;
  }
}

/**
 * LOD 'blocks': cada objeto vira um retangulo solido do seu AABB.
 *
 * Desenhado em lote, agrupado por cor. O gargalo aqui nao e o preenchimento de
 * pixels -- e a troca de estado do contexto: atribuir `fillStyle` milhares de
 * vezes por frame custa mais que os proprios `fillRect`. Agrupando, o numero de
 * trocas cai de "um por objeto" para "um por cor distinta" (algumas dezenas).
 */
export function paintBlocks(
  objects: readonly BoardObject[],
  ctx: CanvasRenderingContext2D,
  adapt: ColorAdapter,
): number {
  const byColor = new Map<string, BoardObject[]>();
  for (let i = 0; i < objects.length; i++) {
    const obj = objects[i]!;
    // Mesma distincao do desenho em detalhe: marcas sao adaptadas ao fundo,
    // superficies (post-it, preenchimento) mantem a cor original.
    const raw = blockColor(obj);
    const color = isMark(obj) ? adapt(raw) : raw;
    const bucket = byColor.get(color);
    if (bucket) bucket.push(obj);
    else byColor.set(color, [obj]);
  }

  ctx.globalAlpha = 0.85;
  let drawn = 0;
  for (const [color, bucket] of byColor) {
    ctx.fillStyle = color;
    // `fillRect` individual, e nao um path unico com milhares de sub-retangulos:
    // medido, o path gigante economiza tempo de JS mas custa mais na
    // rasterizacao (tesselacao de um path enorme), piorando o frame como um todo.
    for (let i = 0; i < bucket.length; i++) {
      const b = bucket[i]!.bbox;
      ctx.fillRect(b.x, b.y, b.w, b.h);
    }
    drawn += bucket.length;
  }
  ctx.globalAlpha = 1;
  return drawn;
}

function blockColor(obj: BoardObject): string {
  switch (obj.type) {
    case 'stroke':
      return obj.color;
    case 'path':
      return obj.fill;
    case 'shape':
      return obj.fill ?? obj.stroke ?? '#888';
    case 'note':
      return obj.bg;
    case 'text':
      return obj.color;
    default:
      return '#8a94a6';
  }
}

/** true para objetos cuja cor e uma marca (deve contrastar com o fundo). */
function isMark(obj: BoardObject): boolean {
  if (obj.type === 'text') return true;
  // Tinta importada e marca: e caligrafia, precisa contrastar com o fundo.
  if (obj.type === 'path') return true;
  if (obj.type === 'stroke') return obj.variant !== 'highlighter';
  // Forma sem preenchimento e representada pelo contorno, que e marca.
  if (obj.type === 'shape') return obj.fill === null;
  return false;
}

export type { PaintContext };
