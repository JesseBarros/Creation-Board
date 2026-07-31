import type { BoardObject } from '@shared/model/types';
import { WBD_SCHEMA_VERSION, type WbdDocument } from '@shared/model/document';
import type { Camera } from '../../core/Camera';
import type { Document } from '../../core/Document';
import { paintBlocks, paintObject } from '../../render/painters';
import { lodForZoom } from '../../render/painters/types';
import { createColorAdapter } from '../../render/colorAdapt';
import type { RenderTheme } from '../../render/Renderer';
import { clearPathCache } from '../../render/painters/path';
import type { AssetStore } from '../images/AssetStore';

/** Ids de asset realmente referenciados por algum objeto do quadro. */
export function usedAssetIds(doc: Document): Set<string> {
  const ids = new Set<string>();
  for (const obj of doc.all()) {
    if (obj.type === 'image') ids.add(obj.assetId);
  }
  return ids;
}

/** Serializa o estado atual do quadro no formato gravado dentro do .wbd. */
export function serializeBoard(
  doc: Document,
  camera: Camera,
  assets: AssetStore,
): WbdDocument {
  return {
    schemaVersion: WBD_SCHEMA_VERSION,
    objects: [...doc.all()],
    prefs: { ...doc.prefs },
    camera: camera.snapshot(),
    assets: assets.metas(usedAssetIds(doc)),
  };
}

/** Aplica um documento carregado sobre o estado vivo. */
export function applyBoard(doc: Document, camera: Camera, wbd: WbdDocument): void {
  doc.clear();
  clearPathCache();
  doc.setPrefs(wbd.prefs);
  doc.add(wbd.objects as BoardObject[]);
  camera.restore(wbd.camera);
}

const THUMB_W = 480;
const THUMB_H = 300;

/**
 * Gera a miniatura que aparece no card do lobby.
 *
 * Desenha num canvas proprio, fora da tela, enquadrando todo o conteudo. Usa o
 * mesmo caminho de LOD do renderer principal: numa miniatura de 480px um quadro
 * inteiro cabe com zoom baixissimo, entao quase sempre cai no modo de blocos --
 * que e justamente o que se quer aqui, um mapa de calor do quadro, barato de
 * produzir e legivel como identificacao visual.
 */
export async function renderThumbnail(
  doc: Document,
  theme: RenderTheme,
  resolveImage?: (assetId: string) => ImageBitmap | undefined,
): Promise<Uint8Array | null> {
  const canvas = document.createElement('canvas');
  canvas.width = THUMB_W;
  canvas.height = THUMB_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // A miniatura sai no tema em que o quadro foi salvo, com a mesma adaptacao de
  // cor do canvas principal -- senao um quadro escuro geraria um card ilegivel.
  const adapt = createColorAdapter(theme.boardBg);

  ctx.fillStyle = theme.boardBg;
  ctx.fillRect(0, 0, THUMB_W, THUMB_H);

  const bounds = doc.contentBounds();
  if (bounds && bounds.w > 0 && bounds.h > 0) {
    const pad = 12;
    const zoom = Math.min((THUMB_W - pad * 2) / bounds.w, (THUMB_H - pad * 2) / bounds.h);
    const camX = bounds.x + bounds.w / 2 - THUMB_W / 2 / zoom;
    const camY = bounds.y + bounds.h / 2 - THUMB_H / 2 / zoom;

    ctx.setTransform(zoom, 0, 0, zoom, -camX * zoom, -camY * zoom);

    const lod = lodForZoom(zoom);
    const objects = doc.queryVisible({
      x: camX,
      y: camY,
      w: THUMB_W / zoom,
      h: THUMB_H / zoom,
    });

    if (lod === 'blocks') {
      paintBlocks(objects, ctx, adapt);
    } else {
      for (const obj of objects) {
        const t = obj.transform;
        ctx.save();
        ctx.translate(t.x, t.y);
        if (t.rotation !== 0) ctx.rotate(t.rotation);
        if (t.scaleX !== 1 || t.scaleY !== 1) ctx.scale(t.scaleX, t.scaleY);
        // A miniatura e gerada em 1x, entao o zoom ja e a escala em pixel final.
        paintObject(obj, {
          ctx,
          zoom,
          lod,
          deviceScale: zoom,
          objectScale: Math.abs(t.scaleY),
          adapt,
          image: resolveImage,
        });
        ctx.restore();
      }
    }
  }

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), 'image/png');
  });
  if (!blob) return null;
  return new Uint8Array(await blob.arrayBuffer());
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
