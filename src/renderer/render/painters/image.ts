import type { ImageObject } from '@shared/model/types';
import type { PaintContext } from './types';

/**
 * Desenha uma imagem do quadro.
 *
 * O bitmap nao vem do objeto: o objeto guarda so o `assetId`, e o bitmap vive no
 * AssetStore. O renderer injeta o resolvedor no PaintContext para os painters
 * nao precisarem conhecer o store.
 */
export function paintImage(o: ImageObject, p: PaintContext): void {
  const { ctx } = p;
  const bitmap = p.image?.(o.assetId);

  if (!bitmap) {
    // Asset ausente ou ainda decodificando: marcador em vez de buraco silencioso.
    ctx.save();
    ctx.fillStyle = 'rgba(130,145,175,0.18)';
    ctx.fillRect(0, 0, o.w, o.h);
    ctx.strokeStyle = 'rgba(130,145,175,0.55)';
    ctx.lineWidth = 1 / p.zoom;
    ctx.strokeRect(0, 0, o.w, o.h);
    ctx.restore();
    return;
  }

  ctx.globalAlpha = o.opacity;

  if (o.crop) {
    // Recorte normalizado (0..1) sobre a imagem original.
    const sx = o.crop.x * bitmap.width;
    const sy = o.crop.y * bitmap.height;
    const sw = o.crop.w * bitmap.width;
    const sh = o.crop.h * bitmap.height;
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, o.w, o.h);
  } else {
    ctx.drawImage(bitmap, 0, 0, o.w, o.h);
  }

  ctx.globalAlpha = 1;
}
