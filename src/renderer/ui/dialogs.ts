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
