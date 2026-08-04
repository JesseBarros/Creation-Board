import type { Rect } from '@shared/geometry/rect';
import type { Vec2 } from '@shared/geometry/vec2';
import type { BoardObject, ObjectId } from '@shared/model/types';
import { TransformObjects } from '../commands';
import { applyPatches, type ObjectPatch } from '../commands/patch';
import type { Camera } from '../core/Camera';
import { hitTest, hitTestRect } from '../features/selection/hitTest';
import {
  computeFrame,
  frameCenter,
  handleCursor,
  handleDirection,
  hitHandle,
  SCALE_UV,
  worldToFrame,
  type ScaleHandleId,
  type SelectionFrame,
} from '../features/selection/frame';
import {
  moveObjects,
  requiresUniformScale,
  rotateObjects,
  scaleObjects,
} from '../features/selection/transformOps';
import { snapPoint, snapRect, type SnapGuide } from '../features/snapping/snap';
import { paintSelection } from '../render/SelectionOverlay';
import { paintSnapGuides } from '../render/SnapGuides';
import { DRAG_THRESHOLD_PX, screenDistance, type Tool, type ToolContext, type ToolPointer } from './types';

/**
 * Ferramenta de selecao: escolher objetos e manipula-los.
 *
 * Gestos, todos no botao esquerdo:
 *   - clique no objeto            -> seleciona so ele
 *   - Shift + clique              -> adiciona ou remove da selecao
 *   - clique no vazio             -> limpa a selecao
 *   - arrastar do vazio           -> laco (Shift soma ao que ja estava)
 *   - arrastar a selecao          -> mover (Shift trava num eixo)
 *   - arrastar uma alca de canto  -> redimensionar (Shift mantem proporcao,
 *                                    Alt ancora no centro)
 *   - arrastar a alca de cima     -> girar (Shift trava de 15 em 15 graus)
 *
 * Um arraste inteiro vira UM passo de undo. Durante o gesto os patches sao
 * aplicados direto no documento, sem passar pelo historico; o comando so e
 * empurrado ao soltar o botao. A alternativa -- empurrar um comando por frame e
 * confiar na fusao do History -- se desfaz se o usuario parar de mexer no meio
 * do arraste por mais que a janela de fusao, quebrando um gesto em dois passos.
 */
export class SelectTool implements Tool {
  readonly id = 'select' as const;

  #mode: 'idle' | 'pending' | 'move' | 'scale' | 'rotate' | 'marquee' = 'idle';
  #intent: 'move' | 'scale' | 'rotate' | 'marquee' = 'move';

  #startScreen: Vec2 = { x: 0, y: 0 };
  #startWorld: Vec2 = { x: 0, y: 0 };

  /** Estado dos objetos no inicio do gesto. Todo delta e medido contra isto. */
  #originals: BoardObject[] = [];
  #before = new Map<ObjectId, ObjectPatch>();
  #after: Map<ObjectId, ObjectPatch> | null = null;
  #frame0: SelectionFrame | null = null;

  #handle: ScaleHandleId | null = null;
  /** Ancora da escala, em espaco de frame: o canto que fica parado. */
  #anchor: Vec2 = { x: 0, y: 0 };
  /** Posicao nominal da alca em espaco de frame. */
  #handleAt: Vec2 = { x: 0, y: 0 };
  /** Diferenca entre onde o usuario pegou e o centro da alca, para nao pular. */
  #grab: Vec2 = { x: 0, y: 0 };
  #startAngle = 0;

  #marquee: Rect | null = null;
  /** Selecao anterior ao laco, preservada quando ele soma com Shift. */
  #marqueeBase: ObjectId[] = [];

  /** AABB da selecao no inicio do gesto; base do encaixe ao mover. */
  #startBounds: Rect | null = null;
  /** Ids que estao se movendo: nao podem servir de referencia para si mesmos. */
  #moving: Set<ObjectId> = new Set();
  /** Guias do encaixe do frame corrente, desenhadas no overlay. */
  #guides: SnapGuide[] = [];

  /** Clique registrado no pointerdown, resolvido no pointerup se nao virou arraste. */
  #clickId: ObjectId | null = null;
  #clickWasSelected = false;
  #clickShift = false;

  constructor(private readonly ctx: ToolContext) {}

  // --------------------------------------------------------------- ponteiro

  onPointerDown(p: ToolPointer): void {
    const { selection, doc, camera } = this.ctx;

    this.#startScreen = p.screen;
    this.#startWorld = p.world;
    this.#clickId = null;
    this.#after = null;

    // 1) Alcas tem prioridade: elas ficam SOBRE o objeto e sobre o vazio ao
    //    redor dele, e quem mira a alca nunca quis o que esta atras.
    const selected = selection.objects(doc);
    const frame = computeFrame(selected);
    if (frame) {
      const handle = hitHandle(frame, p.world, camera.zoom, true);
      if (handle) {
        this.#mode = 'pending';
        this.#intent = handle === 'rotate' ? 'rotate' : 'scale';
        this.#handle = handle === 'rotate' ? null : handle;
        return;
      }
    }

    // 2) Objeto sob o cursor.
    const hit = hitTest(doc, p.world, camera.zoom);
    if (hit) {
      this.#clickId = hit.id;
      this.#clickShift = p.shift;
      this.#clickWasSelected = selection.has(hit.id);

      // Somar a selecao acontece agora, para o arraste que vem em seguida ja
      // levar o objeto novo junto. TIRAR da selecao fica para o pointerup: quem
      // segura Shift e arrasta quer travar o eixo, nao desmarcar o que pegou.
      if (!this.#clickWasSelected) {
        if (p.shift) selection.add([hit.id]);
        else selection.set([hit.id]);
      }

      this.#mode = 'pending';
      this.#intent = 'move';
      this.ctx.invalidate();
      return;
    }

    // 3) Vazio: laco.
    this.#marqueeBase = p.shift ? selection.ids() : [];
    if (!p.shift) selection.clear();
    this.#mode = 'pending';
    this.#intent = 'marquee';
    this.ctx.invalidate();
  }

  onPointerMove(p: ToolPointer): void {
    if (this.#mode === 'idle') return;

    if (this.#mode === 'pending') {
      if (screenDistance(p.screen, this.#startScreen) < DRAG_THRESHOLD_PX) return;
      if (!this.#promote()) return;
    }

    switch (this.#mode) {
      case 'move':
        this.#dragMove(p);
        break;
      case 'scale':
        this.#dragScale(p);
        break;
      case 'rotate':
        this.#dragRotate(p);
        break;
      case 'marquee':
        this.#dragMarquee(p);
        break;
    }
  }

  onPointerUp(_p: ToolPointer): void {
    const { selection, history } = this.ctx;

    // Nunca cruzou o limiar: foi clique, nao arraste. As duas decisoes abaixo
    // ficam para este momento justamente porque, se o gesto tivesse virado
    // arraste, nenhuma das duas deveria acontecer.
    if (this.#mode === 'pending') {
      if (this.#intent === 'move' && this.#clickId && this.#clickWasSelected) {
        if (this.#clickShift) {
          // Shift+clique num objeto ja selecionado: agora sim, tira.
          selection.remove([this.#clickId]);
        } else if (selection.size > 1) {
          // Clicar num membro de uma selecao multipla reduz a selecao a ele.
          selection.set([this.#clickId]);
        }
      }
      this.#reset();
      return;
    }

    if (this.#mode === 'marquee') {
      this.#marquee = null;
      this.#reset();
      this.ctx.invalidate();
      return;
    }

    if (this.#after && this.#after.size > 0) {
      // O comando reaplica valores que ja estao no documento -- inofensivo, e o
      // preco de ter exatamente um passo de undo por gesto.
      history.push(new TransformObjects(this.ctx.doc, this.#before, this.#after, this.#label()));
      history.seal();
    }
    this.#reset();
    this.ctx.invalidate();
  }

  cancel(): boolean {
    if (this.#mode === 'idle') return false;
    // Devolve os objetos ao estado do inicio do gesto. O historico nunca chegou
    // a receber nada, entao nao ha o que desfazer nele.
    if (this.#before.size > 0 && this.#after) applyPatches(this.ctx.doc, this.#before);
    this.#marquee = null;
    this.#reset();
    this.ctx.invalidate();
    return true;
  }

  // ------------------------------------------------------------- promocao

  /** Converte um `pending` em gesto de verdade, capturando o estado inicial. */
  #promote(): boolean {
    if (this.#intent === 'marquee') {
      this.#mode = 'marquee';
      return true;
    }

    const objects = this.ctx.selection.objects(this.ctx.doc).filter((o) => !o.locked);
    const frame = computeFrame(objects);
    if (objects.length === 0 || !frame) {
      this.#mode = 'idle';
      return false;
    }

    this.#originals = objects;
    this.#frame0 = frame;
    this.#before = new Map(
      objects.map((o) => [o.id, { transform: { ...o.transform } } as ObjectPatch]),
    );
    this.#moving = new Set(objects.map((o) => o.id));
    this.#startBounds = boundsOf(objects);

    if (this.#intent === 'move') {
      // Mover nao precisa de mais nada: o delta e medido contra `#startWorld`.
      this.#mode = 'move';
      return true;
    }

    if (this.#intent === 'rotate') {
      const c = frameCenter(frame);
      this.#startAngle = Math.atan2(this.#startWorld.y - c.y, this.#startWorld.x - c.x);
      this.#mode = 'rotate';
      return true;
    }

    const handle = this.#handle;
    if (!handle) {
      this.#mode = 'idle';
      return false;
    }
    const nominal = SCALE_UV[handle];
    this.#handleAt = { x: frame.w * nominal.u, y: frame.h * nominal.v };
    this.#anchor = { x: frame.w * (1 - nominal.u), y: frame.h * (1 - nominal.v) };
    const grabbed = worldToFrame(frame, this.#startWorld.x, this.#startWorld.y);
    this.#grab = { x: grabbed.x - this.#handleAt.x, y: grabbed.y - this.#handleAt.y };
    this.#mode = 'scale';
    return true;
  }

  // --------------------------------------------------------------- gestos

  #dragMove(p: ToolPointer): void {
    let dx = p.world.x - this.#startWorld.x;
    let dy = p.world.y - this.#startWorld.y;
    // Shift trava no eixo dominante, para arrastar reto sem depender do pulso.
    const lockY = p.shift && Math.abs(dx) >= Math.abs(dy);
    const lockX = p.shift && !lockY;
    if (lockY) dy = 0;
    if (lockX) dx = 0;

    // O encaixe age sobre o AABB da selecao ja deslocado, e devolve so a
    // correcao -- o delta continua sendo medido contra o inicio do gesto, senao
    // a selecao perderia o vinculo com o cursor. Ctrl desliga o encaixe.
    const bounds = this.#startBounds;
    if (bounds && !p.ctrl) {
      const moved: Rect = { x: bounds.x + dx, y: bounds.y + dy, w: bounds.w, h: bounds.h };
      const snap = snapRect(moved, {
        doc: this.ctx.doc,
        zoom: this.ctx.camera.zoom,
        exclude: this.#moving,
        snapToGrid: this.ctx.doc.prefs.snapToGrid,
        gridSize: this.ctx.doc.prefs.grid.size,
        // Um eixo travado pelo Shift nao pode ser destravado pelo encaixe.
        axes: { x: !lockX, y: !lockY },
      });
      dx += snap.dx;
      dy += snap.dy;
      this.#guides = snap.guides;
    } else {
      this.#guides = [];
    }

    this.#apply(moveObjects(this.#originals, dx, dy));
  }

  #dragScale(p: ToolPointer): void {
    const frame = this.#frame0;
    const handle = this.#handle;
    if (!frame || !handle) return;

    const dir = handleDirection(handle);
    const cur = worldToFrame(frame, p.world.x, p.world.y);
    let targetX = cur.x - this.#grab.x;
    let targetY = cur.y - this.#grab.y;

    // Encaixe da borda arrastada. So com o quadro alinhado aos eixos: girado, a
    // borda do objeto nao e paralela as linhas-guia e "alinhar" nao quer dizer
    // nada. Proporcao travada tambem fica de fora -- o encaixe de um eixo
    // mudaria o outro pela regra da proporcao e a borda sairia do lugar
    // encaixado.
    const forcedUniform = requiresUniformScale(this.#originals, frame);
    const corner = dir.dx !== 0 && dir.dy !== 0;
    const locked = forcedUniform || (p.shift && corner);
    if (!p.ctrl && !locked && frame.rotation === 0) {
      const snap = snapPoint(frame.x + targetX, frame.y + targetY, {
        doc: this.ctx.doc,
        zoom: this.ctx.camera.zoom,
        exclude: this.#moving,
        snapToGrid: this.ctx.doc.prefs.snapToGrid,
        gridSize: this.ctx.doc.prefs.grid.size,
        // Uma alca de lado so mexe num eixo; encaixar o outro moveria uma borda
        // que o usuario nao esta arrastando.
        axes: { x: dir.dx !== 0, y: dir.dy !== 0 },
      });
      targetX += snap.dx;
      targetY += snap.dy;
      this.#guides = snap.guides;
    } else {
      this.#guides = [];
    }

    // Alt ancora no centro: os dois lados se afastam juntos.
    const anchor = p.alt ? { x: frame.w / 2, y: frame.h / 2 } : this.#anchor;

    let fx = dir.dx === 0 ? 1 : ratio(targetX - anchor.x, this.#handleAt.x - anchor.x);
    let fy = dir.dy === 0 ? 1 : ratio(targetY - anchor.y, this.#handleAt.y - anchor.y);

    // Proporcao travada: pelo Shift num canto, ou por obrigacao quando a
    // selecao tem objetos girados (ver requiresUniformScale). E a mesma condicao
    // que ja desligou o encaixe acima.
    if (locked) {
      const f = Math.max(dir.dx === 0 ? 0 : Math.abs(fx), dir.dy === 0 ? 0 : Math.abs(fy));
      fx = f * (fx < 0 ? -1 : 1);
      fy = f * (fy < 0 ? -1 : 1);
    }

    this.#apply(scaleObjects(this.#originals, frame, anchor, fx, fy));
  }

  #dragRotate(p: ToolPointer): void {
    const frame = this.#frame0;
    if (!frame) return;

    const c = frameCenter(frame);
    let delta = Math.atan2(p.world.y - c.y, p.world.x - c.x) - this.#startAngle;

    if (p.shift) {
      const STEP = Math.PI / 12; // 15 graus
      // Com um objeto so, o encaixe e no angulo FINAL dele -- e isso que
      // permite "endireitar" algo que ja estava torto. Com varios, nao existe
      // angulo final comum, entao o encaixe e no proprio giro.
      const base = this.#originals.length === 1 ? this.#originals[0]!.transform.rotation : 0;
      delta = Math.round((base + delta) / STEP) * STEP - base;
    }

    this.#apply(rotateObjects(this.#originals, c, delta));
  }

  #dragMarquee(p: ToolPointer): void {
    const rect: Rect = {
      x: Math.min(this.#startWorld.x, p.world.x),
      y: Math.min(this.#startWorld.y, p.world.y),
      w: Math.abs(p.world.x - this.#startWorld.x),
      h: Math.abs(p.world.y - this.#startWorld.y),
    };
    this.#marquee = rect;
    const inside = hitTestRect(this.ctx.doc, rect).map((o) => o.id);
    this.ctx.selection.set([...this.#marqueeBase, ...inside]);
    this.ctx.invalidate();
  }

  #apply(patches: Map<ObjectId, ObjectPatch>): void {
    this.#after = patches;
    applyPatches(this.ctx.doc, patches);
    this.ctx.markDirty();
  }

  #label(): string {
    return this.#mode === 'rotate' ? 'Girar' : this.#mode === 'scale' ? 'Redimensionar' : 'Mover';
  }

  #reset(): void {
    this.#mode = 'idle';
    this.#originals = [];
    this.#before = new Map();
    this.#after = null;
    this.#frame0 = null;
    this.#handle = null;
    this.#clickId = null;
    this.#marqueeBase = [];
    this.#startBounds = null;
    this.#moving = new Set();
    this.#guides = [];
  }

  // ---------------------------------------------------------------- visual

  cursorFor(p: ToolPointer): string {
    if (this.#mode === 'move') return 'grabbing';
    if (this.#mode === 'rotate') return 'grabbing';
    if (this.#mode === 'scale' && this.#handle && this.#frame0) {
      return handleCursor(this.#handle, this.#frame0.rotation);
    }
    if (this.#mode !== 'idle') return 'default';

    const { doc, camera, selection } = this.ctx;
    const frame = computeFrame(selection.objects(doc));
    if (frame) {
      const h = hitHandle(frame, p.world, camera.zoom, true);
      if (h) return handleCursor(h, frame.rotation);
    }
    return hitTest(doc, p.world, camera.zoom) ? 'move' : 'default';
  }

  paintOverlay(ctx: CanvasRenderingContext2D, camera: Camera): void {
    const members = this.ctx.selection.objects(this.ctx.doc);
    const frame = computeFrame(members);
    paintSelection(ctx, camera, {
      frame,
      members,
      marquee: this.#marquee,
      // Durante o proprio arraste as alcas somem: elas nao seriam clicaveis e
      // so competem visualmente com o objeto que esta se mexendo.
      showHandles: this.#mode === 'idle' || this.#mode === 'pending',
      showRotate: members.length > 0,
    });
    paintSnapGuides(ctx, camera, this.#guides);
  }
}

/** AABB de um conjunto de objetos. Base do encaixe ao mover a selecao. */
function boundsOf(objects: readonly BoardObject[]): Rect | null {
  if (objects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const o of objects) {
    const b = o.bbox;
    if (b.x < minX) minX = b.x;
    if (b.y < minY) minY = b.y;
    if (b.x + b.w > maxX) maxX = b.x + b.w;
    if (b.y + b.h > maxY) maxY = b.y + b.h;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * Fator de escala de um eixo.
 *
 * O denominador e a distancia original da alca ate a ancora. Ele zera quando o
 * quadro nao tem espessura naquele eixo -- uma linha horizontal, por exemplo --
 * e ai nao existe fator que faca sentido: qualquer numero vezes zero continua
 * zero. Devolver 1 deixa o eixo intacto em vez de produzir infinito.
 */
function ratio(current: number, original: number): number {
  return Math.abs(original) < 1e-9 ? 1 : current / original;
}
