import { t } from '@shared/i18n';

/**
 * Tutorial guiado: escurece a tela, ilumina um elemento por vez e explica com um
 * balao. Desde 06/10/2026: um passo a passo com destaque na primeira
 * abertura, e popups dentro do quadro explicando cada ferramenta.
 *
 * Um componente para os dois tutoriais (menu e quadro), e SO o mecanismo: os
 * passos moram em `tutoriais.ts`, e quem decide quando mostrar e o App.
 *
 * TRES DECISOES:
 *
 * 1. **O destaque e um buraco, e nao uma copia.** Um retangulo transparente com
 *    uma sombra enorme em volta escurece todo o resto. O elemento iluminado e o
 *    de verdade, no lugar dele -- uma copia sairia diferente no primeiro botao
 *    que mudasse de estilo.
 * 2. **A tela fica bloqueada enquanto o tutorial esta aberto.** Clicar no botao
 *    iluminado no meio da explicacao abriria um dialogo por baixo do balao. O
 *    tutorial ensina; quem quer usar, pula (Esc, ou "Pular tutorial").
 * 3. **Alvo que nao existe na tela e pulado**, e nao vira um balao apontando
 *    para o nada: a barra pode estar mais curta numa janela estreita.
 */

export interface PassoDoTour {
  /** Seletor do elemento a iluminar. Sem alvo, o balao fica no centro da tela. */
  alvo?: string;
  titulo: string;
  texto: string;
}

export interface OpcoesDoTour {
  /** Rotulo do botao do ultimo passo. */
  rotuloFinal?: string;
  /** `completo` e false quando a pessoa pulou. */
  aoTerminar(completo: boolean): void;
}

const FOLGA = 6;
const DISTANCIA = 12;

export function iniciarTour(todos: readonly PassoDoTour[], opcoes: OpcoesDoTour): { fechar(): void } {
  const visivel = (p: PassoDoTour): boolean => {
    if (!p.alvo) return true;
    const el = document.querySelector<HTMLElement>(p.alvo);
    return !!el && el.offsetParent !== null && el.getBoundingClientRect().width > 0;
  };
  const passos = todos.filter(visivel);

  const raiz = document.createElement('div');
  raiz.className = 'qb-tour';
  raiz.setAttribute('role', 'dialog');
  raiz.setAttribute('aria-modal', 'true');

  const foco = document.createElement('div');
  foco.className = 'qb-tour__foco';

  const balao = document.createElement('div');
  balao.className = 'qb-tour__balao';

  const contador = document.createElement('div');
  contador.className = 'qb-tour__contador';
  const titulo = document.createElement('h3');
  titulo.className = 'qb-tour__titulo';
  const texto = document.createElement('p');
  texto.className = 'qb-tour__texto';

  const acoes = document.createElement('div');
  acoes.className = 'qb-tour__acoes';
  const pular = document.createElement('button');
  pular.type = 'button';
  pular.className = 'qb-tour__pular';
  pular.textContent = t('tour.pular');
  const voltar = document.createElement('button');
  voltar.type = 'button';
  voltar.className = 'qb-btn';
  voltar.textContent = t('tour.voltar');
  const seguir = document.createElement('button');
  seguir.type = 'button';
  seguir.className = 'qb-btn qb-btn--primary';
  acoes.append(pular, voltar, seguir);

  balao.append(contador, titulo, texto, acoes);
  raiz.append(foco, balao);
  document.body.append(raiz);

  let i = 0;
  let fechado = false;

  const posicionar = (): void => {
    const passo = passos[i];
    if (!passo) return;
    const alvo = passo.alvo ? document.querySelector<HTMLElement>(passo.alvo) : null;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const b = balao.getBoundingClientRect();

    if (!alvo) {
      // Sem alvo: o escurecido inteiro, e o balao no centro.
      foco.classList.add('qb-tour__foco--nenhum');
      balao.style.left = `${Math.round((vw - b.width) / 2)}px`;
      balao.style.top = `${Math.round((vh - b.height) / 2)}px`;
      balao.dataset['lado'] = 'centro';
      return;
    }

    foco.classList.remove('qb-tour__foco--nenhum');
    const r = alvo.getBoundingClientRect();
    foco.style.left = `${r.left - FOLGA}px`;
    foco.style.top = `${r.top - FOLGA}px`;
    foco.style.width = `${r.width + FOLGA * 2}px`;
    foco.style.height = `${r.height + FOLGA * 2}px`;

    // Embaixo do alvo se couber, senao em cima; centrado nele, preso a tela.
    const cabeEmbaixo = r.bottom + FOLGA + DISTANCIA + b.height <= vh - 8;
    const top = cabeEmbaixo ? r.bottom + FOLGA + DISTANCIA : r.top - FOLGA - DISTANCIA - b.height;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - b.width / 2), vw - b.width - 8);
    balao.style.left = `${Math.round(left)}px`;
    balao.style.top = `${Math.round(Math.max(8, top))}px`;
    balao.dataset['lado'] = cabeEmbaixo ? 'embaixo' : 'em-cima';
    // A setinha aponta para o centro do alvo, mesmo com o balao preso na borda.
    balao.style.setProperty('--seta-x', `${Math.round(r.left + r.width / 2 - left)}px`);
  };

  const mostrar = (): void => {
    const passo = passos[i]!;
    contador.textContent = t('tour.contador', i + 1, passos.length);
    titulo.textContent = passo.titulo;
    texto.textContent = passo.texto;
    voltar.hidden = i === 0;
    seguir.textContent = i === passos.length - 1 ? (opcoes.rotuloFinal ?? t('tour.concluir')) : t('tour.proximo');
    posicionar();
    seguir.focus();
  };

  const fechar = (completo: boolean): void => {
    if (fechado) return;
    fechado = true;
    window.removeEventListener('keydown', teclas, true);
    window.removeEventListener('resize', posicionar);
    raiz.remove();
    opcoes.aoTerminar(completo);
  };

  // Na CAPTURA, como os modais: as teclas do tutorial nao podem virar atalhos
  // do app por baixo dele (Enter criaria quadro, setas moveriam a selecao).
  const teclas = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') fechar(false);
    else if (e.key === 'ArrowRight' || e.key === 'Enter') seguir.click();
    else if (e.key === 'ArrowLeft' && i > 0) voltar.click();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  pular.addEventListener('click', () => fechar(false));
  voltar.addEventListener('click', () => {
    if (i > 0) {
      i--;
      mostrar();
    }
  });
  seguir.addEventListener('click', () => {
    if (i < passos.length - 1) {
      i++;
      mostrar();
    } else {
      fechar(true);
    }
  });
  window.addEventListener('keydown', teclas, true);
  window.addEventListener('resize', posicionar);

  if (passos.length === 0) fechar(true);
  else mostrar();
  return { fechar: () => fechar(false) };
}
