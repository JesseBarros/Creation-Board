import type { Vec2 } from '@shared/geometry/vec2';
import type { Camera } from '../core/Camera';
import { SelectTool } from './SelectTool';
import type { Tool, ToolContext, ToolId, ToolPointer } from './types';

/**
 * Liga os eventos de ponteiro a ferramenta ativa.
 *
 * Divisao de botoes com input/ViewportInput.ts: aqui so entra o ESQUERDO. O
 * direito e o do meio pertencem a navegacao, e essa fronteira e o que permite
 * arrastar o quadro no meio de um desenho sem trocar de ferramenta.
 */
export class ToolManager {
  #tools: Record<ToolId, Tool>;
  #active: ToolId = 'select';
  #disposers: Array<() => void> = [];
  /** Retangulo do host em cache: le-lo a cada pointermove forcaria layout. */
  #rect: DOMRect;
  /** Ponteiro que capturamos, para nao reagir a um segundo dedo/caneta. */
  #captured: number | null = null;
  /** Ultima posicao conhecida do cursor, em mundo. Null ate ele entrar no quadro. */
  #lastWorld: Vec2 | null = null;

  constructor(
    private readonly host: HTMLElement,
    private readonly ctx: ToolContext,
  ) {
    this.#tools = { select: new SelectTool(ctx) };
    this.#rect = host.getBoundingClientRect();
    this.#bind();
  }

  get active(): Tool {
    return this.#tools[this.#active];
  }

  /**
   * Onde o cursor esta, em mundo. Null se ele ainda nao passou pelo quadro.
   * E o ponto de colagem: colar cai onde o usuario esta olhando.
   */
  get cursorWorld(): Vec2 | null {
    return this.#lastWorld;
  }

  /** O host mudou de tamanho ou de lugar; o cache do retangulo venceu. */
  remeasure(): void {
    this.#rect = this.host.getBoundingClientRect();
  }

  paintOverlay(ctx: CanvasRenderingContext2D, camera: Camera): void {
    this.active.paintOverlay(ctx, camera);
  }

  /** Esc, troca de quadro, perda de foco. */
  cancel(): boolean {
    return this.active.cancel();
  }

  dispose(): void {
    for (const d of this.#disposers) d();
    this.#disposers = [];
  }

  #bind(): void {
    const on = <E extends Event>(
      target: HTMLElement | Window,
      type: string,
      fn: (e: E) => void,
      opts?: AddEventListenerOptions,
    ): void => {
      const handler = fn as EventListener;
      target.addEventListener(type, handler, opts);
      this.#disposers.push(() => target.removeEventListener(type, handler, opts));
    };

    on<PointerEvent>(this.host, 'pointerdown', (e) => {
      if (e.button !== 0 || this.#captured !== null) return;
      e.preventDefault();
      this.remeasure();
      this.#captured = e.pointerId;
      try {
        this.host.setPointerCapture(e.pointerId);
      } catch {
        // Ponteiro que o navegador nao considera ativo -- e o caso dos eventos
        // sinteticos do autoteste. A captura so serve para continuar recebendo
        // o arraste fora do elemento; sem ela o gesto funciona igual.
      }
      this.active.onPointerDown(this.#toPointer(e));
      this.#updateCursor(e);
    });

    on<PointerEvent>(this.host, 'pointermove', (e) => {
      // Fora de um gesto o move ainda importa: e ele que escolhe o cursor, e o
      // cursor e o unico aviso de que uma alca esta ali antes de clicar.
      if (this.#captured !== null && e.pointerId !== this.#captured) return;
      this.active.onPointerMove(this.#toPointer(e));
      this.#updateCursor(e);
    });

    const end = (e: PointerEvent): void => {
      if (this.#captured !== e.pointerId) return;
      this.#captured = null;
      if (this.host.hasPointerCapture(e.pointerId)) this.host.releasePointerCapture(e.pointerId);
      this.active.onPointerUp(this.#toPointer(e));
      this.#updateCursor(e);
    };
    on<PointerEvent>(this.host, 'pointerup', end);
    on<PointerEvent>(this.host, 'pointercancel', end);

    // Perder o foco no meio de um arraste nunca entrega o pointerup: sem isto o
    // gesto ficaria pendurado e o proximo clique continuaria de onde parou.
    on(window, 'blur', () => {
      if (this.#captured === null) return;
      this.#captured = null;
      this.cancel();
    });

    on(window, 'resize', () => this.remeasure());
  }

  #toPointer(e: PointerEvent): ToolPointer {
    const screen: Vec2 = { x: e.clientX - this.#rect.left, y: e.clientY - this.#rect.top };
    const world = this.ctx.camera.screenToWorld(screen);
    this.#lastWorld = world;
    return {
      screen,
      world,
      shift: e.shiftKey,
      alt: e.altKey,
      ctrl: e.ctrlKey || e.metaKey,
    };
  }

  #updateCursor(e: PointerEvent): void {
    this.host.style.cursor = this.active.cursorFor(this.#toPointer(e));
  }
}
