import type { BoardSummary } from '@shared/wbd';
import { formatBytes, formatDate } from '../features/storage/boardIO';
import { confirmDialog, toast } from './dialogs';

export interface LobbyActions {
  newBoard(): void;
  openBoard(summary: BoardSummary): void;
  openDemo(): void;
  showShortcuts(): void;
  toggleTheme(): void;
  importWhiteboard(): void;
}

/**
 * Tela inicial: lista os quadros salvos como cards com miniatura.
 *
 * As miniaturas ja chegam prontas do processo principal (data: URL vinda do
 * preview.png dentro do .wbd). O lobby nunca abre o documento de um quadro para
 * desenhar o card -- por isso a lista carrega rapido independente do tamanho
 * dos quadros.
 */
export class Lobby {
  readonly el: HTMLElement;
  #grid: HTMLElement;
  #empty: HTMLElement;
  #folderLabel: HTMLElement;

  constructor(private readonly actions: LobbyActions) {
    this.el = document.createElement('div');
    this.el.className = 'qb-lobby';

    // ---- cabecalho
    const header = document.createElement('header');
    header.className = 'qb-lobby__header';

    const titleBox = document.createElement('div');
    const title = document.createElement('h1');
    title.className = 'qb-lobby__title';
    title.textContent = 'Creation Board';
    this.#folderLabel = document.createElement('button');
    this.#folderLabel.className = 'qb-lobby__folder';
    this.#folderLabel.title = 'Abrir a pasta dos quadros no Explorador';
    this.#folderLabel.textContent = 'Meus quadros';
    this.#folderLabel.addEventListener('click', () => {
      void window.quadro.board.revealFolder();
    });
    titleBox.append(title, this.#folderLabel);

    const tools = document.createElement('div');
    tools.className = 'qb-lobby__tools';

    const helpBtn = textButton('Atalhos', () => this.actions.showShortcuts());
    helpBtn.title = 'F1';
    const themeBtn = textButton('Tema', () => this.actions.toggleTheme());
    const importBtn = textButton('Importar arquivo', () => this.actions.importWhiteboard());
    importBtn.title = 'Abrir a exportacao (.zip ou .html) do Microsoft Whiteboard';
    const newBtn = textButton('+ Novo quadro', () => this.actions.newBoard());
    newBtn.classList.add('qb-btn--primary');

    tools.append(helpBtn, themeBtn, importBtn, newBtn);
    header.append(titleBox, tools);

    // ---- grade de cards
    this.#grid = document.createElement('div');
    this.#grid.className = 'qb-lobby__grid';

    this.#empty = document.createElement('div');
    this.#empty.className = 'qb-lobby__empty';
    this.#empty.hidden = true;
    const emptyTitle = document.createElement('p');
    emptyTitle.className = 'qb-lobby__empty-title';
    emptyTitle.textContent = 'Nenhum quadro salvo ainda.';
    const emptyHint = document.createElement('p');
    emptyHint.className = 'qb-lobby__empty-hint';
    emptyHint.textContent =
      'Crie um quadro novo e salve com Ctrl+S — ele aparece aqui com uma miniatura.';
    const emptyActions = document.createElement('div');
    emptyActions.className = 'qb-lobby__empty-actions';
    // No lobby vazio o rotulo diz de onde vem, porque ali ele e a explicacao do
    // que fazer primeiro -- e nao mais um botao numa fila.
    const importCta = textButton('Importar arquivo do Microsoft Whiteboard', () =>
      this.actions.importWhiteboard(),
    );
    importCta.classList.add('qb-btn--primary');
    const demoBtn = textButton('Abrir quadro de demonstracao', () => this.actions.openDemo());
    emptyActions.append(importCta, demoBtn);
    this.#empty.append(emptyTitle, emptyHint, emptyActions);

    this.el.append(header, this.#empty, this.#grid);
  }

  setFolder(path: string): void {
    this.#folderLabel.textContent = path;
  }

  /** Recarrega a lista a partir do disco. */
  async refresh(): Promise<void> {
    let boards: BoardSummary[] = [];
    try {
      boards = await window.quadro.board.list();
    } catch (err) {
      toast(`Nao foi possivel ler a pasta de quadros: ${String(err)}`, 'error');
    }

    this.#grid.replaceChildren();
    this.#empty.hidden = boards.length > 0;

    for (const b of boards) {
      this.#grid.append(this.#card(b));
    }
  }

  #card(summary: BoardSummary): HTMLElement {
    const card = document.createElement('article');
    card.className = 'qb-card';
    card.tabIndex = 0;

    const thumb = document.createElement('div');
    thumb.className = 'qb-card__thumb';
    if (summary.preview) {
      const img = document.createElement('img');
      img.src = summary.preview;
      img.alt = '';
      img.loading = 'lazy';
      thumb.append(img);
    } else {
      thumb.classList.add('qb-card__thumb--none');
      thumb.textContent = 'sem miniatura';
    }

    const body = document.createElement('div');
    body.className = 'qb-card__body';

    const name = document.createElement('h2');
    name.className = 'qb-card__name';
    name.textContent = summary.name;
    name.title = summary.name;

    const meta = document.createElement('p');
    meta.className = 'qb-card__meta';
    meta.textContent = `${formatDate(summary.updatedAt)} · ${summary.objectCount.toLocaleString('pt-BR')} objetos · ${formatBytes(summary.bytes)}`;

    body.append(name, meta);

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'qb-card__delete';
    del.textContent = '✕';
    del.title = 'Excluir este quadro';
    del.addEventListener('click', async (e) => {
      // Sem isso o clique borbulha para o card e abriria o quadro que acabou de
      // ser excluido.
      e.stopPropagation();
      const ok = await confirmDialog({
        title: 'Excluir quadro',
        message: `"${summary.name}" sera apagado do disco. Esta acao nao pode ser desfeita.`,
        confirmLabel: 'Excluir',
        danger: true,
      });
      if (!ok) return;
      try {
        await window.quadro.board.remove(summary.path);
        toast(`"${summary.name}" excluido.`);
        await this.refresh();
      } catch (err) {
        toast(`Falha ao excluir: ${String(err)}`, 'error');
      }
    });

    card.append(thumb, body, del);
    card.addEventListener('click', () => this.actions.openBoard(summary));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.actions.openBoard(summary);
      }
    });

    return card;
  }
}

function textButton(text: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'qb-btn';
  b.textContent = text;
  b.addEventListener('click', onClick);
  return b;
}
