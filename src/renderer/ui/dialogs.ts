import type { EstadoGraficos, TemaFundo } from '@shared/ipc-contract';
import type { NivelDeMovimento } from './movimento';
import { NOMES_DOS_IDIOMAS, t, type Idioma } from '@shared/i18n';
import { icon } from './icons';

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
 * aperta Enter e leva o neutro.
 *
 * O NOME veio em 06/10/2026, pedido: com nome, o quadro já nasce salvo
 * (tem arquivo, entra no autosave, e nunca vira "não salvo"). Sem nome, é como
 * antes -- o nome é pedido na primeira vez que salvar.
 */
export interface NovoQuadro {
  papel: string;
  /** Vazio = sem nome ainda. */
  nome: string;
}

export function newBoardDialog(): Promise<NovoQuadro | null> {
  return new Promise((resolve) => {
    const panel = document.createElement('div');
    panel.className = 'qb-dialog';

    const h = document.createElement('h2');
    h.className = 'qb-dialog__title';
    h.textContent = t('novoQuadro.titulo');

    const p = document.createElement('p');
    p.className = 'qb-dialog__message';
    p.textContent = t('novoQuadro.mensagem');

    // O nome vem primeiro: e o que a pessoa ja tem na cabeca ao criar. O foco
    // abre nele, e Enter cria -- com ou sem nome.
    const rotuloNome = document.createElement('label');
    rotuloNome.className = 'qb-dialog__label';
    rotuloNome.textContent = t('novoQuadro.nome');
    const nome = document.createElement('input');
    nome.className = 'qb-dialog__input';
    nome.type = 'text';
    nome.maxLength = 120;
    nome.placeholder = t('novoQuadro.nomeDica');
    rotuloNome.append(nome);

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
    panel.append(h, rotuloNome, p, grade, actions);

    const done = (value: NovoQuadro | null): void => {
      modal.close();
      resolve(value);
    };
    const modal = openModal(panel, () => done(null));

    const criar = (): void => done({ papel: escolhida, nome: nome.value.trim() });
    cancel.addEventListener('click', () => done(null));
    ok.addEventListener('click', criar);
    nome.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        criar();
      }
    });
    nome.focus();
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

  row.append(title, seg(options, initial, onPick));
  return row;
}

/** Os botoes segmentados sozinhos, sem rotulo: o `group` e Configuracoes usam. */
function seg(
  options: ReadonlyArray<readonly [string, string]>,
  initial: string,
  onPick: (value: string) => void,
): HTMLElement {
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

  return buttons;
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
  /** O idioma ESCOLHIDO (gravado). */
  idioma: Idioma;
  /** O idioma desta janela -- difere do escolhido ate recarregar. */
  idiomaEmUso: Idioma;
  animacoes: NivelDeMovimento;
  /** Nome do arquivo escolhido por tema, ou null para a imagem que vem com o app. */
  fundos: { claro: string | null; escuro: string | null };
  /** A "compatibilidade grafica": gravada e em uso (so vale ao reabrir). */
  graficos: EstadoGraficos;
  /** Onde os quadros moram hoje. */
  pastaDosQuadros: string;
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
  /** A imagem que vale agora para o tema (a escolhida, ou a que vem com o app), para a miniatura. */
  previaDoFundo(tema: TemaFundo): string;
  gravarCompatibilidade(ligada: boolean): Promise<void>;
  /** Fecha e abre o app de novo, para a compatibilidade valer. */
  reabrir(): void;
  /** Recarrega a janela, para o idioma valer. */
  recarregar(): void;
  /** Escolher outra pasta e mover os quadros para ela (o App conduz a conversa). */
  trocarPastaDosQuadros(): void;
  /** Mostra os tutoriais de novo. A tela de Configuracoes fecha antes. */
  verTutorial(): void;
}

/**
 * Uma linha de Configuracoes: nome e descricao curta a esquerda, o controle a
 * direita. A descricao e UMA frase -- a tela antiga explicava cada opcao num
 * paragrafo, e a soma deles era o que a deixava pesada.
 */
function linhaConfig(
  nome: string,
  descricao: string,
  controle: HTMLElement,
): { linha: HTMLElement; desc: HTMLElement } {
  const linha = document.createElement('div');
  linha.className = 'qb-config__linha';

  const texto = document.createElement('div');
  texto.className = 'qb-config__texto';
  const n = document.createElement('span');
  n.className = 'qb-config__nome';
  n.textContent = nome;
  const desc = document.createElement('span');
  desc.className = 'qb-config__desc';
  desc.textContent = descricao;
  texto.append(n, desc);

  linha.append(texto, controle);
  return { linha, desc };
}

/** Um bloco com titulo e as linhas num cartao, separadas por um fio. */
function secaoConfig(titulo: string, ...linhas: HTMLElement[]): HTMLElement {
  const secao = document.createElement('section');
  secao.className = 'qb-config__secao';
  const h = document.createElement('h3');
  h.className = 'qb-config__secao-titulo';
  h.textContent = titulo;
  const cartao = document.createElement('div');
  cartao.className = 'qb-config__cartao';
  cartao.append(...linhas);
  secao.append(h, cartao);
  return secao;
}

/**
 * A linha de um fundo: miniatura, nome do arquivo, Trocar e Restaurar.
 *
 * A MINIATURA responde [...] sem ler nada -- a tela antiga
 * dizia so o nome, e "Imagem que vem com o aplicativo" nao mostra qual e.
 * Restaurar e um icone e some quando ja e o padrao: aceso, prometeria uma acao
 * que nao faz nada.
 */
function linhaFundo(opts: {
  nome: string;
  arquivo: string | null;
  previa: () => string;
  escolher: () => Promise<string | null>;
  restaurar: () => Promise<void>;
}): HTMLElement {
  const controle = document.createElement('div');
  controle.className = 'qb-config__fundo';

  const restaurar = document.createElement('button');
  restaurar.type = 'button';
  restaurar.className = 'qb-btn qb-btn--icon';
  restaurar.title = t('config.restaurarPadrao');
  restaurar.setAttribute('aria-label', t('config.restaurarPadrao'));
  restaurar.append(icon('desfazer', 15));

  const trocar = document.createElement('button');
  trocar.type = 'button';
  trocar.className = 'qb-btn';
  trocar.textContent = t('config.trocarImagem');

  controle.append(restaurar, trocar);
  const { linha, desc } = linhaConfig(opts.nome, '', controle);

  const miniatura = document.createElement('span');
  miniatura.className = 'qb-config__miniatura';
  linha.prepend(miniatura);

  let atual = opts.arquivo;
  const pintar = (): void => {
    desc.textContent = atual ?? t('config.imagemPadrao');
    desc.title = atual ?? '';
    restaurar.hidden = atual === null;
    miniatura.style.backgroundImage = `url("${opts.previa()}")`;
  };
  pintar();

  /*
    Os dois botoes ficam travados enquanto o dialogo NATIVO estiver aberto.

    Sem isso, um clique duplo abre dois `showOpenDialog`, e o segundo fica orfao
    atras do modal -- sem foco, sem jeito obvio de fechar, e travando a janela
    para quem nao percebeu que ele existe.
  */
  const enquanto = async (fn: () => Promise<void>): Promise<void> => {
    trocar.disabled = true;
    restaurar.disabled = true;
    try {
      await fn();
    } finally {
      trocar.disabled = false;
      restaurar.disabled = false;
      pintar();
    }
  };

  trocar.addEventListener('click', () => {
    void enquanto(async () => {
      const novo = await opts.escolher();
      // Cancelou: mantem o que estava, e nao apaga a escolha anterior.
      if (novo !== null) atual = novo;
    });
  });

  restaurar.addEventListener('click', () => {
    void enquanto(async () => {
      await opts.restaurar();
      atual = null;
    });
  });

  return linha;
}

/**
 * Configuracoes do aplicativo, abertas pelo menu principal.
 *
 * REDESENHADA em 06/10/2026 ([...]): tres secoes em cartoes, uma frase por opcao, miniatura no lugar
 * dos botoes empilhados do fundo, e o fechar no cabecalho.
 *
 * Animacoes e fundos aplicam NA HORA: o efeito e visivel na propria tela atras
 * do dialogo. Idioma e compatibilidade grafica sao gravados na hora mas so valem
 * ao recarregar (idioma) ou reabrir (compatibilidade) -- e para isso existe o
 * "Aplicar alteracoes" do rodape, pedido com a 1.1.0 instalada: trocar o
 * idioma e fechar a tela nao mudava nada, e nao havia como aplicar dali.
 */
export function settingsDialog(atual: Configuracoes, acoes: AcoesConfig): void {
  const panel = document.createElement('div');
  panel.className = 'qb-dialog qb-config';

  const estado: Configuracoes = { ...atual };

  // --- cabecalho
  const cabecalho = document.createElement('div');
  cabecalho.className = 'qb-config__cabecalho';
  const h = document.createElement('h2');
  h.className = 'qb-dialog__title';
  h.textContent = t('config.titulo');
  const fechar = document.createElement('button');
  fechar.type = 'button';
  fechar.className = 'qb-btn qb-btn--icon qb-config__fechar';
  fechar.title = t('comum.fechar');
  fechar.setAttribute('aria-label', t('comum.fechar'));
  fechar.append(icon('fechar', 16));
  fechar.addEventListener('click', () => modal.close());
  cabecalho.append(h, fechar);

  // --- Geral
  // O idioma primeiro: e a linha que quem abriu o app na lingua errada procura.
  // As opcoes aparecem SEMPRE na propria lingua -- "English (US)" para quem nao
  // le portugues, e vice-versa.
  const idioma = linhaConfig(
    t('config.idioma'),
    t('config.idiomaDica'),
    seg(
      (Object.entries(NOMES_DOS_IDIOMAS) as [Idioma, string][]).map(([valor, nome]) => [nome, valor] as const),
      estado.idioma,
      (v) => {
        if (v === 'pt-BR' || v === 'en-US') {
          estado.idioma = v;
          acoes.onChange({ ...estado });
          pintarRodape();
        }
      },
    ),
  );

  // A descricao acompanha o nivel escolhido: diz o que AQUELE nivel faz, em vez
  // de explicar os tres de uma vez.
  const dicaDoNivel = (n: NivelDeMovimento): string =>
    n === 'off' ? t('config.animDicaOff') : n === 'max' ? t('config.animDicaMax') : t('config.animDicaOn');
  // Em ordem de intensidade, e nao de uso: quem le da esquerda para a direita
  // entende a escala sem ler a dica.
  const animacoes = linhaConfig(
    t('config.animacoes'),
    dicaDoNivel(estado.animacoes),
    seg(
      [
        [t('config.animDesligadas'), 'off'],
        [t('config.animLigadas'), 'on'],
        [t('config.animMaximas'), 'max'],
      ],
      estado.animacoes,
      (v) => {
        estado.animacoes = v === 'off' || v === 'max' ? v : 'on';
        animacoes.desc.textContent = dicaDoNivel(estado.animacoes);
        acoes.onChange({ ...estado });
      },
    ),
  );

  // A pasta dos quadros: o caminho inteiro na dica, porque a linha corta.
  const trocarPasta = document.createElement('button');
  trocarPasta.type = 'button';
  trocarPasta.className = 'qb-btn';
  trocarPasta.textContent = t('config.trocarImagem');
  trocarPasta.addEventListener('click', () => acoes.trocarPastaDosQuadros());
  const pasta = linhaConfig(t('config.pastaQuadros'), estado.pastaDosQuadros, trocarPasta);
  pasta.desc.classList.add('qb-config__desc--caminho');
  pasta.desc.title = estado.pastaDosQuadros;
  pasta.linha.dataset['config'] = 'pasta';

  const verTutorial = document.createElement('button');
  verTutorial.type = 'button';
  verTutorial.className = 'qb-btn';
  verTutorial.textContent = t('config.tutorialVer');
  verTutorial.addEventListener('click', () => {
    modal.close();
    acoes.verTutorial();
  });
  const tutorial = linhaConfig(t('config.tutorial'), t('config.tutorialDica'), verTutorial);
  tutorial.linha.dataset['config'] = 'tutorial';

  // --- Aparencia
  const fundoClaro = linhaFundo({
    nome: t('config.fundoClaro'),
    arquivo: estado.fundos.claro,
    previa: () => acoes.previaDoFundo('claro'),
    escolher: () => acoes.escolherFundo('claro'),
    restaurar: () => acoes.restaurarFundo('claro'),
  });
  const fundoEscuro = linhaFundo({
    nome: t('config.fundoEscuro'),
    arquivo: estado.fundos.escuro,
    previa: () => acoes.previaDoFundo('escuro'),
    escolher: () => acoes.escolherFundo('escuro'),
    restaurar: () => acoes.restaurarFundo('escuro'),
  });
  const aparencia = secaoConfig(t('config.secaoAparencia'), fundoClaro, fundoEscuro);
  const notaFundo = document.createElement('p');
  notaFundo.className = 'qb-config__nota';
  notaFundo.textContent = t('config.fundoDica');
  aparencia.append(notaFundo);

  // --- Desempenho
  // A ultima secao por ser a mais tecnica: quem precisa dela chega aqui
  // procurando, e quem nao precisa nao tem por que mexer.
  const compat = linhaConfig(
    t('config.compat'),
    t('config.compatDica'),
    seg(
      [
        [t('config.compatDesligada'), 'off'],
        [t('config.compatLigada'), 'on'],
      ],
      estado.graficos.compatibilidade ? 'on' : 'off',
      (v) => {
        const ligada = v === 'on';
        estado.graficos = { ...estado.graficos, compatibilidade: ligada };
        pintarRodape();
        void acoes.gravarCompatibilidade(ligada);
      },
    ),
  );
  compat.linha.dataset['config'] = 'compat';

  // --- rodape: "Aplicar alteracoes"
  //
  // Sempre a vista, e apagado quando nao ha nada a aplicar -- assim quem trocou
  // o idioma sabe onde ir, e quem nao trocou nada nao e convidado a recarregar
  // a toa. Se a compatibilidade mudou, reabre o app inteiro (as chaves do
  // Chromium so entram ao abrir), e isso ja leva o idioma junto; senao, basta
  // recarregar a janela.
  const idiomaEmUso = atual.idiomaEmUso;
  const rodape = document.createElement('div');
  rodape.className = 'qb-config__rodape';
  const rodapeTexto = document.createElement('span');
  rodapeTexto.className = 'qb-config__rodape-texto';
  const aplicar = document.createElement('button');
  aplicar.type = 'button';
  aplicar.className = 'qb-btn qb-btn--primary qb-config__aplicar';
  aplicar.textContent = t('config.aplicar');
  rodape.append(rodapeTexto, aplicar);
  const reabrirPendente = (): boolean => estado.graficos.compatibilidade !== estado.graficos.emUso;
  const recarregarPendente = (): boolean => estado.idioma !== idiomaEmUso;
  const pintarRodape = (): void => {
    const reabre = reabrirPendente();
    const recarrega = recarregarPendente();
    aplicar.disabled = !reabre && !recarrega;
    rodapeTexto.textContent = reabre
      ? t('config.aplicarReabre')
      : recarrega
        ? t('config.aplicarRecarrega')
        : '';
  };
  aplicar.addEventListener('click', () => {
    const reabre = reabrirPendente();
    aplicar.disabled = true;
    if (reabre) acoes.reabrir();
    else acoes.recarregar();
  });
  pintarRodape();

  panel.append(
    cabecalho,
    secaoConfig(t('config.secaoGeral'), idioma.linha, animacoes.linha, pasta.linha, tutorial.linha),
    aparencia,
    secaoConfig(t('config.secaoDesempenho'), compat.linha),
    rodape,
  );
  const modal = openModal(panel, () => modal.close());
  fechar.focus();
}
