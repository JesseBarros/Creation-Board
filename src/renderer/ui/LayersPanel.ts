import type { BoardObject } from '@shared/model/types';
import { plainText } from '../features/text/spans';
import { icon } from './icons';
import { t, type ChaveTexto } from '@shared/i18n';

/**
 * Painel de camadas: a pilha do quadro, com olho e cadeado.
 *
 * Pedido (M8): [...].
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
    this.root.setAttribute('aria-label', t('camadas.titulo'));

    const head = document.createElement('div');
    head.className = 'qb-layers__head';

    const titulo = document.createElement('span');
    titulo.className = 'qb-layers__title';
    titulo.textContent = t('camadas.titulo');

    this.#contagem = document.createElement('span');
    this.#contagem.className = 'qb-layers__count';

    const fechar = document.createElement('button');
    fechar.type = 'button';
    fechar.className = 'qb-layers__close';
    fechar.setAttribute('aria-label', t('camadas.fechar'));
    fechar.append(icon('fechar', 15));
    fechar.addEventListener('click', () => this.actions.close());

    head.append(titulo, this.#contagem, fechar);

    this.#lista = document.createElement('div');
    this.#lista.className = 'qb-layers__list';
    this.#lista.setAttribute('role', 'list');

    this.#vazio = document.createElement('p');
    this.#vazio.className = 'qb-layers__empty';
    this.#vazio.textContent = t('camadas.vazio');

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
      this.#botao('subir', t('camadas.subir'), () => this.actions.reorder(obj.id, 'up')),
      this.#botao('descer', t('camadas.descer'), () => this.actions.reorder(obj.id, 'down')),
      this.#alternar(
        obj.hidden ? 'olhoFechado' : 'olho',
        obj.hidden ? t('camadas.mostrar') : t('camadas.esconder'),
        obj.hidden,
        () => this.actions.setHidden(obj.id, !obj.hidden),
      ),
      this.#alternar(
        obj.locked ? 'cadeado' : 'cadeadoAberto',
        obj.locked ? t('camadas.destravar') : t('camadas.travar'),
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
      const texto = plainText(obj.content).replace(/\s+/g, ' ').trim();
      if (texto.length === 0) return obj.type === 'note' ? t('camadas.postitVazio') : t('camadas.textoVazio');
      const curto = texto.length > 34 ? `${texto.slice(0, 34)}…` : texto;
      return obj.type === 'note' ? t('camadas.prefixoPostit', curto) : curto;
    }
    case 'stroke':
      return obj.variant === 'highlighter' ? t('camadas.marcaTexto') : t('camadas.traco');
    case 'path':
      return t('camadas.tinta');
    case 'shape':
      return t(SHAPE_LABELS[obj.kind] ?? 'camadas.forma');
    case 'image':
      return t('camadas.imagem');
    case 'group':
      return t('camadas.grupo');
  }
}

/* Chaves, e nao nomes: a lista e montada antes de o idioma ser escolhido. */
const SHAPE_LABELS: Record<string, ChaveTexto> = {
  rect: 'camadas.retangulo',
  square: 'camadas.quadrado',
  ellipse: 'camadas.elipse',
  circle: 'camadas.circulo',
  triangle: 'camadas.triangulo',
  diamond: 'camadas.losango',
  line: 'camadas.linha',
  arrow: 'camadas.seta',
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
