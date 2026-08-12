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

/** Teto de pixels de UM canvas (~64 MP). Acima disto o navegador nao aloca. */
const MAX_PIXELS = 64_000_000;

/**
 * Teto de lado de um canvas. O Chromium aceita ate 65.535, mas um lado gigante
 * com o outro curto desperdica o orcamento de pixels numa tira; 16.384 mantem os
 * ladrilhos com forma utilizavel.
 */
const MAX_SIDE = 16_384;

/**
 * Como um pedido de resolucao vira arquivos.
 *
 * O B13 era este: os tres botoes (1x, 2x, 3x) produziam o MESMO arquivo num
 * quadro grande, porque o teto de pixels engolia a escolha calado. Um controle
 * que promete e nao cumpre e pior que um controle ausente.
 *
 * A saida registrada no BUGS.md era "renderizar em pedacos e juntar no arquivo
 * final". **Ela nao e alcancavel, e vale dizer por que:** o quadro real dele tem
 * 82.967 x 19.274 unidades, o que da 1,6 GIGApixel a 1x -- 6,4 GB de pixel cru.
 * Nao existe PNG unico para isso, com ou sem ladrilhos, e nenhum visualizador
 * abriria. O teto de 64 MP nao era o limite que apertava; a aritmetica era.
 *
 * Entao o ladrilho vira ARQUIVO, e nao pedaco costurado. A escala pedida passa a
 * ser respeitada exatamente, e o quadro sai numa grade de imagens de tamanho
 * normal -- que e o que torna o resumo legivel, que era o pedido original.
 */
export interface TilePlan {
  /** Escala efetivamente usada. Igual a pedida, sempre que houver ladrilhos. */
  scale: number;
  /** Tamanho total da imagem completa, em pixels. */
  width: number;
  height: number;
  cols: number;
  rows: number;
  /** Lado de um ladrilho em pixels (o da ultima coluna/linha pode ser menor). */
  tileW: number;
  tileH: number;
  /** Area do mundo coberta, ja com a margem. */
  box: Rect;
}

export function planTiles(area: Rect, padding: number, wanted: number): TilePlan {
  const box = inflate(area, padding);
  const width = Math.max(1, Math.round(box.w * wanted));
  const height = Math.max(1, Math.round(box.h * wanted));

  // Primeiro o limite de LADO, que e rigido. Depois o de AREA, crescendo sempre
  // o eixo mais longo -- crescer o curto deixaria ladrilhos em forma de tira.
  let cols = Math.ceil(width / MAX_SIDE);
  let rows = Math.ceil(height / MAX_SIDE);
  while ((width / cols) * (height / rows) > MAX_PIXELS) {
    if (width / cols >= height / rows) cols++;
    else rows++;
  }

  return {
    scale: wanted,
    width,
    height,
    cols,
    rows,
    tileW: Math.ceil(width / cols),
    tileH: Math.ceil(height / rows),
    box,
  };
}

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

/**
 * Um ladrilho da exportacao. Com `cols * rows === 1` e a imagem inteira, e o
 * caminho e identico ao que existia antes de o B13 ser corrigido.
 */
export async function renderPngTile(
  doc: Document,
  assets: AssetStore,
  ids: readonly string[],
  opts: ExportOptions,
  plan: TilePlan,
  col: number,
  row: number,
): Promise<RenderedPng> {
  const { scale, box } = plan;
  // O ultimo ladrilho de cada eixo costuma sobrar: sem o `min`, ele teria pixels
  // vazios alem da borda do quadro.
  const width = Math.min(plan.tileW, plan.width - col * plan.tileW);
  const height = Math.min(plan.tileH, plan.height - row * plan.tileH);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Contexto 2D indisponivel para exportar');

  if (opts.background) {
    ctx.fillStyle = opts.background;
    ctx.fillRect(0, 0, width, height);
  }

  // A origem do ladrilho em pixels vira deslocamento da transformacao: o resto
  // do desenho nao sabe que esta num pedaco.
  const offX = col * plan.tileW;
  const offY = row * plan.tileH;

  const adapt = createColorAdapter(opts.background ?? opts.theme.boardBg);
  ctx.setTransform(scale, 0, 0, scale, -box.x * scale - offX, -box.y * scale - offY);

  // Culling pelo pedaco do MUNDO que este ladrilho cobre. Sem isto, cada
  // ladrilho percorreria o quadro inteiro, e o custo cresceria com o quadrado do
  // numero de ladrilhos.
  const janela: Rect = {
    x: box.x + offX / scale,
    y: box.y + offY / scale,
    w: width / scale,
    h: height / scale,
  };

  for (const obj of objectsToExport(doc, ids, janela)) {
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
 * Uma imagem SO, com a escala cedendo se o pedido nao couber num canvas.
 *
 * Continua existindo porque o PDF e uma pagina: nao ha onde por o segundo
 * ladrilho. Quem exporta PNG passa pelo `planTiles` + `renderPngTile`, que
 * respeitam a escala pedida.
 */
export async function renderPng(
  doc: Document,
  assets: AssetStore,
  area: Rect,
  ids: readonly string[],
  opts: ExportOptions,
): Promise<RenderedPng> {
  const scale = fitScale(inflate(area, opts.padding), opts.scale);
  const plan = planTiles(area, opts.padding, scale);
  return renderPngTile(doc, assets, ids, opts, plan, 0, 0);
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
