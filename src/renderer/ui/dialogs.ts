import type { EstadoGraficos, TemaFundo } from '@shared/ipc-contract';
import type { NivelDeMovimento } from './movimento';
import { NOMES_DOS_IDIOMAS, t, type Idioma } from '@shared/i18n';

/**
 * Dialogos modais e avisos temporarios.
 *
 * Escritos a mao em vez de usar `window.confirm`/`prompt`: os nativos travam o
 * processo do renderer inteiro (o loop de render para) e nao seguem o tema.
 */

interface ModalHandle {
  overlay: HTMLElement;
  close(): void;
}

function openModal(content: HTMLElement, onEscape: () => void): ModalHandle {
  const overlay = document.createElement('div');
  overlay.className = 'qb-overlay';
  overlay.append(content);
  document.body.append(overlay);

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onEscape();
    }
  };
  // Captura: precisa rodar antes dos atalhos globais da janela.
  window.addEventListener('keydown', onKey, true);

  overlay.addEventListener('pointerdown', (e) => {
    if (e.target === overlay) onEscape();
  });

  return {
    overlay,
    close: () => {
      window.removeEventListener('keydown', onKey, true);
      overlay.remove();
    },
  };
}

/** Pergunta um texto. Resolve com null se cancelado. */
export function promptText(opts: {
  title: string;
  label: string;
  value?: string;
  confirmLabel?: string;
}): Promise<string | null> {
  return new Promise((resolve) => {
    const panel = document.createElement('div');
    panel.className = 'qb-dialog';

    const h = document.createElement('h2');
    h.className = 'qb-dialog__title';
    h.textContent = opts.title;

    const label = document.createElement('label');
    label.className = 'qb-dialog__label';
    label.textContent = opts.label;

    const input = document.createElement('input');
    input.className = 'qb-dialog__input';
    input.type = 'text';
    input.value = opts.value ?? '';

    const actions = document.createElement('div');
    actions.className = 'qb-dialog__actions';

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'qb-btn';
    cancel.textContent = t('comum.cancelar');

    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'qb-btn qb-btn--primary';
    ok.textContent = opts.confirmLabel ?? t('dialogo.salvar');

    actions.append(cancel, ok);
    label.append(input);
    panel.append(h, label, actions);

    const done = (value: string | null): void => {
      modal.close();
      resolve(value);
    };
    const modal = openModal(panel, () => done(null));

    cancel.addEventListener('click', () => done(null));
    ok.addEventListener('click', () => done(input.value.trim() || null));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') done(input.value.trim() || null);
    });

    input.focus();
    input.select();
  });
}

export function confirmDialog(opts: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    const panel = document.createElement('div');
    panel.className = 'qb-dialog';

    const h = document.createElement('h2');
    h.className = 'qb-dialog__title';
    h.textContent = opts.title;

    const p = document.createElement('p');
    p.className = 'qb-dialog__message';
    p.textContent = opts.message;

    const actions = document.createElement('div');
    actions.className = 'qb-dialog__actions';

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'qb-btn';
    cancel.textContent = opts.cancelLabel ?? t('comum.cancelar');

    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = `qb-btn ${opts.danger ? 'qb-btn--danger' : 'qb-btn--primary'}`;
    ok.textContent = opts.confirmLabel ?? t('dialogo.confirmar');

    actions.append(cancel, ok);
    panel.append(h, p, actions);

    const done = (value: boolean): void => {
      modal.close();
      resolve(value);
    };
    const modal = openModal(panel, () => done(false));

    cancel.addEventListener('click', () => done(false));
    ok.addEventListener('click', () => done(true));
    ok.focus();
  });
}

/**
 * Papéis do quadro.
 *
 * Todos claros, e todos na MESMA faixa de luminância (~0,80) -- o mesmo nível do
 * fundo de janela do macOS, que foi onde o tema claro parou depois de três
 * rodadas de ajuste. Escolher papel não pode desfazer esse conserto: uma cor
 * mais clara que as outras traria de volta o brilho que cansava a vista.
 *
 * A cor existe para DESTACAR o que está por cima. Num papel levemente colorido,
 * um post-it amarelo e uma tag vermelha se separam do fundo; no branco puro
 * todos competem com ele.
 *
 * São sete, e não vinte: a paleta responde "qual clima", não [...].
 *
 * CADA PAPEL LEVA UMA `marca` -- a mesma cor, escura o bastante para se
 * identificar sozinha. Ela vira um ponto no alto da amostra, e existe por um
 * motivo concreto: a paleta inteira vive em 0,80 de luminância, e a essa altura
 * as sete cores diferem por poucos pontos de saturação. Num monitor calibrado
 * para mais ou para menos saturação, "azul claríssimo" e "menta claríssimo"
 * ficam indistinguíveis -- e a escolha vira adivinhação.
 *
 * A marca é explícita, e não derivada por `color-mix` ou `filter: saturate`.
 * Derivar erraria justamente no Neutro: ele é um cinza levemente azulado, e
 * qualquer amplificação de saturação o mostraria como azul -- que é o oposto do
 * que o nome promete.
 */
/*
  A lista guarda a CHAVE do nome, e nao o nome: ela e montada quando o modulo
  carrega, ANTES de o idioma ser escolhido (`renderer/idioma.ts`). Com o texto
  aqui, os papeis ficariam em portugues para sempre. O nome sai de `t()` na hora
  de desenhar o dialogo.
*/
type ChaveDePapel =
  | 'papel.neutro'
  | 'papel.azul'
  | 'papel.verde'
  | 'papel.areia'
  | 'papel.rosa'
  | 'papel.lilas'
  | 'papel.menta';

export const BOARD_PAPERS: ReadonlyArray<{ nome: ChaveDePapel; cor: string; marca: string }> = [
  { nome: 'papel.neutro', cor: '#e3e7ee', marca: '#7b8698' },
  { nome: 'papel.azul', cor: '#dceaf7', marca: '#3d7fb0' },
  { nome: 'papel.verde', cor: '#dfeee3', marca: '#4a9160' },
  { nome: 'papel.areia', cor: '#f1eadf', marca: '#a8824a' },
  { nome: 'papel.rosa', cor: '#f7e4ea', marca: '#c25f80' },
  { nome: 'papel.lilas', cor: '#e7e3f4', marca: '#7b63c0' },
  { nome: 'papel.menta', cor: '#dff0ee', marca: '#3f9e93' },
];

export const DEFAULT_PAPER = BOARD_PAPERS[0]!.cor;

/**
 * Escolha do papel ao criar um quadro.
 *
 * Aparece na criação porque é ali que a decisão é barata: o quadro está vazio, e
 * trocar depois muda o fundo de um resumo já montado. Quem não quiser escolher
 * aperta Enter e leva o neutro -- o diálogo abre com ele em foco.
 */
export function newBoardDialog(): Promise<string | null> {
  return new Promise((resolve) => {
    const panel = document.createElement('div');
    panel.className = 'qb-dialog';

    const h = document.createElement('h2');
    h.className = 'qb-dialog__title';
    h.textContent = t('novoQuadro.titulo');

    const p = document.createElement('p');
    p.className = 'qb-dialog__message';
    p.textContent = t('novoQuadro.mensagem');

    const grade = document.createElement('div');
    grade.className = 'qb-papers';

    let escolhida = DEFAULT_PAPER;
    const amostras: HTMLButtonElement[] = [];

    for (const papel of BOARD_PAPERS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'qb-paper';
      b.dataset['value'] = papel.cor;
      b.style.background = papel.cor;
      // O ponto é desenhado pelo CSS (`::before`) e a cor chega por variável:
      // assim a marca acompanha o papel sem um segundo elemento por amostra.
      b.style.setProperty('--marca', papel.marca);
      const nomeDoPapel = t(papel.nome);
      b.title = nomeDoPapel;
      b.setAttribute('aria-label', t('papel.rotulo', nomeDoPapel));
      b.addEventListener('click', () => {
        escolhida = papel.cor;
        for (const a of amostras) {
          a.classList.toggle('qb-paper--active', a === b);
          a.setAttribute('aria-pressed', String(a === b));
        }
      });
      amostras.push(b);
      grade.append(b);
    }
    amostras[0]!.classList.add('qb-paper--active');
    amostras[0]!.setAttribute('aria-pressed', 'true');

    const actions = document.createElement('div');
    actions.className = 'qb-dialog__actions';

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'qb-btn';
    cancel.textContent = t('comum.cancelar');

    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'qb-btn qb-btn--primary';
    ok.textContent = t('novoQuadro.criar');

    actions.append(cancel, ok);
    panel.append(h, p, grade, actions);

    const done = (value: string | null): void => {
      modal.close();
      resolve(value);
    };
    const modal = openModal(panel, () => done(null));

    cancel.addEventListener('click', () => done(null));
    ok.addEventListener('click', () => done(escolhida));
    ok.focus();
  });
}

/** O que fazer com um quadro que tem alteracoes pendentes. */
export type UnsavedChoice = 'salvar' | 'descartar' | 'cancelar';

/**
 * Sair com alteracoes nao salvas.
 *
 * Tres saidas, e nao duas, porque a pergunta tem tres respostas. O dialogo
 * anterior oferecia "Descartar" e "Continuar aqui": quem quisesse SALVAR --
 * que e o desfecho mais provavel de todos -- tinha de cancelar, procurar o
 * botao de salvar, clicar, e so entao sair. Tres passos para o caminho feliz.
 *
 * A ordem dos botoes e deliberada: o destrutivo fica na PONTA ESQUERDA, longe
 * do foco, e o seguro recebe o destaque e o foco inicial. Enter salva.
 */
export function unsavedDialog(nome: string): Promise<UnsavedChoice> {
  return new Promise((resolve) => {
    const panel = document.createElement('div');
    panel.className = 'qb-dialog';

    const h = document.createElement('h2');
    h.className = 'qb-dialog__title';
    h.textContent = t('naoSalvo.titulo');

    const p = document.createElement('p');
    p.className = 'qb-dialog__message';
    p.textContent = t('naoSalvo.mensagem', nome);

    const actions = document.createElement('div');
    actions.className = 'qb-dialog__actions';

    const botao = (rotulo: string, classe: string, valor: UnsavedChoice): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = classe;
      b.textContent = rotulo;
      b.addEventListener('click', () => done(valor));
      return b;
    };

    const descartar = botao(t('naoSalvo.sairSemSalvar'), 'qb-btn qb-btn--danger', 'descartar');
    const cancelar = botao(t('comum.cancelar'), 'qb-btn', 'cancelar');
    const salvar = botao(t('naoSalvo.salvarESair'), 'qb-btn qb-btn--primary', 'salvar');

    // O destrutivo primeiro e separado: `margin-right: auto` empurra os outros
    // dois para a direita, e a distancia fisica e o que evita o clique errado.
    descartar.style.marginRight = 'auto';
    actions.append(descartar, cancelar, salvar);
    panel.append(h, p, actions);

    const done = (value: UnsavedChoice): void => {
      modal.close();
      resolve(value);
    };
    // Fechar pelo Esc ou pelo fundo e CANCELAR, e nunca descartar: um gesto de
    // [...] nao pode ser o que apaga o trabalho.
    const modal = openModal(panel, () => done('cancelar'));

    salvar.focus();
  });
}

export interface ExportChoice {
  format: 'png' | 'svg' | 'pdf';
  /** `selection` so aparece quando ha algo selecionado. */
  scope: 'board' | 'selection';
  /** Multiplicador de pixels. Ignorado no SVG, que nao tem resolucao. */
  scale: number;
  background: boolean;
}

/**
 * Escolhas da exportacao.
 *
 * Um dialogo, e nao tres itens de menu (PNG/SVG/PDF): escala e fundo valem para
 * mais de um formato, e repetir as opcoes em cada item multiplicaria o menu sem
 * explicar nada.
 */
export interface ExportPreview {
  width: number;
  height: number;
  files: number;
  /** Escala que sera realmente usada; menor que a pedida so no PDF. */
  scale: number;
}

export function exportDialog(opts: {
  hasSelection: boolean;
  /** O que vai sair, para as escolhas atuais. Ver o B13. */
  preview: (choice: ExportChoice) => ExportPreview | null;
}): Promise<ExportChoice | null> {
  return new Promise((resolve) => {
    const choice: ExportChoice = {
      format: 'png',
      scope: opts.hasSelection ? 'selection' : 'board',
      scale: 2,
      background: true,
    };

    const panel = document.createElement('div');
    panel.className = 'qb-dialog';

    const h = document.createElement('h2');
    h.className = 'qb-dialog__title';
    h.textContent = t('exportar.titulo');
    panel.append(h);

    /**
     * O que vai sair, escrito antes de exportar.
     *
     * Era isto que faltava no B13: os tres botoes de resolucao produziam o mesmo
     * arquivo num quadro grande e ninguem avisava. Agora a linha muda a cada
     * clique, e dizer "12 arquivos de 8.192 x 4.819" e o que impede a pessoa de
     * descobrir isso depois de esperar a exportacao.
     */
    const resumo = document.createElement('p');
    resumo.className = 'qb-dialog__hint';
    const atualizarResumo = (): void => {
      const p = opts.preview(choice);
      if (!p) {
        resumo.textContent = '';
        return;
      }
      const tamanho = t('exportar.tamanho', p.width, p.height);
      if (choice.format === 'svg') {
        resumo.textContent = t('exportar.vetorial');
      } else if (p.scale < choice.scale - 0.001) {
        // So o PDF cai aqui: uma pagina nao tem onde por o segundo ladrilho.
        resumo.textContent = t('exportar.pdfLimitado', tamanho, p.scale, choice.scale);
      } else if (p.files > 1) {
        resumo.textContent = t('exportar.variosArquivos', tamanho, p.files, choice.scale);
        // Acima de duas dezenas de arquivos a escolha deixa de ser obvia: a
        // resolucao e real, mas o resultado e uma pasta cheia e uma espera
        // longa. Dizer isso antes vale mais do que descobrir depois.
        if (p.files > 24) {
          resumo.textContent += t('exportar.muitos');
          resumo.classList.add('qb-dialog__hint--warn');
        } else {
          resumo.classList.remove('qb-dialog__hint--warn');
        }
      } else {
        resumo.textContent = t('exportar.umArquivo', tamanho);
      }
    };

    const scaleRow = group(t('exportar.resolucao'), [
      ['1x', '1'],
      ['2x', '2'],
      ['3x', '3'],
    ], String(choice.scale), (v) => {
      choice.scale = Number(v);
      atualizarResumo();
    });

    panel.append(
      group(
        t('exportar.formato'),
        [
          ['PNG', 'png'],
          ['SVG', 'svg'],
          ['PDF', 'pdf'],
        ],
        choice.format,
        (v) => {
          choice.format = v as ExportChoice['format'];
          // SVG nao tem resolucao: o arquivo e a geometria, e ampliar depois nao
          // perde nada. Esconder a linha e mais honesto que deixa-la sem efeito.
          scaleRow.hidden = choice.format === 'svg';
          atualizarResumo();
        },
      ),
    );

    if (opts.hasSelection) {
      panel.append(
        group(
          t('exportar.oQue'),
          [
            [t('exportar.selecao'), 'selection'],
            [t('exportar.quadroTodo'), 'board'],
          ],
          choice.scope,
          (v) => {
            choice.scope = v as ExportChoice['scope'];
            atualizarResumo();
          },
        ),
      );
    }

    panel.append(scaleRow);
    panel.append(
      group(
        t('exportar.fundo'),
        [
          [t('exportar.comFundo'), 'sim'],
          [t('exportar.transparente'), 'nao'],
        ],
        'sim',
        (v) => {
          choice.background = v === 'sim';
        },
      ),
    );

    panel.append(resumo);
    atualizarResumo();

    const actions = document.createElement('div');
    actions.className = 'qb-dialog__actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'qb-btn';
    cancel.textContent = t('comum.cancelar');
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'qb-btn qb-btn--primary';
    ok.textContent = t('exportar.exportar');
    actions.append(cancel, ok);
    panel.append(actions);

    const done = (value: ExportChoice | null): void => {
      modal.close();
      resolve(value);
    };
    const modal = openModal(panel, () => done(null));
    cancel.addEventListener('click', () => done(null));
    ok.addEventListener('click', () => done(choice));
    ok.focus();
  });
}

/** Linha de opcoes exclusivas, no estilo de botoes segmentados. */
function group(
  label: string,
  options: ReadonlyArray<readonly [string, string]>,
  initial: string,
  onPick: (value: string) => void,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'qb-dialog__row';

  const title = document.createElement('span');
  title.className = 'qb-dialog__row-label';
  title.textContent = label;

  const buttons = document.createElement('div');
  buttons.className = 'qb-seg';

  for (const [text, value] of options) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'qb-seg__btn';
    b.textContent = text;
    b.classList.toggle('qb-seg__btn--active', value === initial);
    b.addEventListener('click', () => {
      for (const other of buttons.children) other.classList.remove('qb-seg__btn--active');
      b.classList.add('qb-seg__btn--active');
      onPick(value);
    });
    buttons.append(b);
  }

  row.append(title, buttons);
  return row;
}

let toastTimer = 0;

/** Aviso breve no rodape. Substitui o anterior em vez de empilhar. */
export function toast(message: string, kind: 'ok' | 'error' = 'ok'): void {
  document.querySelector('.qb-toast')?.remove();
  clearTimeout(toastTimer);

  const el = document.createElement('div');
  el.className = `qb-toast qb-toast--${kind}`;
  el.textContent = message;
  document.body.append(el);

  toastTimer = window.setTimeout(() => el.remove(), kind === 'error' ? 6000 : 2600);
}

/** O que a tela de Configuracoes devolve. */
export interface Configuracoes {
  idioma: Idioma;
  animacoes: NivelDeMovimento;
  /** Nome do arquivo escolhido por tema, ou null para a imagem que vem com o app. */
  fundos: { claro: string | null; escuro: string | null };
  /** A "compatibilidade grafica": gravada e em uso (so vale ao reabrir). */
  graficos: EstadoGraficos;
}

/**
 * O que a tela de Configuracoes precisa PEDIR ao aplicativo.
 *
 * Separado do estado porque sao coisas diferentes: `Configuracoes` e o que
 * esta valendo agora, e isto e o que fazer quando alguem mexe. Escolher uma
 * imagem abre dialogo nativo e mexe em disco, coisas que este arquivo nao faz
 * nem deve fazer.
 */
export interface AcoesConfig {
  onChange(c: Configuracoes): void;
  /** Abre o seletor. Devolve o nome do arquivo, ou null se cancelou. */
  escolherFundo(tema: TemaFundo): Promise<string | null>;
  restaurarFundo(tema: TemaFundo): Promise<void>;
  gravarCompatibilidade(ligada: boolean): Promise<void>;
  /** Fecha e abre o app de novo, para a compatibilidade valer. */
  reabrir(): void;
}

/**
 * Linha de "arquivo escolhido": rotulo, o nome atual, e os dois botoes.
 *
 * O `group()` acima so faz segmentado, e um seletor de arquivo nao e uma
 * escolha entre opcoes conhecidas -- por isso um construtor proprio em vez de
 * torcer aquele.
 */
function linhaArquivo(opts: {
  label: string;
  nome: string | null;
  escolher: () => Promise<string | null>;
  restaurar: () => Promise<void>;
}): HTMLElement {
  const row = document.createElement('div');
  row.className = 'qb-dialog__row';

  const title = document.createElement('span');
  title.className = 'qb-dialog__row-label';
  title.textContent = opts.label;

  const caixa = document.createElement('div');
  caixa.className = 'qb-dialog__arquivo';

  const nome = document.createElement('span');
  nome.className = 'qb-dialog__arquivo-nome';

  const escolher = document.createElement('button');
  escolher.type = 'button';
  escolher.className = 'qb-btn';
  escolher.textContent = t('config.escolherImagem');

  const restaurar = document.createElement('button');
  restaurar.type = 'button';
  restaurar.className = 'qb-btn';
  restaurar.textContent = t('config.restaurarPadrao');

  const pintar = (atual: string | null): void => {
    nome.textContent = atual ?? t('config.imagemPadrao');
    nome.title = atual ?? '';
    // Sem imagem propria nao ha o que restaurar: o botao aceso prometeria uma
    // acao que nao faz nada.
    restaurar.disabled = atual === null;
  };
  pintar(opts.nome);

  /*
    Os dois botoes ficam travados enquanto o dialogo NATIVO estiver aberto.

    Sem isso, um clique duplo abre dois `showOpenDialog`, e o segundo fica orfao
    atras do modal -- sem foco, sem jeito obvio de fechar, e travando a janela
    para quem nao percebeu que ele existe.
  */
  const enquanto = async (fn: () => Promise<string | null | void>): Promise<void> => {
    escolher.disabled = true;
    restaurar.disabled = true;
    try {
      return void (await fn());
    } finally {
      escolher.disabled = false;
      // `pintar` decide o estado do restaurar; chamado por quem invocou.
    }
  };

  escolher.addEventListener('click', () => {
    void enquanto(async () => {
      const novo = await opts.escolher();
      // Cancelou: mantem o que estava, e nao apaga a escolha anterior.
      if (novo !== null) pintar(novo);
      else pintar(nome.title || null);
    });
  });

  restaurar.addEventListener('click', () => {
    void enquanto(async () => {
      await opts.restaurar();
      pintar(null);
    });
  });

  caixa.append(nome, escolher, restaurar);
  row.append(title, caixa);
  return row;
}

/**
 * Configuracoes do aplicativo, abertas pelo menu principal.
 *
 * Hoje tem um item so, e isso e de proposito: ela nasceu em 21/09/2026 para
 * abrigar o interruptor de animacoes, e encher a tela de opcoes que ninguem
 * pediu seria inventar trabalho. O formato ja comporta a proxima -- e uma
 * lista de linhas, e cada linha e uma pergunta.
 *
 * Aplica NA HORA, sem botao de confirmar: o efeito e visivel na propria tela
 * atras do dialogo, entao confirmar uma coisa que ja esta acontecendo so
 * acrescenta um passo. Fechar e a unica saida, e nao ha o que desfazer.
 */
export function settingsDialog(atual: Configuracoes, acoes: AcoesConfig): void {
  const panel = document.createElement('div');
  panel.className = 'qb-dialog';

  const h = document.createElement('h2');
  h.className = 'qb-dialog__title';
  h.textContent = t('config.titulo');

  const estado: Configuracoes = { ...atual };

  // Em ordem de intensidade, e nao de uso: quem le da esquerda para a direita
  // entende a escala sem ler a dica.
  // O idioma primeiro: e a linha que quem abriu o app na lingua errada procura.
  // As opcoes aparecem SEMPRE na propria lingua -- "English (US)" para quem nao
  // le portugues, e vice-versa.
  const linhaIdioma = group(
    t('config.idioma'),
    (Object.entries(NOMES_DOS_IDIOMAS) as [Idioma, string][]).map(([valor, nome]) => [nome, valor] as const),
    estado.idioma,
    (v) => {
      if (v === 'pt-BR' || v === 'en-US') {
        estado.idioma = v;
        acoes.onChange({ ...estado });
      }
    },
  );
  const dicaIdioma = document.createElement('p');
  dicaIdioma.className = 'qb-dialog__hint';
  dicaIdioma.textContent = t('config.idiomaDica');

  const linha = group(
    t('config.animacoes'),
    [
      [t('config.animDesligadas'), 'off'],
      [t('config.animLigadas'), 'on'],
      [t('config.animMaximas'), 'max'],
    ],
    estado.animacoes,
    (v) => {
      estado.animacoes = v === 'off' || v === 'max' ? v : 'on';
      acoes.onChange({ ...estado });
    },
  );

  const dica = document.createElement('p');
  dica.className = 'qb-dialog__hint';
  dica.textContent = t('config.animDica');

  const actions = document.createElement('div');
  actions.className = 'qb-dialog__actions';

  const fechar = document.createElement('button');
  fechar.type = 'button';
  fechar.className = 'qb-btn qb-btn--primary';
  fechar.textContent = t('comum.fechar');
  fechar.addEventListener('click', () => modal.close());
  actions.append(fechar);

  const fundoClaro = linhaArquivo({
    label: t('config.fundoClaro'),
    nome: estado.fundos.claro,
    escolher: () => acoes.escolherFundo('claro'),
    restaurar: () => acoes.restaurarFundo('claro'),
  });

  const fundoEscuro = linhaArquivo({
    label: t('config.fundoEscuro'),
    nome: estado.fundos.escuro,
    escolher: () => acoes.escolherFundo('escuro'),
    restaurar: () => acoes.restaurarFundo('escuro'),
  });

  const dicaFundo = document.createElement('p');
  dicaFundo.className = 'qb-dialog__hint';
  dicaFundo.textContent = t('config.fundoDica');

  // A ultima linha por ser a mais tecnica: quem precisa dela chega aqui
  // procurando, e quem nao precisa nao tem por que mexer.
  //
  // Vale ao REABRIR (as chaves do Chromium so entram antes de o app ficar
  // pronto), entao a dica avisa quando o escolhido difere do que esta em uso --
  // senao o clique pareceria nao ter feito nada.
  //
  // O botao "Reabrir agora" so aparece com a mudanca pendente: foi o que faltou
  // quando no teste -- ligou a opcao, nao reabriu, e o defeito continuava.
  const dicaCompat = document.createElement('p');
  dicaCompat.className = 'qb-dialog__hint';
  const textoCompat = document.createElement('span');
  const reabrir = document.createElement('button');
  reabrir.type = 'button';
  reabrir.className = 'qb-btn qb-dialog__reabrir';
  reabrir.textContent = t('config.compatReabrirAgora');
  reabrir.addEventListener('click', () => {
    reabrir.disabled = true;
    acoes.reabrir();
  });
  dicaCompat.append(textoCompat, reabrir);
  const pintarDicaCompat = (): void => {
    const pendente = estado.graficos.compatibilidade !== estado.graficos.emUso;
    textoCompat.textContent = pendente
      ? `${t('config.compatDica')} ${t('config.compatReabrir')}`
      : t('config.compatDica');
    reabrir.hidden = !pendente;
  };
  pintarDicaCompat();
  const linhaCompat = group(
    t('config.compat'),
    [
      [t('config.compatDesligada'), 'off'],
      [t('config.compatLigada'), 'on'],
    ],
    estado.graficos.compatibilidade ? 'on' : 'off',
    (v) => {
      const ligada = v === 'on';
      estado.graficos = { ...estado.graficos, compatibilidade: ligada };
      pintarDicaCompat();
      void acoes.gravarCompatibilidade(ligada);
    },
  );

  panel.append(
    h,
    linhaIdioma,
    dicaIdioma,
    linha,
    dica,
    fundoClaro,
    fundoEscuro,
    dicaFundo,
    linhaCompat,
    dicaCompat,
    actions,
  );
  const modal = openModal(panel, () => modal.close());
  fechar.focus();
}
