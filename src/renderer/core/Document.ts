import type { Rect } from '@shared/geometry/rect';
import type { BoardObject, ObjectId } from '@shared/model/types';
import { type BoardPrefs, createEmptyDocument } from '@shared/model/document';
import { SpatialIndex } from './SpatialIndex';

export type DocumentEvent = 'objects' | 'prefs';
type Listener = () => void;

/**
 * Fracao do quadro que, se mudar de uma vez, faz valer a pena refazer o indice
 * espacial inteiro em lote em vez de reposicionar objeto a objeto.
 * Ver `replaceMany`.
 */
const BULK_REINDEX_RATIO = 0.25;

/**
 * Store central dos objetos do quadro.
 *
 * Responsabilidades: guardar os objetos, manter o indice espacial em sincronia e
 * avisar quem depende disso (renderer, futura busca, futura selecao).
 *
 * O que NAO faz: mutar objetos por conta propria. A partir da Fase 3 toda
 * mutacao entra por um Command, que chama estes metodos. Manter esta classe
 * "burra" e o que torna o undo/redo viavel sem snapshots.
 */
export class Document {
  readonly index = new SpatialIndex();

  #objects = new Map<ObjectId, BoardObject>();
  #prefs: BoardPrefs = createEmptyDocument().prefs;
  #listeners = new Map<DocumentEvent, Set<Listener>>();

  /**
   * Posicao de cada objeto na ordem de camadas, como numero.
   * Existe porque ordenar os visiveis por `z` (string) a cada frame seria caro;
   * comparar numeros e ~5x mais rapido. Recalculado so quando a ordem muda.
   */
  #rank = new Map<ObjectId, number>();
  #rankDirty = true;

  get size(): number {
    return this.#objects.size;
  }

  get prefs(): Readonly<BoardPrefs> {
    return this.#prefs;
  }

  setPrefs(patch: Partial<BoardPrefs>): void {
    this.#prefs = { ...this.#prefs, ...patch };
    this.#emit('prefs');
  }

  get(id: ObjectId): BoardObject | undefined {
    return this.#objects.get(id);
  }

  all(): IterableIterator<BoardObject> {
    return this.#objects.values();
  }

  add(objs: readonly BoardObject[]): void {
    if (objs.length === 0) return;
    for (const o of objs) this.#objects.set(o.id, o);
    // Carga em lote e bem mais rapida que N insercoes individuais no R-tree.
    if (objs.length > 8) this.index.load(objs);
    else for (const o of objs) this.index.insert(o);
    this.#rankDirty = true;
    this.#emit('objects');
  }

  remove(ids: readonly ObjectId[]): void {
    let changed = false;
    for (const id of ids) {
      if (!this.#objects.delete(id)) continue;
      this.index.remove(id);
      changed = true;
    }
    if (!changed) return;
    this.#rankDirty = true;
    this.#emit('objects');
  }

  /** Substitui um objeto ja existente, ressincronizando o indice espacial. */
  replace(obj: BoardObject): void {
    this.replaceMany([obj]);
  }

  /**
   * Substitui varios objetos de uma vez.
   *
   * Existe para arrastes com selecao multipla: `replace` por objeto emitiria um
   * evento por objeto por frame, e cada evento agenda um redesenho. Com 200
   * objetos selecionados isso seria 200 notificacoes para um unico movimento.
   */
  replaceMany(objs: readonly BoardObject[]): void {
    let changed = 0;
    for (const obj of objs) {
      const prev = this.#objects.get(obj.id);
      if (!prev) continue;
      this.#objects.set(obj.id, obj);
      if (prev.z !== obj.z) this.#rankDirty = true;
      changed++;
    }
    if (changed === 0) return;

    // Reposicionar objeto a objeto custa um `remove` -- que procura a entrada na
    // arvore -- mais um `insert` reequilibrado. Quando o arraste mexe em boa
    // parte do quadro, refazer o indice em lote sai mais barato: medido com
    // 10.000 objetos, 20,4 ms um a um contra 6,9 ms de uma vez.
    if (changed >= this.#objects.size * BULK_REINDEX_RATIO) {
      this.index.rebuild([...this.#objects.values()]);
    } else {
      for (const obj of objs) {
        if (this.#objects.has(obj.id)) this.index.update(obj);
      }
    }
    this.#emit('objects');
  }

  clear(): void {
    this.#objects.clear();
    this.index.clear();
    this.#rank.clear();
    this.#rankDirty = true;
    this.#emit('objects');
  }

  /**
   * Culling: objetos visiveis em `rect`, ja ordenados por camada (de tras para
   * frente, que e a ordem de desenho). Nunca varre a lista inteira.
   */
  queryVisible(rect: Rect): BoardObject[] {
    const ids = this.index.search(rect);
    const out: BoardObject[] = [];
    for (let i = 0; i < ids.length; i++) {
      const obj = this.#objects.get(ids[i]!);
      if (obj && !obj.hidden) out.push(obj);
    }
    const rank = this.#ranks();
    out.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
    return out;
  }

  /** AABB de todo o conteudo. Usado pelo "ajustar a tela". */
  contentBounds(): Rect | null {
    return this.index.bounds();
  }

  /** Maior `z` atual, para inserir um objeto novo no topo da pilha. */
  topZ(): string {
    let top = '';
    for (const o of this.#objects.values()) {
      if (o.z > top) top = o.z;
    }
    return top;
  }

  /** Menor `z` atual, para enviar algo para tras de tudo. */
  bottomZ(): string | null {
    let bottom: string | null = null;
    for (const o of this.#objects.values()) {
      if (bottom === null || o.z < bottom) bottom = o.z;
    }
    return bottom;
  }

  on(event: DocumentEvent, fn: Listener): () => void {
    let set = this.#listeners.get(event);
    if (!set) {
      set = new Set();
      this.#listeners.set(event, set);
    }
    set.add(fn);
    return () => set.delete(fn);
  }

  #emit(event: DocumentEvent): void {
    const set = this.#listeners.get(event);
    if (!set) return;
    for (const fn of set) fn();
  }

  #ranks(): Map<ObjectId, number> {
    if (!this.#rankDirty) return this.#rank;
    const sorted = [...this.#objects.values()].sort((a, b) => (a.z < b.z ? -1 : a.z > b.z ? 1 : 0));
    this.#rank.clear();
    for (let i = 0; i < sorted.length; i++) this.#rank.set(sorted[i]!.id, i);
    this.#rankDirty = false;
    return this.#rank;
  }
}
