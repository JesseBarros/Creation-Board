import type { Vec2 } from '@shared/geometry/vec2';
import type { Camera } from '../core/Camera';

/**
 * Reguas das bordas: uma faixa graduada no topo e outra na esquerda.
 *
 * Servem para responder "de que tamanho e isto" sem precisar medir na mao, e o
 * marcador que segue o cursor responde "onde eu estou" num quadro infinito, onde
 * nao ha borda de pagina para servir de referencia.
 *
 * Desenhadas no overlay, em px de TELA, e nao como elementos de DOM: elas mudam
 * a cada movimento de camera, e um DOM reposicionado a 60Hz custaria layout a
 * cada frame. No overlay o custo e uma faixa de pixels e nada mais.
 *
 * A unidade vem das preferencias do quadro (`unit`), que o .wbd ja previa.
 */

/** Largura da faixa, em px de tela. */
export const RULER_PX = 20;

/** Pixels por centimetro no padrao CSS (96 dpi). */
const PX_PER_CM = 96 / 2.54;

/** Espaco minimo entre dois rotulos, em px de tela. */
const LABEL_GAP_PX = 64;

/** Passos "redondos" aceitos; multiplicados por potencias de 10. */
const NICE_STEPS = [1, 2, 5];

export interface RulerTheme {
  bg: string;
  fg: string;
  line: string;
  cursor: string;
}

export function paintRulers(
  ctx: CanvasRenderingContext2D,
  camera: Camera,
  viewportW: number,
  viewportH: number,
  unit: 'px' | 'cm',
  cursor: Vec2 | null,
  theme: RulerTheme,
): void {
  const perUnit = unit === 'cm' ? PX_PER_CM : 1;
  // Passo escolhido em UNIDADES do usuario, nao em px de mundo: em cm, os
  // rotulos precisam cair em 1, 2, 5 cm -- e nao em 37,8 px.
  const step = niceStep((LABEL_GAP_PX / camera.zoom) / perUnit);
  const stepWorld = step * perUnit;

  ctx.save();
  ctx.font = '10px "Segoe UI", system-ui, sans-serif';
  ctx.textBaseline = 'middle';

  // Faixas de fundo. A quina onde as duas se cruzam e pintada junto com a
  // horizontal e depois coberta pela vertical -- sem isso sobra um buraco.
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, viewportW, RULER_PX);
  ctx.fillRect(0, 0, RULER_PX, viewportH);

  ctx.strokeStyle = theme.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, RULER_PX + 0.5);
  ctx.lineTo(viewportW, RULER_PX + 0.5);
  ctx.moveTo(RULER_PX + 0.5, 0);
  ctx.lineTo(RULER_PX + 0.5, viewportH);
  ctx.stroke();

  // ------------------------------------------------------------ horizontal
  ctx.fillStyle = theme.fg;
  ctx.textAlign = 'left';
  const firstX = Math.ceil(camera.x / stepWorld) * stepWorld;
  const lastX = camera.screenToWorld({ x: viewportW, y: 0 }).x;
  for (let w = firstX; w <= lastX; w += stepWorld) {
    const sx = Math.round((w - camera.x) * camera.zoom) + 0.5;
    if (sx < RULER_PX) continue;
    ctx.beginPath();
    ctx.moveTo(sx, RULER_PX - 5);
    ctx.lineTo(sx, RULER_PX);
    ctx.stroke();
    ctx.fillText(label(w / perUnit, step), sx + 3, RULER_PX / 2 - 1);
  }

  // -------------------------------------------------------------- vertical
  ctx.textAlign = 'center';
  const firstY = Math.ceil(camera.y / stepWorld) * stepWorld;
  const lastY = camera.screenToWorld({ x: 0, y: viewportH }).y;
  for (let w = firstY; w <= lastY; w += stepWorld) {
    const sy = Math.round((w - camera.y) * camera.zoom) + 0.5;
    if (sy < RULER_PX) continue;
    ctx.beginPath();
    ctx.moveTo(RULER_PX - 5, sy);
    ctx.lineTo(RULER_PX, sy);
    ctx.stroke();
    // Rotulo deitado: escrito na horizontal, "1200" nao caberia nos 20px da
    // faixa vertical.
    ctx.save();
    ctx.translate(RULER_PX / 2 - 1, sy + 3);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(label(w / perUnit, step), 0, 0);
    ctx.restore();
  }

  // --------------------------------------------------------------- cursor
  if (cursor) {
    const p = camera.worldToScreen(cursor);
    ctx.strokeStyle = theme.cursor;
    ctx.beginPath();
    ctx.moveTo(Math.round(p.x) + 0.5, 0);
    ctx.lineTo(Math.round(p.x) + 0.5, RULER_PX);
    ctx.moveTo(0, Math.round(p.y) + 0.5);
    ctx.lineTo(RULER_PX, Math.round(p.y) + 0.5);
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Maior passo "redondo" que ainda cabe no espaco disponivel.
 *
 * Sem isso a regua sairia com marcas de 37 em 37 unidades num zoom qualquer, que
 * e um numero que nao ajuda ninguem a medir nada.
 */
function niceStep(minStep: number): number {
  if (!(minStep > 0)) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(minStep));
  for (const s of NICE_STEPS) {
    if (s * magnitude >= minStep) return s * magnitude;
  }
  return 10 * magnitude;
}

/** Casas decimais suficientes para o passo escolhido, e nem uma a mais. */
function label(value: number, step: number): string {
  const decimals = step >= 1 ? 0 : Math.min(3, Math.ceil(-Math.log10(step)));
  return value.toFixed(decimals);
}
