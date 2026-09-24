import type { BoardSummary } from '@shared/wbd';
import { formatBytes, formatDate } from '../features/storage/boardIO';
import { confirmDialog, promptText, toast } from './dialogs';
import { icon, type IconName } from './icons';
import { LibrarySearch } from './LibrarySearch';
import { invalidateLibraryIndex } from '../features/search/libraryQuery';
import {
  criarPasta,
  criarPastaCom,
  excluirPasta,
  moverParaPasta,
  indiceVazio,
  nomeDeArquivoDe,
  nomeLivre,
  reconciliar,
  renomearPasta,
  tirarDeTodas,
} from '@shared/pastas';
import type { IndicePastas, PastaResolvida, Reconciliado } from '@shared/pastas';
import { createId } from '@shared/model/id';
import { tornarArrastavel, type AlvoDeArrasto } from './arrastarCard';

/**
 * Onde um quadro arrastado pode cair. A tela decide quais existem: na
 * principal, as pastas e os outros quadros; dentro de uma pasta, so a trilha
 * de volta -- pasta dentro de pasta nao existe no indice.
 */
type Alvo =
  | { tipo: 'pasta'; id: string; nome: string }
  | { tipo: 'quadro'; arquivo: string }
  | { tipo: 'fora' };

export interface LobbyActions {
  newBoard(): void;
  openBoard(summary: BoardSummary): void;
  openDemo(): void;
  toggleTheme(): void;
  openSettings(): void;
  importBoards(): void;
  /** Abre o quadro do caminho e leva a camera ate o objeto (busca da biblioteca). */
  openBoardAt(path: string, objectId: string): void;
}

/**
 * De onde o lobby le os quadros e o indice de pastas, e para onde grava.
 *
 * Existe para o selftest poder montar um `Lobby` de verdade com um disco de
 * mentira. Sem isto, conferir que entrar numa pasta mostra os quadros dela
 * exigiria gravar no indice de pastas REAL dele -- e um teste que mexe no
 * agrupamento de verdade do usuario e um teste que ninguem quer rodar duas
 * vezes (a mesma razao de o selftest nunca chamar `pastas.gravar`).
 */
export interface FonteDoLobby {
  listarQuadros(): Promise<BoardSummary[]>;
  lerPastas(): Promise<IndicePastas>;
  gravarPastas(indice: IndicePastas): Promise<void>;
}

const FONTE_REAL: FonteDoLobby = {
  listarQuadros: () => window.quadro.board.list(),
  lerPastas: () => window.quadro.pastas.ler(),
  gravarPastas: (indice) => window.quadro.pastas.gravar(indice),
};

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
  /** O que rola. A raiz e palco parado -- ver a montagem no construtor. */
  #rolagem!: HTMLElement;
  #painel!: HTMLElement;
  #grid: HTMLElement;
  #empty: HTMLElement;
  #folderLabel: HTMLElement;
  #themeBtn!: HTMLButtonElement;
  #novaPastaBtn: HTMLButtonElement;
  #search: LibrarySearch;

  // ---- pastas
  /** "Todos os quadros / Nome": so existe na tela de dentro de uma pasta. */
  #trilha: HTMLElement;
  #trilhaNome: HTMLElement;
  #vazioPasta: HTMLElement;
  /**
   * A pasta aberta, por ID. Sobrevive ao `refresh()` e a ida ao quadro: quem
   * abre um quadro de dentro de uma pasta volta para dentro dela.
   */
  #pastaAberta: string | null = null;
  /** Onde a rolagem estava na tela principal, para voltar ao mesmo ponto. */
  #rolagemAntes = 0;
  /** O ultimo resultado do disco. Entrar e sair de pasta desenha daqui, sem reler. */
  #ultimo: Reconciliado = { pastas: [], soltos: [] };

  constructor(
    private readonly actions: LobbyActions,
    private readonly fonte: FonteDoLobby = FONTE_REAL,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'qb-lobby';

    // ---- cabecalho
    const header = document.createElement('header');
    header.className = 'qb-lobby__header';

    // NAO ha marca aqui, e isso e decisao.
    //
    // Ela chegou a existir ao lado do titulo, e se viu o problema na hora: a
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
    /*
      NAO HA BOTAO DE ATALHOS AQUI, e isto e decisao de 21/09/2026.

      A tela de atalhos continua existindo e `F1` continua abrindo -- o que saiu
      foi o botao NESTA tela. O lobby responde [...]; a lista de
      teclas responde [...], que e uma pergunta de dentro do quadro.
      O botao dela na barra inferior fica, porque ali a pergunta faz sentido.

      Sobraram tres controles no cabecalho, e os tres respondem a pergunta da
      tela: trocar o tema, importar e criar.

      "Nova pasta" entrou depois, em 22/09/2026, e e ACAO, entao e escrita. Ela
      e o caminho de criar pasta que nao depende de arrastar -- o arrastar e a
      Parte 4 e vira um segundo caminho, sem tirar este.
    */
    this.#themeBtn = iconOnlyButton('lua', 'Alternar tema', () => this.actions.toggleTheme());

    // Configuracoes entrou em 21/09/2026, depois de o botao de atalhos ter
    // SAIDO daqui ([...]). A
    // diferenca entre os dois: aquele so contava coisas, este MUDA coisas --
    // e uma preferencia do aplicativo precisa de um lugar onde ser encontrada.
    const configBtn = iconOnlyButton('ajustes', 'Configurações', () =>
      this.actions.openSettings(),
    );

    this.#novaPastaBtn = textButton('Nova pasta', () => void this.#novaPasta());
    this.#novaPastaBtn.prepend(icon('novaPasta', 15));

    const importBtn = textButton('Importar arquivo', () => this.actions.importBoards());
    importBtn.title = 'Abrir um quadro exportado de outro aplicativo (.zip ou .html)';
    const newBtn = textButton('Novo quadro', () => this.actions.newBoard());
    newBtn.classList.add('qb-btn--primary');
    // O "+" era texto dentro do rotulo e alinhava mal com a letra; como icone
    // ele tem o mesmo peso dos outros glifos e fica na linha de base certa.
    newBtn.prepend(icon('mais', 15));

    tools.append(this.#themeBtn, configBtn, this.#novaPastaBtn, importBtn, newBtn);
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
    const importCta = textButton('Importar um quadro de outro aplicativo', () =>
      this.actions.importBoards(),
    );
    importCta.classList.add('qb-btn--primary');
    const demoBtn = textButton('Abrir quadro de demonstracao', () => this.actions.openDemo());
    emptyActions.append(importCta, demoBtn);
    this.#empty.append(emptyTitle, emptyHint, emptyActions);

    /*
      A ROLAGEM MORA NUM FILHO, e nao na raiz do lobby.

      A raiz virou palco: ela nao rola (`overflow: clip`) e e ela que vai
      carregar a imagem de fundo. Assim o fundo fica parado enquanto a lista
      corre, DE GRACA -- sem `background-attachment: fixed`, que num elemento
      que rola obriga o Chromium a repintar o fundo a cada frame, e este app ja
      tem historico documentado de rastro ao rolar (B8 e B18).

      Efeito colateral bom: a barra de rolagem nasce na borda real da tela, e
      nao a 32px dela, porque o padding desceu junto com a rolagem.
    */
    /*
      O PAINEL DE VIDRO, e o que fica DENTRO dele.

      Cabecalho e busca ficam FORA: nos mockups eles pousam direto sobre a foto,
      e a busca nao e um controle da grade -- ela procura dentro dos quadros,
      nao entre eles. O que entra e a grade e o estado vazio.

      O estado vazio entra por um motivo pratico: deixado de fora, o lobby de
      quem acabou de instalar abriria com a mensagem [...]
      e, logo abaixo dela, uma lamina de vidro vazia. E a pior primeira imagem
      possivel da tela.
    */
    // ---- dentro de uma pasta
    //
    // A trilha mora DENTRO do painel, e nao no cabecalho: ela diz onde esta a
    // grade, e nao o aplicativo. O cabecalho continua o mesmo nas duas telas.
    this.#trilha = document.createElement('nav');
    this.#trilha.className = 'qb-lobby__trilha';
    this.#trilha.setAttribute('aria-label', 'Local');
    this.#trilha.hidden = true;
    const voltar = document.createElement('button');
    voltar.type = 'button';
    voltar.className = 'qb-lobby__trilha-voltar';
    voltar.append(icon('voltar', 15), 'Todos os quadros');
    voltar.addEventListener('click', () => this.#sairDaPasta());
    const separador = document.createElement('span');
    separador.className = 'qb-lobby__trilha-sep';
    separador.setAttribute('aria-hidden', 'true');
    separador.textContent = '/';
    this.#trilhaNome = document.createElement('h2');
    this.#trilhaNome.className = 'qb-lobby__trilha-nome';
    this.#trilha.append(voltar, separador, this.#trilhaNome);

    // Pasta vazia e estado normal, e nao falha: a pasta acabou de ser criada.
    // A mensagem nao promete o arrastar, que ainda nao existe.
    this.#vazioPasta = document.createElement('p');
    this.#vazioPasta.className = 'qb-lobby__pasta-vazia';
    this.#vazioPasta.textContent = 'Esta pasta ainda está vazia.';
    this.#vazioPasta.hidden = true;

    this.#painel = document.createElement('div');
    this.#painel.className = 'qb-lobby__painel';
    this.#painel.append(this.#trilha, this.#empty, this.#vazioPasta, this.#grid);

    this.#rolagem = document.createElement('div');
    this.#rolagem.className = 'qb-lobby__rolagem';
    this.#rolagem.append(header, this.#search.el, this.#painel);
    this.el.append(this.#rolagem);
  }

  /**
   * Buscando, a grade de cards sai da frente.
   *
   * Deixar as duas na tela faria a pessoa rolar por cima de uma lista de quadros
   * que nao tem relacao com o que ela procurou -- e os cards sao altos, entao os
   * resultados comecariam abaixo da dobra.
   *
   * QUEM SOME E O PAINEL, e nao a grade. Enquanto a grade era o elemento de
   * cima, esconde-la bastava; com o vidro em volta, esconder so o conteudo
   * deixaria uma lamina vazia pousada sob os resultados da busca.
   */
  #syncSearchState(): void {
    const buscando = this.#search.active;
    this.#painel.hidden = buscando;
    this.#empty.hidden = buscando || !this.#semNada();
  }

  /**
   * O lobby nao tem nada para mostrar: nem quadro, nem pasta.
   *
   * Contar os filhos da grade deixou de servir quando a pasta entrou: dentro de
   * uma pasta vazia a grade fica vazia tambem, e a mensagem [...] apareceria para quem tem quarenta.
   */
  #semNada(): boolean {
    const { pastas, soltos } = this.#ultimo;
    return this.#pastaAberta === null && pastas.length === 0 && soltos.length === 0;
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
   * [...] e a pergunta de quem esta com o dedo em cima dele.
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
      boards = await this.fonte.listarQuadros();
    } catch (err) {
      toast(`Nao foi possivel ler a pasta de quadros: ${String(err)}`, 'error');
    }

    // Ler o indice falhando NAO pode impedir o lobby de abrir. O `ler` do main
    // ja devolve indice vazio em qualquer erro; o `catch` aqui e a segunda
    // linha de defesa, para o caso de o proprio IPC nao responder.
    let indice = indiceVazio();
    try {
      indice = await this.fonte.lerPastas();
    } catch {
      // Sem agrupamento e melhor que sem lobby.
    }
    this.#ultimo = reconciliar(indice, boards);
    this.#desenhar();
  }

  /**
   * Desenha a tela de onde se esta -- a principal ou a de dentro de uma pasta
   * -- a partir do ultimo resultado do disco.
   *
   * A PROMESSA do `shared/pastas.ts` continua valendo aqui, e e ela que decide
   * o que vai onde: todo quadro que o disco tem aparece em exatamente UM
   * lugar -- solto na tela principal, ou dentro da pasta que o cita. Tirar os
   * quadros de uma pasta da tela principal so e aceitavel porque o card da
   * pasta esta ali, levando a eles.
   */
  #desenhar(): void {
    const { pastas, soltos } = this.#ultimo;

    // A pasta aberta pode ter deixado de existir -- excluida, ou o indice se
    // perdeu. Volta para a tela principal em vez de mostrar uma pasta fantasma.
    const aberta =
      this.#pastaAberta === null ? null : (pastas.find((p) => p.id === this.#pastaAberta) ?? null);
    if (aberta === null) this.#pastaAberta = null;

    this.#trilha.hidden = aberta === null;
    this.#trilhaNome.textContent = aberta ? nomeDeExibicao(aberta) : '';
    // Pasta dentro de pasta nao existe no indice; o botao sairia prometendo.
    this.#novaPastaBtn.hidden = aberta !== null;
    this.#vazioPasta.hidden = aberta === null || aberta.quadros.length > 0;

    this.#grid.replaceChildren();
    if (aberta) {
      for (const b of aberta.quadros) this.#grid.append(this.#card(b));
    } else {
      // Pastas primeiro, como no Explorador: sao poucas, e sao o caminho para
      // o que nao esta a vista.
      for (const p of pastas) this.#grid.append(this.#cardPasta(p));
      for (const b of soltos) this.#grid.append(this.#card(b));
    }
    this.#syncSearchState();
  }

  #entrarNaPasta(id: string): void {
    this.#rolagemAntes = this.#rolagem.scrollTop;
    this.#pastaAberta = id;
    this.#desenhar();
    this.#rolagem.scrollTop = 0;
    // O foco vai para o caminho de volta: quem entrou pelo teclado tem de
    // saber como sair sem procurar.
    this.#trilha.querySelector<HTMLElement>('.qb-lobby__trilha-voltar')?.focus();
  }

  #sairDaPasta(): void {
    const de = this.#pastaAberta;
    this.#pastaAberta = null;
    this.#desenhar();
    this.#rolagem.scrollTop = this.#rolagemAntes;
    // E volta para o card de onde saiu, e nao para o topo da lista.
    if (de !== null) this.#focarPasta(de);
  }

  #focarPasta(id: string): void {
    for (const el of this.#grid.querySelectorAll<HTMLElement>('.qb-card--pasta')) {
      if (el.dataset['pastaId'] === id) {
        el.focus();
        return;
      }
    }
  }

  // ------------------------------------------------------- mudar o indice

  /**
   * Toda mudanca no indice passa por aqui: le o do DISCO, aplica, grava,
   * redesenha.
   *
   * Le de novo, em vez de partir do que esta na tela, porque a tela pode estar
   * velha -- e gravar a partir dela desfaria qualquer mudanca feita depois do
   * ultimo `refresh()`.
   *
   * Um risco fica ASSUMIDO: se a leitura falhar de um jeito passageiro (arquivo
   * preso por antivirus ou sincronizacao), o main devolve indice vazio, e a
   * gravacao seguinte parte do vazio -- desfazendo o agrupamento. Nenhum quadro
   * some com isso, que e o que o desenho inteiro garante.
   */
  async #mudarIndice(mudar: (indice: IndicePastas) => IndicePastas): Promise<boolean> {
    try {
      const atual = await this.fonte.lerPastas();
      await this.fonte.gravarPastas(mudar(atual));
    } catch (err) {
      toast(`Não foi possível salvar as pastas: ${String(err)}`, 'error');
      return false;
    }
    await this.refresh();
    return true;
  }

  async #novaPasta(): Promise<void> {
    const nome = await promptText({
      title: 'Nova pasta',
      label: 'Nome da pasta',
      value: nomeLivre(
        this.#ultimo.pastas.map((p) => p.nome),
        'Nova pasta',
      ),
      confirmLabel: 'Criar',
    });
    if (nome === null) return;
    const id = createId();
    if (await this.#mudarIndice((i) => criarPasta(i, id, nome))) this.#focarPasta(id);
  }

  async #renomearPasta(pasta: PastaResolvida): Promise<void> {
    const nome = await promptText({
      title: 'Renomear pasta',
      label: 'Nome da pasta',
      value: pasta.nome,
      confirmLabel: 'Renomear',
    });
    if (nome === null || nome === pasta.nome) return;
    if (await this.#mudarIndice((i) => renomearPasta(i, pasta.id, nome))) {
      this.#focarPasta(pasta.id);
    }
  }

  /**
   * Excluir a pasta NUNCA exclui quadro -- ver `excluirPasta`. Por isso o
   * dialogo nao e vermelho: o que se perde e o agrupamento, e os quadros voltam
   * para a tela principal.
   *
   * Pasta vazia sai sem perguntar. Nao ha nada a desfazer, e perguntar o
   * obvio ensina a clicar "Excluir" sem ler.
   */
  async #excluirPasta(pasta: PastaResolvida): Promise<void> {
    const n = pasta.quadros.length;
    if (n > 0) {
      const ok = await confirmDialog({
        title: 'Excluir pasta',
        message:
          `A pasta "${nomeDeExibicao(pasta)}" será desfeita, e ` +
          (n === 1 ? 'o quadro dentro dela volta' : `os ${n} quadros dentro dela voltam`) +
          ' para a tela principal. Nenhum quadro é apagado.',
        confirmLabel: 'Excluir pasta',
      });
      if (!ok) return;
    }
    if (await this.#mudarIndice((i) => excluirPasta(i, pasta.id))) {
      toast(`Pasta "${nomeDeExibicao(pasta)}" excluída.`);
    }
  }

  #cardPasta(pasta: PastaResolvida): HTMLElement {
    const nome = nomeDeExibicao(pasta);
    const n = pasta.quadros.length;
    const contagem =
      n === 0 ? 'Vazia' : n === 1 ? '1 quadro' : `${n.toLocaleString('pt-BR')} quadros`;

    // E um `.qb-card` com modificador, e NAO uma classe nova. A classe e o que
    // poe o card nas listas centralizadas do `base.css` -- e desde a Parte 2 a
    // lista dele e a da TINTA, nao a do vidro: a lamina e o painel. Uma classe
    // nova nasceria fora das duas, e teria de ser lembrada em cada uma.
    const card = document.createElement('article');
    card.className = 'qb-card qb-card--pasta';
    card.tabIndex = 0;
    card.dataset['pastaId'] = pasta.id;
    card.setAttribute('aria-label', `Pasta ${nome}, ${contagem.toLowerCase()}`);

    // A miniatura da pasta e um MOSAICO das miniaturas de dentro, ate quatro.
    // E o que deixa reconhecer a pasta pelo conteudo, que e como se reconhece
    // um quadro nesta tela.
    const thumb = document.createElement('div');
    thumb.className = 'qb-card__thumb qb-card__thumb--pasta';
    const amostra = pasta.quadros.slice(0, 4);
    thumb.dataset['n'] = String(amostra.length);
    if (amostra.length === 0) thumb.append(icon('pasta', 44));
    for (const b of amostra) {
      const celula = document.createElement('div');
      celula.className = 'qb-card__mosaico';
      if (b.preview) {
        const img = document.createElement('img');
        img.src = b.preview;
        img.alt = '';
        img.loading = 'lazy';
        // A pasta nao e arrastavel, e a miniatura dela tambem nao: sem isto,
        // puxar pelo mosaico levantaria o arrastar NATIVO de imagem.
        img.draggable = false;
        celula.append(img);
      }
      thumb.append(celula);
    }

    const body = document.createElement('div');
    body.className = 'qb-card__body';
    const titulo = document.createElement('h2');
    titulo.className = 'qb-card__name';
    titulo.title = nome;
    // O nome num `span` proprio: as reticencias do nome longo so funcionam num
    // elemento, e nao num pedaco de texto solto ao lado do icone.
    const texto = document.createElement('span');
    texto.className = 'qb-card__name-texto';
    texto.textContent = nome;
    titulo.append(icon('pasta', 14), texto);
    const meta = document.createElement('p');
    meta.className = 'qb-card__meta';
    meta.textContent = contagem;
    body.append(titulo, meta);

    const renomear = document.createElement('button');
    renomear.type = 'button';
    renomear.className = 'qb-card__renomear';
    renomear.append(icon('lapis', 13));
    renomear.title = 'Renomear esta pasta (F2)';
    renomear.setAttribute('aria-label', 'Renomear esta pasta');
    renomear.addEventListener('click', (e) => {
      e.stopPropagation();
      void this.#renomearPasta(pasta);
    });

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'qb-card__delete';
    del.append(icon('fechar', 13));
    del.title = 'Excluir esta pasta (os quadros continuam)';
    del.setAttribute('aria-label', 'Excluir esta pasta');
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      void this.#excluirPasta(pasta);
    });

    card.append(thumb, body, renomear, del);
    card.addEventListener('click', () => this.#entrarNaPasta(pasta.id));
    card.addEventListener('keydown', (e) => {
      // So o card em si: Enter num dos botoes de dentro e daquele botao.
      if (e.target !== card) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.#entrarNaPasta(pasta.id);
      } else if (e.key === 'F2') {
        e.preventDefault();
        void this.#renomearPasta(pasta);
      }
    });
    return card;
  }

  #card(summary: BoardSummary): HTMLElement {
    const card = document.createElement('article');
    card.className = 'qb-card';
    card.tabIndex = 0;
    // O nome de ARQUIVO, que e o que o indice guarda. E por ele que um card
    // vira alvo de outro no arrastar.
    card.dataset['arquivo'] = nomeDeArquivoDe(summary);

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
    del.append(icon('fechar', 13));
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
        await this.#esquecerNoIndice(summary);
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
    tornarArrastavel<Alvo>(card, {
      rolagem: this.#rolagem,
      alvoEm: (el) => this.#alvoEm(el, card),
      soltar: (alvo) => void this.#soltar(summary, alvo),
    });

    return card;
  }

  // ------------------------------------------------------------- arrastar

  /**
   * O que esta sob o ponteiro, lido como alvo para o card `origem`.
   *
   * A regra de QUAL tela aceita O QUE mora aqui, num lugar so:
   *   - na principal: pasta (entrar nela) e outro quadro (criar pasta com os dois);
   *   - dentro de uma pasta: so "Todos os quadros", na trilha (tirar da pasta).
   *     Outro quadro ali NAO e alvo, porque a pasta que ele criaria estaria
   *     dentro desta.
   */
  #alvoEm(el: Element | null, origem: HTMLElement): AlvoDeArrasto<Alvo> | null {
    if (!el) return null;
    if (this.#pastaAberta !== null) {
      const voltar = el.closest<HTMLElement>('.qb-lobby__trilha-voltar');
      return voltar && this.#trilha.contains(voltar) ? { el: voltar, alvo: { tipo: 'fora' } } : null;
    }
    const card = el.closest<HTMLElement>('.qb-card');
    if (!card || card === origem || !this.#grid.contains(card)) return null;
    const pastaId = card.dataset['pastaId'];
    if (pastaId !== undefined) {
      const pasta = this.#ultimo.pastas.find((p) => p.id === pastaId);
      return pasta ? { el: card, alvo: { tipo: 'pasta', id: pasta.id, nome: nomeDeExibicao(pasta) } } : null;
    }
    const arquivo = card.dataset['arquivo'];
    return arquivo ? { el: card, alvo: { tipo: 'quadro', arquivo } } : null;
  }

  /**
   * O que soltar significa. Tudo passa por `#mudarIndice`: le o indice do
   * disco, aplica, grava, redesenha -- o mesmo caminho do botao "Nova pasta".
   *
   * O aviso em texto e provisorio e de proposito: sem animacao (Parte 5), o
   * card simplesmente some da grade ao entrar numa pasta, e sem uma linha
   * dizendo para onde ele foi isso parece um quadro sumindo.
   */
  async #soltar(origem: BoardSummary, alvo: Alvo): Promise<void> {
    const arquivo = nomeDeArquivoDe(origem);

    if (alvo.tipo === 'pasta') {
      if (await this.#mudarIndice((i) => moverParaPasta(i, arquivo, alvo.id))) {
        toast(`"${origem.name}" foi para a pasta "${alvo.nome}".`);
      }
      return;
    }

    if (alvo.tipo === 'fora') {
      if (await this.#mudarIndice((i) => tirarDeTodas(i, arquivo))) {
        toast(`"${origem.name}" voltou para a tela principal.`);
      }
      return;
    }

    // Quadro sobre quadro: uma pasta nova com os dois, e o nome e perguntado
    // -- decisao de produto. Cancelar nao muda nada, e e por isso que a pergunta vem
    // ANTES de qualquer gravacao.
    const nome = await promptText({
      title: 'Nova pasta',
      label: 'Nome da pasta com os dois quadros',
      value: nomeLivre(
        this.#ultimo.pastas.map((p) => p.nome),
        'Nova pasta',
      ),
      confirmLabel: 'Criar',
    });
    if (nome === null) return;
    const id = createId();
    // O que estava parado vem primeiro: ele ja estava ali, o outro chegou.
    if (await this.#mudarIndice((i) => criarPastaCom(i, id, nome, [alvo.arquivo, arquivo]))) {
      this.#focarPasta(id);
    }
  }

  /**
   * Tira do indice um quadro que acabou de ser excluido.
   *
   * A reconciliacao ja o esconderia sozinha -- quadro citado que nao esta no
   * disco nao aparece. O motivo de limpar e outro: um quadro NOVO criado depois
   * com o mesmo nome de arquivo nasceria dentro da pasta do antigo, sem que
   * ninguem o tivesse posto la.
   *
   * Falhar aqui nao e erro para o usuario: o quadro ja foi excluido, e o pior
   * desfecho e o caso raro acima.
   */
  async #esquecerNoIndice(summary: BoardSummary): Promise<void> {
    const arquivo = nomeDeArquivoDe(summary).toLowerCase();
    try {
      const indice = await this.fonte.lerPastas();
      const citado = indice.pastas.some((p) => p.quadros.some((q) => q.toLowerCase() === arquivo));
      if (citado) await this.fonte.gravarPastas(tirarDeTodas(indice, arquivo));
    } catch {
      // Ver acima.
    }
  }
}

/**
 * O nome que a pasta mostra. O indice aceita nome vazio (um campo do tipo
 * errado vira '' na leitura), e um card sem titulo nenhum nao se distingue.
 */
function nomeDeExibicao(pasta: PastaResolvida): string {
  return pasta.nome === '' ? 'Pasta sem nome' : pasta.nome;
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
