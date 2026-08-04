import type { Rect } from '@shared/geometry/rect';
import type { Vec2 } from '@shared/geometry/vec2';
import { computeBbox } from '@shared/model/bbox';
import { keyBetween } from '@shared/model/fractional';
import { createId } from '@shared/model/id';
import type { TextObject } from '@shared/model/types';
import type { Camera } from '../core/Camera';
import { hitTest } from '../features/selection/hitTest';
import { snapPoint, type SnapGuide } from '../features/snapping/snap';
import { contentHeight } from '../render/text/layout';
import { paintSnapGuides } from '../render/SnapGuides';
import type { DrawStyle } from './DrawStyle';
import {
  DRAG_THRESHOLD_PX,
  screenDistance,
  type Tool,
  type ToolContext,
  type ToolPointer,
} from './types';

/**
 * Caixa de texto.
 *
 * Dois gestos, os mesmos que qualquer editor de quadro usa:
 *   - clique      -> caixa de largura padrao, que cresce em altura conforme se
 *                    escreve;
 *   - arrastar    -> a largura vira a do arraste, e a quebra de linha acompanha.
 *
 * Clicar SOBRE uma caixa que ja existe abre ela para edicao em vez de criar
 * outra por cima -- que e o erro que este gesto cometeria com mais frequencia,
 * ja que a mira do texto e justamente onde ha texto.
 *
 * A caixa criada so entra no documento se receber conteudo: ver TextEditor.
 */
export class TextTool implements Tool {
  readonly id = 'text' as const;

  #mode: 'idle' | 'pending' | 'drawing' = 'idle';
  #startScreen: Vec2 = { x: 0, y: 0 };
  #start: Vec2 = { x: 0, y: 0 };
  #end: Vec2 = { x: 0, y: 0 };
  #guides: SnapGuide[] = [];

  constructor(
    private readonly ctx: ToolContext,
    private readonly style: DrawStyle,
  ) {}

  onPointerDown(p: ToolPointer): void {
    const hit = hitTest(this.ctx.doc, p.world, this.ctx.camera.zoom);
    if (hit && (hit.type === 'text' || hit.type === 'note')) {
      this.#mode = 'idle';
      this.ctx.beginEdit(hit);
      return;
    }

    this.#mode = 'pending';
    this.#startScreen = p.screen;
    this.#start = this.#snap(p.world, p.ctrl);
    this.#end = this.#start;
  }

  onPointerMove(p: ToolPointer): void {
    if (this.#mode === 'idle') return;
    if (this.#mode === 'pending') {
      if (screenDistance(p.screen, this.#startScreen) < DRAG_THRESHOLD_PX) return;
      this.#mode = 'drawing';
    }
    this.#end = this.#snap(p.world, p.ctrl);
    this.ctx.invalidateOverlay();
  }

  onPointerUp(p: ToolPointer): void {
    if (this.#mode === 'idle') return;
    if (this.#mode === 'drawing') this.#end = this.#snap(p.world, p.ctrl);

    const rect = this.#rect();
    const dragged = this.#mode === 'drawing';
    this.#reset();

    const width = dragged ? Math.max(MIN_WIDTH, rect.w) : DEFAULT_WIDTH;
    this.ctx.beginEdit(this.#draft(rect.x, rect.y, width), { isNew: true });
  }

  cancel(): boolean {
    if (this.#mode === 'idle') return false;
    this.#reset();
    this.ctx.invalidate();
    return true;
  }

  cursorFor(): string {
    return 'text';
  }

  paintOverlay(ctx: CanvasRenderingContext2D, camera: Camera): void {
    if (this.#mode === 'drawing') {
      const r = this.#rect();
      const a = camera.worldToScreen({ x: r.x, y: r.y });
      const b = camera.worldToScreen({ x: r.x + r.w, y: r.y + r.h });
      ctx.save();
      ctx.strokeStyle = '#3b6ff0';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 3]);
      // So a largura importa: a altura da caixa sai do texto, entao o retangulo
      // mostra a coluna que esta sendo definida e nao promete uma altura fixa.
      ctx.strokeRect(a.x + 0.5, a.y + 0.5, b.x - a.x, Math.max(12, b.y - a.y));
      ctx.restore();
    }
    paintSnapGuides(ctx, camera, this.#guides);
  }

  // ------------------------------------------------------------------ interno

  #rect(): Rect {
    const { x: sx, y: sy } = this.#start;
    const { x: ex, y: ey } = this.#end;
    return {
      x: Math.min(sx, ex),
      y: Math.min(sy, ey),
      w: Math.abs(ex - sx),
      h: Math.abs(ey - sy),
    };
  }

  #snap(world: Vec2, ctrl: boolean): Vec2 {
    if (ctrl) {
      this.#guides = [];
      return world;
    }
    const s = snapPoint(world.x, world.y, {
      doc: this.ctx.doc,
      zoom: this.ctx.camera.zoom,
      exclude: EMPTY_SET,
      snapToGrid: this.ctx.doc.prefs.snapToGrid,
      gridSize: this.ctx.doc.prefs.grid.size,
    });
    this.#guides = s.guides;
    return { x: world.x + s.dx, y: world.y + s.dy };
  }

  #draft(x: number, y: number, w: number): TextObject {
    const now = Date.now();
    const fontSize = this.style.width('text');
    const obj: TextObject = {
      id: createId(),
      type: 'text',
      parentId: null,
      z: keyBetween(this.ctx.doc.topZ(), null),
      transform: { x, y, rotation: 0, scaleX: 1, scaleY: 1 },
      bbox: { x: 0, y: 0, w: 0, h: 0 },
      opacity: 1,
      locked: false,
      hidden: false,
      rev: 0,
      createdAt: now,
      updatedAt: now,
      w,
      h: 0,
      autoHeight: true,
      content: [],
      fontFamily: TEXT_FONT_FAMILY,
      fontSize,
      lineHeight: TEXT_LINE_HEIGHT,
      align: 'left',
      color: this.style.color('text'),
      list: 'none',
    };
    // Altura de uma linha vazia, medida pelo mesmo layout que vai desenhar:
    // e ela que da a caixa do cursor antes da primeira letra.
    obj.h = contentHeight([], {
      width: w,
      fontSize,
      fontFamily: TEXT_FONT_FAMILY,
      lineHeight: TEXT_LINE_HEIGHT,
      align: 'left',
      list: 'none',
    });
    obj.bbox = computeBbox(obj);
    return obj;
  }

  #reset(): void {
    this.#mode = 'idle';
    this.#guides = [];
  }
}

/** Largura da caixa criada com um clique, em unidades de mundo. */
const DEFAULT_WIDTH = 320;
/** Abaixo disto a coluna nao comporta nem uma palavra media. */
const MIN_WIDTH = 40;

export const TEXT_FONT_FAMILY = "'Segoe UI', sans-serif";
export const TEXT_LINE_HEIGHT = 1.35;

const EMPTY_SET: ReadonlySet<string> = new Set();
