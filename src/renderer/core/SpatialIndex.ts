import RBush from 'rbush';
import type { Rect } from '@shared/geometry/rect';
import type { BoardObject, ObjectId } from '@shared/model/types';

interface Entry {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  id: ObjectId;
}

/**
 * Indice espacial sobre os AABBs dos objetos.
 *
 * Escolhi R-tree (rbush) em vez de quadtree porque o quadro mistura AABBs de
 * escalas muito diferentes -- um traco de 20px e uma imagem de 4000px no mesmo
 * documento. Quadtree degrada nesse cenario (objetos grandes ficam presos em nos
 * altos ou sao duplicados em varios nos); R-tree agrupa por proximidade real.
 *
 * Custo das operacoes: busca O(log n), insercao/remocao O(log n) amortizado,
 * carga inicial em lote O(n log n) e varias vezes mais rapida que N insercoes.
 */
export class SpatialIndex {
  #tree = new RBush<Entry>();
  #entries = new Map<ObjectId, Entry>();

  get size(): number {
    return this.#entries.size;
  }

  insert(obj: BoardObject): void {
    const entry = toEntry(obj);
    this.#tree.insert(entry);
    this.#entries.set(obj.id, entry);
  }

  /** Carga em lote. Usar sempre que forem muitos objetos de uma vez. */
  load(objs: readonly BoardObject[]): void {
    const entries = objs.map(toEntry);
    this.#tree.load(entries);
    for (const e of entries) this.#entries.set(e.id, e);
  }

  remove(id: ObjectId): void {
    const entry = this.#entries.get(id);
    if (!entry) return;
    // Comparador por identidade: o rbush precisa achar exatamente este objeto.
    this.#tree.remove(entry, (a, b) => a.id === b.id);
    this.#entries.delete(id);
  }

  /** Reposiciona um objeto que mudou de bbox. */
  update(obj: BoardObject): void {
    this.remove(obj.id);
    this.insert(obj);
  }

  /** Ids cujos AABBs intersectam `rect`. E a base do culling por viewport. */
  search(rect: Rect): ObjectId[] {
    const hits = this.#tree.search({
      minX: rect.x,
      minY: rect.y,
      maxX: rect.x + rect.w,
      maxY: rect.y + rect.h,
    });
    const out: ObjectId[] = new Array(hits.length);
    for (let i = 0; i < hits.length; i++) out[i] = hits[i]!.id;
    return out;
  }

  /** AABB que engloba todo o conteudo indexado, ou null se estiver vazio. */
  bounds(): Rect | null {
    if (this.#entries.size === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const e of this.#entries.values()) {
      if (e.minX < minX) minX = e.minX;
      if (e.minY < minY) minY = e.minY;
      if (e.maxX > maxX) maxX = e.maxX;
      if (e.maxY > maxY) maxY = e.maxY;
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  clear(): void {
    this.#tree.clear();
    this.#entries.clear();
  }
}

function toEntry(obj: BoardObject): Entry {
  const b = obj.bbox;
  return { minX: b.x, minY: b.y, maxX: b.x + b.w, maxY: b.y + b.h, id: obj.id };
}
