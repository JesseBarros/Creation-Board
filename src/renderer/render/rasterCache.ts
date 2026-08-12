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
 * caminho passam direto.
 *
 * **Traco e forma NAO devem ser cacheados, e isto deixou de ser deducao.**
 * Medido em 12/08/2026 (repartição por tipo, no selftest), em ms por mil
 * objetos na tela:
 *
 *   desenhar mil tracos do zero    6,4 - 6,7
 *   desenhar mil formas do zero    5,7 - 6,0
 *   COLAR mil bitmaps ja prontos   6,3 - 7,0
 *
 * Colar um bitmap nao e mais barato que desenhar um traco curto: os tres numeros
 * sao a mesma coisa. O custo que domina e FIXO por objeto -- ele existe antes de
 * qualquer pixel --, e um bitmap paga esse custo igual. Cachear traco e forma
 * gastaria memoria para economizar *menos que zero*.
 *
 * O que torna o cache valioso para texto e o tamanho do que ele evita: mil
 * caixas de texto desenhadas do zero custam ~200 ms, e coladas ~6,4. Fator 30.
 * E isso porque medir e montar texto e caro, nao porque colar seja barato.
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
  /** Bucket de escala com que este bitmap foi desenhado. */
  escala: number;
}

/** O que o cache precisa saber do objeto. Evita depender do tipo do modelo. */
export interface Rasterizavel {
  readonly w: number;
  readonly h: number;
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
  /**
   * Chaveado pelo PROPRIO objeto, e nao por uma string `id:rev:escala`.
   *
   * As duas metades importam, e as duas saem de uma medicao (12/08/2026: colar
   * um bitmap de texto custava 7,7 ms por mil objetos, mais que DESENHAR mil
   * tracos do zero -- o custo estava na contabilidade, nao no desenho):
   *
   * - **Sem montar string.** A chave antiga era interpolada a cada objeto a cada
   *   frame. Num quadro cheio isso e uma string nova por objeto por frame, so
   *   para ser jogada fora em seguida.
   * - **Sem remexer a ordem.** O LRU antigo fazia `delete` + `set` em CADA
   *   acerto, para marcar o item como recem-usado. Com milhares de acertos por
   *   frame, manter a ordem custava mais do que a ordem valia.
   *
   * A invalidacao sai de graca, e pelo mesmo motivo que ja vale para o cache da
   * busca: toda mutacao SUBSTITUI o objeto, entao o objeto novo simplesmente nao
   * esta no mapa. Nao ha `rev` para comparar nem entrada velha para expulsar --
   * o coletor de lixo leva o bitmap junto com o objeto que morreu.
   */
  #mapa = new WeakMap<Rasterizavel, Entrada>();
  #vivas = 0;
  #bytes = 0;
  #acertos = 0;
  #erros = 0;

  constructor(private readonly orcamentoBytes = 192 * 1024 * 1024) {}

  get bytes(): number {
    return this.#bytes;
  }

  get stats(): { entradas: number; mb: number; acertos: number; erros: number } {
    return {
      entradas: this.#vivas,
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
   *
   * Um `WeakMap` nao se percorre, entao "esvaziar" e trocar o mapa por um novo.
   * O antigo morre inteiro com os bitmaps dentro dele, que e o que se queria.
   */
  clear(): void {
    this.#mapa = new WeakMap<Rasterizavel, Entrada>();
    this.#bytes = 0;
    this.#vivas = 0;
  }

  /**
   * Bitmap do objeto na escala pedida, desenhando-o se ainda nao existir.
   *
   * Devolve `null` quando nao vale a pena cachear -- e aí quem chamou desenha
   * direto, como antes.
   */
  obter(
    obj: Rasterizavel,
    escala: number,
    pintar: (ctx: OffscreenCanvasRenderingContext2D, escala: number) => void,
  ): OffscreenCanvas | null {
    const existente = this.#mapa.get(obj);
    // A escala entra na comparacao, e nao na chave: um zoom que mude de bucket
    // redesenha o bitmap por cima do antigo, em vez de acumular um por bucket.
    if (existente && existente.escala === escala) {
      this.#acertos++;
      return existente.canvas;
    }

    const w = Math.ceil((obj.w + RASTER_PAD * 2) * escala);
    const h = Math.ceil((obj.h + RASTER_PAD * 2) * escala);
    if (!(w > 0) || !(h > 0) || w > MAX_SIDE || h > MAX_SIDE) return null;

    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.setTransform(escala, 0, 0, escala, RASTER_PAD * escala, RASTER_PAD * escala);
    pintar(ctx, escala);

    const bytes = w * h * 4;
    if (existente) {
      this.#bytes -= existente.bytes;
      this.#vivas--;
    }
    this.#mapa.set(obj, { canvas, bytes, escala });
    this.#bytes += bytes;
    this.#vivas++;
    this.#erros++;

    // Sem lista para percorrer nao ha como expulsar o menos usado, entao o teto
    // e aplicado de uma vez: passou do orcamento, o cache inteiro vai embora e
    // se refaz sob demanda. E grosseiro de proposito -- custa UM frame caro e
    // acontece raramente, contra um custo por objeto por frame para manter uma
    // ordem que a medicao mostrou nao valer o preco.
    if (this.#bytes > this.orcamentoBytes) this.clear();
    return canvas;
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
