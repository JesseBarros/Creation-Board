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
 *
 * TRES NIVEIS desde 30/09/2026: desligadas, ligadas (o padrao)
 * e MAXIMAS -- [...]. O nivel vira o mesmo
 * atributo na raiz (`data-anim='off' | 'max'`; ligado e a ausencia dele), e
 * quem anima pergunta o nivel aqui. O maximo nao e so "mais lento": e outra
 * receita -- mola que passa do ponto e volta, entrada em cascata, o fantasma
 * inclinando com a velocidade do arrasto.
 */

export type NivelDeMovimento = 'off' | 'on' | 'max';

/** Duracoes, em ms. Curta para reacao (hover, alvo); media para ida e volta; longa so no maximo. */
export const DURACAO = { curta: 140, media: 220, longa: 420 } as const;

/**
 * A curva de saida do app: comeca rapido e assenta devagar. Movimento de
 * interface que acelera no fim parece que vai bater em alguma coisa.
 */
export const CURVA = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

/**
 * A MOLA do nivel maximo: passa um pouco do ponto e volta. E o que faz o
 * movimento parecer "vivo" em vez de "deslizado". Mesma curva do
 * `--ease-mola` do `base.css` -- as duas tem de concordar, ou a transicao de
 * CSS e a animacao de JavaScript do mesmo gesto teriam personalidades
 * diferentes.
 */
export const CURVA_MOLA = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

/** A curva de quem e SUGADO para dentro de algo: comeca devagar e acelera. */
export const CURVA_SUGAR = 'cubic-bezier(0.55, 0, 0.75, 0.2)';

/**
 * O nivel com que o app abre: o forcado por `QB_ANIM`, senao o gravado em
 * Configuracoes, senao o PADRAO -- MAXIMAS desde 06/10/2026, decisao de produto (era
 * Ligadas). Quem ja gravou um nivel continua com o seu.
 */
export const NIVEL_PADRAO: NivelDeMovimento = 'max';

export function nivelInicial(forcado: string | null, gravado: string | null): NivelDeMovimento {
  const valido = (v: string | null): NivelDeMovimento | null =>
    v === 'off' || v === 'on' || v === 'max' ? v : null;
  return valido(forcado) ?? valido(gravado) ?? NIVEL_PADRAO;
}

export function nivelDeMovimento(): NivelDeMovimento {
  const v = document.documentElement.dataset['anim'];
  return v === 'off' ? 'off' : v === 'max' ? 'max' : 'on';
}

export function movimentoLigado(): boolean {
  return nivelDeMovimento() !== 'off';
}

export function movimentoMaximo(): boolean {
  return nivelDeMovimento() === 'max';
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

/**
 * O "recebi": o elemento incha e volta, com a mola. Usado quando algo CAI
 * dentro dele (a pasta que recebeu um quadro, a janela). So existe no maximo --
 * no nivel ligado o recebimento ja e dito pelo fantasma encolhendo.
 */
export function pulsar(el: Element, opcoes: { atraso?: number; intensidade?: number } = {}): Promise<void> {
  if (!movimentoMaximo()) return Promise.resolve();
  const s = 1 + (opcoes.intensidade ?? 0.08);
  return animar(
    el,
    [
      { transform: 'scale(1)' },
      { transform: `scale(${s})`, offset: 0.35 },
      { transform: `scale(${2 - s})`, offset: 0.65 },
      { transform: 'scale(1)' },
    ],
    { duracao: DURACAO.longa, atraso: opcoes.atraso ?? 0, curva: 'ease-out' },
  );
}
