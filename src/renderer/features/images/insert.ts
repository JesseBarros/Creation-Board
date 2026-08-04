import type { Vec2 } from '@shared/geometry/vec2';
import { computeBbox } from '@shared/model/bbox';
import { keyBetween } from '@shared/model/fractional';
import { createId } from '@shared/model/id';
import type { ImageObject } from '@shared/model/types';
import { AddObjects } from '../../commands';
import type { ToolContext } from '../../tools/types';
import type { AssetStore } from './AssetStore';

/**
 * Entrada de imagens pelo app: colar e arrastar arquivo.
 *
 * O caminho de dentro (AssetStore, ImageObject, painter, gravacao no .wbd) ja
 * existia desde a Fase 2, usado pela importacao do Whiteboard. O que a Fase 7
 * acrescenta e a porta de entrada.
 *
 * Uma imagem entra em TAMANHO DE TELA, nao no tamanho do arquivo: um print de
 * 3840x2160 colado em escala 1:1 cobriria o quadro inteiro e obrigaria a
 * redimensionar antes de conseguir ler o que esta embaixo. O teto reduz; imagem
 * menor que ele entra no tamanho natural, porque ampliar borraria.
 */

/** Maior lado de uma imagem recem-inserida, em unidades de mundo. */
const MAX_INSERT_SIZE = 720;

/** Espaco entre imagens quando varias entram de uma vez. */
const GAP = 24;

export interface InsertResult {
  objects: ImageObject[];
  /** Arquivos recusados, com o motivo -- para a interface poder avisar. */
  rejected: Array<{ name: string; reason: string }>;
}

/**
 * Insere arquivos de imagem centrados em `at`.
 *
 * Varios arquivos entram lado a lado, e nao empilhados: empilhar esconderia
 * todos menos o de cima, e a primeira acao de quem colou tres imagens seria
 * separar as tres.
 */
export async function insertImages(
  ctx: ToolContext,
  assets: AssetStore,
  files: readonly File[],
  at: Vec2,
): Promise<InsertResult> {
  const result: InsertResult = { objects: [], rejected: [] };

  const usable = files.filter((f) => {
    if (f.type.startsWith('image/')) return true;
    result.rejected.push({ name: f.name || 'sem nome', reason: 'nao e imagem' });
    return false;
  });
  if (usable.length === 0) return result;

  // Decodifica tudo antes de posicionar: so com os tamanhos em maos da para
  // distribuir as imagens lado a lado sem sobreposicao.
  const decoded: Array<{ id: string; w: number; h: number; natW: number; natH: number }> = [];
  for (const file of usable) {
    try {
      const asset = await assets.add(file, file.name);
      const natW = asset.meta.width ?? asset.bitmap.width;
      const natH = asset.meta.height ?? asset.bitmap.height;
      // Nunca amplia: uma miniatura de 64px esticada para 720 seria uma mancha.
      const scale = Math.min(1, MAX_INSERT_SIZE / Math.max(natW, natH, 1));
      decoded.push({
        id: asset.meta.id,
        w: Math.max(1, Math.round(natW * scale)),
        h: Math.max(1, Math.round(natH * scale)),
        natW,
        natH,
      });
    } catch {
      // Arquivo corrompido ou formato que o Chromium nao decodifica. Recusar um
      // nao pode impedir os outros de entrar.
      result.rejected.push({ name: file.name || 'sem nome', reason: 'nao foi possivel abrir' });
    }
  }
  if (decoded.length === 0) return result;

  const totalW = decoded.reduce((sum, d) => sum + d.w, 0) + GAP * (decoded.length - 1);
  const tallest = decoded.reduce((max, d) => Math.max(max, d.h), 0);
  let cursorX = at.x - totalW / 2;
  const now = Date.now();
  let z = ctx.doc.topZ();

  for (const d of decoded) {
    z = keyBetween(z, null);
    const obj: ImageObject = {
      id: createId(),
      type: 'image',
      parentId: null,
      z,
      // Alinhadas pelo CENTRO vertical: com alturas diferentes, alinhar pelo
      // topo deixaria a fila torta em relacao ao ponto onde se soltou.
      transform: { x: cursorX, y: at.y - tallest / 2 + (tallest - d.h) / 2, rotation: 0, scaleX: 1, scaleY: 1 },
      bbox: { x: 0, y: 0, w: 0, h: 0 },
      opacity: 1,
      locked: false,
      hidden: false,
      rev: 0,
      createdAt: now,
      updatedAt: now,
      w: d.w,
      h: d.h,
      assetId: d.id,
      naturalW: d.natW,
      naturalH: d.natH,
    };
    obj.bbox = computeBbox(obj);
    result.objects.push(obj);
    cursorX += d.w + GAP;
  }

  ctx.history.push(
    new AddObjects(
      ctx.doc,
      result.objects,
      result.objects.length === 1 ? 'Inserir imagem' : `Inserir ${result.objects.length} imagens`,
    ),
  );
  ctx.history.seal();
  ctx.markDirty();
  ctx.selection.set(result.objects.map((o) => o.id));
  ctx.invalidate();

  return result;
}

/** Arquivos de imagem de um DataTransfer (colar ou arrastar). */
export function imageFilesFrom(data: DataTransfer | null): File[] {
  if (!data) return [];
  const out: File[] = [];
  for (const item of data.files) {
    if (item.type.startsWith('image/')) out.push(item);
  }
  return out;
}
