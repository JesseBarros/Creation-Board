import type { ShapeKind } from '@shared/model/types';
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

/** Espessuras em unidades de MUNDO. Tres degraus por ferramenta. */
const WIDTHS: Record<StyleToolId, readonly number[]> = {
  pen: [2, 4, 7],
  highlighter: [12, 20, 30],
  pencil: [1.5, 3, 5],
  shape: [2, 4, 7],
};

const DEFAULTS: Record<StyleToolId, { color: string; width: number }> = {
  pen: { color: INK_COLORS[0], width: WIDTHS.pen[1]! },
  highlighter: { color: HIGHLIGHTER_COLORS[0], width: WIDTHS.highlighter[1]! },
  pencil: { color: INK_COLORS[0], width: WIDTHS.pencil[1]! },
  shape: { color: INK_COLORS[0], width: WIDTHS.shape[0]! },
};

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
  #listeners = new Set<() => void>();

  constructor() {
    const stored = readStored();
    this.#state = { ...DEFAULTS, ...stored.tools };
    this.#shapeKind = stored.shapeKind ?? DEFAULT_SHAPE_KIND;
    this.#shapeFilled = stored.shapeFilled ?? false;
  }

  colorsFor(id: StyleToolId): readonly string[] {
    return id === 'highlighter' ? HIGHLIGHTER_COLORS : INK_COLORS;
  }

  widthsFor(id: StyleToolId): readonly number[] {
    return WIDTHS[id];
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
   * Anda pelos degraus declarados em vez de multiplicar por um fator: a
   * espessura corrente pode ter vindo do arquivo de preferencias com um valor
   * que nao esta na lista, e a partida e sempre o degrau mais proximo.
   */
  stepWidth(id: StyleToolId, direction: -1 | 1): void {
    const steps = WIDTHS[id];
    const current = this.#state[id].width;
    let nearest = 0;
    for (let i = 1; i < steps.length; i++) {
      if (Math.abs(steps[i]! - current) < Math.abs(steps[nearest]! - current)) nearest = i;
    }
    const next = Math.min(steps.length - 1, Math.max(0, nearest + direction));
    this.setWidth(id, steps[next]!);
  }

  onChange(fn: () => void): () => void {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  #commit(): void {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          ...this.#state,
          shapeKind: this.#shapeKind,
          shapeFilled: this.#shapeFilled,
        }),
      );
    } catch {
      // Sem localStorage o app continua funcionando; so nao lembra a escolha.
    }
    for (const fn of this.#listeners) fn();
  }
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
    const palette: readonly string[] = id === 'highlighter' ? HIGHLIGHTER_COLORS : INK_COLORS;
    tools[id] = {
      color: typeof color === 'string' && palette.includes(color) ? color : DEFAULTS[id].color,
      width:
        typeof width === 'number' && width > 0 && width <= 200 ? width : DEFAULTS[id].width,
    };
  }

  const kind = obj['shapeKind'];
  return {
    tools,
    shapeKind:
      typeof kind === 'string' && (SHAPE_KINDS as readonly string[]).includes(kind)
        ? (kind as ShapeKind)
        : undefined,
    shapeFilled: typeof obj['shapeFilled'] === 'boolean' ? obj['shapeFilled'] : undefined,
  };
}
