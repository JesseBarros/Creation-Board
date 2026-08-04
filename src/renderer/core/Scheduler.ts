import type { RenderStats } from '../render/Renderer';

export interface FrameStats extends RenderStats {
  /** Quadros por segundo medidos sobre os frames realmente desenhados. */
  fps: number;
  /** Intervalo medio entre frames desenhados, em ms. */
  frameMs: number;
  /** Heap JS em uso, em MB (API nao-padrao, disponivel no Chromium). */
  heapMB: number;
  /** true quando nada mudou e o loop esta apenas ocioso. */
  idle: boolean;
}

interface ChromiumPerformance extends Performance {
  memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
}

const SAMPLE_WINDOW = 90;

/**
 * Loop de renderizacao.
 *
 * Ponto central: o loop e sempre chamado via rAF, mas so DESENHA quando algo
 * invalidou o frame. Com o quadro parado o custo por frame e uma comparacao de
 * booleano -- nada de queimar GPU redesenhando pixels identicos.
 *
 * `setContinuous(true)` forca desenho a cada frame; e o que o benchmark usa
 * para medir frame rate sustentado de forma honesta.
 *
 * Ha DOIS niveis de sujeira. O conteudo do quadro muda pouco; o que esta sendo
 * desenhado ou manipulado agora muda a cada evento de ponteiro. Um sinal so
 * obrigaria cada ponto de um traco a repintar os 10 mil objetos da camada
 * estatica -- que e exatamente o custo que a separacao em duas camadas do
 * Renderer existe para evitar.
 */
export class Scheduler {
  #dirty = true;
  #overlayDirty = false;
  #continuous = false;
  #raf = 0;
  #running = false;

  #intervals: number[] = [];
  #lastRenderAt = 0;
  #lastActivity = 0;
  #last: RenderStats = { total: 0, visible: 0, drawn: 0, renderMs: 0, lod: 'full' };

  constructor(
    private readonly render: () => RenderStats,
    private readonly paintOverlay: () => void,
  ) {}

  /** O conteudo mudou: redesenha as duas camadas. */
  invalidate(): void {
    this.#dirty = true;
  }

  /** So o que esta em cima mudou: redesenha apenas o overlay. */
  invalidateOverlay(): void {
    this.#overlayDirty = true;
  }

  setContinuous(on: boolean): void {
    this.#continuous = on;
    if (on) this.#dirty = true;
  }

  get continuous(): boolean {
    return this.#continuous;
  }

  start(): void {
    if (this.#running) return;
    this.#running = true;
    const tick = (now: number): void => {
      if (!this.#running) return;
      this.#raf = requestAnimationFrame(tick);

      if (!this.#dirty && !this.#continuous) {
        // Frame so de overlay: nao mexe na camada estatica e nao entra na
        // amostragem de fps, que mede o custo de desenhar CONTEUDO. Contá-lo
        // inflaria o numero exatamente quando o quadro esta parado.
        if (this.#overlayDirty) {
          this.#overlayDirty = false;
          this.paintOverlay();
          this.#lastActivity = now;
        }
        return;
      }
      this.#dirty = false;
      this.#overlayDirty = false;

      this.#last = this.render();

      if (this.#lastRenderAt > 0) {
        const dt = now - this.#lastRenderAt;
        // Descarta intervalos longos: sao pausas de ociosidade, nao frames
        // lentos, e contaminariam a media de FPS.
        if (dt < 500) {
          this.#intervals.push(dt);
          if (this.#intervals.length > SAMPLE_WINDOW) this.#intervals.shift();
        }
      }
      this.#lastRenderAt = now;
      this.#lastActivity = now;
    };
    this.#raf = requestAnimationFrame(tick);
  }

  stop(): void {
    this.#running = false;
    cancelAnimationFrame(this.#raf);
  }

  stats(): FrameStats {
    let sum = 0;
    for (let i = 0; i < this.#intervals.length; i++) sum += this.#intervals[i]!;
    const frameMs = this.#intervals.length > 0 ? sum / this.#intervals.length : 0;
    const mem = (performance as ChromiumPerformance).memory;

    return {
      ...this.#last,
      fps: frameMs > 0 ? 1000 / frameMs : 0,
      frameMs,
      heapMB: mem ? mem.usedJSHeapSize / (1024 * 1024) : 0,
      idle: !this.#continuous && performance.now() - this.#lastActivity > 400,
    };
  }

  /** Zera a janela de amostragem; usado ao iniciar uma medicao nova. */
  resetSamples(): void {
    this.#intervals.length = 0;
    this.#lastRenderAt = 0;
  }
}
