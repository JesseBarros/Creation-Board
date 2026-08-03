import type { Vec2 } from '@shared/geometry/vec2';
import type { Camera } from '../core/Camera';
import type { Document } from '../core/Document';
import type { History } from '../core/History';
import type { Selection } from '../core/Selection';

/**
 * Contrato de uma ferramenta.
 *
 * A Fase 3 tem uma so (selecao), mas a interface ja e a que a caneta, a borracha
 * e as formas vao usar. O que cada ferramenta recebe e um evento de ponteiro ja
 * traduzido para coordenadas de mundo -- nenhuma delas precisa saber que existe
 * camera, DPR ou retangulo do host.
 *
 * O botao ESQUERDO pertence as ferramentas. Direito e meio sao da navegacao
 * (ver input/ViewportInput.ts) e nunca chegam aqui.
 */

export type ToolId = 'select';

export interface ToolPointer {
  /** Posicao em coordenadas de mundo. */
  world: Vec2;
  /** Posicao em px de tela, relativa ao canto do host. */
  screen: Vec2;
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
}

export interface ToolContext {
  readonly doc: Document;
  readonly camera: Camera;
  readonly selection: Selection;
  readonly history: History;
  /** Agenda um redesenho. Necessario para mudancas que so afetam o overlay. */
  invalidate(): void;
  /** Sinaliza que o quadro passou a ter alteracoes nao gravadas. */
  markDirty(): void;
}

export interface Tool {
  readonly id: ToolId;

  onPointerDown(p: ToolPointer): void;
  onPointerMove(p: ToolPointer): void;
  onPointerUp(p: ToolPointer): void;

  /** Cursor apropriado para a posicao atual, fora de qualquer gesto. */
  cursorFor(p: ToolPointer): string;

  paintOverlay(ctx: CanvasRenderingContext2D, camera: Camera): void;

  /** Aborta o gesto em curso (Esc, perda de foco). true se havia um. */
  cancel(): boolean;
}

/** Deslocamento em px de tela a partir do qual um clique vira arraste. */
export const DRAG_THRESHOLD_PX = 3;

export function screenDistance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
