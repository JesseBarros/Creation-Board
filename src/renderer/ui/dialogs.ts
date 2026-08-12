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
    cancel.textContent = 'Cancelar';

    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'qb-btn qb-btn--primary';
    ok.textContent = opts.confirmLabel ?? 'Salvar';

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
    cancel.textContent = opts.cancelLabel ?? 'Cancelar';

    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = `qb-btn ${opts.danger ? 'qb-btn--danger' : 'qb-btn--primary'}`;
    ok.textContent = opts.confirmLabel ?? 'Confirmar';

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
    h.textContent = 'Exportar quadro';
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
      const tamanho = `${p.width.toLocaleString('pt-BR')} × ${p.height.toLocaleString('pt-BR')} px`;
      if (choice.format === 'svg') {
        resumo.textContent = 'Vetorial: legivel em qualquer ampliacao, sem resolucao fixa.';
      } else if (p.scale < choice.scale - 0.001) {
        // So o PDF cai aqui: uma pagina nao tem onde por o segundo ladrilho.
        resumo.textContent =
          `${tamanho} — uma pagina so cabe ${p.scale.toFixed(2)}x, e nao ${choice.scale}x. ` +
          `Para ${choice.scale}x de verdade, exporte em PNG.`;
      } else if (p.files > 1) {
        resumo.textContent = `${tamanho} em ${p.files} arquivos, a ${choice.scale}x de verdade.`;
        // Acima de duas dezenas de arquivos a escolha deixa de ser obvia: a
        // resolucao e real, mas o resultado e uma pasta cheia e uma espera
        // longa. Dizer isso antes vale mais do que descobrir depois.
        if (p.files > 24) {
          resumo.textContent += ' Sao muitos — considere 1x, ou o SVG.';
          resumo.classList.add('qb-dialog__hint--warn');
        } else {
          resumo.classList.remove('qb-dialog__hint--warn');
        }
      } else {
        resumo.textContent = `${tamanho}, um arquivo.`;
      }
    };

    const scaleRow = group('Resolucao', [
      ['1x', '1'],
      ['2x', '2'],
      ['3x', '3'],
    ], String(choice.scale), (v) => {
      choice.scale = Number(v);
      atualizarResumo();
    });

    panel.append(
      group(
        'Formato',
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
          'O que',
          [
            ['Selecao', 'selection'],
            ['Quadro todo', 'board'],
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
        'Fundo',
        [
          ['Com fundo', 'sim'],
          ['Transparente', 'nao'],
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
    cancel.textContent = 'Cancelar';
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'qb-btn qb-btn--primary';
    ok.textContent = 'Exportar';
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
