import type { LibraryEntryKind } from '@shared/librarySearch';
import {
  loadLibraryIndex,
  searchLibrary,
  type LibraryGroup,
  type LibraryHit,
} from '../features/search/libraryQuery';
import { icon } from './icons';
import { t } from '@shared/i18n';

/**
 * Busca em todos os quadros, no menu principal.
 *
 * ## O que ela responde, e por que e outra pergunta
 *
 * O `Ctrl+F` de dentro do quadro responde [...]. Esta responde
 * [...] -- e e a pergunta que a
 * Fase 7.5 tornou util, porque agora o texto dentro das imagens tambem conta.
 *
 * Por isso os resultados vem **agrupados por quadro e com a contagem ao lado**:
 * quem busca aqui esta escolhendo por onde entrar, nao percorrendo uma lista.
 *
 * ## Duas decisoes de comportamento
 *
 * - **A leitura da biblioteca acontece na PRIMEIRA tecla**, e nao ao abrir o
 *   lobby. Ela custa 68 ms na biblioteca de teste -- pouco, mas nao vale
 *   gastar em toda abertura do app para um recurso que nem sempre e usado.
 * - **A lista nao fecha ao clicar.** Abrir o quadro e ir ate o objeto e o meio,
 *   nao o fim: quase sempre se quer ver o proximo resultado depois. Fechar
 *   obrigaria a redigitar a busca a cada pulo.
 */

export interface LibrarySearchActions {
  /** Abre o quadro e leva a camera ate o objeto. */
  openAt(path: string, objectId: string): void;
}

const MARCAS: Record<LibraryEntryKind, string> = {
  text: 'T',
  note: '▤',
  image: '▣',
  name: '#',
};

export class LibrarySearch {
  readonly el: HTMLElement;

  #input: HTMLInputElement;
  #status: HTMLElement;
  #results: HTMLElement;
  #query = '';
  /** Evita que uma resposta antiga sobrescreva o resultado de uma tecla nova. */
  #geracao = 0;

  constructor(private readonly actions: LibrarySearchActions) {
    this.el = document.createElement('div');
    this.el.className = 'qb-libsearch';

    const campo = document.createElement('div');
    campo.className = 'qb-libsearch__field';
    // LUPA, e nao teclado. Ate 21/09/2026 este campo usava `comandos` -- o mesmo
    // icone do botao de atalhos da barra --, porque a lupa nao existia no
    // conjunto e alguem pegou o que havia. Dois controles sem relacao nenhuma
    // apareciam identicos em telas diferentes.
    campo.append(icon('busca', 15));

    this.#input = document.createElement('input');
    this.#input.type = 'search';
    this.#input.className = 'qb-libsearch__input';
    this.#input.placeholder = t('biblioteca.placeholder');
    this.#input.setAttribute('aria-label', t('biblioteca.rotulo'));
    this.#input.addEventListener('input', () => void this.#run(this.#input.value));
    this.#input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.#input.value = '';
        void this.#run('');
        this.#input.blur();
      }
    });
    campo.append(this.#input);

    this.#status = document.createElement('p');
    this.#status.className = 'qb-libsearch__status';
    this.#status.hidden = true;

    this.#results = document.createElement('div');
    this.#results.className = 'qb-libsearch__results';
    this.#results.hidden = true;

    this.el.append(campo, this.#status, this.#results);
  }

  focus(): void {
    this.#input.focus();
    this.#input.select();
  }

  /** Se ha busca em curso, o lobby esconde a grade de cards. */
  get active(): boolean {
    return this.#query.trim().length > 0;
  }

  clear(): void {
    this.#input.value = '';
    void this.#run('');
  }

  async #run(query: string): Promise<void> {
    this.#query = query;
    const geracao = ++this.#geracao;
    const termo = query.trim();

    if (termo.length === 0) {
      this.#results.replaceChildren();
      this.#results.hidden = true;
      this.#status.hidden = true;
      this.el.dispatchEvent(new CustomEvent('qb-libsearch-change', { bubbles: true }));
      return;
    }

    this.#status.hidden = false;
    this.#status.textContent = t('biblioteca.procurando');
    this.el.dispatchEvent(new CustomEvent('qb-libsearch-change', { bubbles: true }));

    let index;
    try {
      index = await loadLibraryIndex();
    } catch {
      if (geracao !== this.#geracao) return;
      this.#status.textContent = t('biblioteca.erroLer');
      this.#results.hidden = true;
      return;
    }
    // Uma tecla mais nova ja disparou outra busca: esta resposta esta velha.
    if (geracao !== this.#geracao) return;

    const grupos = searchLibrary(index, termo);
    const total = grupos.reduce((n, g) => n + g.total, 0);

    this.#status.textContent =
      total === 0
        ? t('biblioteca.nadaEncontrado', termo)
        : t('biblioteca.resumo', total, grupos.length, index.falhas);

    this.#render(grupos);
  }

  #render(grupos: readonly LibraryGroup[]): void {
    this.#results.replaceChildren();
    this.#results.hidden = grupos.length === 0;

    for (const grupo of grupos) {
      const bloco = document.createElement('section');
      bloco.className = 'qb-libsearch__group';

      const cabecalho = document.createElement('h2');
      cabecalho.className = 'qb-libsearch__board';
      const nome = document.createElement('span');
      nome.textContent = grupo.boardName;
      const contagem = document.createElement('span');
      contagem.className = 'qb-libsearch__count';
      contagem.textContent = String(grupo.total);
      cabecalho.append(nome, contagem);
      bloco.append(cabecalho);

      for (const hit of grupo.hits) bloco.append(this.#linha(hit));

      // Quando o teto por quadro corta, dizer quanto ficou de fora e o que
      // impede a lista de mentir por omissao.
      if (grupo.total > grupo.hits.length) {
        const resto = document.createElement('p');
        resto.className = 'qb-libsearch__more';
        resto.textContent = t('biblioteca.mais', grupo.total - grupo.hits.length);
        bloco.append(resto);
      }

      this.#results.append(bloco);
    }
  }

  #linha(hit: LibraryHit): HTMLElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'qb-libsearch__hit';
    b.dataset['path'] = hit.path;
    b.dataset['id'] = hit.id;

    const marca = document.createElement('span');
    marca.className = 'qb-libsearch__mark';
    marca.textContent = MARCAS[hit.kind];
    marca.title =
      hit.kind === 'image' ? t('biblioteca.deImagem') : t('biblioteca.doQuadro');

    const trecho = document.createElement('span');
    trecho.className = 'qb-libsearch__snippet';
    // O casamento vai em <mark>, e nao em negrito: e o mesmo destaque que a
    // busca de dentro do quadro usa, e o navegador ja o pinta com semantica.
    const antes = hit.snippet.slice(0, hit.at);
    const meio = hit.snippet.slice(hit.at, hit.at + hit.length);
    const depois = hit.snippet.slice(hit.at + hit.length);
    trecho.append(document.createTextNode(antes));
    if (meio.length > 0) {
      const m = document.createElement('mark');
      m.textContent = meio;
      trecho.append(m);
    }
    trecho.append(document.createTextNode(depois));

    b.append(marca, trecho);
    b.addEventListener('click', () => this.actions.openAt(hit.path, hit.id));
    return b;
  }
}
