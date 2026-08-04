import { keyBetween } from '@shared/model/fractional';
import type { AlertLevel, BoardObject, NoteObject, ObjectId } from '@shared/model/types';
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

/**
 * Uma sessao de edicao de texto inteira, em um passo de undo.
 *
 * O delta e o conteudo mais a altura: com `autoHeight` a caixa cresce enquanto
 * se digita, e desfazer precisa devolver as duas coisas juntas -- restaurar so
 * o texto deixaria uma caixa alta com duas palavras dentro.
 *
 * Nao se funde com o comando seguinte de proposito: uma sessao de edicao ja
 * comeca e termina em pontos claros (entrar e sair da caixa), e fundir duas
 * faria Ctrl+Z pular o conteudo de duas caixas de uma vez.
 */
export class EditText implements Command {
  constructor(
    private readonly doc: Document,
    private readonly before: ReadonlyMap<ObjectId, ObjectPatch>,
    private readonly after: ReadonlyMap<ObjectId, ObjectPatch>,
    readonly label = 'Editar texto',
  ) {}

  apply(): void {
    applyPatches(this.doc, this.after);
  }

  revert(): void {
    applyPatches(this.doc, this.before);
  }
}

/** O que se pode trocar num post-it sem mexer no conteudo nem na geometria. */
export interface NoteStyle {
  bg?: string;
  alert?: { level: AlertLevel; icon: string } | null;
  pinned?: boolean;
}

/**
 * Cor do papel, nivel de alerta e fixar/desafixar.
 *
 * Nao passa por `ObjectPatch` porque nada disto e geometria: o AABB nao muda, e
 * alargar o patch de manipulacao com campos de um unico tipo de objeto o faria
 * deixar de ser o contrato estreito que ele e. Guarda os objetos inteiros de
 * antes, que e o que permite reverter os tres campos de uma vez.
 */
export class RestyleNotes implements Command {
  readonly label: string;
  #before: NoteObject[] = [];

  constructor(
    private readonly doc: Document,
    private readonly ids: readonly ObjectId[],
    private readonly style: NoteStyle,
    label?: string,
  ) {
    this.label = label ?? 'Alterar post-it';
  }

  apply(): void {
    const next: NoteObject[] = [];
    // A captura acontece so na primeira aplicacao: no redo os objetos ja estao
    // com o valor novo, e recapturar aqui perderia o estado original.
    const capture = this.#before.length === 0;

    for (const id of this.ids) {
      const obj = this.doc.get(id);
      if (!obj || obj.type !== 'note') continue;
      if (capture) this.#before.push({ ...obj });
      next.push({
        ...obj,
        ...(this.style.bg !== undefined ? { bg: this.style.bg } : {}),
        ...(this.style.alert !== undefined ? { alert: this.style.alert } : {}),
        ...(this.style.pinned !== undefined ? { pinned: this.style.pinned } : {}),
        rev: obj.rev + 1,
        updatedAt: Date.now(),
      });
    }
    this.doc.replaceMany(next);
  }

  revert(): void {
    // `rev` sempre anda para frente, mesmo desfazendo: ele e o que invalida
    // caches por objeto, e voltar o numero deixaria um desenho velho valendo.
    this.doc.replaceMany(
      this.#before.map((o) => ({ ...o, rev: (this.doc.get(o.id)?.rev ?? o.rev) + 1 })),
    );
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
