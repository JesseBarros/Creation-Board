import type { Vec2 } from '@shared/geometry/vec2';
import type { BoardObject, ObjectId } from '@shared/model/types';
import { EraseObjects } from '../commands';
import type { Camera } from '../core/Camera';
import { hitsObject } from '../features/selection/hitTest';
import type { Tool, ToolContext, ToolPointer } from './types';

/**
 * Borracha.
 *
 * Apaga o OBJETO INTEIRO que o cursor toca, como o padrao do Microsoft
 * Whiteboard, e nao um pedaco do traco. Apagar por pedaco exigiria partir a
 * polilinha, recalcular LOD e AABB dos dois cacos e decidir o que fazer com a
 * pressao no corte -- e, na pratica de um resumo, quem erra uma letra refaz a
 * palavra.
 *
 * So apaga TINTA (`stroke` e `path`, este ultimo a caligrafia importada). Um
 * gesto largo de borracha passando por cima de uma caixa de texto ou de uma
 * imagem apagaria o resumo inteiro sem que o usuario tivesse pedido; para essas,
 * o caminho e selecionar e Delete, que mostra o que vai sumir antes de sumir.
 */
export class EraserTool implements Tool {
  readonly id = 'eraser' as const;

  #erasing = false;
  /** Objetos ja tirados do documento neste gesto, na ordem em que sairam. */
  #removed: BoardObject[] = [];
  #seen = new Set<ObjectId>();
  /** Ultima posicao do ponteiro, em px de tela. Null ate ele entrar no quadro. */
  #cursor: Vec2 | null = null;
  /** Ultima posicao processada em MUNDO, para varrer o intervalo entre eventos. */
  #lastWorld: Vec2 | null = null;

  constructor(private readonly ctx: ToolContext) {}

  // --------------------------------------------------------------- ponteiro

  onPointerDown(p: ToolPointer): void {
    this.#erasing = true;
    this.#removed = [];
    this.#seen.clear();
    this.#lastWorld = p.world;
    this.#cursor = p.screen;
    this.#eraseAt(p.world);
  }

  onPointerMove(p: ToolPointer): void {
    this.#cursor = p.screen;

    if (!this.#erasing) {
      // Fora do gesto o movimento ainda importa: e ele que arrasta o circulo da
      // borracha pela tela, que e o unico aviso do tamanho dela antes de apagar.
      this.ctx.invalidateOverlay();
      return;
    }

    const from = this.#lastWorld ?? p.world;
    this.#eraseAlong(from, p.world, this.#radiusWorld());
    this.#lastWorld = p.world;
  }

  onPointerUp(_p: ToolPointer): void {
    if (!this.#erasing) return;
    this.#erasing = false;
    this.#lastWorld = null;

    if (this.#removed.length > 0) {
      this.ctx.history.push(new EraseObjects(this.ctx.doc, this.#removed));
      this.ctx.history.seal();
      this.ctx.markDirty();
    }
    this.#removed = [];
    this.#seen.clear();
    this.ctx.invalidate();
  }

  cancel(): boolean {
    if (!this.#erasing) return false;
    this.#erasing = false;
    this.#lastWorld = null;
    // Nada disto passou pelo historico ainda, entao desfazer nao alcancaria:
    // devolver os objetos aqui e a unica forma de o Esc valer para a borracha.
    if (this.#removed.length > 0) this.ctx.doc.add(this.#removed);
    this.#removed = [];
    this.#seen.clear();
    this.ctx.invalidate();
    return true;
  }

  // ------------------------------------------------------------- apagamento

  /**
   * Varre o intervalo entre dois eventos de ponteiro.
   *
   * Um movimento rapido entrega saltos de dezenas de pixels entre um
   * `pointermove` e o seguinte. Testando so as posicoes recebidas, a borracha
   * passaria POR CIMA de um traco fino sem toca-lo -- o gesto some do meio do
   * risco e nada e apagado.
   */
  #eraseAlong(from: Vec2, to: Vec2, radius: number): void {
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(dist / Math.max(radius, 1e-6)));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      this.#eraseAt({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
    }
  }

  #eraseAt(world: Vec2): void {
    const { doc } = this.ctx;
    const r = this.#radiusWorld();
    const probe = { x: world.x - r, y: world.y - r, w: r * 2, h: r * 2 };

    const doomed: BoardObject[] = [];
    for (const obj of doc.queryVisible(probe)) {
      if (obj.locked) continue;
      if (obj.type !== 'stroke' && obj.type !== 'path') continue;
      if (this.#seen.has(obj.id)) continue;
      if (!hitsObject(obj, world.x, world.y, r)) continue;
      this.#seen.add(obj.id);
      doomed.push(obj);
    }
    if (doomed.length === 0) return;

    this.#removed.push(...doomed);
    // Sai do documento agora: a borracha precisa mostrar o resultado enquanto o
    // gesto acontece. O passo de undo so nasce ao soltar (ver EraseObjects).
    doc.remove(doomed.map((o) => o.id));
    this.ctx.markDirty();
  }

  #radiusWorld(): number {
    return RADIUS_PX / this.ctx.camera.zoom;
  }

  // ---------------------------------------------------------------- visual

  cursorFor(): string {
    // O cursor do sistema some: quem indica onde e de que tamanho a borracha
    // apaga e o circulo desenhado no overlay, que acompanha o zoom.
    return 'none';
  }

  paintOverlay(ctx: CanvasRenderingContext2D, _camera: Camera): void {
    const c = this.#cursor;
    if (!c) return;

    ctx.save();
    ctx.beginPath();
    ctx.arc(c.x, c.y, RADIUS_PX, 0, Math.PI * 2);
    // Preenchimento claro com contorno escuro: o circulo precisa ficar visivel
    // tanto sobre o quadro branco quanto sobre uma mancha de tinta.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(31, 41, 51, 0.75)';
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Raio da borracha em px de TELA.
 *
 * De tela, e nao de mundo: a borracha e um instrumento de apontar, e o que
 * importa e o quanto ela cobre do que se esta vendo. Em unidades de mundo, dar
 * zoom para acertar um detalhe faria a borracha crescer junto e cobrir tudo.
 */
const RADIUS_PX = 14;
