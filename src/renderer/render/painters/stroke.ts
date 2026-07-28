import type { StrokeObject } from '@shared/model/types';
import type { PaintContext } from './types';

/** Passo do array achatado de pontos: [x, y, pressao]. */
export const STROKE_STRIDE = 3;

export function paintStroke(o: StrokeObject, p: PaintContext): void {
  const { ctx } = p;

  // Em LOD reduzido usa a polilinha simplificada (RDP), que tem uma fracao dos
  // pontos e resultado visualmente identico nesse nivel de zoom.
  const pts = p.lod === 'full' ? o.points : (o.lod ?? o.points);
  if (pts.length < 4) return;

  ctx.beginPath();
  ctx.moveTo(pts[0]!, pts[1]!);
  for (let i = STROKE_STRIDE; i + 1 < pts.length; i += STROKE_STRIDE) {
    ctx.lineTo(pts[i]!, pts[i + 1]!);
  }

  // Marca-texto e superficie, nao marca: ele deve ter contraste baixo. Adaptar
  // sua cor o transformaria num traco opaco escuro, que e o oposto do efeito.
  ctx.strokeStyle = o.variant === 'highlighter' ? o.color : p.adapt(o.color);
  ctx.lineWidth = o.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Marca-texto e translucido por natureza; a ordem de camada que o mantem
  // atras do texto e resolvida no `z`, nao aqui.
  ctx.globalAlpha = o.opacity * (o.variant === 'highlighter' ? 0.4 : 1);
  ctx.stroke();
  ctx.globalAlpha = 1;
}
