import type { Camera } from '../core/Camera';
import type { BoardPrefs } from '@shared/model/document';

/**
 * Grade de fundo, desenhada em ESPACO DE TELA (nao no espaco do mundo).
 *
 * Motivo: em espaco de mundo as linhas herdariam o zoom e ficariam borradas ou
 * grossas demais. Em espaco de tela cada linha tem sempre 1px nitido.
 *
 * O passo se adapta ao zoom: multiplica o tamanho base por potencias de 2 ate a
 * distancia na tela cair numa faixa confortavel, senao com zoom afastado a
 * grade vira uma mancha solida e com zoom aproximado some.
 */
const MIN_SCREEN_STEP = 12;
const MAX_SCREEN_STEP = 90;

export function paintGrid(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  viewportW: number,
  viewportH: number,
  prefs: Readonly<BoardPrefs>,
  color: string,
): void {
  if (!prefs.grid.enabled) return;

  let step = prefs.grid.size * camera.zoom;
  if (step <= 0) return;
  while (step < MIN_SCREEN_STEP) step *= 2;
  while (step > MAX_SCREEN_STEP) step /= 2;

  // Offset da primeira linha: onde a origem do mundo cai na tela, modulo o passo.
  const originX = -camera.x * camera.zoom;
  const originY = -camera.y * camera.zoom;
  const startX = ((originX % step) + step) % step;
  const startY = ((originY % step) + step) % step;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  if (prefs.grid.kind === 'lines') {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    // 0.5 alinha a linha ao centro do pixel, evitando o borrao de 2px.
    for (let x = startX; x < viewportW; x += step) {
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, viewportH);
    }
    for (let y = startY; y < viewportH; y += step) {
      ctx.moveTo(0, Math.round(y) + 0.5);
      ctx.lineTo(viewportW, Math.round(y) + 0.5);
    }
    ctx.stroke();
  } else {
    ctx.fillStyle = color;
    const r = camera.zoom > 1.5 ? 1.5 : 1;
    for (let x = startX; x < viewportW; x += step) {
      for (let y = startY; y < viewportH; y += step) {
        ctx.fillRect(Math.round(x), Math.round(y), r, r);
      }
    }
  }

  ctx.restore();
}
