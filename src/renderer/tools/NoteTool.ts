import type { Vec2 } from '@shared/geometry/vec2';
import { computeBbox } from '@shared/model/bbox';
import { keyBetween } from '@shared/model/fractional';
import { createId } from '@shared/model/id';
import type { NoteObject } from '@shared/model/types';
import type { Camera } from '../core/Camera';
import { hitTest } from '../features/selection/hitTest';
import { snapPoint, type SnapGuide } from '../features/snapping/snap';
import { paintNote } from '../render/painters/text';
import { paintSnapGuides } from '../render/SnapGuides';
import { ALERT_ICONS, type DrawStyle } from './DrawStyle';
import {
  DRAG_THRESHOLD_PX,
  screenDistance,
  type Tool,
  type ToolContext,
  type ToolPointer,
} from './types';

/**
 * Post-it, com ou sem alerta.
 *
 * Clique solta um post-it de tamanho padrao e ja abre para escrever; arrastar
 * define o tamanho. A cor do papel e o nivel de alerta saem da barra lateral --
 * e os mesmos botoes reestilizam um post-it que ja esteja selecionado, para nao
 * existirem dois lugares diferentes de escolher a mesma coisa.
 *
 * Diferente da caixa de texto, o post-it tem tamanho PROPRIO e nao cresce com o
 * conteudo: ele e um papel, e um papel cheio demais e sinal de que o assunto
 * merecia outro lugar. O texto que nao couber fica escondido, nao vaza.
 */
export class NoteTool implements Tool {
  readonly id = 'note' as const;

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
    if (hit && (hit.type === 'note' || hit.type === 'text')) {
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

    const dragged = this.#mode === 'drawing';
    const draft = dragged ? this.#draftFromDrag() : this.#draft(this.#start.x, this.#start.y, DEFAULT_SIZE, DEFAULT_SIZE);
    this.#reset();
    this.ctx.beginEdit(draft, { isNew: true });
  }

  cancel(): boolean {
    if (this.#mode === 'idle') return false;
    this.#reset();
    this.ctx.invalidate();
    return true;
  }

  cursorFor(): string {
    return 'crosshair';
  }

  paintOverlay(ctx: CanvasRenderingContext2D, camera: Camera): void {
    if (this.#mode === 'drawing') {
      const preview = this.#draftFromDrag();
      const origin = camera.worldToScreen({ x: preview.transform.x, y: preview.transform.y });
      ctx.save();
      // O proprio painter desenha a previa, como nas formas: e o que garante que
      // o que se ve durante o gesto e o que vai ficar no quadro.
      ctx.translate(origin.x, origin.y);
      ctx.scale(camera.zoom, camera.zoom);
      ctx.globalAlpha = 0.75;
      paintNote(preview, {
        ctx,
        zoom: camera.zoom,
        lod: 'full',
        deviceScale: camera.zoom,
        objectScale: 1,
        adapt: this.ctx.adapt,
      });
      ctx.restore();
    }
    paintSnapGuides(ctx, camera, this.#guides);
  }

  // ------------------------------------------------------------------ interno

  #draftFromDrag(): NoteObject {
    const { x: sx, y: sy } = this.#start;
    const { x: ex, y: ey } = this.#end;
    return this.#draft(
      Math.min(sx, ex),
      Math.min(sy, ey),
      Math.max(MIN_SIZE, Math.abs(ex - sx)),
      Math.max(MIN_SIZE, Math.abs(ey - sy)),
    );
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

  #draft(x: number, y: number, w: number, h: number): NoteObject {
    const now = Date.now();
    const level = this.style.noteAlert;
    const obj: NoteObject = {
      id: createId(),
      type: 'note',
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
      h,
      bg: this.style.noteBg,
      content: [],
      alert: level ? { level, icon: ALERT_ICONS[level] } : null,
      pinned: false,
    };
    obj.bbox = computeBbox(obj);
    return obj;
  }

  #reset(): void {
    this.#mode = 'idle';
    this.#guides = [];
  }
}

/** Lado do post-it criado com um clique, em unidades de mundo. */
const DEFAULT_SIZE = 180;
const MIN_SIZE = 60;

const EMPTY_SET: ReadonlySet<string> = new Set();
