import type { Rect } from '@shared/geometry/rect';
import type { Camera } from '../core/Camera';

/**
 * Destaque do resultado atual da busca.
 *
 * Desenhado no overlay, em px de TELA, como o resto do cromo. Existe separado do
 * quadro de selecao por um motivo pratico: o quadro de selecao so aparece com a
 * ferramenta de selecao ativa, e buscar no meio de um desenho nao deveria
 * obrigar a trocar de ferramenta para ver o que foi encontrado.
 *
 * Cor propria, diferente do azul da selecao e do laranja das guias: sao tres
 * respostas diferentes do sistema, e pintar duas iguais faria uma passar pela
 * outra.
 */

const COLOR = '#7048e8';
const PAD = 6;

export function paintSearchHighlight(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  bbox: Rect | null,
): void {
  if (!bbox) return;

  const a = camera.worldToScreen({ x: bbox.x, y: bbox.y });
  const b = camera.worldToScreen({ x: bbox.x + bbox.w, y: bbox.y + bbox.h });

  ctx.save();
  ctx.strokeStyle = COLOR;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.roundRect(a.x - PAD, a.y - PAD, b.x - a.x + PAD * 2, b.y - a.y + PAD * 2, 4);
  ctx.stroke();
  ctx.restore();
}
