import type { BoardSummary } from '@shared/wbd';
import { formatBytes, formatDate } from '../features/storage/boardIO';
import { confirmDialog, toast } from './dialogs';
import { icon, type IconName } from './icons';
import { LibrarySearch } from './LibrarySearch';
import { invalidateLibraryIndex } from '../features/search/libraryQuery';

export interface LobbyActions {
  newBoard(): void;
  openBoard(summary: BoardSummary): void;
  openDemo(): void;
  showShortcuts(): void;
  toggleTheme(): void;
  importWhiteboard(): void;
  /** Abre o quadro do caminho e leva a camera ate o objeto (busca da biblioteca). */
  openBoardAt(path: string, objectId: string): void;
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
  #themeBtn!: HTMLButtonElement;
  #search: LibrarySearch;

  constructor(private readonly actions: LobbyActions) {
    this.el = document.createElement('div');
    this.el.className = 'qb-lobby';

    // ---- cabecalho
    const header = document.createElement('header');
    header.className = 'qb-lobby__header';

    // NAO ha marca aqui, e isso e decisao.
    //
    // Ela chegou a existir ao lado do titulo, e ele viu o problema na hora: a
    // barra de titulo da janela ja mostra o mesmo icone com o mesmo nome, um
    // centimetro acima. Eram a mesma coisa duas vezes, empilhadas.
    //
    // O icone do aplicativo mora onde o sistema o poe -- barra de titulo, barra
    // de tarefas, Alt+Tab -- e na tela de abertura. Dentro da interface ele nao
    // se repete: aplicativo de desktop nao carrega a propria logo na tela, e
    // "Creation Board" escrito em corpo 26 ja e a marca desta tela.
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

    // Duas classes de botao, e a divisao e o que deixa o cabecalho calmo:
    //
    // **Utilidades viram icone** -- atalhos e tema. Sao coisas que se procura
    // quando ja se sabe que existem, e o nome escrito delas competia em peso com
    // as duas acoes que realmente importam aqui.
    //
    // **Acoes continuam escritas** -- importar e criar. Elas precisam se
    // explicar: quem abre o app pela primeira vez tem de saber o que fazer sem
    // decifrar desenho nenhum.
    const helpBtn = iconOnlyButton('comandos', 'Atalhos e comandos (F1)', () =>
      this.actions.showShortcuts(),
    );
    this.#themeBtn = iconOnlyButton('lua', 'Alternar tema', () => this.actions.toggleTheme());

    const importBtn = textButton('Importar arquivo', () => this.actions.importWhiteboard());
    importBtn.title = 'Abrir a exportacao (.zip ou .html) do Microsoft Whiteboard';
    const newBtn = textButton('Novo quadro', () => this.actions.newBoard());
    newBtn.classList.add('qb-btn--primary');
    // O "+" era texto dentro do rotulo e alinhava mal com a letra; como icone
    // ele tem o mesmo peso dos outros glifos e fica na linha de base certa.
    newBtn.prepend(icon('mais', 15));

    tools.append(helpBtn, this.#themeBtn, importBtn, newBtn);
    header.append(titleBox, tools);

    // A busca da biblioteca fica ABAIXO do cabecalho, em linha propria, e nao
    // entre os botoes: ela e a acao mais larga desta tela e a unica que precisa
    // de espaco para respirar. Espremida na fila de botoes, ela pareceria mais
    // um controle -- e ela nao e um controle, e a porta de entrada de quem sabe
    // o que procura mas nao em qual quadro.
    this.#search = new LibrarySearch({
      openAt: (path, id) => this.actions.openBoardAt(path, id),
    });
    this.#search.el.addEventListener('qb-libsearch-change', () => this.#syncSearchState());

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

    this.el.append(header, this.#search.el, this.#empty, this.#grid);
  }

  /**
   * Buscando, a grade de cards sai da frente.
   *
   * Deixar as duas na tela faria a pessoa rolar por cima de uma lista de quadros
   * que nao tem relacao com o que ela procurou -- e os cards sao altos, entao os
   * resultados comecariam abaixo da dobra.
   */
  #syncSearchState(): void {
    const buscando = this.#search.active;
    this.#grid.hidden = buscando;
    if (buscando) this.#empty.hidden = true;
    else this.#empty.hidden = this.#grid.childElementCount > 0;
  }

  /** Foco na busca da biblioteca. O `Ctrl+F` do lobby chama aqui. */
  focusSearch(): void {
    this.#search.focus();
  }

  setFolder(path: string): void {
    this.#folderLabel.textContent = path;
  }

  /**
   * Troca o glifo do interruptor de tema para o do PROXIMO tema.
   *
   * Sol de noite, lua de dia: o botao oferece o proximo estado, e nao relata o
   * atual. Um interruptor de uma tecla so nao tem como dizer as duas coisas, e
   * "para onde isto leva" e a pergunta de quem esta com o dedo em cima dele.
   */
  setTheme(theme: 'light' | 'dark'): void {
    this.#themeBtn.replaceChildren(icon(theme === 'dark' ? 'sol' : 'lua', 17));
    const label = theme === 'dark' ? 'Mudar para o tema claro' : 'Mudar para o tema escuro';
    this.#themeBtn.title = label;
    this.#themeBtn.setAttribute('aria-label', label);
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
        // O quadro sumiu do disco; a busca da biblioteca nao pode continuar
        // oferecendo resultados que abririam um arquivo inexistente.
        invalidateLibraryIndex();
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

/**
 * Botao so de icone.
 *
 * O nome vive no `aria-label` e no `title`: sem texto visivel, e ele que um
 * leitor de tela anuncia e que aparece ao parar o mouse. Um icone sem nome e um
 * botao mudo -- foi a licao do M3 na barra inferior.
 */
function iconOnlyButton(name: IconName, label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'qb-btn qb-btn--icon';
  b.title = label;
  b.setAttribute('aria-label', label);
  b.append(icon(name, 17));
  b.addEventListener('click', onClick);
  return b;
}
