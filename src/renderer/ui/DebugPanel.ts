import type { FrameStats } from '../core/Scheduler';

export interface DebugActions {
  seed(count: number): void;
  clear(): void;
  toggleBenchmark(): void;
  isBenchmarking(): boolean;
}

/**
 * Painel de diagnostico (F3).
 *
 * Detalhe importante de medicao: o DOM e atualizado no maximo a cada 120ms, nao
 * a cada frame. Escrever ~15 nos de texto 60 vezes por segundo custaria o
 * suficiente para contaminar justamente o numero que o painel esta medindo.
 */
const UPDATE_INTERVAL_MS = 120;

export class DebugPanel {
  readonly el: HTMLElement;
  #rows = new Map<string, HTMLElement>();
  #lastUpdate = 0;
  #visible = false;
  #benchBtn: HTMLButtonElement;

  constructor(private readonly actions: DebugActions) {
    this.el = document.createElement('div');
    this.el.className = 'qb-debug';
    this.el.hidden = true;

    const title = document.createElement('div');
    title.className = 'qb-debug__title';
    title.textContent = 'Debug · F3';
    this.el.append(title);

    const stats = document.createElement('div');
    stats.className = 'qb-debug__stats';
    for (const key of [
      'FPS',
      'Frame',
      'Render',
      'Objetos',
      'No viewport',
      'Desenhados',
      'LOD',
      'Zoom',
      'Heap JS',
    ]) {
      const row = document.createElement('div');
      row.className = 'qb-debug__row';
      const k = document.createElement('span');
      k.className = 'qb-debug__key';
      k.textContent = key;
      const v = document.createElement('span');
      v.className = 'qb-debug__val';
      v.textContent = '—';
      row.append(k, v);
      stats.append(row);
      this.#rows.set(key, v);
    }
    this.el.append(stats);

    const load = document.createElement('div');
    load.className = 'qb-debug__section';
    load.append(label('Carga de teste'));
    const buttons = document.createElement('div');
    buttons.className = 'qb-debug__buttons';
    for (const n of [1000, 10000, 50000]) {
      buttons.append(
        button(n >= 1000 ? `${n / 1000}k` : String(n), () => this.actions.seed(n)),
      );
    }
    buttons.append(button('limpar', () => this.actions.clear()));
    load.append(buttons);
    this.el.append(load);

    const bench = document.createElement('div');
    bench.className = 'qb-debug__section';
    bench.append(label('Medicao'));
    this.#benchBtn = button('▶ benchmark (B)', () => this.actions.toggleBenchmark());
    this.#benchBtn.classList.add('qb-debug__btn--wide');
    bench.append(this.#benchBtn);
    const hint = document.createElement('p');
    hint.className = 'qb-debug__hint';
    hint.textContent =
      'O benchmark faz a camera varrer o quadro redesenhando todo frame, para medir fps sustentado em vez de fps ocioso.';
    bench.append(hint);
    this.el.append(bench);
  }

  get visible(): boolean {
    return this.#visible;
  }

  toggle(): void {
    this.#visible = !this.#visible;
    this.el.hidden = !this.#visible;
  }

  update(stats: FrameStats, zoom: number, now: number): void {
    if (!this.#visible) return;
    if (now - this.#lastUpdate < UPDATE_INTERVAL_MS) return;
    this.#lastUpdate = now;

    const fpsEl = this.#rows.get('FPS')!;
    if (stats.idle) {
      fpsEl.textContent = 'ocioso';
      fpsEl.className = 'qb-debug__val qb-debug__val--idle';
    } else {
      fpsEl.textContent = stats.fps.toFixed(0);
      // Verde a partir de 55fps (a meta de 60 com folga de vsync), ambar ate 30,
      // vermelho abaixo disso.
      fpsEl.className =
        'qb-debug__val ' +
        (stats.fps >= 55 ? 'qb-debug__val--ok' : stats.fps >= 30 ? 'qb-debug__val--warn' : 'qb-debug__val--bad');
    }

    this.#set('Frame', stats.idle ? '—' : `${stats.frameMs.toFixed(1)} ms`);
    this.#set('Render', `${stats.renderMs.toFixed(2)} ms`);
    this.#set('Objetos', stats.total.toLocaleString('pt-BR'));
    this.#set('No viewport', stats.visible.toLocaleString('pt-BR'));
    this.#set('Desenhados', stats.drawn.toLocaleString('pt-BR'));
    this.#set('LOD', stats.lod);
    this.#set('Zoom', `${(zoom * 100).toFixed(0)}%`);
    this.#set('Heap JS', stats.heapMB > 0 ? `${stats.heapMB.toFixed(0)} MB` : 'n/d');

    const on = this.actions.isBenchmarking();
    this.#benchBtn.textContent = on ? '■ parar benchmark (B)' : '▶ benchmark (B)';
    this.#benchBtn.classList.toggle('qb-debug__btn--active', on);
  }

  #set(key: string, value: string): void {
    const el = this.#rows.get(key);
    if (el) el.textContent = value;
  }
}

function label(text: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'qb-debug__label';
  el.textContent = text;
  return el;
}

function button(text: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'qb-debug__btn';
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}
