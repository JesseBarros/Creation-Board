import type { Rect } from '@shared/geometry/rect';
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
  /**
   * Recorte da imagem, normalizado 0..1 sobre o arquivo original.
   * `null` remove o recorte. Anda junto de `w`/`h` e do `transform`: recortar
   * muda o pedaco visivel E o retangulo que ele ocupa no quadro.
   */
  crop?: Rect | null;
  /**
   * Cadeado e olho do painel de camadas (M8).
   *
   * Entram aqui, e nao num comando proprio, porque `PatchObjects` ja e o comando
   * generico de mudanca de campo -- e com isso travar e esconder ganham undo,
   * agrupamento e notificacao de graca. Um `ToggleLock` separado seria um
   * terceiro caminho fazendo o mesmo que os outros dois.
   */
  locked?: boolean;
  hidden?: boolean;
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
  if (fields.crop !== undefined && obj.type === 'image') out.crop = obj.crop ?? null;
  if (fields.locked !== undefined) out.locked = obj.locked;
  if (fields.hidden !== undefined) out.hidden = obj.hidden;
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
      crop?: Rect | undefined;
    };
    if (patch.transform) next.transform = { ...patch.transform };
    if (patch.w !== undefined && 'w' in obj) next.w = patch.w;
    if (patch.h !== undefined && 'h' in obj) next.h = patch.h;
    if (patch.z !== undefined) next.z = patch.z;
    if (patch.content !== undefined && 'content' in obj) next.content = [...patch.content];
    if (patch.list !== undefined && obj.type === 'text') next.list = patch.list;
    // `null` no patch significa "sem recorte", e o campo do objeto e opcional:
    // guardar o null cru deixaria `crop` presente e falso ao mesmo tempo.
    if (patch.crop !== undefined && obj.type === 'image') {
      next.crop = patch.crop === null ? undefined : { ...patch.crop };
    }
    if (patch.locked !== undefined) next.locked = patch.locked;
    if (patch.hidden !== undefined) next.hidden = patch.hidden;

    next.rev = obj.rev + 1;
    next.updatedAt = now;
    next.bbox = computeBbox(next);
    updated.push(next);
  }

  doc.replaceMany(updated);
}
