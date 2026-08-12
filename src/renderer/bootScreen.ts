/**
 * Tela de abertura.
 *
 * A marcacao dela vive no `index.html`, e nao aqui, e isso e o ponto todo: ela
 * precisa estar pintada no PRIMEIRO frame, antes de qualquer modulo carregar.
 * Montada por JavaScript, ela apareceria depois do momento em que serve.
 *
 * O que ela substitui: a janela ja abria sem flash branco (`backgroundColor` no
 * BrowserWindow, com `show: false` ate o `ready-to-show`), mas o que se via era
 * um retangulo escuro vazio ate a biblioteca aparecer. Nao havia susto -- havia
 * ausencia.
 *
 * **Ela nao adia nada.** Nao ha tempo minimo de exibicao: sai assim que a
 * biblioteca esta listada. Se o app abrir em 300 ms, ela aparece por 300 ms.
 * Um tempo minimo faria a marca custar abertura, que e o oposto de polimento.
 *
 * O tempo real sai no terminal (`[boot] pronto em N ms`), para a proxima sessao
 * poder decidir com numero se ela ainda se justifica.
 */

const FADE_MS = 260;

/**
 * Tira a tela de abertura.
 *
 * `imediato` remove sem transicao nenhuma, e existe para os modos de
 * verificacao: ali a tela nao e enfeite atrasando, e obstaculo -- ela cobre a
 * janela inteira, e um evento de ponteiro do auto-teste cairia nela.
 */
export function dismissBootScreen(imediato = false): void {
  const el = document.getElementById('qb-boot');
  if (!el) return;

  if (imediato) {
    el.remove();
    return;
  }

  console.log(`[boot] pronto em ${Math.round(performance.now())} ms`);

  // Esconde por opacidade e so depois remove do DOM: remover na hora corta a
  // transicao, e a troca vira um piscar.
  el.style.opacity = '0';
  el.style.pointerEvents = 'none';
  window.setTimeout(() => el.remove(), FADE_MS);
}
