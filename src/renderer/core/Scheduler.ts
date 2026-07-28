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
 */
export class Scheduler {
  #dirty = true;
  #continuous = false;
  #raf = 0;
  #running = false;

  #intervals: number[] = [];
  #lastRenderAt = 0;
  #lastActivity = 0;
  #last: RenderStats = { total: 0, visible: 0, drawn: 0, renderMs: 0, lod: 'full' };

  constructor(private readonly render: () => RenderStats) {}

  invalidate(): void {
    this.#dirty = true;
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
      if (!this.#dirty && !this.#continuous) return;
      this.#dirty = false;

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
