/**
 * Adaptacao de cor por tema.
 *
 * O problema concreto: um traco preto desenhado no tema claro fica invisivel se
 * o quadro passar a ser escuro (e um traco branco some no tema claro). A cor
 * gravada no arquivo NUNCA muda -- ela e a cor que o autor escolheu, e e ela que
 * a exportacao vai usar. O que muda e a cor exibida, calculada por frame.
 *
 * Duas regras que importam:
 *
 * 1. Nao inverter tudo. Um vermelho saturado ja contrasta com fundo claro E
 *    escuro; inverte-lo so o deixaria feio sem ganhar legibilidade. So se
 *    inverte quando o contraste medido contra o fundo esta abaixo do minimo.
 *
 * 2. Isto vale para MARCAS (traco de caneta, texto, contorno de forma), nao para
 *    SUPERFICIES (fundo de post-it, preenchimento de forma, marca-texto). Um
 *    post-it amarelo pastel tem contraste baixissimo contra o branco -- e e
 *    exatamente assim que ele deve ser. Aplicar a regra ali transformaria os
 *    post-its em blocos escuros. Por isso o adaptador so e chamado nas marcas.
 */

interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * Abaixo disto a marca comeca a se confundir com o fundo.
 *
 * 2.0 e deliberadamente permissivo: o laranja #f08c00 tem 2.48 contra o branco.
 * E baixo, mas e uma cor de quadro branco legitima, e inverte-la surpreenderia
 * quem a escolheu. O alvo aqui e resgatar o que sumiria de vez (branco no claro,
 * preto no escuro), nao reprovar cores por acessibilidade.
 */
const MIN_CONTRAST = 2.0;

export type ColorAdapter = (color: string) => string;

/**
 * Cria o adaptador para um fundo de quadro. Simetrico: funciona nos dois temas,
 * porque o criterio e o contraste contra o fundo, nao qual tema esta ativo.
 */
export function createColorAdapter(boardBg: string): ColorAdapter {
  const bg = parseColor(boardBg);
  const bgLum = bg ? luminance(bg) : 0;

  // Um quadro tem dezenas de cores distintas mas milhares de objetos; sem cache
  // o mesmo calculo se repetiria por objeto, a cada frame.
  const cache = new Map<string, string>();

  return (color: string): string => {
    const hit = cache.get(color);
    if (hit !== undefined) return hit;

    const rgba = parseColor(color);
    if (!rgba) {
      cache.set(color, color);
      return color;
    }

    const current = contrast(luminance(rgba), bgLum);
    let out = color;

    if (current < MIN_CONTRAST) {
      const flipped = invertLightness(rgba);
      // So aceita a inversao se ela realmente melhorou a leitura.
      if (contrast(luminance(flipped), bgLum) > current) out = toHex(flipped);
    }

    cache.set(color, out);
    return out;
  };
}

/** Preto ou branco, o que for legivel sobre `bg`. Usado no texto dos post-its. */
export function readableTextOn(bg: string): string {
  const rgba = parseColor(bg);
  if (!rgba) return '#2a2a2a';
  return luminance(rgba) > 0.42 ? '#23262d' : '#eef1f6';
}

// --------------------------------------------------------------- utilitarios

function parseColor(color: string): Rgba | null {
  // rgb()/rgba(): formato do conteudo importado do Microsoft Whiteboard, onde a
  // tinta vem como fill="rgba(91,49,141,1)". Sem tratar isso aqui, caligrafia
  // preta importada nao seria adaptada e sumiria no tema escuro.
  if (color.startsWith('rgb')) {
    const nums = color.match(/[\d.]+/g);
    if (!nums || nums.length < 3) return null;
    return {
      r: Number(nums[0]),
      g: Number(nums[1]),
      b: Number(nums[2]),
      // O alfa de rgba() vem em 0..1; o resto do modulo trabalha em 0..255.
      a: nums.length > 3 ? Math.round(Number(nums[3]) * 255) : 255,
    };
  }

  if (color.charCodeAt(0) !== 35 /* # */) return null;
  const hex = color.slice(1);

  if (hex.length === 3) {
    return {
      r: parseInt(hex[0]! + hex[0]!, 16),
      g: parseInt(hex[1]! + hex[1]!, 16),
      b: parseInt(hex[2]! + hex[2]!, 16),
      a: 255,
    };
  }
  if (hex.length === 6 || hex.length === 8) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
      // Preenchimentos usam a forma #rrggbbaa; o alfa precisa sobreviver.
      a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) : 255,
    };
  }
  return null;
}

function toHex(c: Rgba): string {
  const h = (n: number): string => Math.round(n).toString(16).padStart(2, '0');
  const base = `#${h(c.r)}${h(c.g)}${h(c.b)}`;
  return c.a >= 255 ? base : `${base}${h(c.a)}`;
}

/** Luminancia relativa (WCAG). */
function luminance(c: Rgba): number {
  const f = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}

function contrast(l1: number, l2: number): number {
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

/** Espelha a luminosidade em HSL preservando matiz e saturacao. */
function invertLightness(c: Rgba): Rgba {
  const { h, s, l } = rgbToHsl(c);
  return { ...hslToRgb(h, s, 1 - l), a: c.a };
}

function rgbToHsl(c: Rgba): { h: number; s: number; l: number } {
  const r = c.r / 255;
  const g = c.g / 255;
  const b = c.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) return { h: 0, s: 0, l };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;

  return { h: h / 6, s, l };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  if (s === 0) {
    const v = l * 255;
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: hueToRgb(p, q, h + 1 / 3) * 255,
    g: hueToRgb(p, q, h) * 255,
    b: hueToRgb(p, q, h - 1 / 3) * 255,
  };
}

function hueToRgb(p: number, q: number, t: number): number {
  let x = t;
  if (x < 0) x += 1;
  if (x > 1) x -= 1;
  if (x < 1 / 6) return p + (q - p) * 6 * x;
  if (x < 1 / 2) return q;
  if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
  return p;
}
