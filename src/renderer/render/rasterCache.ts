import type { PaintContext } from './painters/types';

/**
 * Cache de objetos ja rasterizados.
 *
 * O problema que ele resolve foi MEDIDO, e a medicao e o que escolheu esta
 * solucao em vez das outras. Duas fases do `QB_BENCH`, na MESMA area de tela:
 *
 *   zoom 40%        126 objetos visiveis   ->  2,2 ms de render
 *   ajustado a tela 4.000 objetos visiveis -> 22,4 ms de render
 *
 * 32x mais objetos custam 10x mais tempo com o mesmo numero de pixels pintados.
 * O gargalo e por OBJETO -- medir texto, montar linha, rasterizar glifo --, e
 * nao por pixel. Foi isso que descartou a saida intuitiva de renderizar em
 * resolucao menor e ampliar ("um DLSS 2D"): ela corta custo de pixel, que aqui
 * quase nao existe, e cobraria nitidez em troca de pouco fps.
 *
 * O que sobra e nao repetir trabalho: desenhar cada objeto UMA vez num bitmap
 * proprio e, nos frames seguintes, so cola-lo. Colar e uma operacao de copia; o
 * texto nao e medido nem montado de novo.
 *
 * Vale para texto e post-it, que sao os caros. Imagem ja e bitmap, e traco e
 * caminho -- os dois passam direto, porque cachea-los gastaria memoria para
 * economizar pouco.
 */

/** Folga em unidades locais, para descida de letra e sombra nao serem cortadas. */
export const RASTER_PAD = 2;

/**
 * Teto de lado do bitmap. Acima disto nao vale a pena: a memoria cresce com o
 * quadrado do lado, e um objeto tao grande na tela ja aparece sozinho -- o caso
 * que o cache existe para resolver e "milhares deles ao mesmo tempo".
 */
const MAX_SIDE = 2048;

interface Entrada {
  canvas: OffscreenCanvas;
  bytes: number;
}

/**
 * A escala e arredondada para cima na proxima potencia de dois.
 *
 * As duas metades importam. **Para cima**, porque o bitmap e depois REDUZIDO ao
 * ser colado, e reduzir mantem nitido -- ampliar borraria, que e exatamente o
 * que ele nao quer. **Em degraus**, porque a escala muda a cada tique de zoom:
 * sem degraus, cada tique invalidaria o cache inteiro e o custo voltaria.
 */
export function bucketScale(escala: number): number {
  if (!(escala > 0)) return 1;
  return Math.pow(2, Math.ceil(Math.log2(escala)));
}

export class RasterCache {
  /** `Map` mantem ordem de insercao: reinserir no acesso ja da o LRU. */
  readonly #entradas = new Map<string, Entrada>();
  #bytes = 0;
  #acertos = 0;
  #erros = 0;

  constructor(private readonly orcamentoBytes = 192 * 1024 * 1024) {}

  get bytes(): number {
    return this.#bytes;
  }

  get stats(): { entradas: number; mb: number; acertos: number; erros: number } {
    return {
      entradas: this.#entradas.size,
      mb: this.#bytes / (1024 * 1024),
      acertos: this.#acertos,
      erros: this.#erros,
    };
  }

  /**
   * Joga tudo fora.
   *
   * Chamado ao trocar de tema: a cor gravada no bitmap ja passou pelo adaptador,
   * e um bitmap do tema claro colado no tema escuro apareceria com a cor errada.
   */
  clear(): void {
    this.#entradas.clear();
    this.#bytes = 0;
  }

  /**
   * Bitmap do objeto na escala pedida, desenhando-o se ainda nao existir.
   *
   * Devolve `null` quando nao vale a pena cachear -- e aí quem chamou desenha
   * direto, como antes.
   */
  obter(
    chave: string,
    larguraLocal: number,
    alturaLocal: number,
    escala: number,
    pintar: (ctx: OffscreenCanvasRenderingContext2D, escala: number) => void,
  ): OffscreenCanvas | null {
    const existente = this.#entradas.get(chave);
    if (existente) {
      // Reinsere para marcar como recem-usado.
      this.#entradas.delete(chave);
      this.#entradas.set(chave, existente);
      this.#acertos++;
      return existente.canvas;
    }

    const w = Math.ceil((larguraLocal + RASTER_PAD * 2) * escala);
    const h = Math.ceil((alturaLocal + RASTER_PAD * 2) * escala);
    if (!(w > 0) || !(h > 0) || w > MAX_SIDE || h > MAX_SIDE) return null;

    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.setTransform(escala, 0, 0, escala, RASTER_PAD * escala, RASTER_PAD * escala);
    pintar(ctx, escala);

    const bytes = w * h * 4;
    this.#entradas.set(chave, { canvas, bytes });
    this.#bytes += bytes;
    this.#erros++;
    this.#despejar();
    return canvas;
  }

  /** Descarta os menos usados ate caber no orcamento. */
  #despejar(): void {
    if (this.#bytes <= this.orcamentoBytes) return;
    for (const [chave, entrada] of this.#entradas) {
      this.#entradas.delete(chave);
      this.#bytes -= entrada.bytes;
      if (this.#bytes <= this.orcamentoBytes) return;
    }
  }
}

/**
 * O contexto de pintura para o bitmap.
 *
 * `deviceScale` recebe a escala do bitmap e `objectScale` vira 1: os painters
 * usam o PRODUTO dos dois para saber de que tamanho uma unidade do objeto sai
 * em pixel, e no bitmap a escala do objeto ja esta embutida na transformacao.
 */
export function contextoDeRaster(
  ctx: OffscreenCanvasRenderingContext2D,
  escala: number,
  base: PaintContext,
): PaintContext {
  return {
    ...base,
    ctx: ctx as unknown as CanvasRenderingContext2D,
    deviceScale: escala,
    objectScale: 1,
  };
}
