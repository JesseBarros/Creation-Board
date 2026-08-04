import type { DrawStyle } from '../tools/DrawStyle';
import { isDrawTool, type DrawToolId, type ToolId } from '../tools/types';

/**
 * Barra vertical de ferramentas, na lateral esquerda do quadro.
 *
 * Fica separada da ViewportBar de proposito: aquela ja tem doze controles, e
 * ferramenta e a escolha que mais se troca enquanto se trabalha -- ela merece
 * alvo grande e lugar fixo, nao mais um item no fim de uma fila.
 *
 * O painel de cor e espessura so aparece quando a ferramenta ativa desenha:
 * escolher cor de borracha ou de seta de selecao nao quer dizer nada.
 */

export interface ToolBarActions {
  setTool(id: ToolId): void;
}

interface ToolDef {
  id: ToolId;
  icon: string;
  label: string;
  key: string;
}

const TOOLS: ToolDef[] = [
  { id: 'select', icon: '⭦', label: 'Selecionar', key: 'V' },
  { id: 'pen', icon: '🖊', label: 'Caneta', key: 'P' },
  { id: 'highlighter', icon: '▬', label: 'Marca-texto', key: 'M' },
  { id: 'pencil', icon: '✎', label: 'Lapis', key: 'L' },
  { id: 'eraser', icon: '⌫', label: 'Borracha', key: 'E' },
];

export class ToolBar {
  readonly el: HTMLElement;

  #buttons = new Map<ToolId, HTMLButtonElement>();
  #options: HTMLElement;
  #colorRow: HTMLElement;
  #widthRow: HTMLElement;
  #active: ToolId = 'select';

  constructor(
    private readonly actions: ToolBarActions,
    private readonly style: DrawStyle,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'qb-tools';

    const rail = document.createElement('div');
    rail.className = 'qb-tools__rail';
    for (const t of TOOLS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'qb-tools__btn';
      b.textContent = t.icon;
      b.title = `${t.label} (${t.key})`;
      b.setAttribute('aria-label', t.label);
      b.addEventListener('click', () => this.actions.setTool(t.id));
      this.#buttons.set(t.id, b);
      rail.append(b);
    }

    this.#colorRow = document.createElement('div');
    this.#colorRow.className = 'qb-tools__colors';
    this.#widthRow = document.createElement('div');
    this.#widthRow.className = 'qb-tools__widths';

    this.#options = document.createElement('div');
    this.#options.className = 'qb-tools__options';
    this.#options.hidden = true;
    this.#options.append(this.#colorRow, this.#widthRow);

    this.el.append(rail, this.#options);

    // Mudanca vinda de fora (atalho `[`/`]`) tem de aparecer aqui tambem.
    this.style.onChange(() => this.#renderOptions());
    this.setActive('select');
  }

  setActive(id: ToolId): void {
    this.#active = id;
    for (const [toolId, btn] of this.#buttons) {
      btn.classList.toggle('qb-tools__btn--active', toolId === id);
    }
    this.#renderOptions();
  }

  #renderOptions(): void {
    const id = this.#active;
    if (!isDrawTool(id)) {
      this.#options.hidden = true;
      return;
    }
    this.#options.hidden = false;
    this.#renderColors(id);
    this.#renderWidths(id);
  }

  #renderColors(id: DrawToolId): void {
    const current = this.style.color(id);
    this.#colorRow.replaceChildren();
    for (const color of this.style.colorsFor(id)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'qb-tools__color';
      b.classList.toggle('qb-tools__color--active', color === current);
      // A amostra e a propria cor do documento, sem passar pelo adaptador de
      // tema: e ela que fica gravada no .wbd e que o usuario esta escolhendo.
      b.style.background = color;
      b.title = color;
      b.setAttribute('aria-label', `Cor ${color}`);
      b.addEventListener('click', () => this.style.setColor(id, color));
      this.#colorRow.append(b);
    }
  }

  #renderWidths(id: DrawToolId): void {
    const current = this.style.width(id);
    const steps = this.style.widthsFor(id);
    const biggest = steps[steps.length - 1] ?? 1;
    this.#widthRow.replaceChildren();

    for (const width of steps) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'qb-tools__width';
      b.classList.toggle('qb-tools__width--active', width === current);
      b.title = `Espessura ${width}px ([ e ])`;
      b.setAttribute('aria-label', `Espessura ${width}`);

      const dot = document.createElement('span');
      dot.className = 'qb-tools__width-dot';
      // A amostra e proporcional a maior espessura da ferramenta, com um piso
      // para o degrau mais fino continuar clicavel e visivel.
      const size = Math.max(4, Math.round((width / biggest) * 18));
      dot.style.width = `${size}px`;
      dot.style.height = `${size}px`;
      b.append(dot);

      b.addEventListener('click', () => this.style.setWidth(id, width));
      this.#widthRow.append(b);
    }
  }
}
