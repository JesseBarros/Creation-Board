import { definirIdioma, idiomaDoSistema, idiomaValido, type Idioma } from '@shared/i18n';

/** Onde fica a escolha feita em Configuracoes. Sem ela, vale o idioma do Windows. */
export const IDIOMA_KEY = 'qb.idioma';

/**
 * Qual idioma vale nesta execucao, na ordem:
 *
 *   1. `QB_IDIOMA` (parametro `idioma` da pagina) -- instrumento, nao grava nada;
 *   2. o SELFTEST roda em portugues quando nao se pede outro: varias guardas
 *      procuram elementos pelo texto, e a maquina de quem roda nao pode decidir
 *      se elas passam;
 *   3. a escolha gravada em Configuracoes;
 *   4. o idioma do Windows.
 */
export function escolherIdioma(): Idioma {
  const params = new URLSearchParams(location.search);
  const forcado = params.get('idioma');
  if (idiomaValido(forcado)) return forcado;
  if (params.get('selftest') !== null) return 'pt-BR';
  try {
    const gravado = localStorage.getItem(IDIOMA_KEY);
    if (idiomaValido(gravado)) return gravado;
  } catch {
    // Sem armazenamento: cai no idioma do sistema.
  }
  return idiomaDoSistema(navigator.languages);
}

/**
 * Aplica o idioma: textos (`t()`), o `lang` da pagina -- que o leitor de tela
 * usa para escolher a pronuncia, e o Chromium para hifenizar e corrigir -- e o
 * processo principal, que escreve os dialogos nativos e as mensagens de erro.
 */
export function aplicarIdioma(idioma: Idioma): void {
  definirIdioma(idioma);
  document.documentElement.lang = idioma;
  void window.quadro.definirIdioma(idioma).catch(() => undefined);
}
