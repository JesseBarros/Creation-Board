import type { Rect } from '@shared/geometry/rect';
import type { Vec2 } from '@shared/geometry/vec2';
import { computeBbox } from '@shared/model/bbox';
import { keyBetween } from '@shared/model/fractional';
import { createId } from '@shared/model/id';
import type { ShapeKind, ShapeObject } from '@shared/model/types';
import { AddObjects } from '../commands';
import type { Camera } from '../core/Camera';
import { snapPoint, type SnapGuide } from '../features/snapping/snap';
import { paintShape } from '../render/painters/shape';
import { paintSnapGuides } from '../render/SnapGuides';
import type { DrawStyle } from './DrawStyle';
import { DRAG_THRESHOLD_PX, screenDistance, type Tool, type ToolContext, type ToolPointer } from './types';

/**
 * Formas geometricas: retangulo, elipse, triangulo, losango, linha e seta.
 *
 * Uma ferramenta so para as seis, com o tipo escolhido na barra. Seis botoes de
 * ferramenta para o que e a mesma interacao -- arrastar de um canto ao outro --
 * encheriam a barra sem ensinar nada.
 *
 * Modificadores, os mesmos que a selecao ja usa para nao inventar vocabulario:
 *   Shift  -> proporcao travada (quadrado, circulo) ou angulo de 15 em 15 na linha
 *   Alt    -> desenha a partir do centro
 *   Ctrl   -> ignora o encaixe
 */
export class ShapeTool implements Tool {
  readonly id = 'shape' as const;

  #mode: 'idle' | 'pending' | 'drawing' = 'idle';
  #startScreen: Vec2 = { x: 0, y: 0 };
  #start: Vec2 = { x: 0, y: 0 };
  #end: Vec2 = { x: 0, y: 0 };
  #guides: SnapGuide[] = [];
  /** Modificadores do ultimo evento; `#build` os consulta ao fechar o gesto. */
  #shift = false;
  #alt = false;

  constructor(
    private readonly ctx: ToolContext,
    private readonly style: DrawStyle,
  ) {}

  // --------------------------------------------------------------- ponteiro

  onPointerDown(p: ToolPointer): void {
    this.#mode = 'pending';
    this.#startScreen = p.screen;
    this.#start = p.world;
    this.#end = p.world;
    this.#guides = [];
  }

  onPointerMove(p: ToolPointer): void {
    if (this.#mode === 'idle') return;
    this.#shift = p.shift;
    this.#alt = p.alt;
    if (this.#mode === 'pending') {
      // Abaixo do limiar ainda e um clique. Sem isto, encostar o mouse no quadro
      // deixaria uma forma de tamanho zero para tras a cada clique perdido.
      if (screenDistance(p.screen, this.#startScreen) < DRAG_THRESHOLD_PX) return;
      this.#mode = 'drawing';
    }

    this.#end = this.#resolveEnd(p);
    this.ctx.invalidateOverlay();
  }

  onPointerUp(p: ToolPointer): void {
    if (this.#mode !== 'drawing') {
      this.#reset();
      return;
    }
    this.#shift = p.shift;
    this.#alt = p.alt;
    this.#end = this.#resolveEnd(p);

    const shape = this.#build();
    this.#reset();
    if (!shape) {
      this.ctx.invalidate();
      return;
    }

    this.ctx.history.push(new AddObjects(this.ctx.doc, [shape], 'Inserir forma'));
    this.ctx.history.seal();
    this.ctx.markDirty();
    this.ctx.invalidate();
  }

  cancel(): boolean {
    if (this.#mode === 'idle') return false;
    this.#reset();
    this.ctx.invalidate();
    return true;
  }

  // ---------------------------------------------------------------- geometria

  /** Ponto final depois dos modificadores e do encaixe. */
  #resolveEnd(p: ToolPointer): Vec2 {
    const open = isOpen(this.style.shapeKind);
    let end = { x: p.world.x, y: p.world.y };

    if (p.shift) {
      end = open ? constrainAngle(this.#start, end) : constrainSquare(this.#start, end);
    }

    // O encaixe age no canto que esta sendo arrastado, que e o unico ponto que o
    // usuario esta mirando. Ctrl desliga -- para encostar duas formas de
    // proposito sem a guia empurrar uma delas.
    if (!p.ctrl && !p.shift) {
      const s = snapPoint(end.x, end.y, {
        doc: this.ctx.doc,
        zoom: this.ctx.camera.zoom,
        exclude: EMPTY_SET,
        snapToGrid: this.ctx.doc.prefs.snapToGrid,
        gridSize: this.ctx.doc.prefs.grid.size,
      });
      end = { x: end.x + s.dx, y: end.y + s.dy };
      this.#guides = s.guides;
    } else {
      this.#guides = [];
    }

    return end;
  }

  /**
   * Retangulo do gesto. Com Alt o ponto inicial vira o CENTRO: o retangulo
   * cresce para os dois lados, que e como se desenha um circulo em volta de algo
   * que ja esta no quadro.
   */
  #rect(alt: boolean): Rect {
    const { x: sx, y: sy } = this.#start;
    const { x: ex, y: ey } = this.#end;
    if (!alt) {
      return { x: Math.min(sx, ex), y: Math.min(sy, ey), w: Math.abs(ex - sx), h: Math.abs(ey - sy) };
    }
    const w = Math.abs(ex - sx);
    const h = Math.abs(ey - sy);
    return { x: sx - w, y: sy - h, w: w * 2, h: h * 2 };
  }

  #build(): ShapeObject | null {
    const kind = this.#effectiveKind();
    const open = isOpen(kind);
    const strokeWidth = this.style.width('shape');
    const color = this.style.color('shape');
    const now = Date.now();

    // Linha e seta guardam a DIRECAO em w/h (o painter vai de 0,0 ate w,h), entao
    // elas nao podem ser normalizadas para o canto superior esquerdo como as
    // formas fechadas -- isso viraria uma seta apontando sempre para baixo.
    const transform = open
      ? { x: this.#start.x, y: this.#start.y, rotation: 0, scaleX: 1, scaleY: 1 }
      : (() => {
          const r = this.#rect(this.#alt);
          return { x: r.x, y: r.y, rotation: 0, scaleX: 1, scaleY: 1 };
        })();

    let w: number;
    let h: number;
    if (open) {
      w = this.#end.x - this.#start.x;
      h = this.#end.y - this.#start.y;
    } else {
      const r = this.#rect(this.#alt);
      w = r.w;
      h = r.h;
    }

    // Gesto degenerado: um arraste que nao chegou a formar area (ou comprimento)
    // produziria um objeto invisivel e inclicavel no meio do quadro.
    if (open ? Math.hypot(w, h) < MIN_SIZE : w < MIN_SIZE || h < MIN_SIZE) return null;

    const shape: ShapeObject = {
      id: createId(),
      type: 'shape',
      kind,
      parentId: null,
      z: keyBetween(this.ctx.doc.topZ(), null),
      transform,
      bbox: { x: 0, y: 0, w: 0, h: 0 },
      opacity: 1,
      locked: false,
      hidden: false,
      rev: 0,
      createdAt: now,
      updatedAt: now,
      w,
      h,
      stroke: color,
      strokeWidth,
      // O preenchimento e o proprio contorno em 13% de opacidade (`22` em hex):
      // uma forma opaca por cima de um resumo esconderia o que esta destacando.
      fill: !open && this.style.shapeFilled ? `${color}22` : null,
    };
    shape.bbox = computeBbox(shape);
    return shape;
  }

  /** Shift troca retangulo por quadrado e elipse por circulo -- e a mesma trava. */
  #effectiveKind(): ShapeKind {
    const kind = this.style.shapeKind;
    if (!this.#shift) return kind;
    if (kind === 'rect') return 'square';
    if (kind === 'ellipse') return 'circle';
    return kind;
  }

  #reset(): void {
    this.#mode = 'idle';
    this.#guides = [];
  }

  // ---------------------------------------------------------------- visual

  cursorFor(): string {
    return 'crosshair';
  }

  paintOverlay(ctx: CanvasRenderingContext2D, camera: Camera): void {
    if (this.#mode !== 'drawing') return;

    const preview = this.#build();
    if (preview) {
      const origin = camera.worldToScreen({ x: preview.transform.x, y: preview.transform.y });
      ctx.save();
      // O proprio painter desenha a previa, no espaco local do objeto levado para
      // a tela. Reimplementar o desenho aqui abriria espaco para a previa mentir
      // sobre o que vai ser criado.
      ctx.translate(origin.x, origin.y);
      ctx.scale(camera.zoom, camera.zoom);
      paintShape(preview, {
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
}

/** Formas sem area: o gesto define um segmento, nao um retangulo. */
function isOpen(kind: ShapeKind): boolean {
  return kind === 'line' || kind === 'arrow';
}

/** Lado menor, em unidades de mundo, abaixo do qual a forma nao vale a pena. */
const MIN_SIZE = 2;

const EMPTY_SET: ReadonlySet<string> = new Set();

/** Trava a proporcao pelo maior lado, preservando o quadrante do gesto. */
function constrainSquare(start: Vec2, end: Vec2): Vec2 {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const side = Math.max(Math.abs(dx), Math.abs(dy));
  return { x: start.x + Math.sign(dx || 1) * side, y: start.y + Math.sign(dy || 1) * side };
}

/** Prende a linha ao multiplo de 15 graus mais proximo. */
function constrainAngle(start: Vec2, end: Vec2): Vec2 {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return end;
  const STEP = Math.PI / 12;
  const angle = Math.round(Math.atan2(dy, dx) / STEP) * STEP;
  return { x: start.x + Math.cos(angle) * len, y: start.y + Math.sin(angle) * len };
}
