import type { Rect } from '@shared/geometry/rect';
import type { BoardObject } from '@shared/model/types';
import type { Document } from '../../core/Document';
import { createColorAdapter } from '../../render/colorAdapt';
import { paintObject } from '../../render/painters';
import type { RenderTheme } from '../../render/Renderer';
import type { AssetStore } from '../images/AssetStore';

/**
 * Exportacao do quadro para imagem.
 *
 * O PNG sai do MESMO caminho de desenho do app -- `paintObject`, o mesmo
 * adaptador de cor, os mesmos painters. Um renderizador proprio para exportar
 * significaria manter dois desenhos do mesmo quadro, e eles divergiriam na
 * primeira funcionalidade nova (foi o que aconteceu com a medicao de texto entre
 * a Fase 2 e a 5).
 *
 * A diferenca em relacao a tela e o que NAO entra: cromo de interface. Reguas,
 * alcas de selecao, guias de encaixe, destaque da busca e fichas de post-it
 * fixado sao respostas do app a quem esta editando, e nao conteudo do quadro.
 */

export interface ExportOptions {
  /** Escala em relacao as unidades de mundo. 2 = o dobro de pixels. */
  scale: number;
  /** Margem em volta do conteudo, em unidades de mundo. */
  padding: number;
  /** Fundo do quadro, ou null para PNG com transparencia. */
  background: string | null;
  theme: RenderTheme;
}

/** Teto de pixels do PNG exportado (~64 MP). Acima disto, a escala cede. */
const MAX_PIXELS = 64_000_000;

/** Retangulo a exportar: a selecao, se houver, senao todo o conteudo. */
export function exportBounds(doc: Document, ids: readonly string[]): Rect | null {
  if (ids.length === 0) return doc.contentBounds();

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const id of ids) {
    const obj = doc.get(id);
    if (!obj) continue;
    const b = obj.bbox;
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x + b.w > maxX) maxX = b.x + b.w;
    if (b.y + b.h > maxY) maxY = b.y + b.h;
  }
  return Number.isFinite(minX) ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY } : null;
}

export interface RenderedPng {
  bytes: Uint8Array;
  width: number;
  height: number;
  /** Escala efetivamente usada; menor que a pedida se o teto de pixels apertou. */
  scale: number;
}

export async function renderPng(
  doc: Document,
  assets: AssetStore,
  area: Rect,
  ids: readonly string[],
  opts: ExportOptions,
): Promise<RenderedPng> {
  const box = inflate(area, opts.padding);
  const scale = fitScale(box, opts.scale);
  const width = Math.max(1, Math.round(box.w * scale));
  const height = Math.max(1, Math.round(box.h * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Contexto 2D indisponivel para exportar');

  if (opts.background) {
    ctx.fillStyle = opts.background;
    ctx.fillRect(0, 0, width, height);
  }

  const adapt = createColorAdapter(opts.background ?? opts.theme.boardBg);
  ctx.setTransform(scale, 0, 0, scale, -box.x * scale, -box.y * scale);

  for (const obj of objectsToExport(doc, ids, box)) {
    const t = obj.transform;
    ctx.save();
    ctx.translate(t.x, t.y);
    if (t.rotation !== 0) ctx.rotate(t.rotation);
    if (t.scaleX !== 1 || t.scaleY !== 1) ctx.scale(t.scaleX, t.scaleY);
    paintObject(obj, {
      ctx,
      zoom: scale,
      // Sempre em detalhe cheio: LOD existe para manter 60fps enquanto se
      // navega, e um arquivo exportado nao tem frame rate. Exportar em
      // 'simplified' gravaria as barras cinzas no lugar do texto.
      lod: 'full',
      deviceScale: scale,
      objectScale: Math.abs(t.scaleY),
      adapt,
      image: (id) => assets.bitmap(id),
    });
    ctx.restore();
  }

  const blob = await new Promise<Blob | null>((r) => canvas.toBlob((b) => r(b), 'image/png'));
  if (!blob) throw new Error('Falha ao codificar o PNG');
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height, scale };
}

/**
 * Escala reduzida quando o pedido estoura o teto de pixels.
 *
 * Um quadro de 80.000 unidades a 2x seriam 160.000px de largura -- o canvas
 * falharia em alocar e a exportacao morreria sem explicacao. Reduzir entrega um
 * arquivo util; o alternativo e uma mensagem de erro.
 */
function fitScale(box: Rect, wanted: number): number {
  const pixels = box.w * box.h * wanted * wanted;
  if (pixels <= MAX_PIXELS) return wanted;
  // A folga de 1% existe porque a largura e a altura sao ARREDONDADAS depois:
  // sem ela, dois arredondamentos para cima devolvem um canvas alguns milhares
  // de pixels acima do teto que esta conta acabou de garantir.
  return wanted * Math.sqrt((MAX_PIXELS * 0.99) / pixels);
}

function inflate(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, w: r.w + by * 2, h: r.h + by * 2 };
}

/** Objetos a desenhar, na ordem de camada. */
function objectsToExport(doc: Document, ids: readonly string[], box: Rect): BoardObject[] {
  const visible = doc.queryVisible(box);
  if (ids.length === 0) return visible;
  const wanted = new Set(ids);
  return visible.filter((o) => wanted.has(o.id));
}
