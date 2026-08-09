import type { BoardObject } from '@shared/model/types';
import { paintStroke } from './stroke';
import { paintPath } from './path';
import { paintImage } from './image';
import { paintShape } from './shape';
import { paintNote, paintText } from './text';
import { withErase } from './erase';
import type { PaintContext } from './types';

/**
 * Despacho por tipo de objeto.
 *
 * Adicionar um tipo novo = escrever o painter e registrar aqui. Nenhum outro
 * ponto do renderer precisa saber que ele existe.
 */
export function paintObject(obj: BoardObject, p: PaintContext): void {
  switch (obj.type) {
    // Os dois tipos de tinta passam pelo `withErase`: se houver rastro de
    // borracha ele abre o buraco, e se nao houver o painter e chamado direto.
    case 'stroke':
      withErase(obj, p, paintStroke);
      return;
    case 'path':
      withErase(obj, p, paintPath);
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

export type { PaintContext };
