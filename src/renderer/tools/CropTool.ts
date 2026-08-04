import type { Rect } from '@shared/geometry/rect';
import type { Vec2 } from '@shared/geometry/vec2';
import type { ImageObject, ObjectId } from '@shared/model/types';
import { PatchObjects } from '../commands';
import type { ObjectPatch } from '../commands/patch';
import type { Camera } from '../core/Camera';
import {
  computeFrame,
  frameToWorld,
  handleCursor,
  hitHandle,
  worldToFrame,
  type ScaleHandleId,
  type SelectionFrame,
} from '../features/selection/frame';
import { paintCropOverlay } from '../render/CropOverlay';
import { DRAG_THRESHOLD_PX, screenDistance, type Tool, type ToolContext, type ToolPointer } from './types';

/**
 * Recorte de imagem.
 *
 * Nao aparece na barra: entra pelo duplo clique numa imagem ou pelo menu de
 * contexto, e sai sozinha ao confirmar. E um MODO sobre um objeto, nao uma
 * ferramenta que se escolhe antes de saber no que vai usar.
 *
 * O recorte so aperta para DENTRO do que esta visivel. Deixar arrastar para fora
 * exigiria desenhar a imagem inteira alem das bordas do objeto -- com a imagem
 * escurecida por fora e o quadro por baixo aparecendo no meio -- para um ganho
 * que "Remover recorte" ja entrega: voltar ao original e recomecar.
 *
 * A composicao com um recorte anterior e feita no espaco NORMALIZADO do arquivo
 * (0..1), e nao em pixels: assim recortar duas vezes seguidas nao acumula erro
 * de arredondamento e nunca depende do tamanho em que a imagem esta no quadro.
 */
export class CropTool implements Tool {
  readonly id = 'crop' as const;

  #target: ImageObject | null = null;
  /** Retangulo do recorte em espaco LOCAL do objeto (0..w, 0..h). */
  #rect: Rect = { x: 0, y: 0, w: 0, h: 0 };

  #mode: 'idle' | 'pending' | 'resize' | 'move' = 'idle';
  #handle: ScaleHandleId | null = null;
  #startScreen: Vec2 = { x: 0, y: 0 };
  #startFrame: Vec2 = { x: 0, y: 0 };
  #startRect: Rect = { x: 0, y: 0, w: 0, h: 0 };

  constructor(private readonly ctx: ToolContext) {}

  /** Abre o recorte sobre uma imagem. Chamado pelo App, nao pela barra. */
  begin(obj: ImageObject): void {
    this.#target = obj;
    this.#rect = { x: 0, y: 0, w: obj.w, h: obj.h };
    this.#mode = 'idle';
    this.ctx.selection.set([obj.id]);
    this.ctx.invalidate();
  }

  get targetId(): ObjectId | null {
    return this.#target?.id ?? null;
  }

  // --------------------------------------------------------------- ponteiro

  onPointerDown(p: ToolPointer): void {
    const frame = this.#frame();
    if (!frame) return;

    this.#startScreen = p.screen;
    this.#startFrame = worldToFrame(frame, p.world.x, p.world.y);
    this.#startRect = { ...this.#rect };

    // `allowRotate: false` na chamada, entao 'rotate' nunca volta -- girar a
    // janela de recorte nao existe: quem gira e a imagem, e o recorte acompanha.
    const handle = hitHandle(this.#cropFrame(frame), p.world, this.ctx.camera.zoom, false);
    if (handle && handle !== 'rotate') {
      this.#handle = handle;
      this.#mode = 'pending';
      return;
    }

    // Dentro do recorte: arrasta a janela. Fora dele: confirma e sai, que e o
    // gesto natural de "terminei" -- o mesmo do editor de texto.
    const inside =
      this.#startFrame.x >= this.#rect.x &&
      this.#startFrame.x <= this.#rect.x + this.#rect.w &&
      this.#startFrame.y >= this.#rect.y &&
      this.#startFrame.y <= this.#rect.y + this.#rect.h;

    if (inside) {
      this.#handle = null;
      this.#mode = 'pending';
      return;
    }
    this.commit();
  }

  onPointerMove(p: ToolPointer): void {
    if (this.#mode === 'idle' || !this.#target) return;
    const frame = this.#frame();
    if (!frame) return;

    if (this.#mode === 'pending') {
      if (screenDistance(p.screen, this.#startScreen) < DRAG_THRESHOLD_PX) return;
      this.#mode = this.#handle ? 'resize' : 'move';
    }

    const now = worldToFrame(frame, p.world.x, p.world.y);
    const dx = now.x - this.#startFrame.x;
    const dy = now.y - this.#startFrame.y;

    this.#rect = this.#mode === 'move' ? this.#movedRect(dx, dy) : this.#resizedRect(dx, dy);
    this.ctx.invalidateOverlay();
  }

  onPointerUp(_p: ToolPointer): void {
    this.#mode = 'idle';
    this.#handle = null;
  }

  /** Enter confirma; ver App. */
  commit(): void {
    const obj = this.#target;
    if (!obj) return;

    const r = this.#rect;
    const current = this.ctx.doc.get(obj.id);
    this.#target = null;
    this.#mode = 'idle';

    // Recorte que nao mudou nada nao vira passo de undo.
    const untouched = near(r.x, 0) && near(r.y, 0) && near(r.w, obj.w) && near(r.h, obj.h);
    if (!current || current.type !== 'image' || untouched) {
      this.ctx.invalidate();
      return;
    }

    const before: ObjectPatch = {
      transform: { ...current.transform },
      w: current.w,
      h: current.h,
      crop: current.crop ?? null,
    };
    const after: ObjectPatch = {
      transform: shifted(current, r.x, r.y),
      w: r.w,
      h: r.h,
      crop: compose(current, r),
    };

    this.ctx.history.push(
      new PatchObjects(
        this.ctx.doc,
        new Map([[obj.id, before]]),
        new Map([[obj.id, after]]),
        'Recortar imagem',
      ),
    );
    this.ctx.history.seal();
    this.ctx.markDirty();
    this.ctx.invalidate();
  }

  cancel(): boolean {
    if (!this.#target) return false;
    this.#target = null;
    this.#mode = 'idle';
    this.ctx.invalidate();
    return true;
  }

  // -------------------------------------------------------------- geometria

  #frame(): SelectionFrame | null {
    const obj = this.#target ? this.ctx.doc.get(this.#target.id) : undefined;
    return obj ? computeFrame([obj]) : null;
  }

  /** O quadro do RECORTE (e nao o do objeto), onde ficam as alcas. */
  #cropFrame(frame: SelectionFrame): SelectionFrame {
    const origin = frameToWorld(frame, this.#rect.x, this.#rect.y);
    return { x: origin.x, y: origin.y, w: this.#rect.w, h: this.#rect.h, rotation: frame.rotation };
  }

  #movedRect(dx: number, dy: number): Rect {
    const obj = this.#target!;
    const r = this.#startRect;
    // A janela nao sai da imagem: arrastar contra a borda para, em vez de
    // revelar area vazia que nao existe no arquivo.
    return {
      x: clamp(r.x + dx, 0, obj.w - r.w),
      y: clamp(r.y + dy, 0, obj.h - r.h),
      w: r.w,
      h: r.h,
    };
  }

  #resizedRect(dx: number, dy: number): Rect {
    const obj = this.#target!;
    const r = this.#startRect;
    const h = this.#handle!;
    const west = h === 'nw' || h === 'w' || h === 'sw';
    const east = h === 'ne' || h === 'e' || h === 'se';
    const north = h === 'nw' || h === 'n' || h === 'ne';
    const south = h === 'sw' || h === 's' || h === 'se';

    let x0 = r.x;
    let y0 = r.y;
    let x1 = r.x + r.w;
    let y1 = r.y + r.h;

    if (west) x0 = clamp(x0 + dx, 0, x1 - MIN_SIZE);
    if (east) x1 = clamp(x1 + dx, x0 + MIN_SIZE, obj.w);
    if (north) y0 = clamp(y0 + dy, 0, y1 - MIN_SIZE);
    if (south) y1 = clamp(y1 + dy, y0 + MIN_SIZE, obj.h);

    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  // ---------------------------------------------------------------- visual

  cursorFor(p: ToolPointer): string {
    const frame = this.#frame();
    if (!frame) return 'default';
    const handle = hitHandle(this.#cropFrame(frame), p.world, this.ctx.camera.zoom, false);
    return handle ? handleCursor(handle, frame.rotation) : 'move';
  }

  paintOverlay(ctx: CanvasRenderingContext2D, camera: Camera): void {
    const frame = this.#frame();
    if (!frame) return;
    paintCropOverlay(ctx, camera, frame, this.#rect);
  }
}

/** Lado minimo do recorte, em unidades locais. */
const MIN_SIZE = 8;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function near(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.5;
}

/** Transform deslocado pelo canto do recorte, respeitando rotacao e escala. */
function shifted(obj: ImageObject, lx: number, ly: number): ImageObject['transform'] {
  const t = obj.transform;
  const cos = Math.cos(t.rotation);
  const sin = Math.sin(t.rotation);
  const px = lx * t.scaleX;
  const py = ly * t.scaleY;
  return { ...t, x: t.x + px * cos - py * sin, y: t.y + px * sin + py * cos };
}

/**
 * Novo recorte normalizado, composto com o que ja existia.
 *
 * Sem a composicao, recortar uma imagem ja recortada voltaria a medir sobre o
 * arquivo inteiro e o segundo corte pularia para outro pedaco da foto.
 */
function compose(obj: ImageObject, r: Rect): Rect {
  const base = obj.crop ?? { x: 0, y: 0, w: 1, h: 1 };
  return {
    x: base.x + (r.x / obj.w) * base.w,
    y: base.y + (r.y / obj.h) * base.h,
    w: (r.w / obj.w) * base.w,
    h: (r.h / obj.h) * base.h,
  };
}

/** Desfaz o recorte: devolve o arquivo inteiro e o tamanho proporcional. */
export function uncropPatch(obj: ImageObject): { before: ObjectPatch; after: ObjectPatch } | null {
  const crop = obj.crop;
  if (!crop || crop.w <= 0 || crop.h <= 0) return null;

  const w = obj.w / crop.w;
  const h = obj.h / crop.h;
  return {
    before: { transform: { ...obj.transform }, w: obj.w, h: obj.h, crop },
    after: {
      // O canto volta para onde estaria o canto da imagem inteira.
      transform: shifted(obj, -crop.x * w, -crop.y * h),
      w,
      h,
      crop: null,
    },
  };
}
