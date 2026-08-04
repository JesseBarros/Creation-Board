import type { AlertLevel, ShapeKind } from '@shared/model/types';
import { ALERT_ICONS, NOTE_COLORS, SHAPE_KINDS, type DrawStyle } from '../tools/DrawStyle';
import { hasStyle, type StyleToolId, type ToolId } from '../tools/types';
import { ALERT_COLORS } from '../render/painters/text';

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
  /**
   * Aplica a escolha de papel/alerta aos post-its selecionados, se houver
   * algum. Os mesmos botoes que definem o proximo post-it reestilizam o que ja
   * existe -- dois lugares para a mesma escolha so obrigariam a procurar em
   * qual deles ela estava.
   */
  restyleNotes(style: { bg?: string; alert?: AlertLevel | null }): void;
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
  { id: 'text', icon: 'T', label: 'Texto', key: 'T' },
  // Icone com pauta, e nao mais um quadrado: ao lado do de formas, dois
  // quadrados parecidos nao distinguem uma ferramenta da outra na barra.
  { id: 'note', icon: '▤', label: 'Post-it', key: 'N' },
  { id: 'shape', icon: '◻', label: 'Formas', key: 'F' },
  { id: 'eraser', icon: '⌫', label: 'Borracha', key: 'E' },
];

/** Rotulo de cada nivel de alerta, mais o "sem alerta". */
const ALERT_LABELS: Record<AlertLevel, string> = {
  importante: 'Importante',
  duvida: 'Duvida',
  revisar: 'Revisar',
};

/** Icone e nome de cada forma no seletor. */
const SHAPE_LABELS: Record<ShapeKind, { icon: string; label: string }> = {
  rect: { icon: '▭', label: 'Retangulo (Shift: quadrado)' },
  square: { icon: '◻', label: 'Quadrado' },
  ellipse: { icon: '⬭', label: 'Elipse (Shift: circulo)' },
  circle: { icon: '◯', label: 'Circulo' },
  triangle: { icon: '△', label: 'Triangulo' },
  diamond: { icon: '◇', label: 'Losango' },
  line: { icon: '╱', label: 'Linha (Shift: 15 em 15 graus)' },
  arrow: { icon: '↗', label: 'Seta (Shift: 15 em 15 graus)' },
};

export class ToolBar {
  readonly el: HTMLElement;

  #buttons = new Map<ToolId, HTMLButtonElement>();
  #options: HTMLElement;
  #shapeRow: HTMLElement;
  #colorRow: HTMLElement;
  #widthRow: HTMLElement;
  #alertRow: HTMLElement;
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

    this.#shapeRow = document.createElement('div');
    this.#shapeRow.className = 'qb-tools__shapes';
    this.#colorRow = document.createElement('div');
    this.#colorRow.className = 'qb-tools__colors';
    this.#widthRow = document.createElement('div');
    this.#widthRow.className = 'qb-tools__widths';
    this.#alertRow = document.createElement('div');
    this.#alertRow.className = 'qb-tools__alerts';

    this.#options = document.createElement('div');
    this.#options.className = 'qb-tools__options';
    this.#options.hidden = true;
    this.#options.append(this.#shapeRow, this.#colorRow, this.#widthRow, this.#alertRow);

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

    // O post-it nao tem cor de marca nem espessura: o que ele escolhe e papel e
    // alerta. Por isso ele nao passa por `hasStyle` e monta o proprio painel.
    if (id === 'note') {
      this.#options.hidden = false;
      this.#shapeRow.hidden = true;
      this.#widthRow.hidden = true;
      this.#alertRow.hidden = false;
      this.#renderNoteColors();
      this.#renderAlerts();
      return;
    }

    if (!hasStyle(id)) {
      this.#options.hidden = true;
      return;
    }
    this.#options.hidden = false;
    // O seletor de forma so existe para a ferramenta de formas; para as de tinta
    // a linha inteira sai do fluxo em vez de ficar como um espaco vazio.
    this.#shapeRow.hidden = id !== 'shape';
    this.#alertRow.hidden = true;
    this.#widthRow.hidden = false;
    if (id === 'shape') this.#renderShapes();
    this.#renderColors(id);
    this.#renderWidths(id);
  }

  #renderNoteColors(): void {
    const current = this.style.noteBg;
    this.#colorRow.replaceChildren();
    for (const color of NOTE_COLORS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'qb-tools__color';
      b.classList.toggle('qb-tools__color--active', color === current);
      b.style.background = color;
      b.title = `Papel ${color}`;
      b.setAttribute('aria-label', `Papel ${color}`);
      b.addEventListener('click', () => {
        this.style.setNoteBg(color);
        this.actions.restyleNotes({ bg: color });
      });
      this.#colorRow.append(b);
    }
  }

  #renderAlerts(): void {
    const current = this.style.noteAlert;
    this.#alertRow.replaceChildren();

    const add = (level: AlertLevel | null): void => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'qb-tools__alert';
      b.classList.toggle('qb-tools__alert--active', level === current);
      b.textContent = level ? ALERT_ICONS[level] : '–';
      if (level) b.style.color = ALERT_COLORS[level];
      const label = level ? `Alerta: ${ALERT_LABELS[level]}` : 'Sem alerta';
      b.title = label;
      b.setAttribute('aria-label', label);
      b.addEventListener('click', () => {
        this.style.setNoteAlert(level);
        this.actions.restyleNotes({ alert: level });
      });
      this.#alertRow.append(b);
    };

    add(null);
    for (const level of Object.keys(ALERT_ICONS) as AlertLevel[]) add(level);
  }

  #renderShapes(): void {
    const current = this.style.shapeKind;
    this.#shapeRow.replaceChildren();

    for (const kind of SHAPE_KINDS) {
      const meta = SHAPE_LABELS[kind];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'qb-tools__shape';
      b.classList.toggle('qb-tools__shape--active', kind === current);
      b.textContent = meta.icon;
      b.title = meta.label;
      b.setAttribute('aria-label', meta.label);
      b.addEventListener('click', () => this.style.setShapeKind(kind));
      this.#shapeRow.append(b);
    }

    const fill = document.createElement('button');
    fill.type = 'button';
    fill.className = 'qb-tools__shape qb-tools__shape--fill';
    fill.classList.toggle('qb-tools__shape--active', this.style.shapeFilled);
    fill.textContent = this.style.shapeFilled ? '◼' : '◻';
    fill.title = 'Preencher a forma (translucido, na cor do contorno)';
    fill.setAttribute('aria-label', 'Preencher a forma');
    fill.addEventListener('click', () => this.style.setShapeFilled(!this.style.shapeFilled));
    this.#shapeRow.append(fill);
  }

  #renderColors(id: StyleToolId): void {
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

  #renderWidths(id: StyleToolId): void {
    const current = this.style.width(id);
    const steps = this.style.widthsFor(id);
    const biggest = steps[steps.length - 1] ?? 1;
    // No texto o mesmo eixo e o corpo da fonte; o rotulo acompanha, senao a
    // dica diria "espessura" para quem esta escolhendo tamanho de letra.
    const noun = id === 'text' ? 'Tamanho da fonte' : 'Espessura';
    this.#widthRow.replaceChildren();

    for (const width of steps) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'qb-tools__width';
      b.classList.toggle('qb-tools__width--active', width === current);
      b.title = `${noun} ${width}px ([ e ])`;
      b.setAttribute('aria-label', `${noun} ${width}`);

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
