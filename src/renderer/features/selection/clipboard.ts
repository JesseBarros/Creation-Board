import type { Rect } from '@shared/geometry/rect';
import type { Vec2 } from '@shared/geometry/vec2';
import { keyBetween } from '@shared/model/fractional';
import type { BoardObject } from '@shared/model/types';
import { AddObjects } from '../../commands';
import type { ToolContext } from '../../tools/types';
import type { AssetStore, SerializedAsset } from '../images/AssetStore';
import { cloneObject, deleteSelection, rotulo } from './actions';

/**
 * Area de transferencia do quadro.
 *
 * Em memoria, e nao no clipboard do sistema: um objeto do quadro nao tem
 * representacao fiel em texto nem em imagem, e serializa-lo para o clipboard do
 * Windows so para ler de volta em seguida perderia a fidelidade -- traco vira
 * bitmap, texto perde a formatacao. Colar em OUTRO aplicativo e exportacao, e
 * pertence a Fase 8.
 *
 * Copia junto os BYTES das imagens referenciadas. Sem isso, copiar uma imagem
 * num quadro e colar noutro deixaria um ImageObject apontando para um asset que
 * o AssetStore do destino nao tem -- o quadro esvazia o store ao trocar de
 * arquivo, entao a copia sairia como marcador de imagem ausente.
 */
export class BoardClipboard {
  #objects: BoardObject[] = [];
  #assets: SerializedAsset[] = [];

  get isEmpty(): boolean {
    return this.#objects.length === 0;
  }

  get size(): number {
    return this.#objects.length;
  }

  copy(objects: readonly BoardObject[], store: AssetStore): boolean {
    if (objects.length === 0) return false;

    // Copia profunda ja aqui: o original pode ser movido, redimensionado ou
    // excluido antes de o usuario colar, e o que se cola e o que ele copiou.
    this.#objects = objects.map((o) => cloneObject(o, o.z, 0, 0));

    const usados = new Set<string>();
    for (const o of objects) {
      if (o.type === 'image') usados.add(o.assetId);
    }
    this.#assets = usados.size > 0 ? store.serialize(usados) : [];
    return true;
  }

  cut(ctx: ToolContext, store: AssetStore): boolean {
    if (!this.copy(ctx.selection.objects(ctx.doc), store)) return false;
    return deleteSelection(ctx);
  }

  /** Cola centrado em `at` (posicao do cursor, em mundo). */
  async paste(ctx: ToolContext, store: AssetStore, at: Vec2): Promise<boolean> {
    if (this.#objects.length === 0) return false;

    // Os bytes precisam estar decodificados ANTES de os objetos entrarem, senao
    // o primeiro frame desenha marcador no lugar da imagem.
    for (const a of this.#assets) await store.adopt(a.id, a.mime, a.data);

    const b = unionBbox(this.#objects);
    const dx = at.x - (b.x + b.w / 2);
    const dy = at.y - (b.y + b.h / 2);

    // Ordena pela camada de origem para a pilha relativa entre as copias sair
    // igual a do original.
    const ordenados = [...this.#objects].sort((p, q) => (p.z < q.z ? -1 : p.z > q.z ? 1 : 0));
    let cursor = ctx.doc.topZ();
    const copias = ordenados.map((o) => {
      cursor = keyBetween(cursor, null);
      return cloneObject(o, cursor, dx, dy);
    });

    ctx.history.push(new AddObjects(ctx.doc, copias, rotulo('Colar', copias.length)));
    ctx.history.seal();
    ctx.selection.set(copias.map((o) => o.id));
    ctx.markDirty();
    ctx.invalidate();
    return true;
  }
}

function unionBbox(objects: readonly BoardObject[]): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const o of objects) {
    const b = o.bbox;
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x + b.w > maxX) maxX = b.x + b.w;
    if (b.y + b.h > maxY) maxY = b.y + b.h;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
