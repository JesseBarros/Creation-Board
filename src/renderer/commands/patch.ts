import { computeBbox } from '@shared/model/bbox';
import type { BoardObject, ObjectId, Transform } from '@shared/model/types';
import type { Document } from '../core/Document';

/**
 * Campos que uma manipulacao pode alterar num objeto.
 *
 * Deliberadamente estreito: mover, redimensionar, rotacionar e reordenar cobrem
 * tudo que a ferramenta de selecao faz. Edicoes de conteudo (texto, pontos de
 * traco) terao comandos proprios, porque precisam guardar deltas diferentes.
 */
export interface ObjectPatch {
  transform?: Transform;
  w?: number;
  h?: number;
  z?: string;
}

/** Le do objeto os campos que um patch tocaria, para poder desfazer depois. */
export function snapshotPatch(obj: BoardObject, fields: ObjectPatch): ObjectPatch {
  const out: ObjectPatch = {};
  if (fields.transform !== undefined) out.transform = { ...obj.transform };
  if (fields.w !== undefined && 'w' in obj) out.w = obj.w;
  if (fields.h !== undefined && 'h' in obj) out.h = obj.h;
  if (fields.z !== undefined) out.z = obj.z;
  return out;
}

/**
 * Aplica patches a varios objetos numa unica notificacao.
 *
 * O `bbox` e sempre recalculado aqui, e `rev` sempre incrementado: o primeiro
 * mantem o indice espacial honesto, o segundo invalida qualquer bitmap em cache
 * do objeto.
 */
export function applyPatches(
  doc: Document,
  patches: ReadonlyMap<ObjectId, ObjectPatch>,
): void {
  const updated: BoardObject[] = [];
  const now = Date.now();

  for (const [id, patch] of patches) {
    const obj = doc.get(id);
    if (!obj) continue;

    const next = { ...obj } as BoardObject & { w?: number; h?: number };
    if (patch.transform) next.transform = { ...patch.transform };
    if (patch.w !== undefined && 'w' in obj) next.w = patch.w;
    if (patch.h !== undefined && 'h' in obj) next.h = patch.h;
    if (patch.z !== undefined) next.z = patch.z;

    next.rev = obj.rev + 1;
    next.updatedAt = now;
    next.bbox = computeBbox(next);
    updated.push(next);
  }

  doc.replaceMany(updated);
}
