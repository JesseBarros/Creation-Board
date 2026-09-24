/**
 * O vocabulario de MOVIMENTO do app. Parte 5 da repaginacao, 24/09/2026.
 *
 * Ate aqui o app tinha uma animacao so (`qb-toast-in`, em CSS). Esta parte cria
 * as de entrada, saida e transicao do menu, e todas as que rodam por JavaScript
 * passam por AQUI -- nunca por `el.animate` direto.
 *
 * O MOTIVO E O B26. O interruptor de movimento (Configuracoes) vira um
 * `data-anim='off'` na raiz, e a regra global do `base.css` zera a duracao de
 * toda `transition` e `animation` de CSS. Mas ela NAO alcanca a Web Animations
 * API: um `el.animate(...)` roda inteiro com o interruptor desligado. Uma
 * animacao nova que ignore o interruptor repete exatamente o B26 -- entao a
 * pergunta [...] mora num lugar so, e quem anima por
 * JavaScript nao tem como esquece-la.
 */

/** Duracoes, em ms. Curta para reacao (hover, alvo); media para ida e volta. */
export const DURACAO = { curta: 140, media: 220 } as const;

/**
 * A curva de saida do app: comeca rapido e assenta devagar. Movimento de
 * interface que acelera no fim parece que vai bater em alguma coisa.
 */
export const CURVA = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

export function movimentoLigado(): boolean {
  return document.documentElement.dataset['anim'] !== 'off';
}

/**
 * Anima um elemento, respeitando o interruptor. Resolve quando termina -- ou na
 * hora, com o movimento desligado, e ai nada chega a ser criado.
 *
 * Nunca rejeita: animacao cancelada (o elemento saiu do DOM, outra tomou o
 * lugar) e fim de animacao para quem esta esperando. Quem espera uma animacao
 * quer seguir em frente, e nao tratar erro de enfeite.
 */
export function animar(
  el: Element,
  quadros: Keyframe[],
  opcoes: { duracao?: number; atraso?: number; curva?: string; preencher?: FillMode } = {},
): Promise<void> {
  if (!movimentoLigado()) return Promise.resolve();
  const a = el.animate(quadros, {
    duration: opcoes.duracao ?? DURACAO.media,
    delay: opcoes.atraso ?? 0,
    easing: opcoes.curva ?? CURVA,
    fill: opcoes.preencher ?? 'none',
  });
  return a.finished.then(
    () => undefined,
    () => undefined,
  );
}
