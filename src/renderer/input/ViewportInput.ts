import type { Camera } from '../core/Camera';

/**
 * Navegacao do canvas infinito: pan e zoom.
 *
 * Mapeamento de entrada:
 *   - botao direito + arrastar         -> pan
 *   - botao do meio + arrastar         -> pan
 *   - dois dedos no trackpad           -> pan (wheel sem ctrl)
 *   - roda do mouse                    -> pan vertical
 *   - Shift + roda                     -> pan horizontal
 *   - Ctrl + roda                      -> zoom no cursor
 *   - pinca no trackpad                -> zoom no cursor
 *
 * Detalhe nao obvio: o Chromium reporta a pinca do trackpad como um evento
 * `wheel` com `ctrlKey = true`. Por isso pinca e Ctrl+roda caem no mesmo ramo --
 * a diferenca esta so na magnitude do delta, que a exponencial abaixo absorve.
 */

/**
 * Deslocamento em px de tela a partir do qual um arrasto deixa de ser clique.
 * Existe porque o botao direito acumula dois papeis: arrastar move o quadro, mas
 * clicar sem mover precisa continuar disponivel para o menu de contexto da Fase 3.
 * Sem a folga, a tremida natural da mao ao clicar cancelaria o menu.
 */
const DRAG_THRESHOLD = 3;

export class ViewportInput {
  #panning = false;
  #panButton = -1;
  #moved = false;
  #startX = 0;
  #startY = 0;
  #lastX = 0;
  #lastY = 0;
  /** Marcado quando o arrasto com o direito realmente moveu o quadro. */
  #swallowContextMenu = false;
  #disposers: Array<() => void> = [];

  constructor(
    private readonly host: HTMLElement,
    private readonly camera: Camera,
    private readonly onChange: () => void,
  ) {
    this.#bind();
  }

  get isPanning(): boolean {
    return this.#panning;
  }

  dispose(): void {
    for (const d of this.#disposers) d();
    this.#disposers = [];
  }

  #on<K extends keyof HTMLElementEventMap>(
    target: HTMLElement | Window,
    type: K | string,
    fn: (ev: never) => void,
    opts?: AddEventListenerOptions,
  ): void {
    const handler = fn as EventListener;
    target.addEventListener(type, handler, opts);
    this.#disposers.push(() => target.removeEventListener(type, handler, opts));
  }

  #bind(): void {
    this.#on(this.host, 'wheel', (e: WheelEvent) => this.#onWheel(e), { passive: false });
    this.#on(this.host, 'pointerdown', (e: PointerEvent) => this.#onPointerDown(e));
    this.#on(this.host, 'pointermove', (e: PointerEvent) => this.#onPointerMove(e));
    this.#on(this.host, 'pointerup', (e: PointerEvent) => this.#onPointerUp(e));
    this.#on(this.host, 'pointercancel', (e: PointerEvent) => this.#onPointerUp(e));
    this.#on(this.host, 'contextmenu', (e: MouseEvent) => this.#onContextMenu(e));
    // Perder o foco no meio de um arrasto deixaria o pan preso ligado, ja que o
    // pointerup correspondente nunca chega.
    this.#on(window, 'blur', () => {
      this.#panning = false;
      this.#updateCursor();
    });
  }

  #onContextMenu(e: MouseEvent): void {
    // O arrasto com o direito ja moveu o quadro; abrir menu agora seria um
    // efeito colateral indesejado do gesto de pan.
    if (this.#swallowContextMenu) {
      this.#swallowContextMenu = false;
      e.preventDefault();
      return;
    }
    // Ate a Fase 3 nao existe menu de contexto proprio; sem isso o Chromium
    // nao mostra nada de qualquer forma, mas o preventDefault deixa explicito
    // que o clique com o direito e nosso.
    e.preventDefault();
  }

  #onWheel(e: WheelEvent): void {
    // Sem isto o Chromium aplica o proprio zoom de pagina no Ctrl+roda.
    e.preventDefault();

    // deltaMode 1 = linhas; converte para pixels aproximados.
    const k = e.deltaMode === 1 ? 16 : 1;
    const dx = e.deltaX * k;
    const dy = e.deltaY * k;

    if (e.ctrlKey || e.metaKey) {
      const rect = this.host.getBoundingClientRect();
      const anchor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      // Exponencial em vez de fator linear: mantem o passo de zoom perceptivelmente
      // constante em qualquer nivel, e absorve a diferenca de escala entre o
      // delta grosso da roda e o delta fino da pinca.
      this.camera.zoomAt(anchor, Math.exp(-dy * 0.0025));
    } else if (e.shiftKey && dx === 0) {
      this.camera.panByScreen(-dy, 0);
    } else {
      this.camera.panByScreen(-dx, -dy);
    }
    this.onChange();
  }

  #onPointerDown(e: PointerEvent): void {
    // 2 = botao direito, 1 = botao do meio.
    if (e.button !== 2 && e.button !== 1) return;

    e.preventDefault();
    this.#panning = true;
    this.#panButton = e.button;
    this.#moved = false;
    this.#startX = e.clientX;
    this.#startY = e.clientY;
    this.#lastX = e.clientX;
    this.#lastY = e.clientY;
    this.host.setPointerCapture(e.pointerId);
  }

  #onPointerMove(e: PointerEvent): void {
    if (!this.#panning) return;

    if (!this.#moved) {
      const dist = Math.hypot(e.clientX - this.#startX, e.clientY - this.#startY);
      if (dist < DRAG_THRESHOLD) return; // ainda pode ser um clique
      this.#moved = true;
      this.#updateCursor();
    }

    this.camera.panByScreen(e.clientX - this.#lastX, e.clientY - this.#lastY);
    this.#lastX = e.clientX;
    this.#lastY = e.clientY;
    this.onChange();
  }

  #onPointerUp(e: PointerEvent): void {
    if (!this.#panning) return;
    if (this.#panButton === 2 && this.#moved) this.#swallowContextMenu = true;
    this.#panning = false;
    this.#panButton = -1;
    this.#moved = false;
    if (this.host.hasPointerCapture(e.pointerId)) this.host.releasePointerCapture(e.pointerId);
    this.#updateCursor();
  }

  #updateCursor(): void {
    this.host.style.cursor = this.#panning && this.#moved ? 'grabbing' : '';
  }
}
