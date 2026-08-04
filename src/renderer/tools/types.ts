import type { Vec2 } from '@shared/geometry/vec2';
import type { Camera } from '../core/Camera';
import type { Document } from '../core/Document';
import type { History } from '../core/History';
import type { Selection } from '../core/Selection';

/**
 * Contrato de uma ferramenta.
 *
 * O que cada ferramenta recebe e um evento de ponteiro ja traduzido para
 * coordenadas de mundo -- nenhuma delas precisa saber que existe camera, DPR ou
 * retangulo do host.
 *
 * O botao ESQUERDO pertence as ferramentas. Direito e meio sao da navegacao
 * (ver input/ViewportInput.ts) e nunca chegam aqui. E essa fronteira que permite
 * arrastar o quadro no meio de um traco sem trocar de modo nem cortar o traco.
 */

export type ToolId = 'select' | 'pen' | 'highlighter' | 'pencil' | 'eraser';

/** Ferramentas que produzem tinta; as unicas com cor e espessura. */
export const DRAW_TOOLS = ['pen', 'highlighter', 'pencil'] as const;
export type DrawToolId = (typeof DRAW_TOOLS)[number];

export function isDrawTool(id: ToolId): id is DrawToolId {
  return (DRAW_TOOLS as readonly ToolId[]).includes(id);
}

export interface ToolPointer {
  /** Posicao em coordenadas de mundo. */
  world: Vec2;
  /** Posicao em px de tela, relativa ao canto do host. */
  screen: Vec2;
  /** Pressao da caneta, 0..1. Ver a normalizacao em ToolManager. */
  pressure: number;
  shift: boolean;
  alt: boolean;
  ctrl: boolean;
}

export interface ToolContext {
  readonly doc: Document;
  readonly camera: Camera;
  readonly selection: Selection;
  readonly history: History;
  /** Agenda um redesenho completo: fundo, objetos e overlay. */
  invalidate(): void;
  /**
   * Agenda um redesenho apenas do overlay.
   *
   * E o que mantem o desenho barato: um traco em andamento muda a cada
   * pointermove, mas nao muda nenhum objeto do documento. Passar por
   * `invalidate()` repintaria os 10 mil objetos da camada estatica a cada ponto.
   */
  invalidateOverlay(): void;
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
