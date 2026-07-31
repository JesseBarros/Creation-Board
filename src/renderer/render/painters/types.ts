import type { BoardObject } from '@shared/model/types';
import type { ColorAdapter } from '../colorAdapt';

/**
 * Nivel de detalhe. Com o zoom bem afastado nao adianta desenhar cada ponto de
 * um traco nem glifos de texto: o resultado ocupa menos de um pixel. Cair de
 * nivel troca fidelidade por frame rate exatamente quando a fidelidade e
 * imperceptivel.
 */
export type LodLevel =
  /** Zoom normal: tudo desenhado fielmente. */
  | 'full'
  /** Afastado: tracos usam a versao simplificada, texto vira barras. */
  | 'simplified'
  /** Muito afastado: todo objeto vira um bloco solido do seu AABB. */
  | 'blocks';

export interface PaintContext {
  ctx: CanvasRenderingContext2D;
  /** Zoom atual da camera; util para manter certas espessuras em px de tela. */
  zoom: number;
  lod: LodLevel;
  /**
   * Mundo -> pixels FISICOS da tela (`zoom * dpr`), e a escala do proprio
   * objeto. Juntos dizem de que tamanho uma unidade do objeto sai na tela --
   * que e o que decide se um glifo ainda e legivel. Ver `glyphPixels`.
   */
  deviceScale: number;
  objectScale: number;
  /**
   * Traduz uma cor do documento para a cor a exibir no tema atual.
   * No tema claro e a identidade. Ver render/colorAdapt.ts.
   */
  adapt: ColorAdapter;
  /** Resolve o bitmap de um asset de imagem. Ausente em contextos sem imagens. */
  image?: (assetId: string) => ImageBitmap | undefined;
}

export type Painter<T extends BoardObject> = (obj: T, p: PaintContext) => void;

export function lodForZoom(zoom: number): LodLevel {
  if (zoom < 0.12) return 'blocks';
  if (zoom < 0.4) return 'simplified';
  return 'full';
}

/**
 * Altura de fonte em pixels fisicos da tela.
 *
 * O zoom da camera sozinho nao responde se o texto da para ler: um objeto
 * carrega a propria escala, e num resumo importado ela varia bastante -- os
 * titulos chegam a 34 unidades de mundo enquanto o corpo fica em 12,5. A 22% de
 * zoom isso e a diferenca entre 7,5px (legivel) e 2,8px (mancha).
 */
export function glyphPixels(fontSize: number, p: PaintContext): number {
  return fontSize * p.objectScale * p.deviceScale;
}

/**
 * Abaixo disto o glifo nao forma letra: vira mancha de pixels, e a barra cinza
 * comunica melhor "aqui tem texto" por uma fracao do custo. Acima, desenhar de
 * verdade e o que permite reconhecer um titulo com o quadro todo na tela.
 */
export const MIN_GLYPH_PX = 6;
