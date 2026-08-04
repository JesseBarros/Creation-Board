import { computeBbox } from '@shared/model/bbox';
import type { BoardObject, ObjectId, RichSpan, Transform } from '@shared/model/types';
import type { Document } from '../core/Document';

/**
 * Campos que uma manipulacao pode alterar num objeto.
 *
 * Estreito de proposito: mover, redimensionar, rotacionar, reordenar e editar
 * texto cobrem tudo que as ferramentas fazem hoje. Os pontos de um traco ficam
 * de fora porque nada os edita depois de criados -- a borracha apaga o objeto
 * inteiro.
 *
 * `content` anda junto de `h`: mudar o texto muda a altura da caixa, e um patch
 * que trocasse so um dos dois deixaria o AABB mentindo sobre o objeto.
 */
export interface ObjectPatch {
  transform?: Transform;
  w?: number;
  h?: number;
  z?: string;
  content?: readonly RichSpan[];
  /** Marcadores de lista da caixa de texto -- muda o recuo e, com ele, a altura. */
  list?: 'none' | 'bullet';
}

/** Le do objeto os campos que um patch tocaria, para poder desfazer depois. */
export function snapshotPatch(obj: BoardObject, fields: ObjectPatch): ObjectPatch {
  const out: ObjectPatch = {};
  if (fields.transform !== undefined) out.transform = { ...obj.transform };
  if (fields.w !== undefined && 'w' in obj) out.w = obj.w;
  if (fields.h !== undefined && 'h' in obj) out.h = obj.h;
  if (fields.z !== undefined) out.z = obj.z;
  if (fields.content !== undefined && 'content' in obj) out.content = obj.content;
  if (fields.list !== undefined && obj.type === 'text') out.list = obj.list;
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

    const next = { ...obj } as BoardObject & {
      w?: number;
      h?: number;
      content?: RichSpan[];
      list?: 'none' | 'bullet';
    };
    if (patch.transform) next.transform = { ...patch.transform };
    if (patch.w !== undefined && 'w' in obj) next.w = patch.w;
    if (patch.h !== undefined && 'h' in obj) next.h = patch.h;
    if (patch.z !== undefined) next.z = patch.z;
    if (patch.content !== undefined && 'content' in obj) next.content = [...patch.content];
    if (patch.list !== undefined && obj.type === 'text') next.list = patch.list;

    next.rev = obj.rev + 1;
    next.updatedAt = now;
    next.bbox = computeBbox(next);
    updated.push(next);
  }

  doc.replaceMany(updated);
}
