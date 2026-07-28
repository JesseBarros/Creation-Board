import type { ShapeObject } from '@shared/model/types';
import type { PaintContext } from './types';

export function paintShape(o: ShapeObject, p: PaintContext): void {
  const { ctx } = p;
  const { w, h } = o;

  ctx.globalAlpha = o.opacity;
  ctx.beginPath();

  switch (o.kind) {
    case 'rect':
    case 'square':
      ctx.rect(0, 0, w, h);
      break;

    case 'ellipse':
    case 'circle':
      ctx.ellipse(w / 2, h / 2, Math.abs(w / 2), Math.abs(h / 2), 0, 0, Math.PI * 2);
      break;

    case 'triangle':
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      break;

    case 'diamond':
      ctx.moveTo(w / 2, 0);
      ctx.lineTo(w, h / 2);
      ctx.lineTo(w / 2, h);
      ctx.lineTo(0, h / 2);
      ctx.closePath();
      break;

    case 'line':
      ctx.moveTo(0, 0);
      ctx.lineTo(w, h);
      break;

    case 'arrow': {
      ctx.moveTo(0, 0);
      ctx.lineTo(w, h);
      // Ponta: duas hastes a 30 graus do eixo da linha, com comprimento preso a
      // um teto para nao virar uma seta gigante em linhas muito longas.
      const angle = Math.atan2(h, w);
      const head = Math.min(Math.hypot(w, h) * 0.28, o.strokeWidth * 6 + 10);
      for (const spread of [-0.5, 0.5]) {
        ctx.moveTo(w, h);
        ctx.lineTo(w - head * Math.cos(angle + spread), h - head * Math.sin(angle + spread));
      }
      break;
    }
  }

  const openShape = o.kind === 'line' || o.kind === 'arrow';
  if (o.fill && !openShape) {
    // Preenchimento e superficie: fica como o autor escolheu.
    ctx.fillStyle = o.fill;
    ctx.fill();
  }
  if (o.stroke && o.strokeWidth > 0) {
    ctx.strokeStyle = p.adapt(o.stroke);
    ctx.lineWidth = o.strokeWidth;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
