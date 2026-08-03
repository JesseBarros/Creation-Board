export interface MenuItem {
  label: string;
  /** Atalho equivalente, mostrado a direita. Nao e um botao: e lembrete. */
  hint?: string;
  disabled?: boolean;
  danger?: boolean;
  onSelect(): void;
}

export type MenuEntry = MenuItem | 'separator';

/** Folga minima ate a borda da janela ao reposicionar o menu. */
const EDGE_GAP = 8;

/**
 * Menu de contexto do quadro.
 *
 * Em HTML e nao no canvas: o menu precisa de foco, navegacao por teclado e
 * medicao de texto, tudo de graca no DOM e trabalhoso no canvas. Ele fica fora
 * das camadas de desenho, entao nao entra no custo do frame.
 */
export class ContextMenu {
  readonly el: HTMLElement;
  #open = false;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'qb-menu';
    this.el.hidden = true;
    this.el.setAttribute('role', 'menu');

    // Captura na fase de descida: um clique fora deve fechar o menu ANTES de a
    // ferramenta tratar o mesmo clique como selecao.
    document.addEventListener(
      'pointerdown',
      (e) => {
        if (this.#open && !this.el.contains(e.target as Node)) this.hide();
      },
      true,
    );
    window.addEventListener('blur', () => this.hide());
    // Rolar ou dar zoom move o quadro embaixo do menu, e ele apontaria para o
    // lugar errado.
    window.addEventListener('wheel', () => this.hide(), { passive: true });
  }

  get isOpen(): boolean {
    return this.#open;
  }

  show(clientX: number, clientY: number, entries: readonly MenuEntry[]): void {
    if (entries.length === 0) return;
    this.el.replaceChildren();

    for (const entry of entries) {
      if (entry === 'separator') {
        const hr = document.createElement('div');
        hr.className = 'qb-menu__sep';
        this.el.append(hr);
        continue;
      }

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'qb-menu__item';
      btn.setAttribute('role', 'menuitem');
      if (entry.danger) btn.classList.add('qb-menu__item--danger');
      btn.disabled = entry.disabled ?? false;

      const label = document.createElement('span');
      label.textContent = entry.label;
      btn.append(label);

      if (entry.hint) {
        const hint = document.createElement('kbd');
        hint.className = 'qb-menu__hint';
        hint.textContent = entry.hint;
        btn.append(hint);
      }

      btn.addEventListener('click', () => {
        this.hide();
        entry.onSelect();
      });
      this.el.append(btn);
    }

    // Precisa estar visivel para ter tamanho medivel; posicionado so depois.
    this.el.hidden = false;
    this.#open = true;
    this.el.style.left = '0px';
    this.el.style.top = '0px';

    const box = this.el.getBoundingClientRect();
    const x = Math.max(
      EDGE_GAP,
      Math.min(clientX, window.innerWidth - box.width - EDGE_GAP),
    );
    // Perto do rodape o menu sobe para o lado de cima do cursor, em vez de
    // encostar na borda e cortar os ultimos itens.
    const y =
      clientY + box.height + EDGE_GAP > window.innerHeight
        ? Math.max(EDGE_GAP, clientY - box.height)
        : clientY;

    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;
  }

  hide(): void {
    if (!this.#open) return;
    this.#open = false;
    this.el.hidden = true;
  }
}
