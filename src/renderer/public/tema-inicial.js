/*
 * O TEMA DA TELA DE ABERTURA, decidido antes do primeiro frame (07/10/2026).
 *
 * Pedido: [...]. Antes, a abertura era sempre escura; com o tema claro, a
 * janela abria escura e virava clara quando o app assumia.
 *
 * Por que um arquivo a parte, e nao o `main.ts`: modulo e adiado, roda depois de
 * o HTML inteiro ser lido -- e o Chromium pode pintar antes disso. Este e um
 * script CLASSICO no <head>: bloqueia a leitura ate terminar, entao o primeiro
 * frame ja sai com o tema certo. Script embutido no HTML nao serve, porque a CSP
 * (`script-src 'self'`) recusa.
 *
 * A REGRA E A MESMA de `temaInicial` (App.ts): o forcado por `QB_THEME`, senao o
 * escolhido pelo botao de tema, senao o do Windows. Um modulo nao pode ser
 * importado daqui, entao as duas sao conferidas contra a MESMA tabela -- este
 * arquivo pelo `check:abertura`, e o App pelo selftest, que tambem confere que a
 * abertura e o app chegaram ao mesmo tema na execucao de verdade.
 *
 * Grava a decisao em `data-tema-abertura`, e nao so no `data-theme`: o App
 * reescreve o `data-theme` ao montar, e sem um registro proprio nao haveria como
 * conferir o que a abertura pintou.
 */
(function () {
  var tema = null;
  try {
    tema = new URLSearchParams(location.search).get('theme');
  } catch (e) {
    tema = null;
  }
  if (tema !== 'light' && tema !== 'dark') {
    try {
      tema = localStorage.getItem('qb.theme');
    } catch (e) {
      // Sem armazenamento: vale o Windows.
      tema = null;
    }
  }
  if (tema !== 'light' && tema !== 'dark') {
    tema = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = tema;
  document.documentElement.dataset.temaAbertura = tema;
})();
