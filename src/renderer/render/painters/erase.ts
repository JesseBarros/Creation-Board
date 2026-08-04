import { localBounds } from '@shared/model/bbox';
import type { EraseMark, InkObject } from '@shared/model/types';
import { paintPath } from './path';
import { paintStroke } from './stroke';
import type { PaintContext, Painter } from './types';

/**
 * Desenho de tinta com apagamento progressivo.
 *
 * A borracha nao recorta a geometria: ela guarda no objeto por onde passou (ver
 * `EraseMark`), e o buraco aparece aqui. O objeto e desenhado num canvas
 * intermediario, os rastros sao aplicados com `destination-out` -- que remove
 * pixel em vez de pintar por cima, e por isso funciona igual sobre traco de
 * caneta e sobre a caligrafia importada -- e o resultado volta para o canvas do
 * quadro.
 *
 * Pintar por cima com a cor do fundo seria mais barato e ERRADO: no tema escuro
 * a mancha apareceria clara, o marca-texto por baixo continuaria visivel atraves
 * dela, e a miniatura sairia com retangulos brancos.
 *
 * So paga esse custo o objeto que TEM marca. Tinta intacta -- que e a esmagadora
 * maioria num quadro -- segue direto para o painter, sem canvas intermediario.
 */

/** Teto de pixels do canvas intermediario. Acima disto, cai a resolucao. */
const MAX_PIXELS = 4_000_000;

let scratch: HTMLCanvasElement | null = null;
let scratchCtx: CanvasRenderingContext2D | null = null;

export function withErase<T extends InkObject>(obj: T, p: PaintContext, paint: Painter<T>): void {
  const marks = obj.erased;
  if (!marks || marks.length === 0) {
    paint(obj, p);
    return;
  }

  const bounds = localBounds(obj);
  if (bounds.w <= 0 || bounds.h <= 0) return;

  // Escala local -> pixel fisico. Sem ela o buraco sairia serrilhado com zoom
  // aproximado, porque o canvas intermediario teria menos pixel que a tela.
  const wanted = Math.max(p.deviceScale * p.objectScale, 0.01);
  const fit = Math.sqrt(MAX_PIXELS / Math.max(1, bounds.w * bounds.h));
  const f = Math.min(wanted, fit);

  const w = Math.max(1, Math.ceil(bounds.w * f));
  const h = Math.max(1, Math.ceil(bounds.h * f));
  const ctx = scratchContext(w, h);
  if (!ctx) {
    // Sem canvas intermediario, desenhar sem o buraco e melhor que nao desenhar:
    // some o apagamento, nao a tinta.
    paint(obj, p);
    return;
  }

  ctx.setTransform(f, 0, 0, f, -bounds.x * f, -bounds.y * f);
  paint(obj, { ...p, ctx });

  cutMarks(ctx, marks);

  // De volta ao quadro no MESMO retangulo local, para o bitmap cair pixel a
  // pixel onde a tinta estaria.
  p.ctx.drawImage(scratch!, 0, 0, w, h, bounds.x, bounds.y, w / f, h / f);
}

/**
 * O objeto ficou sem nenhum pixel visivel?
 *
 * Decidido pelo RESULTADO, e nao pela geometria: com um `PathObject` nao ha
 * "pontos do traco" para conferir um a um, e para o traco de caneta a conta de
 * cobertura erraria nas pontas. Rasterizar pequeno e perguntar se sobrou alfa
 * responde igual para os dois tipos, e roda uma vez por objeto no fim do gesto.
 */
export function isFullyErased(obj: InkObject, p: PaintContext): boolean {
  const marks = obj.erased;
  if (!marks || marks.length === 0) return false;

  const bounds = localBounds(obj);
  if (bounds.w <= 0 || bounds.h <= 0) return true;

  // Resolucao baixa de proposito: a pergunta e "sobrou alguma coisa?", nao "o
  // que sobrou". Um traco de 3.000px vira 64px e a resposta continua a mesma.
  const f = Math.min(1, PROBE_PX / Math.max(bounds.w, bounds.h));
  const w = Math.max(1, Math.ceil(bounds.w * f));
  const h = Math.max(1, Math.ceil(bounds.h * f));
  const ctx = scratchContext(w, h);
  if (!ctx) return false;

  ctx.setTransform(f, 0, 0, f, -bounds.x * f, -bounds.y * f);
  // O painter CRU, e nao o despacho geral: passar por `paintObject` voltaria
  // para `withErase`, que disputaria este mesmo canvas intermediario.
  paintRaw(obj, { ...p, ctx, deviceScale: f, objectScale: 1, lod: 'full' });
  cutMarks(ctx, marks);

  const data = ctx.getImageData(0, 0, w, h).data;
  // Alfa residual da borda anti-serrilhada nao conta como tinta viva.
  for (let i = 3; i < data.length; i += 4) {
    if (data[i]! > ALPHA_FLOOR) return false;
  }
  return true;
}

const PROBE_PX = 64;
const ALPHA_FLOOR = 8;

/** Desenha a tinta sem passar pelo apagamento. */
function paintRaw(obj: InkObject, p: PaintContext): void {
  if (obj.type === 'stroke') paintStroke(obj, p);
  else paintPath(obj, p);
}

/** Aplica os rastros como remocao de pixel. */
function cutMarks(ctx: CanvasRenderingContext2D, marks: readonly EraseMark[]): void {
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.globalAlpha = 1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#000';
  ctx.fillStyle = '#000';

  for (const mark of marks) {
    const pts = mark.points;
    if (pts.length < 2) continue;

    // Um toque so (dois numeros) nao forma segmento: vira um disco, que e
    // exatamente o que um clique de borracha deve apagar.
    if (pts.length === 2) {
      ctx.beginPath();
      ctx.arc(pts[0]!, pts[1]!, mark.width / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }

    ctx.lineWidth = mark.width;
    ctx.beginPath();
    ctx.moveTo(pts[0]!, pts[1]!);
    for (let i = 2; i + 1 < pts.length; i += 2) ctx.lineTo(pts[i]!, pts[i + 1]!);
    ctx.stroke();
  }

  ctx.restore();
}

/** O ponto local caiu dentro de algum rastro de borracha? */
export function isErasedAt(obj: InkObject, x: number, y: number): boolean {
  const marks = obj.erased;
  if (!marks || marks.length === 0) return false;

  for (const mark of marks) {
    const pts = mark.points;
    const reach = mark.width / 2;
    if (pts.length === 2) {
      if (Math.hypot(x - pts[0]!, y - pts[1]!) <= reach) return true;
      continue;
    }
    for (let i = 0; i + 3 < pts.length; i += 2) {
      if (distToSegment(x, y, pts[i]!, pts[i + 1]!, pts[i + 2]!, pts[i + 3]!) <= reach) return true;
    }
  }
  return false;
}

/**
 * Canvas intermediario reaproveitado.
 *
 * Um canvas por objeto apagado, por frame, seria alocacao e coleta de lixo no
 * meio do loop de render. Ele so cresce, nunca encolhe: reduzir devolveria a
 * alocacao a cada oscilacao de zoom.
 */
function scratchContext(w: number, h: number): CanvasRenderingContext2D | null {
  if (!scratch) {
    scratch = document.createElement('canvas');
    scratchCtx = scratch.getContext('2d', { willReadFrequently: true });
  }
  if (!scratchCtx) return null;

  if (scratch.width < w || scratch.height < h) {
    scratch.width = Math.max(scratch.width, w);
    scratch.height = Math.max(scratch.height, h);
  }
  scratchCtx.setTransform(1, 0, 0, 1, 0, 0);
  scratchCtx.globalAlpha = 1;
  scratchCtx.globalCompositeOperation = 'source-over';
  scratchCtx.clearRect(0, 0, w, h);
  return scratchCtx;
}

/** Distancia de um ponto a um segmento. Mesma conta do hit-test dos tracos. */
function distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - ax, py - ay);
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
