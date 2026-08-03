import { displayKeys, groupedShortcuts } from '../shortcuts';

/**
 * Tela de ajuda com todos os atalhos.
 *
 * O conteudo e gerado a partir do registro em shortcuts.ts, nunca escrito a
 * mao: um atalho novo aparece aqui automaticamente.
 */
export class ShortcutsModal {
  readonly el: HTMLElement;
  #open = false;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'qb-overlay';
    this.el.hidden = true;

    const panel = document.createElement('div');
    panel.className = 'qb-dialog qb-dialog--wide';

    const header = document.createElement('div');
    header.className = 'qb-help__header';
    const h = document.createElement('h2');
    h.className = 'qb-dialog__title';
    h.textContent = 'Atalhos e comandos';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'qb-help__close';
    close.textContent = '✕';
    close.title = 'Fechar (Esc)';
    close.addEventListener('click', () => this.hide());
    header.append(h, close);

    const columns = document.createElement('div');
    columns.className = 'qb-help__columns';

    for (const [group, items] of groupedShortcuts()) {
      const section = document.createElement('section');
      section.className = 'qb-help__group';

      const title = document.createElement('h3');
      title.className = 'qb-help__group-title';
      title.textContent = group;
      section.append(title);

      for (const item of items) {
        const row = document.createElement('div');
        row.className = 'qb-help__row';

        const keys = document.createElement('span');
        keys.className = 'qb-help__keys';
        const combos = displayKeys(item);
        combos.forEach((combo, i) => {
          if (i > 0) {
            const ou = document.createElement('span');
            ou.className = 'qb-help__or';
            ou.textContent = 'ou';
            keys.append(ou);
          }
          for (const part of combo.split('+')) {
            const kbd = document.createElement('kbd');
            kbd.textContent = part.trim();
            keys.append(kbd);
          }
        });

        const label = document.createElement('span');
        label.className = 'qb-help__label';
        label.textContent = item.label;

        row.append(keys, label);
        section.append(row);
      }
      columns.append(section);
    }

    panel.append(header, columns);
    this.el.append(panel);

    this.el.addEventListener('pointerdown', (e) => {
      if (e.target === this.el) this.hide();
    });
  }

  get isOpen(): boolean {
    return this.#open;
  }

  toggle(): void {
    this.#open ? this.hide() : this.show();
  }

  show(): void {
    this.#open = true;
    this.el.hidden = false;
  }

  hide(): void {
    this.#open = false;
    this.el.hidden = true;
  }
}
