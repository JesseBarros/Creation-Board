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
 *
 * QUEM LIGA E DESLIGA e a preferencia do app (`ligada`), e nao o
 * `prefs.grid.enabled` do arquivo -- ver `toggleGrid` no App. Do arquivo vem so
 * o desenho: tipo e tamanho.
 */
const MIN_SCREEN_STEP = 12;
const MAX_SCREEN_STEP = 90;

export function paintGrid(
  ctx: CanvasRenderingContext2D,
  camera: Pick<Camera, 'x' | 'y' | 'zoom'>,
  viewportW: number,
  viewportH: number,
  prefs: Readonly<BoardPrefs>,
  ligada: boolean,
  color: string,
  dpr = 1,
): void {
  if (!ligada) return;

  let step = prefs.grid.size * camera.zoom;
  if (step <= 0) return;
  while (step < MIN_SCREEN_STEP) step *= 2;
  while (step > MAX_SCREEN_STEP) step /= 2;

  /*
    Tudo daqui para baixo e em pixel FISICO. Ate 30/09/2026 a grade era
    desenhada com a transformacao zerada mas com medidas em px CSS: numa tela com
    escala de 125% ou 150% ela cobria so parte do quadro e andava mais devagar
    que o conteudo ao arrastar (B33). Com DPR 1 nada muda.
  */
  step *= dpr;
  viewportW *= dpr;
  viewportH *= dpr;

  // Offset da primeira linha: onde a origem do mundo cai na tela, modulo o passo.
  const originX = -camera.x * camera.zoom * dpr;
  const originY = -camera.y * camera.zoom * dpr;
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
    const r = (camera.zoom > 1.5 ? 1.5 : 1) * dpr;
    for (let x = startX; x < viewportW; x += step) {
      for (let y = startY; y < viewportH; y += step) {
        ctx.fillRect(Math.round(x), Math.round(y), r, r);
      }
    }
  }

  ctx.restore();
}
