import type { FrameStats } from '../core/Scheduler';
import { formatarNumero, t } from '@shared/i18n';

/*
  O que se LE em cada linha. A chave e o identificador interno da linha (o
  selftest e o resto deste arquivo a usam); as que nao estao aqui -- Render,
  Frame, LOD, Zoom, Heap JS -- sao termos tecnicos iguais nos dois idiomas.
*/
const ROTULOS_DO_F3: Readonly<Record<string, () => string>> = {
  Objetos: () => t('depuracao.objetos'),
  'No viewport': () => t('depuracao.noViewport'),
  Desenhados: () => t('depuracao.desenhados'),
  'Atualizacoes/s': () => t('depuracao.atualizacoes'),
};

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
 *
 * **O painel foi pego medindo a coisa errada, e reordenado por causa disso.**
 * Olhando o F3 num quadro real: quanto mais rapido se movia o quadro, maior o
 * fps, ate um teto perto de 66; movendo pouco, ficava em 28-30.
 * Custo nao se comporta assim -- se desenhar fosse o gargalo, mover mais rapido
 * daria MENOS fps, nao mais.
 *
 * O que o contador media era o intervalo entre redesenhos, e o `Scheduler` so
 * redesenha quando algo muda: mover devagar produz menos mudancas, logo menos
 * frames, logo um numero menor. A leitura era "o app esta lento"; o painel respondia
 * "a tela mudou 30 vezes neste segundo". Na MESMA captura, o render era de
 * 6,40 ms com 1.049 objetos -- daria 156 fps se houvesse o que desenhar.
 *
 * Entao o destaque agora e **Render**, que e trabalho e so trabalho, e o antigo
 * "FPS" desceu para o fim com o nome honesto: *atualizacoes por segundo*.
 */
const UPDATE_INTERVAL_MS = 120;

/**
 * Orcamento de um frame, em ms, nas duas metas.
 *
 * 144 e a meta (a fluidez de uma tela de 144 Hz, B9). O verde antigo comecava
 * em 55 fps -- ou seja, o medidor dizia "otimo" exatamente num numero que
 * ainda travava.
 */
const ORCAMENTO_144 = 1000 / 144;
const ORCAMENTO_60 = 1000 / 60;

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
    title.textContent = t('depuracao.titulo');
    this.el.append(title);

    const stats = document.createElement('div');
    stats.className = 'qb-debug__stats';
    // A ordem e a mensagem: o primeiro numero e o que se olha. Render vem antes
    // porque e o unico que mede TRABALHO -- Frame carrega a espera do vsync
    // junto, e "atualizacoes/s" depende de quanta coisa mudou.
    for (const key of [
      'Render',
      'Frame',
      'Objetos',
      'No viewport',
      'Desenhados',
      'LOD',
      'Zoom',
      'Heap JS',
      'Atualizacoes/s',
    ]) {
      const row = document.createElement('div');
      row.className = 'qb-debug__row';
      const k = document.createElement('span');
      k.className = 'qb-debug__key';
      // A chave identifica a linha no codigo; o que se LE e o rotulo traduzido.
      k.textContent = ROTULOS_DO_F3[key]?.() ?? key;
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
    load.append(label(t('depuracao.cargaDeTeste')));
    const buttons = document.createElement('div');
    buttons.className = 'qb-debug__buttons';
    for (const n of [1000, 10000, 50000]) {
      buttons.append(
        button(n >= 1000 ? `${n / 1000}k` : String(n), () => this.actions.seed(n)),
      );
    }
    buttons.append(button(t('depuracao.limpar'), () => this.actions.clear()));
    load.append(buttons);
    this.el.append(load);

    const bench = document.createElement('div');
    bench.className = 'qb-debug__section';
    bench.append(label(t('depuracao.medicao')));
    this.#benchBtn = button(t('depuracao.benchmarkLigar'), () => this.actions.toggleBenchmark());
    this.#benchBtn.classList.add('qb-debug__btn--wide');
    bench.append(this.#benchBtn);
    const hint = document.createElement('p');
    hint.className = 'qb-debug__hint';
    hint.textContent = t('depuracao.benchmarkDica');
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

    // O numero de destaque: desenhar a cena custa isto, e so isto. Ele nao
    // depende de vsync, de quanto a tela mudou nem de a janela estar na frente.
    const renderEl = this.#rows.get('Render')!;
    renderEl.textContent = `${stats.renderMs.toFixed(2)} ms`;
    renderEl.className =
      'qb-debug__val ' +
      (stats.renderMs <= ORCAMENTO_144
        ? 'qb-debug__val--ok'
        : stats.renderMs <= ORCAMENTO_60
          ? 'qb-debug__val--warn'
          : 'qb-debug__val--bad');
    // A dica diz contra o que a cor esta comparando -- sem isso, verde e vermelho
    // sao opiniao sem criterio.
    renderEl.title = t(
      'depuracao.renderDica',
      formatarNumero(ORCAMENTO_144, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
      formatarNumero(ORCAMENTO_60, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    );

    this.#set('Frame', stats.idle ? '—' : `${stats.frameMs.toFixed(1)} ms`);

    // O antigo "FPS". O nome mudou porque o numero sempre foi este: quantas
    // vezes a tela foi redesenhada, e nao quao rapido o app consegue desenhar.
    const taxaEl = this.#rows.get('Atualizacoes/s')!;
    if (stats.idle) {
      taxaEl.textContent = t('depuracao.ocioso');
      taxaEl.className = 'qb-debug__val qb-debug__val--idle';
    } else {
      taxaEl.textContent = stats.fps.toFixed(0);
      // Sem cor de propósito: um numero baixo aqui costuma significar "nada
      // mudou", que e o comportamento certo. Pintar de vermelho o quadro parado
      // seria o erro que este painel acabou de deixar de cometer.
      taxaEl.className = 'qb-debug__val';
    }
    taxaEl.title = t('depuracao.atualizacoesDica');

    this.#set('Objetos', formatarNumero(stats.total));
    this.#set('No viewport', formatarNumero(stats.visible));
    this.#set('Desenhados', formatarNumero(stats.drawn));
    this.#set('LOD', stats.lod);
    this.#set('Zoom', `${(zoom * 100).toFixed(0)}%`);
    this.#set('Heap JS', stats.heapMB > 0 ? `${stats.heapMB.toFixed(0)} MB` : t('depuracao.naoDisponivel'));

    const on = this.actions.isBenchmarking();
    this.#benchBtn.textContent = on ? t('depuracao.benchmarkParar') : t('depuracao.benchmarkLigar');
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
