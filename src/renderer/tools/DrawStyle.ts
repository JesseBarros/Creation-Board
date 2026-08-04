import type { AlertLevel, ShapeKind } from '@shared/model/types';
import type { StyleToolId } from './types';

/**
 * Cor e espessura correntes das ferramentas que produzem marca: as tres de
 * tinta e a de formas.
 *
 * O estado e POR FERRAMENTA, e nao global: quem grifa de amarelo com 20px de
 * marca-texto e volta para a caneta espera a caneta preta e fina de antes, nao
 * uma caneta amarela grossa. Um estado unico obrigaria a reescolher cor a cada
 * troca de ferramenta.
 *
 * Persistido em localStorage pelo mesmo motivo do tema: e preferencia do
 * usuario, nao conteudo do quadro -- nao pertence ao .wbd.
 */

const STORAGE_KEY = 'qb.draw';

/** Espera antes de gravar a preferencia em disco. Ver `#commit`. */
const PERSIST_DELAY_MS = 400;

/**
 * Cores de tinta. Sao exatamente as que `npm run check:colors` valida como
 * "marca", isto e, as que continuam legiveis nos dois temas depois do adaptador
 * (ver render/colorAdapt.ts). Acrescentar cor aqui exige acrescentar a linha
 * correspondente em scripts/check-colors.mjs, senao ela entra sem que ninguem
 * confira o contraste dela no tema escuro.
 */
export const INK_COLORS = [
  '#1f2933',
  '#e03131',
  '#f08c00',
  '#2f9e44',
  '#0c8599',
  '#1971c2',
  '#9c36b5',
  '#c2255c',
] as const;

/**
 * Cores de marca-texto. Sao SUPERFICIES, nao marcas: o painter as desenha sem
 * passar pelo adaptador e com 40% de opacidade, porque contraste baixo e o
 * efeito pretendido -- um marca-texto opaco e escuro seria o oposto de grifar.
 */
export const HIGHLIGHTER_COLORS = [
  '#ffd43b',
  '#b2f2bb',
  '#a5d8ff',
  '#ffc9c9',
  '#d0bfff',
] as const;

/**
 * Cores de papel dos post-its. Sao SUPERFICIES, como o marca-texto: nao passam
 * pelo adaptador de tema, e quem garante a leitura e `readableTextOn`, que
 * escolhe texto claro ou escuro conforme o papel.
 */
export const NOTE_COLORS = ['#fff3bf', '#d3f9d8', '#d0ebff', '#ffdeeb', '#e9ecef'] as const;

/**
 * Simbolo de cada nivel de alerta.
 *
 * Glifos simples, e nao emoji: no canvas o emoji entra pela fonte colorida do
 * sistema, que ignora `fillStyle` -- o simbolo sairia sempre da mesma cor,
 * quando a cor e justamente o que distingue os tres niveis.
 */
export const ALERT_ICONS: Record<AlertLevel, string> = {
  importante: '!',
  duvida: '?',
  revisar: '↻',
};

/**
 * Faixa de espessura de cada ferramenta, do minimo ao maximo.
 *
 * Ate 04/08/2026 eram tres degraus fixos; ele pediu controle continuo, e a
 * barra de 0 a 100% mapeia para esta faixa. **0% nao e zero**: um traco de
 * espessura zero seria invisivel, e uma barra cujo inicio nao desenha nada e uma
 * barra com um pedaco inutil. O minimo e a menor espessura que ainda deixa
 * marca.
 *
 * No texto a "espessura" e o corpo da fonte; na borracha, o diametro em px de
 * TELA -- ela e instrumento de apontar, e o que importa e o quanto cobre do que
 * se esta vendo. Em unidades de mundo, aproximar o zoom para acertar um detalhe
 * faria a borracha crescer junto.
 */
const RANGES: Record<StyleToolId, { min: number; max: number }> = {
  pen: { min: 1, max: 14 },
  highlighter: { min: 8, max: 44 },
  shape: { min: 1, max: 14 },
  text: { min: 10, max: 72 },
  eraser: { min: 8, max: 80 },
};

/** Quanto `[` e `]` andam na barra, em pontos percentuais. */
const STEP_PERCENT = 10;

const DEFAULTS: Record<StyleToolId, { color: string; width: number }> = {
  pen: { color: INK_COLORS[0], width: 4 },
  highlighter: { color: HIGHLIGHTER_COLORS[0], width: 20 },
  shape: { color: INK_COLORS[0], width: 2 },
  text: { color: INK_COLORS[0], width: 16 },
  // A cor da borracha nunca e usada; ela entra aqui so para o eixo de tamanho
  // ser o mesmo das outras ferramentas, com `[` e `]` valendo igual.
  eraser: { color: INK_COLORS[0], width: 28 },
};

/**
 * Como a borracha apaga.
 *
 * `peca` remove por onde ela passa, deixando o resto do traco no lugar;
 * `objeto` remove o traco inteiro que ela toca. As duas existem porque servem a
 * gestos diferentes: corrigir uma letra e limpar uma anotacao inteira.
 */
export type EraserMode = 'peca' | 'objeto';

/** `#rrggbb` ou `#rgb`. O seletor do sistema devolve sempre a forma longa. */
export function isHexColor(value: string): boolean {
  return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Formas oferecidas na barra, na ordem em que aparecem. */
export const SHAPE_KINDS: readonly ShapeKind[] = [
  'rect',
  'ellipse',
  'triangle',
  'diamond',
  'line',
  'arrow',
];

const DEFAULT_SHAPE_KIND: ShapeKind = 'rect';

type State = Record<StyleToolId, { color: string; width: number }>;

export class DrawStyle {
  #state: State;
  #shapeKind: ShapeKind;
  #shapeFilled: boolean;
  #noteBg: string;
  #noteAlert: AlertLevel | null;
  #eraserMode: EraserMode;
  #listeners = new Set<() => void>();

  constructor() {
    const stored = readStored();
    this.#state = { ...DEFAULTS, ...stored.tools };
    this.#shapeKind = stored.shapeKind ?? DEFAULT_SHAPE_KIND;
    this.#shapeFilled = stored.shapeFilled ?? false;
    this.#noteBg = stored.noteBg ?? NOTE_COLORS[0];
    this.#noteAlert = stored.noteAlert ?? null;
    this.#eraserMode = stored.eraserMode ?? 'peca';
  }

  get eraserMode(): EraserMode {
    return this.#eraserMode;
  }

  setEraserMode(mode: EraserMode): void {
    if (this.#eraserMode === mode) return;
    this.#eraserMode = mode;
    this.#commit();
  }

  colorsFor(id: StyleToolId): readonly string[] {
    return id === 'highlighter' ? HIGHLIGHTER_COLORS : INK_COLORS;
  }

  range(id: StyleToolId): { min: number; max: number } {
    return RANGES[id];
  }

  /** A espessura atual como 0..100, que e o que a barra mostra. */
  percent(id: StyleToolId): number {
    const { min, max } = RANGES[id];
    return clamp(Math.round(((this.#state[id].width - min) / (max - min)) * 100), 0, 100);
  }

  setPercent(id: StyleToolId, percent: number): void {
    const { min, max } = RANGES[id];
    const p = clamp(percent, 0, 100);
    // Uma casa decimal: o suficiente para a barra andar suave sem gravar
    // numeros como 3.7142857 no arquivo.
    this.setWidth(id, Math.round((min + ((max - min) * p) / 100) * 10) / 10);
  }

  color(id: StyleToolId): string {
    return this.#state[id].color;
  }

  width(id: StyleToolId): number {
    return this.#state[id].width;
  }

  get shapeKind(): ShapeKind {
    return this.#shapeKind;
  }

  /**
   * Preenchimento das formas fechadas.
   *
   * Guardado como um booleano, e nao como uma cor: o preenchimento e sempre uma
   * versao translucida do proprio contorno. Duas cores independentes dobrariam a
   * paleta na barra para um ganho que um quadro de estudos nao pede.
   */
  get shapeFilled(): boolean {
    return this.#shapeFilled;
  }

  /** Cor do papel do proximo post-it. */
  get noteBg(): string {
    return this.#noteBg;
  }

  /** Nivel de alerta do proximo post-it; null = post-it comum. */
  get noteAlert(): AlertLevel | null {
    return this.#noteAlert;
  }

  setNoteBg(bg: string): void {
    if (this.#noteBg === bg) return;
    this.#noteBg = bg;
    this.#commit();
  }

  setNoteAlert(level: AlertLevel | null): void {
    if (this.#noteAlert === level) return;
    this.#noteAlert = level;
    this.#commit();
  }

  setShapeKind(kind: ShapeKind): void {
    if (this.#shapeKind === kind) return;
    this.#shapeKind = kind;
    this.#commit();
  }

  setShapeFilled(on: boolean): void {
    if (this.#shapeFilled === on) return;
    this.#shapeFilled = on;
    this.#commit();
  }

  setColor(id: StyleToolId, color: string): void {
    if (this.#state[id].color === color) return;
    this.#state[id] = { ...this.#state[id], color };
    this.#commit();
  }

  setWidth(id: StyleToolId, width: number): void {
    if (this.#state[id].width === width) return;
    this.#state[id] = { ...this.#state[id], width };
    this.#commit();
  }

  /**
   * Passo de espessura para os atalhos `[` e `]`.
   *
   * Anda em pontos percentuais da barra, e nao entre degraus: com a faixa
   * continua nao existem mais degraus para pular.
   */
  stepWidth(id: StyleToolId, direction: -1 | 1): void {
    this.setPercent(id, this.percent(id) + direction * STEP_PERCENT);
  }

  onChange(fn: () => void): () => void {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  /**
   * Avisa a interface na hora e grava em disco depois.
   *
   * A gravacao e adiada porque `localStorage.setItem` e SINCRONO: escrever a
   * cada clique numa cor punha uma ida ao disco no meio do gesto, e era parte
   * do atraso sentido no seletor de cores. O estado em memoria muda na hora --
   * quem desenha nunca ve o valor velho --, e o arquivo alcanca sozinho.
   */
  #commit(): void {
    for (const fn of this.#listeners) fn();

    clearTimeout(this.#persistTimer);
    this.#persistTimer = window.setTimeout(() => this.#persist(), PERSIST_DELAY_MS);
  }

  #persist(): void {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          ...this.#state,
          shapeKind: this.#shapeKind,
          shapeFilled: this.#shapeFilled,
          noteBg: this.#noteBg,
          noteAlert: this.#noteAlert,
          eraserMode: this.#eraserMode,
        }),
      );
    } catch {
      // Sem localStorage o app continua funcionando; so nao lembra a escolha.
    }
  }

  /** Grava agora o que estiver pendente. O guarda de fechamento da janela usa. */
  flush(): void {
    if (this.#persistTimer === 0) return;
    clearTimeout(this.#persistTimer);
    this.#persistTimer = 0;
    this.#persist();
  }

  #persistTimer = 0;
}

/**
 * Le o estado gravado, descartando o que nao for reconhecivel.
 *
 * O arquivo de preferencias e editavel a mao e sobrevive a versoes: uma cor que
 * saiu da paleta ou uma espessura absurda nao pode derrubar o app nem produzir
 * um traco invisivel.
 */
function readStored(): {
  tools: Partial<State>;
  shapeKind?: ShapeKind;
  shapeFilled?: boolean;
  noteBg?: string;
  noteAlert?: AlertLevel | null;
  eraserMode?: EraserMode;
} {
  let raw: unknown;
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (!text) return { tools: {} };
    raw = JSON.parse(text);
  } catch {
    return { tools: {} };
  }
  if (typeof raw !== 'object' || raw === null) return { tools: {} };
  const obj = raw as Record<string, unknown>;

  const tools: Partial<State> = {};
  for (const id of Object.keys(DEFAULTS) as StyleToolId[]) {
    const entry = obj[id];
    if (typeof entry !== 'object' || entry === null) continue;
    const { color, width } = entry as { color?: unknown; width?: unknown };
    tools[id] = {
      // Qualquer cor valida, e nao so as da paleta: desde 04/08/2026 da para
      // escolher cor livre, e uma cor escolhida a mao nao pode ser descartada
      // na proxima abertura do app.
      color: typeof color === 'string' && isHexColor(color) ? color : DEFAULTS[id].color,
      width:
        typeof width === 'number' && width > 0 && width <= 200 ? width : DEFAULTS[id].width,
    };
  }

  const kind = obj['shapeKind'];
  const bg = obj['noteBg'];
  const alert = obj['noteAlert'];
  const eraser = obj['eraserMode'];
  return {
    eraserMode: eraser === 'peca' || eraser === 'objeto' ? eraser : undefined,
    tools,
    shapeKind:
      typeof kind === 'string' && (SHAPE_KINDS as readonly string[]).includes(kind)
        ? (kind as ShapeKind)
        : undefined,
    shapeFilled: typeof obj['shapeFilled'] === 'boolean' ? obj['shapeFilled'] : undefined,
    noteBg: typeof bg === 'string' && (NOTE_COLORS as readonly string[]).includes(bg) ? bg : undefined,
    noteAlert:
      alert === null || (typeof alert === 'string' && alert in ALERT_ICONS)
        ? (alert as AlertLevel | null)
        : undefined,
  };
}
