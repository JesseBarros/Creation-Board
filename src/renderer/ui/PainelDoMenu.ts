import { formatarNumero, t } from '@shared/i18n';

/*
  O que se LE em cada linha. A chave (portugues, sem traduzir) e o identificador
  interno da linha -- o selftest e o resto deste arquivo a usam --, e o rotulo sai
  do dicionario na hora de montar o painel.
*/
const ROTULOS_DO_F3_MENU: Readonly<Record<string, () => string>> = {
  'Cadência': () => t('painelMenu.cadencia'),
  'Intervalo médio': () => t('painelMenu.intervaloMedio'),
  'Pior (1 s)': () => t('painelMenu.pior'),
  'Composição': () => t('painelMenu.composicao'),
  'Desfoque': () => t('painelMenu.desfoque'),
  'Cards': () => t('painelMenu.cards'),
};

/**
 * Painel de desempenho do MENU PRINCIPAL (F3). Pedido em 24/09/2026.
 *
 * NAO e o painel do quadro reaproveitado, e a diferenca e o que ele mede. O F3
 * do quadro destaca o custo de DESENHAR o canvas -- e o menu nao tem canvas. O
 * custo do menu e o de COMPOR a tela: o desfoque do painel, os cards
 * levantando, o fantasma do arrasto. Esse trabalho acontece fora do
 * JavaScript, e o que chega ate aqui e a CADENCIA: quando compor nao da conta,
 * o Chromium deixa de pedir quadros, e o intervalo entre eles cresce.
 *
 * Por isso o painel roda um `requestAnimationFrame` CONTINUO enquanto esta
 * aberto. Parado, a cadencia fica na taxa do monitor; se ela cair enquanto
 * algo se mexe, e a composicao que nao esta dando conta.
 *
 * A LICAO DO PAINEL DO QUADRO vale aqui (ver o cabecalho de `DebugPanel.ts`):
 * ele media [...] e era lido como [...]. Aqui o laco e continuo justamente para a cadencia NAO depender de quanta
 * coisa muda -- ela so cai quando o quadro atrasa.
 *
 * O DOM e escrito a cada 250 ms, nao a cada quadro, pelo mesmo motivo do
 * painel do quadro: escrever texto 144 vezes por segundo contaminaria o numero
 * que se esta medindo.
 */

const ATUALIZAR_A_CADA_MS = 250;
/** A janela da media e do pior: o ultimo segundo. */
const JANELA_MS = 1000;

export class PainelDoMenu {
  readonly el: HTMLElement;
  #valores = new Map<string, HTMLElement>();
  #visivel = false;
  #quadro = 0;
  /** Instantes dos ultimos quadros, dentro de `JANELA_MS`. */
  #instantes: number[] = [];
  #ultimaEscrita = 0;

  constructor(private readonly contarCards: () => number) {
    this.el = document.createElement('div');
    this.el.className = 'qb-debug qb-debug--menu';
    this.el.hidden = true;

    const titulo = document.createElement('div');
    titulo.className = 'qb-debug__title';
    titulo.textContent = t('painelMenu.titulo');
    this.el.append(titulo);

    const linhas = document.createElement('div');
    linhas.className = 'qb-debug__stats';
    // A ordem e a mensagem: cadencia primeiro, porque e o que se sente.
    for (const chave of ['Cadência', 'Intervalo médio', 'Pior (1 s)', 'Composição', 'Desfoque', 'Cards', 'Heap JS']) {
      const linha = document.createElement('div');
      linha.className = 'qb-debug__row';
      const k = document.createElement('span');
      k.className = 'qb-debug__key';
      // A chave identifica a linha no codigo; o que se LE e o rotulo traduzido.
      k.textContent = ROTULOS_DO_F3_MENU[chave]?.() ?? chave;
      const v = document.createElement('span');
      v.className = 'qb-debug__val';
      v.textContent = '—';
      linha.append(k, v);
      linhas.append(linha);
      this.#valores.set(chave, v);
    }
    this.el.append(linhas);

    const dica = document.createElement('p');
    dica.className = 'qb-debug__label';
    dica.textContent = t('painelMenu.dica');
    this.el.append(dica);

    // O que nao muda durante a execucao sai uma vez so.
    const params = new URLSearchParams(location.search);
    const gpu = params.get('gpu') ?? 'normal';
    this.#escrever(
      'Composição',
      gpu === 'compat' || gpu === 'comp' ? 'CPU' : gpu === 'normal' ? 'GPU' : gpu,
    );
    this.#escrever('Desfoque', params.get('blur') === '0' ? t('painelMenu.desligado') : t('painelMenu.ligado'));
  }

  get visivel(): boolean {
    return this.#visivel;
  }

  alternar(): void {
    this.#visivel = !this.#visivel;
    this.el.hidden = !this.#visivel;
    if (this.#visivel) {
      this.#instantes = [];
      this.#quadro = requestAnimationFrame(this.#passo);
    } else {
      cancelAnimationFrame(this.#quadro);
    }
  }

  /** O menu saiu de cena (abriu um quadro): o laco para junto. */
  pausar(): void {
    cancelAnimationFrame(this.#quadro);
  }

  retomar(): void {
    if (!this.#visivel) return;
    this.#instantes = [];
    cancelAnimationFrame(this.#quadro);
    this.#quadro = requestAnimationFrame(this.#passo);
  }

  #passo = (t: number): void => {
    this.#instantes.push(t);
    while (this.#instantes.length > 0 && t - this.#instantes[0]! > JANELA_MS) this.#instantes.shift();
    if (t - this.#ultimaEscrita >= ATUALIZAR_A_CADA_MS) {
      this.#ultimaEscrita = t;
      this.#mostrar();
    }
    this.#quadro = requestAnimationFrame(this.#passo);
  };

  #mostrar(): void {
    const ts = this.#instantes;
    if (ts.length < 2) return;
    let pior = 0;
    for (let i = 1; i < ts.length; i++) pior = Math.max(pior, ts[i]! - ts[i - 1]!);
    const medio = (ts[ts.length - 1]! - ts[0]!) / (ts.length - 1);
    const porSegundo = 1000 / medio;

    const cadencia = this.#valores.get('Cadência')!;
    cadencia.textContent = t('painelMenu.quadrosPorSegundo', porSegundo.toFixed(0));
    // Verde a partir de 55 q/s e nao 144: aqui o que se julga e "esta
    // travando", e nao a meta do quadro. Um monitor de 60 Hz nunca passaria
    // de 60, e pintaria de amarelo um menu perfeito.
    cadencia.className = `qb-debug__val qb-debug__val--${porSegundo >= 55 ? 'ok' : porSegundo >= 30 ? 'warn' : 'bad'}`;
    this.#escrever('Intervalo médio', `${medio.toFixed(1)} ms`);
    const piorEl = this.#valores.get('Pior (1 s)')!;
    piorEl.textContent = `${pior.toFixed(1)} ms`;
    piorEl.className = `qb-debug__val qb-debug__val--${pior <= 34 ? 'ok' : pior <= 67 ? 'warn' : 'bad'}`;
    this.#escrever('Cards', formatarNumero(this.contarCards()));
    const memoria = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    this.#escrever('Heap JS', memoria ? `${(memoria.usedJSHeapSize / 1048576).toFixed(0)} MB` : t('depuracao.naoDisponivel'));
  }

  #escrever(chave: string, valor: string): void {
    const el = this.#valores.get(chave);
    if (el) el.textContent = valor;
  }
}
