import type { HitKind, SearchHit } from '../features/search/search';

/**
 * Barra de busca (`Ctrl+F`).
 *
 * Painel flutuante no topo, e nao um modal: procurar uma palavra e uma acao
 * SOBRE o quadro, e um modal escureceria justamente o que se esta tentando
 * encontrar. Pela mesma razao ela fica no alto e estreita -- o resultado precisa
 * de tela.
 *
 * A lista mostra o trecho em volta do casamento com o pedaco casado destacado:
 * num resumo com dezenas de ocorrencias de "matriz", o que distingue uma da
 * outra e a frase em volta, nao o nome do objeto.
 */

export interface SearchBarActions {
  /** Texto mudou; devolve os resultados a mostrar. */
  search(query: string): void;
  /** Ir para o resultado de indice `i`. */
  goTo(index: number): void;
  close(): void;
}

/**
 * Marca do tipo de cada resultado.
 *
 * O `▣` da imagem existe para uma pergunta que so ela levanta: "por que esse
 * texto nao aparece no quadro?". Ele aparece porque foi LIDO de dentro de uma
 * imagem (Fase 7.5), e sem a marca o resultado pareceria um erro da busca.
 */
const ICONS: Record<HitKind, string> = {
  text: 'T',
  note: '▤',
  name: '#',
  image: '▣',
};

export class SearchBar {
  readonly el: HTMLElement;

  #input: HTMLInputElement;
  #counter: HTMLElement;
  #list: HTMLElement;
  #hits: readonly SearchHit[] = [];
  #current = -1;
  #open = false;

  constructor(private readonly actions: SearchBarActions) {
    this.el = document.createElement('div');
    this.el.className = 'qb-search';
    this.el.hidden = true;

    const row = document.createElement('div');
    row.className = 'qb-search__row';

    this.#input = document.createElement('input');
    this.#input.type = 'text';
    this.#input.className = 'qb-search__input';
    this.#input.placeholder = 'Buscar no quadro…';
    this.#input.spellcheck = false;
    this.#input.setAttribute('aria-label', 'Buscar no quadro');

    this.#counter = document.createElement('span');
    this.#counter.className = 'qb-search__counter';

    const prev = iconButton('‹', 'Resultado anterior (Shift+Enter)', () => this.step(-1));
    const next = iconButton('›', 'Proximo resultado (Enter)', () => this.step(1));
    const close = iconButton('✕', 'Fechar (Esc)', () => this.actions.close());

    row.append(this.#input, this.#counter, prev, next, close);

    this.#list = document.createElement('div');
    this.#list.className = 'qb-search__list';

    this.el.append(row, this.#list);

    this.#input.addEventListener('input', () => this.actions.search(this.#input.value));
    this.#input.addEventListener('keydown', (e) => this.#onKey(e));
  }

  get isOpen(): boolean {
    return this.#open;
  }

  get current(): SearchHit | null {
    return this.#hits[this.#current] ?? null;
  }

  /**
   * Abre e seleciona o texto que ja estava la.
   *
   * Selecionar em vez de limpar: `Ctrl+F` seguido de outra palavra e o caso
   * comum, e digitar por cima resolve; quem quis repetir a busca anterior so
   * aperta Enter.
   */
  open(): void {
    this.#open = true;
    this.el.hidden = false;
    this.#input.focus();
    this.#input.select();
    if (this.#input.value) this.actions.search(this.#input.value);
  }

  close(): void {
    this.#open = false;
    this.el.hidden = true;
  }

  get query(): string {
    return this.#input.value;
  }

  /**
   * Recebe o resultado da busca e mostra.
   *
   * Mostrar NAO e navegar: digitar mais uma letra nao pode arrastar a camera
   * pelo quadro a cada tecla. Quem move e o Enter (ou o clique na lista).
   */
  setHits(hits: readonly SearchHit[]): void {
    this.#hits = hits;
    this.#current = hits.length > 0 ? 0 : -1;
    this.#navigated = false;
    this.#render();
  }

  /** Anda pelos resultados, dando a volta nas pontas. */
  step(direction: 1 | -1): void {
    if (this.#hits.length === 0) return;
    this.#current = (this.#current + direction + this.#hits.length) % this.#hits.length;
    this.#navigated = true;
    this.#render();
    this.actions.goTo(this.#current);
  }

  #onKey(e: KeyboardEvent): void {
    if (e.key === 'Enter') {
      e.preventDefault();
      // O primeiro Enter leva ao resultado que ja esta destacado; os seguintes
      // andam. Sem isso, digitar e apertar Enter pularia o primeiro resultado.
      if (this.#current >= 0 && !this.#navigated) {
        this.#navigated = true;
        this.actions.goTo(this.#current);
        return;
      }
      this.step(e.shiftKey ? -1 : 1);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.actions.close();
    }
  }

  /** Já saímos do lugar por causa desta lista de resultados? */
  #navigated = false;

  #render(): void {
    const total = this.#hits.length;
    this.#counter.textContent =
      total === 0
        ? this.#input.value.trim() === ''
          ? ''
          : 'nada'
        : `${this.#current + 1}/${total}`;

    this.#list.replaceChildren();
    for (let i = 0; i < this.#hits.length; i++) {
      const hit = this.#hits[i]!;
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'qb-search__hit';
      row.classList.toggle('qb-search__hit--active', i === this.#current);

      const icon = document.createElement('span');
      icon.className = 'qb-search__kind';
      icon.textContent = ICONS[hit.kind];

      const text = document.createElement('span');
      text.className = 'qb-search__snippet';
      // O trecho e montado em NOS, e nao com innerHTML: o conteudo vem do quadro
      // do usuario, e um resumo com "<b>" dentro nao pode virar marcacao aqui.
      const before = hit.snippet.slice(0, hit.at);
      const match = hit.snippet.slice(hit.at, hit.at + hit.length);
      const after = hit.snippet.slice(hit.at + hit.length);
      const mark = document.createElement('mark');
      mark.textContent = match;
      text.append(document.createTextNode(before), mark, document.createTextNode(after));

      row.append(icon, text);
      row.addEventListener('click', () => {
        this.#current = i;
        this.#navigated = true;
        this.#render();
        this.actions.goTo(i);
      });
      this.#list.append(row);
    }

    // O resultado atual precisa estar a vista quando se anda com Enter.
    this.#list.children[this.#current]?.scrollIntoView({ block: 'nearest' });
  }
}

function iconButton(label: string, title: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'qb-search__btn';
  b.textContent = label;
  b.title = title;
  b.setAttribute('aria-label', title);
  b.addEventListener('click', onClick);
  return b;
}
