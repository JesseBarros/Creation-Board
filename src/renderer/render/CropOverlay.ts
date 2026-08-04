import type { Rect } from '@shared/geometry/rect';
import type { Camera } from '../core/Camera';
import { framePoint, HANDLE_PX, SCALE_HANDLES, type SelectionFrame } from '../features/selection/frame';

/**
 * Cromo do recorte de imagem.
 *
 * O que esta FORA do recorte continua desenhado, escurecido: e o que permite
 * decidir onde cortar, porque um recorte se escolhe olhando o que vai embora.
 * Escurecer por cima (e nao apagar) tambem mantem a imagem de referencia
 * inteira, sem repintar nada do quadro.
 *
 * Em px de tela, como o resto do cromo. As alcas sao as mesmas da selecao --
 * mesmo tamanho e mesma posicao normalizada -- porque o gesto e o mesmo; o que
 * muda e a cor, que diz que aqui se corta, nao se redimensiona.
 */

const COLOR = '#f08c00';
const SHADE = 'rgba(12, 15, 22, 0.55)';

export function paintCropOverlay(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  frame: SelectionFrame,
  rect: Rect,
): void {
  const crop: SelectionFrame = {
    ...pointToFrame(frame, rect),
    rotation: frame.rotation,
  };

  const outer = corners(frame, camera);
  const inner = corners(crop, camera);

  ctx.save();

  // Sombra por fora do recorte: o caminho externo no sentido horario e o interno
  // no anti-horario deixam o miolo de fora pela regra evenodd.
  ctx.beginPath();
  poly(ctx, outer);
  poly(ctx, inner);
  ctx.fillStyle = SHADE;
  ctx.fill('evenodd');

  ctx.beginPath();
  poly(ctx, inner);
  ctx.closePath();
  ctx.strokeStyle = COLOR;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Tercos: a regra de composicao que qualquer editor de foto mostra, e que e o
  // motivo de o recorte ser feito a olho e nao por numero.
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1;
  for (const t of [1 / 3, 2 / 3]) {
    line(ctx, camera, crop, t, 0, t, 1);
    line(ctx, camera, crop, 0, t, 1, t);
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = COLOR;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  for (const h of SCALE_HANDLES) {
    const p = camera.worldToScreen(framePoint(crop, h.u, h.v));
    ctx.beginPath();
    ctx.rect(p.x - HANDLE_PX / 2, p.y - HANDLE_PX / 2, HANDLE_PX, HANDLE_PX);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

/** Sub-quadro do recorte dentro do quadro do objeto. */
function pointToFrame(frame: SelectionFrame, rect: Rect): { x: number; y: number; w: number; h: number } {
  const cos = Math.cos(frame.rotation);
  const sin = Math.sin(frame.rotation);
  return {
    x: frame.x + rect.x * cos - rect.y * sin,
    y: frame.y + rect.x * sin + rect.y * cos,
    w: rect.w,
    h: rect.h,
  };
}

function corners(f: SelectionFrame, camera: Camera): Array<{ x: number; y: number }> {
  return [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ].map(([u, v]) => camera.worldToScreen(framePoint(f, u!, v!)));
}

function poly(ctx: CanvasRenderingContext2D, pts: ReadonlyArray<{ x: number; y: number }>): void {
  ctx.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]!.x, pts[i]!.y);
  ctx.closePath();
}

function line(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  f: SelectionFrame,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
): void {
  const a = camera.worldToScreen(framePoint(f, u0, v0));
  const b = camera.worldToScreen(framePoint(f, u1, v1));
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}
