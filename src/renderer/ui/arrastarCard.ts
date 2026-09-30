import { animar, CURVA_MOLA, CURVA_SUGAR, DURACAO, movimentoMaximo } from './movimento';

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
 * um alvo valido e so apagar a copia -- o "devolve o card ao lugar" do plano
 * sai de graca, e nao ha estado para desfazer se algo der errado no meio.
 */

export interface AlvoDeArrasto<A> {
  /** O elemento que acende enquanto o ponteiro esta sobre ele. */
  el: HTMLElement;
  alvo: A;
  /**
   * Soltando aqui, o fantasma voa ate o centro de `el` e encolhe DENTRO dele --
   * o "os dois cards se juntando" do plano. Sem isto, ele some no lugar: e o
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

/*
  O FANTASMA VIVO do nivel maximo de movimento (30/09/2026).

  Pego, ele cresce um pouco -- "levantei da mesa". Andando, inclina para o lado
  em que a mao vai, na proporcao da velocidade, como papel arrastado pelo canto;
  parando, endireita. Sobre um alvo, encolhe um pouco, anunciando que vai
  entrar. Tudo por perseguicao exponencial a cada quadro de animacao, e nao por
  `el.animate`: o alvo muda a cada quadro, e uma animacao declarada teria de ser
  cancelada e refeita 144 vezes por segundo.
*/
/** Graus de inclinacao por pixel/quadro de velocidade horizontal. */
const INCLINA_POR_VELOCIDADE = 0.55;
const INCLINA_MAX = 9;
/** Escala do fantasma levantado, e sobre um alvo. */
const ESCALA_PEGO = 1.06;
const ESCALA_SOBRE_ALVO = 0.9;
/** Quanto da distancia ao alvo se anda por quadro de 60 Hz. Maior = mais rapido. */
const PERSEGUE = 0.2;

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
  // O fantasma vivo (nivel maximo). Decidido NO COMECO do arrasto: trocar o
  // nivel com um arrasto no meio nao e um caso que valha codigo.
  let vivo = false;
  let inclinacao = 0;
  let escala = 1;
  let xAnterior = x0;
  let tAnterior = 0;

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
    vivo = movimentoMaximo();
    if (vivo) fantasma.classList.add('qb-card--fantasma-vivo');
    xAnterior = x;
    tAnterior = 0;
    quadro = requestAnimationFrame(porQuadro);
  };

  const pintarFantasma = (): void => {
    if (!fantasma) return;
    const andar = `translate(${x - x0}px, ${y - y0}px)`;
    fantasma.style.transform = vivo
      ? `${andar} rotate(${inclinacao.toFixed(2)}deg) scale(${escala.toFixed(4)})`
      : andar;
  };

  const mover = (): void => {
    pintarFantasma();
    procurarAlvo();
  };

  /** Um passo do fantasma vivo. `dt` em ms, para o jeito nao depender do monitor. */
  const viver = (t: number): void => {
    const dt = tAnterior === 0 ? 1000 / 60 : Math.min(64, t - tAnterior);
    tAnterior = t;
    const quadros60 = dt / (1000 / 60);
    const velocidade = (x - xAnterior) / quadros60;
    xAnterior = x;
    const inclinacaoAlvo = Math.max(-INCLINA_MAX, Math.min(INCLINA_MAX, velocidade * INCLINA_POR_VELOCIDADE));
    const escalaAlvo = alvo ? ESCALA_SOBRE_ALVO : ESCALA_PEGO;
    const k = 1 - Math.pow(1 - PERSEGUE, quadros60);
    inclinacao += (inclinacaoAlvo - inclinacao) * k;
    escala += (escalaAlvo - escala) * k;
    pintarFantasma();
  };

  /*
    Rola enquanto o ponteiro estiver perto da borda, mesmo PARADO.

    Por quadro de animacao, e nao por `pointermove`: quem segura o card na
    borda esperando a lista andar nao mexe o mouse, e um rolar que dependesse de
    movimento pararia exatamente ali. O fantasma vivo mora no mesmo quadro,
    pelo mesmo motivo: parado, ele ainda tem de endireitar.
  */
  const porQuadro = (t: number): void => {
    if (!ativo) return;
    if (vivo) viver(t);
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
    quadro = requestAnimationFrame(porQuadro);
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
      void despedir(f, pousarEm, vivo ? inclinacao : null).then(() => {
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
 *
 * `inclinacao` so vem no nivel maximo (e null fora dele): o fantasma vivo tem
 * receitas proprias -- volta com mola, e e sugado girando para dentro do alvo.
 */
function despedir<A>(f: HTMLElement, pousarEm: AlvoDeArrasto<A> | null, inclinacao: number | null): Promise<void> {
  const agora = f.style.transform || 'translate(0px, 0px)';

  if (inclinacao !== null) return despedirVivo(f, pousarEm, agora, inclinacao);

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
 * As despedidas do nivel maximo.
 *
 * VOLTAR passa do lugar e assenta (a mola), endireitando no caminho. SUGAR vai
 * ate o centro do alvo acelerando -- quem e engolido nao desacelera --, girando
 * para o lado em que ja estava inclinado, e some pequeno. Sumir no lugar (a
 * janela, a tela principal) e um encolher com um giro curto.
 */
function despedirVivo<A>(
  f: HTMLElement,
  pousarEm: AlvoDeArrasto<A> | null,
  agora: string,
  inclinacao: number,
): Promise<void> {
  if (!pousarEm) {
    return animar(f, [{ transform: agora }, { transform: 'translate(0px, 0px) rotate(0deg) scale(1)' }], {
      duracao: DURACAO.longa,
      curva: CURVA_MOLA,
      preencher: 'forwards',
    });
  }

  const lado = inclinacao < 0 ? -1 : 1;
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
        { transform: `translate(${dx}px, ${dy}px) rotate(${lado * 24}deg) scale(0.12)`, opacity: 0.2 },
      ],
      { duracao: 300, curva: CURVA_SUGAR, preencher: 'forwards' },
    );
  }

  return animar(
    f,
    [
      { transform: agora, opacity: 0.94 },
      { transform: `${agora} rotate(${lado * 10}deg) scale(0.7)`, opacity: 0 },
    ],
    { duracao: DURACAO.media, curva: CURVA_SUGAR, preencher: 'forwards' },
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
