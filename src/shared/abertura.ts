/**
 * A cor de fundo da JANELA em cada tema (07/10/2026).
 *
 * E a cor que aparece antes de a pagina pintar e nas bordas ao redimensionar,
 * e por isso tem de ser a mesma do fundo da tela de abertura (`index.html`): as
 * duas diferentes seriam uma piscada ao abrir.
 *
 *  - escuro: a cor exata do fundo da logo (medido: rgb(6,9,18)) -- a logo e um
 *    PNG opaco, e qualquer outra cor deixaria o retangulo dela aparecendo;
 *  - claro: o `--bg` do tema claro (base.css).
 *
 * O `check:abertura` confere que o `index.html` usa estas mesmas duas cores.
 */
export const COR_DA_JANELA = {
  dark: '#060912',
  light: '#d6dbe5',
} as const;

export type TemaDaJanela = keyof typeof COR_DA_JANELA;

export function temaDaJanelaValido(v: unknown): v is TemaDaJanela {
  return v === 'dark' || v === 'light';
}
