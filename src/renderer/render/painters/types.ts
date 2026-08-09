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
  /**
   * Afastado: tracos usam a polilinha simplificada (RDP). Continua sendo o
   * traco, com menos pontos -- nao troca o objeto por outra coisa.
   */
  | 'simplified';

export interface PaintContext {
  ctx: CanvasRenderingContext2D;
  /** Zoom atual da camera; util para manter certas espessuras em px de tela. */
  zoom: number;
  lod: LodLevel;
  /**
   * Mundo -> pixels FISICOS da tela (`zoom * dpr`), e a escala do proprio
   * objeto. Juntos dizem de que tamanho uma unidade do objeto sai na tela.
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

/**
 * Nao existe mais um nivel que substitua o objeto por um retangulo solido.
 *
 * Existia ate 08/08/2026: abaixo de 12% de zoom todo objeto virava um bloco da
 * cor dominante, e era o que fazia as imagens e as formas do quadro dele
 * aparecerem como quadrados coloridos ao afastar. Ele pediu que sumisse,
 * aceitando o custo -- ver o B12 no BUGS.md, com o antes e o depois medidos.
 * O unico corte que ficou e a simplificacao da polilinha, que preserva o traco.
 */
export function lodForZoom(zoom: number): LodLevel {
  if (zoom < 0.4) return 'simplified';
  return 'full';
}
