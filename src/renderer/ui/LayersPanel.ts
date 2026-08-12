import type { BoardObject } from '@shared/model/types';
import { plainText } from '../features/text/spans';
import { icon } from './icons';

/**
 * Painel de camadas: a pilha do quadro, com olho e cadeado.
 *
 * Pedido dele (M8): *"quero uma opcao para alternar as camadas, como tem no
 * Photoshop, porem de forma mais simplificada"*.
 *
 * **E uma lista de OBJETOS, e nao grupos com nome.** As duas perguntas de
 * projeto estavam registradas no BUGS.md, e a escolha foi a barata: "camada"
 * aqui e o objeto que ja existe, com o `z` que ja existe. Inventar grupo seria
 * conceito novo no modelo -- do porte de meia fase -- para resolver um problema
 * que a lista resolve.
 *
 * O cadeado nao e construido aqui: `locked` ja existe, ja e respeitado pelo
 * hitTest, pela borracha e pelo apagar, e ja tem cobertura no selftest desde a
 * Fase 3. O que faltava era **enxergar e alcancar**, que e exatamente o papel
 * deste painel.
 *
 * So lista o que esta NO VIEWPORT. Um resumo importado tem 1.063 objetos, e uma
 * lista de mil linhas nao e um painel de camadas -- e um despejo. O que se quer
 * alcancar e o que se esta olhando.
 */

export interface LayersActions {
  select(id: string, add: boolean): void;
  setLocked(id: string, locked: boolean): void;
  setHidden(id: string, hidden: boolean): void;
  reorder(id: string, dir: 'up' | 'down'): void;
  close(): void;
}

/** Quantas linhas antes de parar de listar. Ver o comentario do modulo. */
const MAX_LINHAS = 200;

export class LayersPanel {
  readonly root: HTMLElement;
  #lista: HTMLElement;
  #vazio: HTMLElement;
  #contagem: HTMLElement;

  constructor(private readonly actions: LayersActions) {
    this.root = document.createElement('aside');
    this.root.className = 'qb-layers';
    this.root.hidden = true;
    // Nomeado para leitor de tela: o painel e uma regiao, e sem nome ele seria
    // anunciado como "complementar" e nada mais.
    this.root.setAttribute('aria-label', 'Camadas');

    const head = document.createElement('div');
    head.className = 'qb-layers__head';

    const titulo = document.createElement('span');
    titulo.className = 'qb-layers__title';
    titulo.textContent = 'Camadas';

    this.#contagem = document.createElement('span');
    this.#contagem.className = 'qb-layers__count';

    const fechar = document.createElement('button');
    fechar.type = 'button';
    fechar.className = 'qb-layers__close';
    fechar.setAttribute('aria-label', 'Fechar o painel de camadas');
    fechar.textContent = '×';
    fechar.addEventListener('click', () => this.actions.close());

    head.append(titulo, this.#contagem, fechar);

    this.#lista = document.createElement('div');
    this.#lista.className = 'qb-layers__list';
    this.#lista.setAttribute('role', 'list');

    this.#vazio = document.createElement('p');
    this.#vazio.className = 'qb-layers__empty';
    this.#vazio.textContent = 'Nada por aqui. O painel lista o que esta na tela.';

    this.root.append(head, this.#lista, this.#vazio);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  toggle(): void {
    this.root.hidden = !this.root.hidden;
  }

  hide(): void {
    this.root.hidden = true;
  }

  /**
   * Redesenha a lista.
   *
   * `objects` chega na ordem de desenho (de tras para frente), e a lista mostra
   * ao CONTRARIO: quem esta por cima no quadro aparece em cima no painel. Um
   * painel de camadas que inverte isso obriga a pensar de cabeca para baixo.
   */
  render(objects: readonly BoardObject[], selected: ReadonlySet<string>): void {
    if (this.root.hidden) return;

    this.#lista.textContent = '';
    const total = objects.length;
    const mostrados = objects.slice(-MAX_LINHAS).reverse();

    this.#vazio.hidden = total > 0;
    this.#contagem.textContent =
      total > MAX_LINHAS ? `${MAX_LINHAS} de ${total}` : total > 0 ? String(total) : '';

    for (const obj of mostrados) {
      this.#lista.append(this.#linha(obj, selected.has(obj.id)));
    }
  }

  #linha(obj: BoardObject, ativo: boolean): HTMLElement {
    const row = document.createElement('div');
    row.className = 'qb-layers__row' + (ativo ? ' qb-layers__row--active' : '');
    row.setAttribute('role', 'listitem');
    row.dataset['id'] = obj.id;

    const nome = document.createElement('button');
    nome.type = 'button';
    nome.className = 'qb-layers__name';
    nome.append(icon(iconeDe(obj), 15));
    const rotulo = document.createElement('span');
    rotulo.textContent = nomeDe(obj);
    nome.append(rotulo);
    // Um objeto travado continua alcancavel PELO PAINEL, mesmo sem poder ser
    // clicado no quadro. E isso que torna o cadeado reversivel: travar sem uma
    // lista seria uma porta que fecha por fora.
    nome.addEventListener('click', (e) => this.actions.select(obj.id, e.shiftKey));

    const acoes = document.createElement('div');
    acoes.className = 'qb-layers__actions';
    acoes.append(
      this.#botao('subir', 'Trazer para frente', () => this.actions.reorder(obj.id, 'up')),
      this.#botao('descer', 'Mandar para tras', () => this.actions.reorder(obj.id, 'down')),
      this.#alternar(
        obj.hidden ? 'olhoFechado' : 'olho',
        obj.hidden ? 'Mostrar' : 'Esconder',
        obj.hidden,
        () => this.actions.setHidden(obj.id, !obj.hidden),
      ),
      this.#alternar(
        obj.locked ? 'cadeado' : 'cadeadoAberto',
        obj.locked ? 'Destravar' : 'Travar',
        obj.locked,
        () => this.actions.setLocked(obj.id, !obj.locked),
      ),
    );

    row.append(nome, acoes);
    return row;
  }

  #botao(nome: Parameters<typeof icon>[0], label: string, onClick: () => void): HTMLElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'qb-layers__btn';
    b.setAttribute('aria-label', label);
    b.title = label;
    b.append(icon(nome, 15));
    b.addEventListener('click', onClick);
    return b;
  }

  #alternar(
    nome: Parameters<typeof icon>[0],
    label: string,
    ligado: boolean,
    onClick: () => void,
  ): HTMLElement {
    const b = this.#botao(nome, label, onClick);
    // `aria-pressed` e o que faz um leitor de tela anunciar "travado"/"nao
    // travado". Sem ele o botao mudaria de icone e nao diria nada.
    b.setAttribute('aria-pressed', String(ligado));
    if (ligado) b.classList.add('qb-layers__btn--on');
    return b;
  }
}

/** Um nome curto e reconhecivel para a linha. */
function nomeDe(obj: BoardObject): string {
  switch (obj.type) {
    case 'text':
    case 'note': {
      // O proprio texto e o melhor nome que existe: "Texto 4" nao ajuda ninguem
      // a achar o paragrafo certo num resumo.
      const t = plainText(obj.content).replace(/\s+/g, ' ').trim();
      const prefixo = obj.type === 'note' ? 'Post-it: ' : '';
      if (t.length === 0) return obj.type === 'note' ? 'Post-it vazio' : 'Texto vazio';
      return prefixo + (t.length > 34 ? `${t.slice(0, 34)}…` : t);
    }
    case 'stroke':
      return obj.variant === 'highlighter' ? 'Marca-texto' : 'Traco';
    case 'path':
      return 'Tinta';
    case 'shape':
      return SHAPE_LABELS[obj.kind] ?? 'Forma';
    case 'image':
      return 'Imagem';
    case 'group':
      return 'Grupo';
  }
}

const SHAPE_LABELS: Record<string, string> = {
  rect: 'Retangulo',
  square: 'Quadrado',
  ellipse: 'Elipse',
  circle: 'Circulo',
  triangle: 'Triangulo',
  diamond: 'Losango',
  line: 'Linha',
  arrow: 'Seta',
};

function iconeDe(obj: BoardObject): Parameters<typeof icon>[0] {
  switch (obj.type) {
    case 'text':
      return 'texto';
    case 'note':
      return 'postit';
    case 'stroke':
      return obj.variant === 'highlighter' ? 'marcaTexto' : 'caneta';
    case 'path':
      return 'caneta';
    case 'shape':
      return 'formas';
    case 'image':
      return 'preencher';
    case 'group':
      return 'camadas';
  }
}
