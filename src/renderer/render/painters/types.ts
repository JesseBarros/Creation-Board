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
