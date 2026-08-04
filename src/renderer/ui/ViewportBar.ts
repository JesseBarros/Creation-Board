export interface ViewportBarActions {
  zoomIn(): void;
  zoomOut(): void;
  zoomTo(zoom: number): void;
  fitToContent(): void;
  toggleGrid(): void;
  toggleSnap(): void;
  toggleRulers(): void;
  toggleTheme(): void;
  save(): void;
  backToLobby(): void;
  showShortcuts(): void;
  undo(): void;
  redo(): void;
}

const PRESETS = [0.01, 0.05, 0.25, 0.5, 1, 2, 4, 8, 16, 64];

/** Barra flutuante inferior do quadro. */
export class ViewportBar {
  readonly el: HTMLElement;
  #zoomLabel: HTMLButtonElement;
  #menu: HTMLElement;
  #gridBtn: HTMLButtonElement;
  #snapBtn: HTMLButtonElement;
  #rulerBtn: HTMLButtonElement;
  #nameLabel: HTMLElement;
  #undoBtn: HTMLButtonElement;
  #redoBtn: HTMLButtonElement;

  constructor(private readonly actions: ViewportBarActions) {
    this.el = document.createElement('div');
    this.el.className = 'qb-bar';

    const backBtn = iconButton('‹ quadros', 'Voltar ao lobby (Ctrl+O)', () =>
      this.actions.backToLobby(),
    );

    this.#nameLabel = document.createElement('span');
    this.#nameLabel.className = 'qb-bar__name';
    this.#nameLabel.textContent = 'Quadro sem nome';

    const saveBtn = iconButton('salvar', 'Salvar (Ctrl+S)', () => this.actions.save());
    saveBtn.classList.add('qb-bar__btn--primary');

    this.#undoBtn = iconButton('↶', 'Desfazer (Ctrl+Z)', () => this.actions.undo());
    this.#undoBtn.classList.add('qb-bar__btn--icon');
    this.#redoBtn = iconButton('↷', 'Refazer (Ctrl+Shift+Z)', () => this.actions.redo());
    this.#redoBtn.classList.add('qb-bar__btn--icon');
    this.setHistory(false, false);

    this.#gridBtn = iconButton('grade', 'Grade de fundo (G)', () => this.actions.toggleGrid());
    this.#snapBtn = iconButton('ímã', 'Grade magnética: encaixar na grade (A)', () =>
      this.actions.toggleSnap(),
    );
    this.#rulerBtn = iconButton('régua', 'Réguas nas bordas (R)', () => this.actions.toggleRulers());
    const fitBtn = iconButton('ajustar', 'Ajustar a tela (Ctrl+1)', () =>
      this.actions.fitToContent(),
    );
    const themeBtn = iconButton('tema', 'Alternar tema claro/escuro', () =>
      this.actions.toggleTheme(),
    );
    const helpBtn = iconButton('?', 'Atalhos e comandos (F1)', () => this.actions.showShortcuts());
    helpBtn.classList.add('qb-bar__btn--icon');

    const minus = iconButton('−', 'Diminuir zoom (Ctrl+-)', () => this.actions.zoomOut());
    minus.classList.add('qb-bar__btn--icon');
    const plus = iconButton('+', 'Aumentar zoom (Ctrl++)', () => this.actions.zoomIn());
    plus.classList.add('qb-bar__btn--icon');

    this.#zoomLabel = iconButton('100%', 'Niveis de zoom', () => this.#toggleMenu());
    this.#zoomLabel.classList.add('qb-bar__zoom');

    this.#menu = document.createElement('div');
    this.#menu.className = 'qb-bar__menu';
    this.#menu.hidden = true;
    for (const z of PRESETS) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'qb-bar__menu-item';
      item.textContent = `${z * 100}%`;
      item.addEventListener('click', () => {
        this.actions.zoomTo(z);
        this.#menu.hidden = true;
      });
      this.#menu.append(item);
    }

    const zoomGroup = document.createElement('div');
    zoomGroup.className = 'qb-bar__group';
    zoomGroup.append(minus, this.#zoomLabel, plus, this.#menu);

    this.el.append(
      backBtn,
      this.#nameLabel,
      saveBtn,
      divider(),
      this.#undoBtn,
      this.#redoBtn,
      divider(),
      this.#gridBtn,
      this.#snapBtn,
      this.#rulerBtn,
      fitBtn,
      themeBtn,
      helpBtn,
      divider(),
      zoomGroup,
    );

    // Clique fora fecha o menu de presets.
    document.addEventListener('pointerdown', (e) => {
      if (!this.#menu.hidden && !this.el.contains(e.target as Node)) this.#menu.hidden = true;
    });
  }

  setZoom(zoom: number): void {
    this.#zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
  }

  setGridEnabled(on: boolean): void {
    this.#gridBtn.classList.toggle('qb-bar__btn--active', on);
  }

  setSnap(on: boolean): void {
    this.#snapBtn.classList.toggle('qb-bar__btn--active', on);
  }

  setRulers(on: boolean): void {
    this.#rulerBtn.classList.toggle('qb-bar__btn--active', on);
  }

  setHistory(canUndo: boolean, canRedo: boolean): void {
    this.#undoBtn.disabled = !canUndo;
    this.#redoBtn.disabled = !canRedo;
  }

  /** O ponto antes do nome sinaliza alteracoes ainda nao gravadas. */
  setBoardName(name: string, dirty: boolean): void {
    this.#nameLabel.textContent = dirty ? `• ${name}` : name;
    this.#nameLabel.classList.toggle('qb-bar__name--dirty', dirty);
    this.#nameLabel.title = dirty ? 'Alteracoes nao salvas' : name;
  }

  #toggleMenu(): void {
    this.#menu.hidden = !this.#menu.hidden;
  }
}

function iconButton(text: string, title: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'qb-bar__btn';
  b.textContent = text;
  b.title = title;
  b.addEventListener('click', onClick);
  return b;
}

function divider(): HTMLElement {
  const d = document.createElement('span');
  d.className = 'qb-bar__divider';
  return d;
}
