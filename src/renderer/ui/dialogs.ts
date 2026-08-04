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
export function exportDialog(opts: { hasSelection: boolean }): Promise<ExportChoice | null> {
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

    const scaleRow = group('Resolucao', [
      ['1x', '1'],
      ['2x', '2'],
      ['3x', '3'],
    ], String(choice.scale), (v) => {
      choice.scale = Number(v);
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
