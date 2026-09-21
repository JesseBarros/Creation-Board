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

/*
  DOIS canvas intermediarios, e a separacao vale explicar porque parece
  duplicacao inutil.

  Ate 21/09/2026 havia um so, criado com `willReadFrequently: true` porque o
  `isFullyErased` precisa de `getImageData`. Essa bandeira diz ao Chromium para
  manter o canvas na CPU, e ai esta o problema: quem a exige roda UMA VEZ por
  objeto, no fim do gesto; quem usava o canvas era o `withErase`, A CADA FRAME,
  para CADA objeto apagado.

  O resultado foi medido no painel `F3` dele: 31,3 ms de render com TRES objetos
  desenhados. Desenhar a tinta num canvas de CPU, recortar, e devolver o bitmap
  para um canvas de GPU custa transferencia nos dois sentidos, por objeto, por
  frame -- e o canvas chega a 4 megapixels com zoom aproximado.

  Agora o desenho usa um canvas normal (acelerado) e a sonda usa o de leitura,
  que e pequeno por definicao (64px) e so roda ao soltar a borracha.
*/
let scratch: HTMLCanvasElement | null = null;
let scratchCtx: CanvasRenderingContext2D | null = null;
let sonda: HTMLCanvasElement | null = null;
let sondaCtx: CanvasRenderingContext2D | null = null;

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

  // So o pedaco VISIVEL do objeto entra no canvas intermediario (B25). Com o
  // objeto inteiro, o custo acompanhava o TAMANHO DO OBJETO em pixel de tela, e
  // nao o tanto dele que aparece -- com zoom alto um traco que mal cabe na tela
  // pedia um canvas de milhoes de pixels por frame, para mostrar uma fatia.
  const area = recorteVisivel(bounds, p.ctx, wanted);
  if (!area) return; // tem marca, mas nenhum pedaco dele esta na tela

  const fit = Math.sqrt(MAX_PIXELS / Math.max(1, area.w * area.h));
  const f = Math.min(wanted, fit);

  const w = Math.max(1, Math.ceil(area.w * f));
  const h = Math.max(1, Math.ceil(area.h * f));
  ultimoRecorte = { w, h };
  const ctx = scratchContext(w, h);
  if (!ctx) {
    // Sem canvas intermediario, desenhar sem o buraco e melhor que nao desenhar:
    // some o apagamento, nao a tinta.
    paint(obj, p);
    return;
  }

  ctx.setTransform(f, 0, 0, f, -area.x * f, -area.y * f);
  paint(obj, { ...p, ctx });

  cutMarks(ctx, marks);

  // De volta ao quadro no MESMO retangulo local, para o bitmap cair pixel a
  // pixel onde a tinta estaria.
  p.ctx.drawImage(scratch!, 0, 0, w, h, area.x, area.y, w / f, h / f);
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Tamanho do ultimo recorte pedido, em pixel. Diagnostico do selftest. */
let ultimoRecorte: { w: number; h: number } = { w: 0, h: 0 };

/** Ver `ultimoRecorte`. */
export function recorteDaBorracha(): { w: number; h: number } {
  return ultimoRecorte;
}

/**
 * O pedaco do objeto que a tela mostra, em coordenadas LOCAIS dele.
 *
 * A janela de visao nao chega aqui pelo `PaintContext` -- e nem precisa. O
 * proprio `ctx` ja carrega a matriz local -> pixel fisico que o renderer montou;
 * invertendo-a e levando os quatro cantos do canvas para o espaco local, sai o
 * retangulo procurado. Vale com rotacao: os quatro cantos viram um losango, e o
 * AABB dele contem tudo que aparece.
 *
 * Devolve `null` quando nao sobra intersecao -- o objeto esta fora da tela e nao
 * ha nada a recortar.
 */
function recorteVisivel(bounds: Rect, ctx: CanvasRenderingContext2D, escala: number): Rect | null {
  const tela = telaEmLocal(ctx);
  if (!tela) return bounds; // matriz degenerada: melhor desenhar demais que de menos

  // Dois pixels fisicos de folga, para a borda anti-serrilhada do traco nao ser
  // cortada rente ao limite da tela.
  const folga = 2 / escala;
  const x = Math.max(bounds.x, tela.x - folga);
  const y = Math.max(bounds.y, tela.y - folga);
  const x2 = Math.min(bounds.x + bounds.w, tela.x + tela.w + folga);
  const y2 = Math.min(bounds.y + bounds.h, tela.y + tela.h + folga);
  if (x2 <= x || y2 <= y) return null;
  return { x, y, w: x2 - x, h: y2 - y };
}

/** O retangulo do canvas inteiro, trazido para o espaco local do objeto. */
function telaEmLocal(ctx: CanvasRenderingContext2D): Rect | null {
  const m = ctx.getTransform();
  const det = m.a * m.d - m.b * m.c;
  if (!Number.isFinite(det) || det === 0) return null;

  const inv = m.inverse();
  const { width, height } = ctx.canvas;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [cx, cy] of [
    [0, 0],
    [width, 0],
    [0, height],
    [width, height],
  ] as const) {
    const x = inv.a * cx + inv.c * cy + inv.e;
    const y = inv.b * cx + inv.d * cy + inv.f;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
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
  const ctx = sondaContext(w, h);
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
    // SEM `willReadFrequently`: este canvas e desenhado a cada frame e nunca
    // lido. A bandeira o jogaria para a CPU e custaria o render inteiro.
    scratchCtx = scratch.getContext('2d');
  }
  if (!scratchCtx) return null;
  return prepara(scratch, scratchCtx, w, h);
}

/**
 * O canvas da sonda de "sobrou tinta?".
 *
 * Este sim pede `willReadFrequently`, porque a unica coisa que ele faz e ser
 * lido. E pequeno (ver PROBE_PX) e roda uma vez por objeto ao soltar a borracha.
 */
function sondaContext(w: number, h: number): CanvasRenderingContext2D | null {
  if (!sonda) {
    sonda = document.createElement('canvas');
    sondaCtx = sonda.getContext('2d', { willReadFrequently: true });
  }
  if (!sondaCtx) return null;
  return prepara(sonda, sondaCtx, w, h);
}

/**
 * Diagnostico do selftest: o canvas de DESENHO ficou acelerado?
 *
 * Nao ha como medir isto de fora -- o canvas e privado deste modulo, e o custo
 * da bandeira so aparece como ms de render, que varia com a maquina. A pergunta
 * aqui e binaria e vale em qualquer PC. Ver o bloco de comentario la em cima
 * para o que a bandeira custou.
 */
export function scratchAcelerado(): boolean {
  const ctx = scratchContext(1, 1);
  return ctx !== null && ctx.getContextAttributes().willReadFrequently !== true;
}

function prepara(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): CanvasRenderingContext2D {
  if (canvas.width < w || canvas.height < h) {
    canvas.width = Math.max(canvas.width, w);
    canvas.height = Math.max(canvas.height, h);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, w, h);
  return ctx;
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
