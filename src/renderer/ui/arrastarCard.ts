import { animar, DURACAO } from './movimento';

/**
 * Arrastar um card do menu principal, por PONTEIRO.
 *
 * Nao e o arrastar-e-soltar nativo do HTML (`draggable` + `dragstart`), e a
 * escolha e do plano: o `App.ts` bloqueia `drop` na janela inteira, para um
 * arquivo largado por engano nao substituir o aplicativo -- e o DnD nativo
 * passaria por esse bloqueio. Por ponteiro e o mesmo idioma das ferramentas do
 * quadro (`SelectTool` usa `setPointerCapture`), e nada global muda.
 *
 * ESTE MODULO NAO SABE O QUE E PASTA. Ele move um fantasma, pergunta a quem
 * chamou se o que esta sob o ponteiro e um alvo, acende o alvo e, no soltar,
 * entrega o alvo de volta. O que soltar significa mora no `Lobby`.
 *
 * O card original NUNCA sai do lugar: quem anda e uma copia. Soltar fora de
 * um alvo valido e so apagar a copia -- o [...] do plano
 * sai de graca, e nao ha estado para desfazer se algo der errado no meio.
 */

export interface AlvoDeArrasto<A> {
  /** O elemento que acende enquanto o ponteiro esta sobre ele. */
  el: HTMLElement;
  alvo: A;
  /**
   * Soltando aqui, o fantasma voa ate o centro de `el` e encolhe DENTRO dele --
   * o [...] do plano. Sem isto, ele some no lugar: e o
   * certo quando o alvo e uma area grande (a janela, a tela principal), em que
   * voar ate o centro pareceria mira errada.
   */
  encolher?: boolean;
}

export interface OpcoesDeArrasto<A> {
  /** A area que rola, para rolar sozinha quando o ponteiro chega perto da borda. */
  rolagem: HTMLElement;
  /** O elemento sob o ponteiro, traduzido num alvo valido -- ou null. */
  alvoEm(el: Element | null): AlvoDeArrasto<A> | null;
  soltar(alvo: A): void;
}

/**
 * Quantos pixels o ponteiro anda antes de virar arrasto.
 *
 * Abaixo disto e clique: a mao treme um pouco ao clicar, e um arrasto de 2px
 * engoliria o clique que abre o quadro.
 */
const LIMIAR = 5;

/** A faixa perto da borda da rolagem que faz ela andar sozinha. */
const BORDA_QUE_ROLA = 56;
/** Pixels por quadro, com o ponteiro ENCOSTADO na borda. Cai ate zero no fim da faixa. */
const ROLAGEM_MAX = 18;

export function tornarArrastavel<A>(card: HTMLElement, op: OpcoesDeArrasto<A>): void {
  // A miniatura e um `<img>`, e imagem tem arrastar nativo proprio: sem isto,
  // puxar pela miniatura comeca um DnD do navegador, que cancela o ponteiro
  // (`pointercancel`) no meio do nosso.
  for (const img of card.querySelectorAll('img')) img.draggable = false;

  card.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || !e.isPrimary) return;
    // Os botoes de dentro do card (excluir, renomear) sao deles.
    if (e.target instanceof Element && e.target.closest('button')) return;
    comecar(card, e, op);
  });
}

function comecar<A>(card: HTMLElement, inicio: PointerEvent, op: OpcoesDeArrasto<A>): void {
  const id = inicio.pointerId;
  const x0 = inicio.clientX;
  const y0 = inicio.clientY;
  let x = x0;
  let y = y0;
  let ativo = false;
  let fantasma: HTMLElement | null = null;
  let alvo: AlvoDeArrasto<A> | null = null;
  let quadro = 0;

  try {
    card.setPointerCapture(id);
  } catch {
    // Evento sintetico (o selftest) nao tem ponteiro de verdade por tras, e o
    // Chromium recusa a captura. Os eventos continuam chegando pelo card.
  }

  const acender = (novo: AlvoDeArrasto<A> | null): void => {
    if (alvo?.el === novo?.el) {
      alvo = novo;
      return;
    }
    alvo?.el.classList.remove('qb-alvo');
    alvo = novo;
    alvo?.el.classList.add('qb-alvo');
  };

  const procurarAlvo = (): void => {
    acender(op.alvoEm(document.elementFromPoint(x, y)));
  };

  const iniciarArrasto = (): void => {
    ativo = true;
    const r = card.getBoundingClientRect();
    fantasma = card.cloneNode(true) as HTMLElement;
    fantasma.classList.add('qb-card--fantasma');
    fantasma.classList.remove('qb-alvo');
    fantasma.removeAttribute('tabindex');
    fantasma.setAttribute('aria-hidden', 'true');
    fantasma.style.left = `${r.left}px`;
    fantasma.style.top = `${r.top}px`;
    fantasma.style.width = `${r.width}px`;
    fantasma.style.height = `${r.height}px`;
    document.body.appendChild(fantasma);
    card.classList.add('qb-card--origem');
    document.documentElement.classList.add('qb-arrastando');
    quadro = requestAnimationFrame(rolarSozinho);
  };

  const mover = (): void => {
    if (fantasma) fantasma.style.transform = `translate(${x - x0}px, ${y - y0}px)`;
    procurarAlvo();
  };

  /*
    Rola enquanto o ponteiro estiver perto da borda, mesmo PARADO.

    Por quadro de animacao, e nao por `pointermove`: quem segura o card na
    borda esperando a lista andar nao mexe o mouse, e um rolar que dependesse de
    movimento pararia exatamente ali.
  */
  const rolarSozinho = (): void => {
    if (!ativo) return;
    const r = op.rolagem.getBoundingClientRect();
    let passo = 0;
    if (y < r.top + BORDA_QUE_ROLA) passo = -ROLAGEM_MAX * (1 - Math.max(0, y - r.top) / BORDA_QUE_ROLA);
    else if (y > r.bottom - BORDA_QUE_ROLA)
      passo = ROLAGEM_MAX * (1 - Math.max(0, r.bottom - y) / BORDA_QUE_ROLA);
    if (passo !== 0) {
      const antes = op.rolagem.scrollTop;
      op.rolagem.scrollTop += passo;
      // A lista andou por baixo de um ponteiro parado: o que esta sob ele mudou.
      if (op.rolagem.scrollTop !== antes) procurarAlvo();
    }
    quadro = requestAnimationFrame(rolarSozinho);
  };

  const aoMover = (e: PointerEvent): void => {
    if (e.pointerId !== id) return;
    x = e.clientX;
    y = e.clientY;
    if (!ativo) {
      if (Math.hypot(x - x0, y - y0) < LIMIAR) return;
      iniciarArrasto();
    }
    mover();
  };

  const aoSoltar = (e: PointerEvent): void => {
    if (e.pointerId !== id) return;
    const soltarEm = ativo ? alvo : null;
    const eraArrasto = ativo;
    terminar(soltarEm);
    if (eraArrasto) engolirOProximoClique(card);
    // A gravacao comeca JUNTO com a animacao, e nao depois dela: o fantasma e
    // uma copia solta no `body`, e a grade pode ser redesenhada por baixo dele
    // sem que um atrapalhe o outro.
    if (soltarEm) op.soltar(soltarEm.alvo);
  };

  const aoCancelar = (e: PointerEvent): void => {
    if (e.pointerId !== id) return;
    terminar(null);
  };

  // Escape no meio do arrasto desiste: o card volta e nada muda.
  const aoTeclar = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' || !ativo) return;
    e.preventDefault();
    // Imediata: o Escape que desiste do arrasto nao pode tambem fechar ou
    // desfazer outra coisa num atalho da janela registrado antes deste.
    e.stopImmediatePropagation();
    terminar(null);
    engolirOProximoClique(card);
  };

  /**
   * Fim do arrasto. `pousarEm` e o alvo em que caiu, ou null para "volta".
   *
   * O estado do arrasto acaba NA HORA -- ouvintes, captura, cursor, alvo aceso
   * --, e so o fantasma ainda anda: ou pousa no alvo, ou volta ao lugar do
   * card. Ate ele chegar de volta, o card de origem continua apagado: e ali que
   * ele vai pousar.
   */
  const terminar = (pousarEm: AlvoDeArrasto<A> | null): void => {
    ativo = false;
    cancelAnimationFrame(quadro);
    acender(null);
    const f = fantasma;
    fantasma = null;
    const soltarOrigem = (): void => card.classList.remove('qb-card--origem');
    if (f) {
      void despedir(f, pousarEm).then(() => {
        f.remove();
        soltarOrigem();
      });
    } else {
      soltarOrigem();
    }
    document.documentElement.classList.remove('qb-arrastando');
    card.removeEventListener('pointermove', aoMover);
    card.removeEventListener('pointerup', aoSoltar);
    card.removeEventListener('pointercancel', aoCancelar);
    window.removeEventListener('keydown', aoTeclar, true);
    try {
      card.releasePointerCapture(id);
    } catch {
      // Ja solta, ou nunca capturada (ver acima).
    }
  };

  card.addEventListener('pointermove', aoMover);
  card.addEventListener('pointerup', aoSoltar);
  card.addEventListener('pointercancel', aoCancelar);
  // Captura: precisa chegar antes dos atalhos globais da janela.
  window.addEventListener('keydown', aoTeclar, true);
}

/**
 * A ultima viagem do fantasma. Resolve quando ele pode sair do DOM.
 *
 * Com o movimento desligado, `animar` resolve na hora e nada e criado -- e o
 * fantasma sai no microtempo seguinte, como antes da Parte 5.
 */
function despedir<A>(f: HTMLElement, pousarEm: AlvoDeArrasto<A> | null): Promise<void> {
  const agora = f.style.transform || 'translate(0px, 0px)';

  if (!pousarEm) {
    // Volta para o lugar do card: o `translate` zero E o lugar dele, porque o
    // fantasma nasceu posicionado em cima do card.
    return animar(f, [{ transform: agora }, { transform: 'translate(0px, 0px)' }], {
      preencher: 'forwards',
    });
  }

  if (pousarEm.encolher) {
    const alvo = pousarEm.el.getBoundingClientRect();
    const x = parseFloat(f.style.left) + parseFloat(f.style.width) / 2;
    const y = parseFloat(f.style.top) + parseFloat(f.style.height) / 2;
    const dx = alvo.left + alvo.width / 2 - x;
    const dy = alvo.top + alvo.height / 2 - y;
    return animar(
      f,
      [
        { transform: agora, opacity: 0.94 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.2)`, opacity: 0 },
      ],
      { preencher: 'forwards' },
    );
  }

  return animar(
    f,
    [
      { transform: agora, opacity: 0.94 },
      { transform: `${agora} scale(0.92)`, opacity: 0 },
    ],
    { duracao: DURACAO.curta, preencher: 'forwards' },
  );
}

/**
 * O clique que o navegador dispara depois de um arrasto nao e um clique.
 *
 * Com o ponteiro capturado, soltar em qualquer lugar gera `click` no CARD DE
 * ORIGEM -- que abriria o quadro que acabou de ser arrastado para uma pasta.
 *
 * O filtro vive so ate o fim da tarefa atual. O `click` sai na mesma tarefa do
 * `pointerup`; se por algum motivo ele nao vier, um filtro que ficasse
 * esperando engoliria o proximo clique DE VERDADE, minutos depois.
 */
function engolirOProximoClique(card: HTMLElement): void {
  const engolir = (e: MouseEvent): void => {
    e.stopImmediatePropagation();
    e.preventDefault();
  };
  card.addEventListener('click', engolir, { capture: true, once: true });
  setTimeout(() => card.removeEventListener('click', engolir, { capture: true }), 0);
}
