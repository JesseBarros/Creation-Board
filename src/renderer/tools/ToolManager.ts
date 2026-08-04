import type { Vec2 } from '@shared/geometry/vec2';
import type { Camera } from '../core/Camera';
import type { DrawStyle } from './DrawStyle';
import { DrawTool } from './DrawTool';
import { EraserTool } from './EraserTool';
import { SelectTool } from './SelectTool';
import { ShapeTool } from './ShapeTool';
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
  #onToolChange: (() => void) | undefined;
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
    style: DrawStyle,
  ) {
    this.#tools = {
      select: new SelectTool(ctx),
      pen: new DrawTool('pen', ctx, style),
      highlighter: new DrawTool('highlighter', ctx, style),
      pencil: new DrawTool('pencil', ctx, style),
      eraser: new EraserTool(ctx),
      shape: new ShapeTool(ctx, style),
    };
    this.#rect = host.getBoundingClientRect();
    this.#bind();
  }

  get active(): Tool {
    return this.#tools[this.#active];
  }

  get activeId(): ToolId {
    return this.#active;
  }

  /**
   * Troca a ferramenta ativa, abortando o gesto em curso.
   *
   * Sem o cancelamento, apertar `E` no meio de um traco deixaria a caneta com um
   * traco pendurado que voltaria a crescer na proxima vez que ela fosse escolhida.
   */
  setActive(id: ToolId): void {
    if (id === this.#active) return;
    this.active.cancel();
    this.#active = id;
    this.host.style.cursor = this.#tools[id].cursorFor(this.#idlePointer());
    this.ctx.invalidate();
    this.#onToolChange?.();
  }

  /** Avisa a UI que a ferramenta mudou (atalho de teclado, por exemplo). */
  onToolChange(fn: () => void): void {
    this.#onToolChange = fn;
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
      // O cromo que segue o cursor -- marcador das reguas, circulo da borracha --
      // precisa de um frame a cada movimento. E so a camada de cima: o conteudo
      // do quadro nao e redesenhado por causa disto.
      this.ctx.invalidateOverlay();
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
      // Mesa digitalizadora entrega a pressao real; mouse manda sempre 0,5. Zero
      // chega de dois jeitos -- evento sintetico do autoteste e alguns drivers no
      // pointerup -- e um traco de pressao zero sairia sem espessura no lapis.
      pressure: e.pressure > 0 ? e.pressure : 0.5,
      shift: e.shiftKey,
      alt: e.altKey,
      ctrl: e.ctrlKey || e.metaKey,
    };
  }

  /** Ponteiro sem evento, para perguntar o cursor fora de qualquer interacao. */
  #idlePointer(): ToolPointer {
    const world = this.#lastWorld ?? { x: 0, y: 0 };
    return {
      screen: this.ctx.camera.worldToScreen(world),
      world,
      pressure: 0.5,
      shift: false,
      alt: false,
      ctrl: false,
    };
  }

  #updateCursor(e: PointerEvent): void {
    this.host.style.cursor = this.active.cursorFor(this.#toPointer(e));
  }
}
