import type { RichSpan } from '@shared/model/types';

/**
 * Traducao entre os spans do modelo e o DOM que o usuario edita.
 *
 * O editor e um `contentEditable`, e a decisao de arquitetura por tras disso
 * (README) e que o Chromium ja sabe posicionar cursor, selecionar, acentuar e
 * receber IME. O preco e este modulo: o que sai de la e HTML, e o que o quadro
 * guarda e uma lista de trechos formatados.
 *
 * A estrutura gerada e deliberadamente RASA -- trechos e `<br>`, sem blocos
 * aninhados. Assim a leitura de volta nao precisa entender aninhamento de
 * `<div>`, e a quebra de linha tem uma representacao so.
 */

export function spansToDom(content: readonly RichSpan[], root: HTMLElement): void {
  const frag = document.createDocumentFragment();

  for (const span of content) {
    const lines = span.text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) frag.append(document.createElement('br'));
      if (lines[i]!.length === 0) continue;
      frag.append(styled(lines[i]!, span));
    }
  }

  // Um editor totalmente vazio nao tem onde por o cursor em alguns casos; o
  // `<br>` final e a mesma solucao que o proprio navegador usa.
  if (!frag.hasChildNodes()) frag.append(document.createElement('br'));
  root.replaceChildren(frag);
}

export function domToSpans(root: HTMLElement): RichSpan[] {
  const out: RichSpan[] = [];

  const push = (text: string, style: SpanStyle): void => {
    if (text.length === 0) return;
    const last = out[out.length - 1];
    if (last && sameStyle(last, style)) last.text += text;
    else out.push({ text, ...style });
  };

  const walk = (node: Node, style: SpanStyle): void => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE) {
        push(child.textContent ?? '', style);
        continue;
      }
      if (!(child instanceof HTMLElement)) continue;

      if (child.tagName === 'BR') {
        // O `<br>` que fecha o ultimo bloco e do navegador, nao do autor:
        // conta-lo devolveria uma linha em branco a cada ida e volta pelo
        // editor, e a caixa cresceria sozinha a cada edicao.
        if (isTrailingBr(child, root)) continue;
        push('\n', style);
        continue;
      }

      // Blocos ainda aparecem quando o texto e COLADO de fora: o Chromium traz
      // a estrutura da origem. Cada bloco fechado vale uma quebra.
      if (isBlock(child) && out.length > 0) push('\n', style);
      walk(child, merge(style, child));
    }
  };

  walk(root, {});
  return out;
}

/** Caixa sem nenhuma letra -- so espacos ou quebras. */
export function isBlank(content: readonly RichSpan[]): boolean {
  return content.every((s) => s.text.trim().length === 0);
}

export function plainText(content: readonly RichSpan[]): string {
  return content.map((s) => s.text).join('');
}

// ------------------------------------------------------------------ internos

type SpanStyle = Omit<RichSpan, 'text'>;

const BLOCKS = new Set(['DIV', 'P', 'LI', 'TR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6']);

function isBlock(el: HTMLElement): boolean {
  return BLOCKS.has(el.tagName);
}

function styled(text: string, span: RichSpan): Node {
  let node: Node = document.createTextNode(text);
  if (span.underline) node = wrapIn('u', node);
  if (span.italic) node = wrapIn('i', node);
  if (span.bold) node = wrapIn('b', node);
  if (span.color) {
    const el = document.createElement('span');
    el.style.color = span.color;
    el.append(node);
    node = el;
  }
  return node;
}

function wrapIn(tag: string, node: Node): HTMLElement {
  const el = document.createElement(tag);
  el.append(node);
  return el;
}

/**
 * Formatacao acumulada ao descer um nivel.
 *
 * Le tanto as tags quanto o estilo inline porque as duas formas chegam: as tags
 * vem do que este modulo gerou, o estilo inline vem do `execCommand` (que ainda
 * e o caminho mais curto para negrito e italico no Chromium) e de texto colado.
 */
function merge(style: SpanStyle, el: HTMLElement): SpanStyle {
  const out: SpanStyle = { ...style };
  const css = el.style;

  if (el.tagName === 'B' || el.tagName === 'STRONG' || weightOf(css.fontWeight) >= 600) {
    out.bold = true;
  }
  if (el.tagName === 'I' || el.tagName === 'EM' || css.fontStyle === 'italic') out.italic = true;
  if (el.tagName === 'U' || css.textDecorationLine.includes('underline')) out.underline = true;
  if (css.color) out.color = css.color;
  return out;
}

function weightOf(value: string): number {
  if (value === 'bold' || value === 'bolder') return 700;
  return parseInt(value, 10) || 0;
}

function sameStyle(a: SpanStyle, b: SpanStyle): boolean {
  return (
    !!a.bold === !!b.bold &&
    !!a.italic === !!b.italic &&
    !!a.underline === !!b.underline &&
    (a.color ?? null) === (b.color ?? null)
  );
}

/** O `<br>` e o ultimo no util do editor? */
function isTrailingBr(br: HTMLElement, root: HTMLElement): boolean {
  let node: Node | null = br;
  while (node && node !== root) {
    if (node.nextSibling) return false;
    node = node.parentNode;
  }
  return true;
}
