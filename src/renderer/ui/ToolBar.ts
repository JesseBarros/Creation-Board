import type { AlertLevel, ShapeKind } from '@shared/model/types';
import {
  ALERT_ICONS,
  NOTE_COLORS,
  SHAPE_KINDS,
  type DrawStyle,
  type EraserMode,
} from '../tools/DrawStyle';
import { hasStyle, type StyleToolId, type ToolId } from '../tools/types';
import { ALERT_COLORS } from '../render/painters/text';
import { icon, type IconName } from './icons';

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
  /**
   * Avisa se a cor escolhida a mao ficar ilegivel em algum tema.
   *
   * Avisa, e nao impede: a paleta e conferida por `npm run check:colors`, mas a
   * escolha livre e do usuario -- ele pode querer um cinza claro de propósito.
   */
  warnIfLowContrast(color: string): void;
  /** Liga/desliga negrito, italico ou sublinhado. Ver `App.toggleTextFormat`. */
  toggleTextFormat(what: 'bold' | 'italic' | 'underline'): void;
}

interface ToolDef {
  id: ToolId;
  icon: IconName;
  label: string;
  key: string;
}

const TOOLS: ToolDef[] = [
  // Icones em SVG, e nao glifos: os simbolos que estavam aqui (a seta do
  // cursor, a caneta, o lapis) dependiam da fonte do sistema para existir, e
  // vinham em pesos e tamanhos diferentes uns dos outros -- uma fila
  // desalinhada. Ver ui/icons.ts.
  { id: 'select', icon: 'selecionar', label: 'Selecionar', key: 'V' },
  { id: 'pen', icon: 'caneta', label: 'Caneta', key: 'P' },
  { id: 'highlighter', icon: 'marcaTexto', label: 'Marca-texto', key: 'M' },
  { id: 'text', icon: 'texto', label: 'Texto', key: 'T' },
  // Icone com pauta, e nao mais um quadrado: ao lado do de formas, dois
  // quadrados parecidos nao distinguem uma ferramenta da outra na barra.
  { id: 'note', icon: 'postit', label: 'Post-it', key: 'N' },
  { id: 'shape', icon: 'formas', label: 'Formas', key: 'F' },
  { id: 'eraser', icon: 'borracha', label: 'Borracha', key: 'E' },
];

/**
 * `<input type="color">` so aceita `#rrggbb`.
 *
 * A tinta importada chega como `rgba(...)`, e a paleta tem cores
 * de tres digitos; sem normalizar, o seletor abriria no preto em vez de abrir
 * na cor que esta em uso.
 */
function normalizeHex(color: string): string {
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    return `#${color[1]!}${color[1]!}${color[2]!}${color[2]!}${color[3]!}${color[3]!}`;
  }
  return '#1f2933';
}

/** Rotulo de cada nivel de alerta, mais o "sem alerta". */
const ALERT_LABELS: Record<AlertLevel, string> = {
  importante: 'Importante',
  duvida: 'Duvida',
  revisar: 'Revisar',
};

/** Icone e nome de cada forma no seletor. */
const SHAPE_LABELS: Record<ShapeKind, { icon: IconName; label: string }> = {
  rect: { icon: 'retangulo', label: 'Retangulo (Shift: quadrado)' },
  square: { icon: 'retangulo', label: 'Quadrado' },
  ellipse: { icon: 'elipse', label: 'Elipse (Shift: circulo)' },
  circle: { icon: 'elipse', label: 'Circulo' },
  triangle: { icon: 'triangulo', label: 'Triangulo' },
  diamond: { icon: 'losango', label: 'Losango' },
  line: { icon: 'linha', label: 'Linha (Shift: 15 em 15 graus)' },
  arrow: { icon: 'seta', label: 'Seta (Shift: 15 em 15 graus)' },
};

export class ToolBar {
  readonly el: HTMLElement;

  #buttons = new Map<ToolId, HTMLButtonElement>();
  #options: HTMLElement;
  #shapeRow: HTMLElement;
  #colorRow: HTMLElement;
  #widthRow: HTMLElement;
  #alertRow: HTMLElement;
  #formatRow: HTMLElement;
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
      b.dataset['action'] = t.id;
      b.append(icon(t.icon, 19));
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
    this.#formatRow = document.createElement('div');
    this.#formatRow.className = 'qb-tools__formats';

    this.#options = document.createElement('div');
    this.#options.className = 'qb-tools__options';
    this.#options.hidden = true;
    this.#options.append(
      this.#shapeRow,
      this.#colorRow,
      this.#formatRow,
      this.#widthRow,
      this.#alertRow,
    );

    this.el.append(rail, this.#options);

    // Mudanca vinda de fora (atalho `[`/`]`, ou a barra reestilizando um
    // post-it) tem de aparecer aqui tambem -- mas so o DESTAQUE muda, e nao a
    // lista de botoes: ver `#syncActive`.
    this.style.onChange(() => this.#syncActive());
    this.setActive('select');
  }

  setActive(id: ToolId): void {
    const trocou = this.#active !== id;
    this.#active = id;
    for (const [toolId, btn] of this.#buttons) {
      btn.classList.toggle('qb-tools__btn--active', toolId === id);
    }
    // Reconstroi o painel so quando a FERRAMENTA muda -- e a unica coisa que
    // muda quais botoes existem. Trocar de cor ou de espessura mexe apenas em
    // qual deles esta destacado.
    if (trocou) this.#renderOptions();
    else this.#syncActive();
  }

  /**
   * Atualiza o destaque sem recriar nada.
   *
   * Antes, qualquer mudanca de estilo reconstruia as quatro linhas de opcao --
   * cerca de vinte botoes -- e isso acontecia a cada clique numa cor. Cada
   * elemento novo obriga o navegador a recalcular estilo e layout, e era parte
   * do atraso sentido no seletor.
   */
  #syncActive(): void {
    const id = this.#active;
    const marcar = (row: HTMLElement, cls: string, valor: string | null): void => {
      for (const el of row.children) {
        if (!(el instanceof HTMLElement)) continue;
        el.classList.toggle(cls, el.dataset['value'] === valor);
      }
    };

    if (id === 'note') {
      marcar(this.#colorRow, 'qb-tools__color--active', this.style.noteBg);
      marcar(this.#alertRow, 'qb-tools__alert--active', this.style.noteAlert ?? 'nenhum');
      return;
    }
    if (!hasStyle(id)) return;

    if (id === 'shape') {
      marcar(this.#shapeRow, 'qb-tools__shape--active', this.style.shapeKind);
      // O preenchimento nao e uma forma: ele acende sozinho.
      const fill = this.#shapeRow.querySelector<HTMLElement>('.qb-tools__shape--fill');
      // O icone e o mesmo nos dois estados; quem diz se esta ligado e o
      // destaque, como em todos os outros botoes da barra.
      fill?.classList.toggle('qb-tools__shape--active', this.style.shapeFilled);
    }
    if (id === 'eraser') marcar(this.#alertRow, 'qb-tools__alert--active', this.style.eraserMode);
    else marcar(this.#colorRow, 'qb-tools__color--active', this.style.color(id));

    this.#refreshWidth();
  }

  #renderOptions(): void {
    const id = this.#active;

    // O post-it nao tem cor de marca nem espessura: o que ele escolhe e papel e
    // alerta. Por isso ele nao passa por `hasStyle` e monta o proprio painel.
    if (id === 'note') {
      this.#options.hidden = false;
      this.#shapeRow.hidden = true;
      this.#widthRow.hidden = true;
      this.#formatRow.hidden = true;
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
    // A linha B/I/U so faz sentido escrevendo.
    this.#formatRow.hidden = id !== 'text';
    if (id === 'text') this.#renderTextFormat();
    // O seletor de forma so existe para a ferramenta de formas; para as de tinta
    // a linha inteira sai do fluxo em vez de ficar como um espaco vazio.
    this.#shapeRow.hidden = id !== 'shape';
    this.#widthRow.hidden = false;
    if (id === 'shape') this.#renderShapes();

    // A borracha nao tem cor -- ela tira tinta, nao poe. No lugar da paleta vai
    // a escolha de como ela apaga.
    this.#colorRow.hidden = id === 'eraser';
    this.#alertRow.hidden = id !== 'eraser';
    if (id === 'eraser') this.#renderEraserModes();
    else this.#renderColors(id);

    this.#renderWidths(id);
  }

  /**
   * Negrito, italico e sublinhado.
   *
   * As tres teclas ja funcionavam dentro da caixa desde a Fase 5, e ninguem
   * descobria: recurso sem controle visivel e recurso que nao existe. Os botoes
   * valem tanto para o texto que esta sendo digitado quanto para a caixa que
   * estiver selecionada.
   */
  #renderTextFormat(): void {
    if (this.#formatRow.childElementCount > 0) return;

    const add = (what: 'bold' | 'italic' | 'underline', letra: string, label: string): void => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `qb-tools__format qb-tools__format--${what}`;
      b.dataset['value'] = what;
      b.textContent = letra;
      b.title = label;
      b.setAttribute('aria-label', label);
      b.addEventListener('click', () => this.actions.toggleTextFormat(what));
      this.#formatRow.append(b);
    };

    add('bold', 'B', 'Negrito (Ctrl+B)');
    add('italic', 'I', 'Italico (Ctrl+I)');
    add('underline', 'U', 'Sublinhado (Ctrl+U)');
  }

  #renderEraserModes(): void {
    const current = this.style.eraserMode;
    this.#alertRow.replaceChildren();

    const add = (mode: EraserMode, name: IconName, label: string): void => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'qb-tools__alert';
      b.dataset['value'] = mode;
      b.classList.toggle('qb-tools__alert--active', mode === current);
      b.append(icon(name, 17));
      b.title = label;
      b.setAttribute('aria-label', label);
      b.addEventListener('click', () => this.style.setEraserMode(mode));
      this.#alertRow.append(b);
    };

    add('peca', 'apagarPeca', 'Apagar por peça: some só o que a borracha cobrir');
    add('objeto', 'apagarTraco', 'Apagar o traço inteiro que a borracha tocar');
  }

  #renderNoteColors(): void {
    const current = this.style.noteBg;
    this.#colorRow.replaceChildren();
    for (const color of NOTE_COLORS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'qb-tools__color';
      b.dataset['value'] = color;
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
      b.dataset['value'] = level ?? 'nenhum';
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
      // O valor fica no proprio elemento: e o que permite atualizar o destaque
      // depois sem recriar o botao (ver `#syncActive`).
      b.dataset['value'] = kind;
      b.classList.toggle('qb-tools__shape--active', kind === current);
      b.append(icon(meta.icon, 17));
      b.title = meta.label;
      b.setAttribute('aria-label', meta.label);
      b.addEventListener('click', () => this.style.setShapeKind(kind));
      this.#shapeRow.append(b);
    }

    const fill = document.createElement('button');
    fill.type = 'button';
    fill.className = 'qb-tools__shape qb-tools__shape--fill';
    fill.classList.toggle('qb-tools__shape--active', this.style.shapeFilled);
    fill.append(icon('preencher', 17));
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
      b.dataset['value'] = color;
      b.classList.toggle('qb-tools__color--active', color === current);
      // A amostra e a propria cor do documento, sem passar pelo adaptador de
      // tema: e ela que fica gravada no .wbd e que o usuario esta escolhendo.
      b.style.background = color;
      b.title = color;
      b.setAttribute('aria-label', `Cor ${color}`);
      b.addEventListener('click', () => this.style.setColor(id, color));
      this.#colorRow.append(b);
    }

    // A cor escolhida a mao entra como mais uma amostra, para poder ser
    // reescolhida com um clique depois de passar por outra da paleta.
    const custom = this.style.color(id);
    if (!this.style.colorsFor(id).includes(custom)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'qb-tools__color';
      b.dataset['value'] = custom;
      b.classList.add('qb-tools__color--active');
      b.style.background = custom;
      b.title = `${custom} (escolhida)`;
      b.setAttribute('aria-label', `Cor ${custom}`);
      b.addEventListener('click', () => this.style.setColor(id, custom));
      this.#colorRow.append(b);
    }

    this.#colorRow.append(this.#customColorButton(id));
  }

  /**
   * Botao que abre o seletor de cor do sistema.
   *
   * O `<input type="color">` fica escondido atras do botao em vez de aparecer
   * cru: o controle nativo tem tamanho e forma proprios, e destoaria da fila de
   * amostras redondas.
   *
   * Criado UMA vez e reaproveitado. Recria-lo a cada troca de ferramenta custou
   * caro e foi pego pela medicao: o controle nativo de cor e pesado de
   * instanciar, e sozinho levou o custo da troca de 1,6 ms para 5,3 ms.
   */
  #customColorButton(id: StyleToolId): HTMLElement {
    this.#customTool = id;

    if (!this.#customColor) {
      const wrap = document.createElement('label');
      wrap.className = 'qb-tools__color qb-tools__color--custom';
      wrap.title = 'Escolher outra cor';
      wrap.setAttribute('aria-label', 'Escolher outra cor');

      const input = document.createElement('input');
      input.type = 'color';
      input.className = 'qb-tools__color-input';

      input.addEventListener('input', () => {
        if (this.#customTool) this.style.setColor(this.#customTool, input.value);
      });
      // O aviso so sai quando a escolha termina: durante o arraste do seletor a
      // cor passa por dezenas de valores, e avisar em cada um seria ruido.
      input.addEventListener('change', () => this.actions.warnIfLowContrast(input.value));

      wrap.append(input, icon('mais', 15));
      this.#customColor = wrap;
      this.#customInput = input;
    }

    if (this.#customInput) this.#customInput.value = normalizeHex(this.style.color(id));
    return this.#customColor;
  }

  #customColor: HTMLElement | null = null;
  #customInput: HTMLInputElement | null = null;
  /** Para qual ferramenta o seletor esta apontando agora. */
  #customTool: StyleToolId | null = null;

  /**
   * Barra de 0 a 100% no lugar dos tres degraus fixos.
   *
   * O numero ao lado mostra a porcentagem, que e o que a barra controla; a
   * dica traz o valor real em px, que e o que sai no papel.
   */
  #renderWidths(id: StyleToolId): void {
    this.#widthTool = id;

    if (!this.#slider) {
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.className = 'qb-tools__slider';
      slider.min = '0';
      slider.max = '100';
      slider.step = '1';

      const readout = document.createElement('span');
      readout.className = 'qb-tools__pct';

      // `input`, e nao `change`: o traco tem de acompanhar o arraste da barra.
      // So ficou viavel depois que trocar o estilo deixou de reconstruir o
      // painel e de gravar em disco a cada mudanca (ver B3 no BUGS.md).
      slider.addEventListener('input', () => {
        if (!this.#widthTool) return;
        this.style.setPercent(this.#widthTool, Number(slider.value));
        readout.textContent = `${slider.value}%`;
      });

      this.#slider = slider;
      this.#pctLabel = readout;
      this.#widthRow.append(slider, readout);
    }

    this.#refreshWidth();
  }

  /**
   * Reaplica o valor da barra quando a espessura muda por fora (`[` e `]`).
   *
   * O controle e criado UMA vez e so atualizado: recriar `input type="range"` e
   * `type="color"` a cada troca de ferramenta levou o custo da troca de 1,6 ms
   * para 5,3 ms -- pego pela medicao do proprio auto-teste.
   */
  #refreshWidth(): void {
    const id = this.#widthTool;
    if (!id || !this.#slider || !this.#pctLabel) return;
    const noun = id === 'text' ? 'Tamanho da fonte' : id === 'eraser' ? 'Diametro' : 'Espessura';
    const pct = this.style.percent(id);
    this.#slider.value = String(pct);
    this.#slider.setAttribute('aria-label', noun);
    this.#slider.title = `${noun}: ${this.style.width(id)}px ([ e ] andam de 10 em 10%)`;
    this.#pctLabel.textContent = `${pct}%`;
  }

  #slider: HTMLInputElement | null = null;
  #pctLabel: HTMLElement | null = null;
  #widthTool: StyleToolId | null = null;

}
