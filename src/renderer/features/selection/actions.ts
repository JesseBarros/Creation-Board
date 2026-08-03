import { keyBetween } from '@shared/model/fractional';
import { createId } from '@shared/model/id';
import type {
  BoardObject,
  GroupObject,
  NoteObject,
  StrokeObject,
  TextObject,
} from '@shared/model/types';
import { AddObjects, RemoveObjects, Reorder, TransformObjects } from '../../commands';
import type { ObjectPatch } from '../../commands/patch';
import type { ToolContext } from '../../tools/types';

/**
 * Acoes sobre a selecao que nao dependem de arrastar nada.
 *
 * Ficam aqui, e nao dentro da ferramenta, porque tem tres pontos de entrada
 * diferentes -- teclado, menu de contexto e (na Fase 9) a barra de ferramentas.
 * Uma implementacao so evita que "Excluir" no menu se comporte diferente do
 * Delete no teclado.
 */

/** Deslocamento da copia, em px de TELA: visivel em qualquer nivel de zoom. */
const DUPLICATE_OFFSET_PX = 18;

/** Passo das setas do teclado, em unidades de mundo. */
const NUDGE_STEP = 1;
const NUDGE_STEP_FAST = 10;

export function selectAll(ctx: ToolContext): void {
  const ids: string[] = [];
  for (const o of ctx.doc.all()) {
    if (!o.locked && !o.hidden) ids.push(o.id);
  }
  ctx.selection.set(ids);
  ctx.invalidate();
}

export function deleteSelection(ctx: ToolContext): boolean {
  const ids = ctx.selection.objects(ctx.doc).filter((o) => !o.locked).map((o) => o.id);
  if (ids.length === 0) return false;

  ctx.history.push(new RemoveObjects(ctx.doc, ids));
  ctx.history.seal();
  ctx.selection.clear();
  ctx.markDirty();
  ctx.invalidate();
  return true;
}

export function duplicateSelection(ctx: ToolContext): boolean {
  const originals = ctx.selection.objects(ctx.doc);
  if (originals.length === 0) return false;

  const offset = DUPLICATE_OFFSET_PX / ctx.camera.zoom;
  let cursor = ctx.doc.topZ();
  const copies: BoardObject[] = [];
  for (const obj of originals) {
    cursor = keyBetween(cursor, null);
    copies.push(cloneObject(obj, cursor, offset, offset));
  }

  ctx.history.push(new AddObjects(ctx.doc, copies, rotulo('Duplicar', copies.length)));
  ctx.history.seal();
  // A copia fica selecionada no lugar do original: e ela que o usuario vai
  // arrastar em seguida, que e o motivo de ter duplicado.
  ctx.selection.set(copies.map((o) => o.id));
  ctx.markDirty();
  ctx.invalidate();
  return true;
}

export function nudgeSelection(ctx: ToolContext, dirX: number, dirY: number, fast: boolean): boolean {
  const objects = ctx.selection.objects(ctx.doc).filter((o) => !o.locked);
  if (objects.length === 0) return false;

  const step = fast ? NUDGE_STEP_FAST : NUDGE_STEP;
  const before = new Map<string, ObjectPatch>();
  const after = new Map<string, ObjectPatch>();
  for (const o of objects) {
    before.set(o.id, { transform: { ...o.transform } });
    after.set(o.id, {
      transform: { ...o.transform, x: o.transform.x + dirX * step, y: o.transform.y + dirY * step },
    });
  }

  // Sem `seal`: setas repetidas dentro da janela de fusao do History viram um
  // unico passo de undo, em vez de um passo por toque na tecla.
  ctx.history.push(new TransformObjects(ctx.doc, before, after, 'Mover'));
  ctx.markDirty();
  ctx.invalidate();
  return true;
}

export function reorderSelection(ctx: ToolContext, direction: 'front' | 'back'): boolean {
  const ids = ctx.selection.objects(ctx.doc).map((o) => o.id);
  if (ids.length === 0) return false;

  ctx.history.push(new Reorder(ctx.doc, ids, direction));
  ctx.history.seal();
  ctx.markDirty();
  ctx.invalidate();
  return true;
}

/**
 * Copia profunda de um objeto, com id e camada novos.
 *
 * A copia rasa nao serve: `points`, `content` e `children` sao referencias, e
 * compartilha-las faria editar a copia alterar o original -- e pior, o undo de
 * uma das duas restauraria o array que a outra ainda esta usando.
 */
function cloneObject(obj: BoardObject, z: string, dx: number, dy: number): BoardObject {
  const now = Date.now();
  const base = {
    ...obj,
    id: createId(),
    z,
    // A copia nasce fora de qualquer grupo: entrar no grupo do original exigiria
    // editar a lista de filhos dele. Sem efeito pratico hoje -- nao ha como
    // criar grupos ainda -- e o lugar certo de resolver e junto com o agrupar.
    parentId: null,
    transform: { ...obj.transform, x: obj.transform.x + dx, y: obj.transform.y + dy },
    bbox: { ...obj.bbox, x: obj.bbox.x + dx, y: obj.bbox.y + dy },
    rev: 0,
    createdAt: now,
    updatedAt: now,
  };

  switch (obj.type) {
    case 'stroke':
      return {
        ...(base as StrokeObject),
        points: [...obj.points],
        ...(obj.lod ? { lod: [...obj.lod] } : {}),
      };
    case 'text':
      return { ...(base as TextObject), content: obj.content.map((s) => ({ ...s })) };
    case 'note':
      return {
        ...(base as NoteObject),
        content: obj.content.map((s) => ({ ...s })),
        alert: obj.alert ? { ...obj.alert } : null,
      };
    case 'group':
      return { ...(base as GroupObject), children: [...obj.children] };
    case 'image':
      // `assetId` e compartilhado de proposito: as duas copias apontam para o
      // mesmo binario em assets/, e duplicar uma imagem nao duplica os bytes.
      return base as BoardObject;
    default:
      return base as BoardObject;
  }
}

function rotulo(acao: string, n: number): string {
  return n === 1 ? `${acao} objeto` : `${acao} ${n} objetos`;
}
