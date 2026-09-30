/**
 * O idioma em vigor e a formatacao que depende dele.
 *
 * Mora separado do `index.ts` porque os dicionarios tambem formatam numero
 * ("1.063 quadros" / "1,063 boards") -- e o `index.ts` importa os dicionarios.
 * Juntos, seria importacao circular.
 */

export type Idioma = 'pt-BR' | 'en-US';

let atual: Idioma = 'pt-BR';

export function idiomaAtual(): Idioma {
  return atual;
}

export function definirIdioma(idioma: Idioma): void {
  atual = idioma;
}

/** Numero no formato do idioma: 1.063 em portugues, 1,063 em ingles. */
export function formatarNumero(n: number, opcoes?: Intl.NumberFormatOptions): string {
  return n.toLocaleString(atual, opcoes);
}

/** Data e hora no formato do idioma. */
export function formatarData(ms: number, opcoes: Intl.DateTimeFormatOptions): string {
  return new Date(ms).toLocaleString(atual, opcoes);
}

/** Tamanho de arquivo: "4,8 MB" em portugues, "4.8 MB" em ingles. */
export function formatarBytes(bytes: number): string {
  if (bytes < 1024) return `${formatarNumero(bytes)} B`;
  if (bytes < 1024 * 1024) return `${formatarNumero(Math.round(bytes / 1024))} KB`;
  return `${formatarNumero(bytes / (1024 * 1024), { minimumFractionDigits: 1, maximumFractionDigits: 1 })} MB`;
}
