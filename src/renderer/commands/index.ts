import { keyBetween } from '@shared/model/fractional';
import type { BoardObject, ObjectId } from '@shared/model/types';
import type { Command } from '../core/History';
import type { Document } from '../core/Document';
import { applyPatches, type ObjectPatch } from './patch';

/** Insere objetos novos. */
export class AddObjects implements Command {
  readonly label: string;

  constructor(
    private readonly doc: Document,
    private readonly objects: readonly BoardObject[],
    label?: string,
  ) {
    this.label = label ?? (objects.length === 1 ? 'Adicionar objeto' : `Adicionar ${objects.length} objetos`);
  }

  apply(): void {
    this.doc.add(this.objects);
  }

  revert(): void {
    this.doc.remove(this.objects.map((o) => o.id));
  }
}

/**
 * Remove objetos.
 *
 * Guarda os objetos inteiros, e nao apenas os ids: desfazer precisa recria-los
 * exatamente como estavam, incluindo a camada `z`, para o quadro voltar ao
 * estado anterior e nao apenas "parecido".
 */
export class RemoveObjects implements Command {
  readonly label: string;
  #removed: BoardObject[] = [];

  constructor(
    private readonly doc: Document,
    private readonly ids: readonly ObjectId[],
  ) {
    this.label = ids.length === 1 ? 'Excluir objeto' : `Excluir ${ids.length} objetos`;
  }

  apply(): void {
    this.#removed = this.ids
      .map((id) => this.doc.get(id))
      .filter((o): o is BoardObject => o !== undefined);
    this.doc.remove(this.ids);
  }

  revert(): void {
    this.doc.add(this.#removed);
  }
}

/**
 * Apaga objetos que ja sairam do documento durante o gesto.
 *
 * Existe porque `RemoveObjects` captura os objetos dentro do proprio `apply()`,
 * e a borracha nao pode esperar por isso: ela precisa apagar enquanto o usuario
 * arrasta, senao o traço so sumiria ao soltar o botao. Quando o gesto termina os
 * objetos ja nao estao no documento, a captura tardia viria vazia e desfazer nao
 * devolveria nada. Aqui os objetos chegam prontos, capturados por quem apagou.
 *
 * `apply()` e idempotente de proposito: no push inicial ele reexecuta uma
 * remocao que ja aconteceu, e `Document.remove` ignora id inexistente.
 */
export class EraseObjects implements Command {
  readonly label: string;

  constructor(
    private readonly doc: Document,
    private readonly objects: readonly BoardObject[],
  ) {
    this.label = objects.length === 1 ? 'Apagar' : `Apagar ${objects.length} objetos`;
  }

  apply(): void {
    this.doc.remove(this.objects.map((o) => o.id));
  }

  revert(): void {
    this.doc.add(this.objects);
  }
}

/**
 * Mover, redimensionar ou rotacionar.
 *
 * Funde-se com o comando seguinte enquanto o arraste esta em curso: sem isso,
 * arrastar uma imagem por dois segundos criaria ~120 passos de undo e desfazer
 * viraria inutil.
 */
export class TransformObjects implements Command {
  constructor(
    private readonly doc: Document,
    private readonly before: Map<ObjectId, ObjectPatch>,
    private after: Map<ObjectId, ObjectPatch>,
    readonly label = 'Mover',
  ) {}

  apply(): void {
    applyPatches(this.doc, this.after);
  }

  revert(): void {
    applyPatches(this.doc, this.before);
  }

  merge(next: Command): boolean {
    if (!(next instanceof TransformObjects)) return false;
    if (next.label !== this.label) return false;
    // Precisa ser exatamente o mesmo conjunto de objetos, senao a fusao
    // perderia o estado anterior de quem entrou ou saiu da selecao.
    if (next.before.size !== this.before.size) return false;
    for (const id of next.before.keys()) {
      if (!this.before.has(id)) return false;
    }
    // Mantem o `before` original e adota o `after` mais recente.
    this.after = next.after;
    return true;
  }
}

/** Traz para frente ou envia para tras, reescrevendo apenas o `z` dos alvos. */
export class Reorder implements Command {
  readonly label: string;
  #before = new Map<ObjectId, ObjectPatch>();
  #after = new Map<ObjectId, ObjectPatch>();

  constructor(
    private readonly doc: Document,
    private readonly ids: readonly ObjectId[],
    private readonly direction: 'front' | 'back',
  ) {
    this.label = direction === 'front' ? 'Trazer para frente' : 'Enviar para tras';
  }

  apply(): void {
    if (this.#after.size === 0) this.#plan();
    applyPatches(this.doc, this.#after);
  }

  revert(): void {
    applyPatches(this.doc, this.#before);
  }

  #plan(): void {
    // Ordena os alvos pela camada atual para preservar a ordem relativa entre
    // eles depois do salto.
    const targets = this.ids
      .map((id) => this.doc.get(id))
      .filter((o): o is BoardObject => o !== undefined)
      .sort((a, b) => (a.z < b.z ? -1 : a.z > b.z ? 1 : 0));

    if (targets.length === 0) return;

    if (this.direction === 'front') {
      let cursor = this.doc.topZ();
      for (const obj of targets) {
        this.#before.set(obj.id, { z: obj.z });
        cursor = keyBetween(cursor, null);
        this.#after.set(obj.id, { z: cursor });
      }
    } else {
      // Para tras: gera chaves abaixo da menor existente, na ordem inversa.
      let cursor = this.doc.bottomZ();
      for (const obj of [...targets].reverse()) {
        this.#before.set(obj.id, { z: obj.z });
        cursor = keyBetween('', cursor);
        this.#after.set(obj.id, { z: cursor });
      }
    }
  }
}

export { applyPatches, snapshotPatch } from './patch';
export type { ObjectPatch } from './patch';
