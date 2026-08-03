import type { BoardObject, ObjectId } from '@shared/model/types';
import type { Document } from './Document';

/**
 * Conjunto de objetos selecionados.
 *
 * Guarda ids, e nao objetos: toda mutacao substitui a instancia do objeto no
 * Document (para invalidar o bitmap cache pelo `rev`), entao uma referencia
 * guardada aqui envelheceria em um unico arraste. Id nao envelhece.
 */
export class Selection {
  #ids = new Set<ObjectId>();
  #listeners = new Set<() => void>();

  get size(): number {
    return this.#ids.size;
  }

  get isEmpty(): boolean {
    return this.#ids.size === 0;
  }

  has(id: ObjectId): boolean {
    return this.#ids.has(id);
  }

  ids(): ObjectId[] {
    return [...this.#ids];
  }

  /** Objetos ainda existentes, na ordem de camadas. */
  objects(doc: Document): BoardObject[] {
    const out: BoardObject[] = [];
    for (const id of this.#ids) {
      const obj = doc.get(id);
      if (obj) out.push(obj);
    }
    out.sort((a, b) => (a.z < b.z ? -1 : a.z > b.z ? 1 : 0));
    return out;
  }

  set(ids: readonly ObjectId[]): void {
    if (sameSet(this.#ids, ids)) return;
    this.#ids = new Set(ids);
    this.#emit();
  }

  add(ids: readonly ObjectId[]): void {
    let changed = false;
    for (const id of ids) {
      if (!this.#ids.has(id)) {
        this.#ids.add(id);
        changed = true;
      }
    }
    if (changed) this.#emit();
  }

  remove(ids: readonly ObjectId[]): void {
    let changed = false;
    for (const id of ids) changed = this.#ids.delete(id) || changed;
    if (changed) this.#emit();
  }

  toggle(id: ObjectId): void {
    if (this.#ids.has(id)) this.#ids.delete(id);
    else this.#ids.add(id);
    this.#emit();
  }

  clear(): void {
    if (this.#ids.size === 0) return;
    this.#ids.clear();
    this.#emit();
  }

  /**
   * Descarta ids que nao existem mais no documento.
   *
   * Necessario porque desfazer uma exclusao e refazer nao passam pela selecao:
   * sem isso o quadro de manipulacao continuaria desenhado em volta de objetos
   * que ja sairam, e um arraste seguinte tentaria mover fantasmas.
   */
  prune(doc: Document): void {
    let changed = false;
    for (const id of this.#ids) {
      if (!doc.get(id)) {
        this.#ids.delete(id);
        changed = true;
      }
    }
    if (changed) this.#emit();
  }

  onChange(fn: () => void): () => void {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  #emit(): void {
    for (const fn of this.#listeners) fn();
  }
}

function sameSet(current: ReadonlySet<ObjectId>, next: readonly ObjectId[]): boolean {
  if (current.size !== next.length) return false;
  for (const id of next) {
    if (!current.has(id)) return false;
  }
  return true;
}
