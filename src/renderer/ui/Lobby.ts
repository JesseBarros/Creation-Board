import type { BoardSummary } from '@shared/wbd';
import { formatDate } from '../features/storage/boardIO';
import { formatarBytes, t } from '@shared/i18n';
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
import { PainelDoMenu } from './PainelDoMenu';
import { animar, CURVA_MOLA, CURVA_SUGAR, DURACAO, movimentoLigado, movimentoMaximo, pulsar } from './movimento';

/**
 * Onde um quadro arrastado pode cair: numa pasta (inclusive a janela da pasta
 * aberta), sobre outro quadro, ou "fora" -- da janela para a tela principal.
 * Quem decide qual vale em cada lugar e `Lobby.#alvoEm`.
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
  #folderLabel: HTMLButtonElement;
  /** O texto do caminho, dentro da pilula -- o icone e irmao dele. */
  #folderTexto: HTMLElement;
  #themeBtn!: HTMLButtonElement;
  #novaPastaBtn: HTMLButtonElement;
  #search: LibrarySearch;
  /** O F3 do menu. Mora no palco, acima da janela de pasta. */
  #desempenho: PainelDoMenu;

  // ---- pastas
  /** A janela da pasta aberta. Mora no PALCO, fora da rolagem -- ver o construtor. */
  #janela: HTMLElement;
  #janelaNome: HTMLElement;
  #janelaContagem: HTMLElement;
  #janelaCorpo: HTMLElement;
  #janelaGrade: HTMLElement;
  #janelaFechar: HTMLButtonElement;
  #vazioPasta: HTMLElement;
  /**
   * A pasta aberta, por ID. Sobrevive ao `refresh()` e a ida ao quadro: quem
   * abre um quadro de dentro de uma pasta volta com ela aberta.
   */
  #pastaAberta: string | null = null;
  /** O ultimo resultado do disco. Entrar e sair de pasta desenha daqui, sem reler. */
  #ultimo: Reconciliado = { pastas: [], soltos: [] };
  /**
   * Os cards desenhados da ultima vez, por chave. E o que decide o que ENTRA
   * animado: so o que nao estava na tela antes. Ver `#entrarNovos`.
   */
  #naTela = new Set<string>();

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
    //
    // O TITULO E A ASSINATURA DA LOGO (30/09/2026), e nao texto de interface:
    // a mesma fonte da palavra na logo (Outfit, embutida) e "Board" no degrade
    // azul->ciano do traco dela. Escolha numa prancha de quatro variacoes
    // -- o relato era que a Segoe UI de antes [...].
    //
    // As DUAS palavras sao spans com o mesmo tratamento (ver `ui.css`), e isso e
    // o conserto de um defeito que se viu no tema claro: com "Creation" em
    // texto comum, o Windows a desenhava com suavizacao colorida (ClearType) e
    // "Board", em degrade, com suavizacao cinza -- duas palavras com cara de
    // fontes diferentes, lado a lado.
    //
    // Os quatro pontos coloridos da logo que ficavam ao lado SAIRAM no mesmo
    // dia. E continua sem o ICONE aqui (decisao acima).
    const titleBox = document.createElement('div');
    titleBox.className = 'qb-lobby__marca';
    const title = document.createElement('h1');
    title.className = 'qb-lobby__title';
    const base = document.createElement('span');
    base.className = 'qb-lobby__title-base';
    base.textContent = 'Creation';
    const destaque = document.createElement('span');
    destaque.className = 'qb-lobby__title-destaque';
    destaque.textContent = 'Board';
    title.append(base, ' ', destaque);

    // O caminho da pasta virou uma PILULA com icone. Antes era a linha
    // sublinhada em fonte de codigo, que se achou com "um destaque que nao e
    // interessante": parecia link, e competia com o titulo. Continua abrindo a
    // pasta no Explorador.
    this.#folderLabel = document.createElement('button');
    this.#folderLabel.type = 'button';
    this.#folderLabel.className = 'qb-lobby__folder';
    this.#folderLabel.title = t('lobby.abrirPastaNoExplorador');
    this.#folderTexto = document.createElement('span');
    this.#folderTexto.className = 'qb-lobby__folder-texto';
    this.#folderTexto.textContent = t('lobby.pastaDosQuadros');
    this.#folderLabel.append(icon('pasta', 13), this.#folderTexto);
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
    this.#themeBtn = iconOnlyButton('lua', t('lobby.alternarTema'), () => this.actions.toggleTheme());

    // Configuracoes entrou em 21/09/2026, depois de o botao de atalhos ter
    // SAIDO daqui ([...]). A
    // diferenca entre os dois: aquele so contava coisas, este MUDA coisas --
    // e uma preferencia do aplicativo precisa de um lugar onde ser encontrada.
    const configBtn = iconOnlyButton('ajustes', t('lobby.configuracoes'), () =>
      this.actions.openSettings(),
    );

    this.#novaPastaBtn = textButton(t('lobby.novaPasta'), () => void this.#novaPasta());
    this.#novaPastaBtn.prepend(icon('novaPasta', 15));

    const importBtn = textButton(t('lobby.importarArquivo'), () => this.actions.importBoards());
    importBtn.title = t('lobby.importarDica');
    const newBtn = textButton(t('lobby.novoQuadro'), () => this.actions.newBoard());
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
    emptyTitle.textContent = t('lobby.vazioTitulo');
    const emptyHint = document.createElement('p');
    emptyHint.className = 'qb-lobby__empty-hint';
    emptyHint.textContent = t('lobby.vazioDica');
    const emptyActions = document.createElement('div');
    emptyActions.className = 'qb-lobby__empty-actions';
    // No lobby vazio o rotulo diz de onde vem, porque ali ele e a explicacao do
    // que fazer primeiro -- e nao mais um botao numa fila.
    const importCta = textButton(t('lobby.vazioImportar'), () =>
      this.actions.importBoards(),
    );
    importCta.classList.add('qb-btn--primary');
    const demoBtn = textButton(t('lobby.vazioDemonstracao'), () => this.actions.openDemo());
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
    /*
      A PASTA ABRE NUMA JANELA MENOR, e a tela principal continua a vista.

      Ate 24/09/2026 abrir uma pasta TROCAVA a grade pelo conteudo dela, com
      uma trilha "Todos os quadros / Nome" para voltar. no teste e pediu o
      contrario: [...]. Trocando a tela, nao havia de onde
      trazer um quadro para a pasta nem para onde leva-lo ao tirar.

      A janela mora no PALCO (a raiz), e nao na rolagem: ela fica parada
      enquanto a lista principal corre por tras. E fica ENCAIXADA EMBAIXO, e nao
      no meio: no meio ela cobriria justamente a primeira fileira de cards,
      que e onde as pastas moram. Enquanto ela esta aberta, a rolagem ganha
      folga embaixo do tamanho dela (ver `.qb-lobby--pasta-aberta` no ui.css),
      entao nenhum card fica preso atras da janela.

      Ela e OPACA, sem desfoque, de proposito: o relato que a criou veio junto
      com [...], e empilhar um segundo `backdrop-filter`
      sobre o do painel seria apostar contra a medicao que ainda nao tinha
      saido.
    */
    this.#janela = document.createElement('section');
    this.#janela.className = 'qb-pasta-janela';
    this.#janela.hidden = true;
    this.#janela.setAttribute('role', 'region');

    const barra = document.createElement('div');
    barra.className = 'qb-pasta-janela__barra';
    this.#janelaNome = document.createElement('h2');
    this.#janelaNome.className = 'qb-pasta-janela__nome';
    this.#janelaContagem = document.createElement('span');
    this.#janelaContagem.className = 'qb-pasta-janela__contagem';
    const renomear = botaoDaJanela('lapis', t('pasta.renomearEsta'), () => {
      const aberta = this.#abertaResolvida();
      if (aberta) void this.#renomearPasta(aberta);
    });
    this.#janelaFechar = botaoDaJanela('fechar', t('pasta.fecharJanela'), () => this.#fecharPasta());
    barra.append(icon('pasta', 17), this.#janelaNome, this.#janelaContagem, renomear, this.#janelaFechar);

    // Pasta vazia e estado normal, e nao falha: ela acabou de ser criada, ou
    // alguem tirou tudo dela. A mensagem diz o que fazer, agora que da.
    this.#vazioPasta = document.createElement('p');
    this.#vazioPasta.className = 'qb-lobby__pasta-vazia';
    this.#vazioPasta.textContent = t('pasta.janelaVazia');
    this.#vazioPasta.hidden = true;

    this.#janelaGrade = document.createElement('div');
    this.#janelaGrade.className = 'qb-lobby__grid qb-pasta-janela__grade';
    this.#janelaCorpo = document.createElement('div');
    this.#janelaCorpo.className = 'qb-pasta-janela__corpo';
    this.#janelaCorpo.append(this.#vazioPasta, this.#janelaGrade);
    this.#janela.append(barra, this.#janelaCorpo);

    // Esc fecha a pasta de onde quer que o foco esteja no menu. Os modais e o
    // arrasto escutam na CAPTURA da janela e param o Escape antes dele chegar
    // aqui -- entao Esc num dialogo fecha o dialogo, e nao a pasta junto.
    this.el.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || this.#pastaAberta === null || this.#search.active) return;
      e.preventDefault();
      // Consumido: o mesmo Esc nao segue para os atalhos da janela.
      e.stopPropagation();
      this.#fecharPasta();
    });

    this.#painel = document.createElement('div');
    this.#painel.className = 'qb-lobby__painel';
    this.#painel.append(this.#empty, this.#grid);

    this.#rolagem = document.createElement('div');
    this.#rolagem.className = 'qb-lobby__rolagem';
    this.#rolagem.append(header, this.#search.el, this.#painel);
    this.#desempenho = new PainelDoMenu(() => this.el.querySelectorAll('.qb-card').length);
    this.el.append(this.#rolagem, this.#janela, this.#desempenho.el);
  }

  /** F3 no menu principal. */
  alternarDesempenho(): void {
    this.#desempenho.alternar();
  }

  pausarDesempenho(): void {
    this.#desempenho.pausar();
  }

  retomarDesempenho(): void {
    this.#desempenho.retomar();
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
    // A janela sai junto: ela e parte da grade, e nao da busca.
    this.#janela.hidden = buscando || this.#pastaAberta === null;
    this.el.classList.toggle('qb-lobby--pasta-aberta', !this.#janela.hidden);
    this.#empty.hidden = buscando || !this.#semNada();
  }

  /**
   * O lobby nao tem nada para mostrar: nem quadro, nem pasta.
   *
   * Contar os filhos da grade deixaria de servir no dia em que a grade
   * ganhasse qualquer filho que nao e card; perguntar ao ultimo resultado do
   * disco nao depende de como a tela foi montada.
   */
  #semNada(): boolean {
    const { pastas, soltos } = this.#ultimo;
    return pastas.length === 0 && soltos.length === 0;
  }

  /** Foco na busca da biblioteca. O `Ctrl+F` do lobby chama aqui. */
  focusSearch(): void {
    this.#search.focus();
  }

  setFolder(path: string): void {
    this.#folderTexto.textContent = path;
    // A pilula corta caminho longo com reticencias; o inteiro fica aqui.
    this.#folderLabel.title = t('lobby.abrirPastaNoExploradorCom', path);
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
    const label = theme === 'dark' ? t('lobby.paraTemaClaro') : t('lobby.paraTemaEscuro');
    this.#themeBtn.title = label;
    this.#themeBtn.setAttribute('aria-label', label);
  }

  /** Recarrega a lista a partir do disco. */
  async refresh(): Promise<void> {
    let boards: BoardSummary[] = [];
    try {
      boards = await this.fonte.listarQuadros();
    } catch (err) {
      toast(t('lobby.erroLerPasta', String(err)), 'error');
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
   * Desenha a tela principal e, se houver pasta aberta, a janela dela -- a
   * partir do ultimo resultado do disco.
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
    // perdeu. A janela fecha em vez de mostrar uma pasta fantasma.
    const aberta = this.#abertaResolvida();
    if (aberta === null) this.#pastaAberta = null;

    // Pastas primeiro, como no Explorador: sao poucas, e sao o caminho para o
    // que nao esta a vista.
    this.#grid.replaceChildren();
    for (const p of pastas) this.#grid.append(this.#cardPasta(p, p.id === aberta?.id));
    for (const b of soltos) this.#grid.append(this.#card(b, null));

    this.#janelaGrade.replaceChildren();
    if (aberta) {
      const nome = nomeDeExibicao(aberta);
      this.#janelaNome.textContent = nome;
      this.#janelaNome.title = nome;
      this.#janelaContagem.textContent = contagemDeQuadros(aberta.quadros.length);
      this.#janela.setAttribute('aria-label', t('pasta.rotuloDaJanela', nome));
      for (const b of aberta.quadros) this.#janelaGrade.append(this.#card(b, aberta));
      this.#vazioPasta.hidden = aberta.quadros.length > 0;
    }
    this.#syncSearchState();
    this.#entrarNovos();
  }

  /**
   * A ENTRADA DA LISTA: so o que e novo na tela entra animado.
   *
   * Todo gesto com pasta termina num `refresh()`, que refaz as duas grades do
   * zero. Animar tudo a cada refazer faria a tela inteira piscar a cada quadro
   * arrastado. Comparando com a ultima vez, entra so o que nao estava la: a
   * lista inteira na primeira abertura, a pasta recem-criada, o quadro que saiu
   * de uma pasta. Voltar de um quadro para o menu nao anima nada, e e o certo:
   * a tela e a mesma de antes.
   *
   * A chave separa as duas grades: o mesmo quadro saindo da janela para a
   * principal E novo onde chegou.
   */
  #entrarNovos(): void {
    const agora = new Set<string>();
    const novos: HTMLElement[] = [];
    const juntar = (grade: HTMLElement, onde: string): void => {
      for (const el of Array.from(grade.children) as HTMLElement[]) {
        const quem = el.dataset['pastaId'] !== undefined ? `pasta:${el.dataset['pastaId']}` : `quadro:${el.dataset['arquivo'] ?? ''}`;
        const chave = `${onde}|${quem}`;
        agora.add(chave);
        if (!this.#naTela.has(chave)) novos.push(el);
      }
    };
    juntar(this.#grid, 'principal');
    juntar(this.#janelaGrade, 'janela');
    this.#naTela = agora;

    // Escalonado, mas com teto: numa biblioteca de 40 quadros, o ultimo nao pode
    // entrar um segundo depois do primeiro. Depois do 12o, todos juntos.
    //
    // No nivel maximo a cascata e mais aberta e cada card SALTA para o lugar:
    // sobe de mais baixo, menor, e passa um pouco do tamanho antes de assentar.
    const maximo = movimentoMaximo();
    novos.forEach((el, i) => {
      void animar(
        el,
        maximo
          ? [
              { opacity: 0, transform: 'translateY(28px) scale(0.86)' },
              { opacity: 1, offset: 0.45 },
              { opacity: 1, transform: 'none' },
            ]
          : [
              { opacity: 0, transform: 'translateY(10px)' },
              { opacity: 1, transform: 'none' },
            ],
        maximo
          ? { duracao: DURACAO.longa, atraso: Math.min(i, 12) * 45, curva: CURVA_MOLA, preencher: 'backwards' }
          : { atraso: Math.min(i, 12) * 24, preencher: 'backwards' },
      );
    });
  }

  /**
   * A janela desce ao fechar -- numa COPIA.
   *
   * O estado fecha na hora: quem aperta Esc e em seguida arrasta um quadro nao
   * pode encontrar uma janela meio aberta aceitando alvo, e a janela de verdade
   * escondida e o que o resto do codigo (e o selftest) le. Quem desce e uma
   * copia inerte, sem os `data-*` que fazem de um card um alvo, e ela sai do DOM
   * no fim.
   */
  #despedirJanela(): void {
    if (!movimentoLigado() || this.#janela.hidden) return;
    const copia = this.#janela.cloneNode(true) as HTMLElement;
    copia.inert = true;
    copia.setAttribute('aria-hidden', 'true');
    copia.removeAttribute('role');
    copia.removeAttribute('aria-label');
    copia.style.pointerEvents = 'none';
    for (const el of copia.querySelectorAll('[data-arquivo], [data-pasta-id]')) {
      el.removeAttribute('data-arquivo');
      el.removeAttribute('data-pasta-id');
    }
    this.el.append(copia);
    const maximo = movimentoMaximo();
    void animar(
      copia,
      [
        { opacity: 1, transform: 'none' },
        { opacity: 0, transform: maximo ? 'translateY(70px) scale(0.94)' : 'translateY(24px)' },
      ],
      maximo
        ? { duracao: DURACAO.media, curva: CURVA_SUGAR, preencher: 'forwards' }
        : { duracao: DURACAO.curta, preencher: 'forwards' },
    ).then(() => copia.remove());
  }

  /** A pasta aberta, ja cruzada com o disco -- ou null. */
  #abertaResolvida(): PastaResolvida | null {
    if (this.#pastaAberta === null) return null;
    return this.#ultimo.pastas.find((p) => p.id === this.#pastaAberta) ?? null;
  }

  #abrirPasta(id: string): void {
    const trocou = this.#pastaAberta !== id;
    const estavaFechada = this.#janela.hidden;
    this.#pastaAberta = id;
    this.#desenhar();
    if (trocou) this.#janelaCorpo.scrollTop = 0;
    // Sobe de baixo, que e onde ela mora. Trocar de uma pasta para outra com a
    // janela ja aberta nao anima a janela -- so os cards de dentro entram.
    if (estavaFechada && !this.#janela.hidden) {
      if (movimentoMaximo()) {
        // Salta de baixo: sobe de mais longe, menor, passa do lugar e assenta.
        void animar(
          this.#janela,
          [
            { opacity: 0, transform: 'translateY(90px) scale(0.92)' },
            { opacity: 1, offset: 0.4 },
            { opacity: 1, transform: 'none' },
          ],
          { duracao: DURACAO.longa, curva: CURVA_MOLA },
        );
      } else {
        void animar(this.#janela, [
          { opacity: 0, transform: 'translateY(24px)' },
          { opacity: 1, transform: 'none' },
        ]);
      }
    }
    // O foco vai para o fechar: quem abriu pelo teclado tem de saber sair sem
    // procurar.
    this.#janelaFechar.focus();
  }

  #fecharPasta(): void {
    const de = this.#pastaAberta;
    this.#despedirJanela();
    this.#pastaAberta = null;
    this.#desenhar();
    // E volta para o card da pasta, e nao para o topo da lista.
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
      toast(t('lobby.erroSalvarPastas', String(err)), 'error');
      return false;
    }
    await this.refresh();
    return true;
  }

  async #novaPasta(): Promise<void> {
    const nome = await promptText({
      title: t('pasta.dialogoNovaTitulo'),
      label: t('pasta.dialogoNome'),
      value: nomeLivre(
        this.#ultimo.pastas.map((p) => p.nome),
        t('pasta.nomePadrao'),
      ),
      confirmLabel: t('comum.criar'),
    });
    if (nome === null) return;
    const id = createId();
    if (await this.#mudarIndice((i) => criarPasta(i, id, nome))) this.#focarPasta(id);
  }

  async #renomearPasta(pasta: PastaResolvida): Promise<void> {
    const nome = await promptText({
      title: t('pasta.dialogoRenomearTitulo'),
      label: t('pasta.dialogoNome'),
      value: pasta.nome,
      confirmLabel: t('comum.renomear'),
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
        title: t('pasta.dialogoExcluirTitulo'),
        message: t('pasta.dialogoExcluirMensagem', nomeDeExibicao(pasta), n),
        confirmLabel: t('pasta.dialogoExcluirTitulo'),
      });
      if (!ok) return;
    }
    if (await this.#mudarIndice((i) => excluirPasta(i, pasta.id))) {
      toast(t('pasta.excluida', nomeDeExibicao(pasta)));
    }
  }

  #cardPasta(pasta: PastaResolvida, aberta: boolean): HTMLElement {
    const nome = nomeDeExibicao(pasta);
    const contagem = contagemDeQuadros(pasta.quadros.length);

    // E um `.qb-card` com modificador, e NAO uma classe nova. A classe e o que
    // poe o card nas listas centralizadas do `base.css` -- e desde a Parte 2 a
    // lista dele e a da TINTA, nao a do vidro: a lamina e o painel. Uma classe
    // nova nasceria fora das duas, e teria de ser lembrada em cada uma.
    const card = document.createElement('article');
    card.className = aberta ? 'qb-card qb-card--pasta qb-card--aberta' : 'qb-card qb-card--pasta';
    card.tabIndex = 0;
    card.dataset['pastaId'] = pasta.id;
    card.setAttribute('aria-label', t('pasta.rotuloDoCard', nome, contagem));

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
    renomear.title = t('pasta.renomearEstaAtalho');
    renomear.setAttribute('aria-label', t('pasta.renomearEsta'));
    renomear.addEventListener('click', (e) => {
      e.stopPropagation();
      void this.#renomearPasta(pasta);
    });

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'qb-card__delete';
    del.append(icon('fechar', 13));
    del.title = t('pasta.excluirEstaDica');
    del.setAttribute('aria-label', t('pasta.excluirEsta'));
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      void this.#excluirPasta(pasta);
    });

    card.append(thumb, body, renomear, del);
    card.addEventListener('click', () => this.#abrirPasta(pasta.id));
    card.addEventListener('keydown', (e) => {
      // So o card em si: Enter num dos botoes de dentro e daquele botao.
      if (e.target !== card) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.#abrirPasta(pasta.id);
      } else if (e.key === 'F2') {
        e.preventDefault();
        void this.#renomearPasta(pasta);
      }
    });
    return card;
  }

  /**
   * O card de um quadro. `pasta` diz ONDE ele esta desenhado: na tela
   * principal (null) ou dentro da janela de uma pasta -- e isso muda o que o X
   * faz.
   */
  #card(summary: BoardSummary, pasta: PastaResolvida | null): HTMLElement {
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
      thumb.textContent = t('lobby.semMiniatura');
    }

    const body = document.createElement('div');
    body.className = 'qb-card__body';

    const name = document.createElement('h2');
    name.className = 'qb-card__name';
    name.textContent = summary.name;
    name.title = summary.name;

    const meta = document.createElement('p');
    meta.className = 'qb-card__meta';
    meta.textContent = t('lobby.metaDoCard', formatDate(summary.updatedAt), summary.objectCount, formatarBytes(summary.bytes));

    body.append(name, meta);

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'qb-card__delete';
    del.append(icon('fechar', 13));
    if (pasta) {
      /*
        DENTRO DA PASTA, O X SO TIRA DA PASTA. Pedido em 24/09/2026.

        O mesmo X que na tela principal apaga o arquivo, aqui desagrupa -- e
        por isso nao pergunta nada: nao ha o que perder. O quadro volta para a
        tela principal, e excluir de verdade continua sendo la.

        O hover tambem muda: vermelho e a cor de "isto apaga", e aqui nao apaga.
      */
      del.classList.add('qb-card__delete--tirar');
      del.title = t('pasta.tirarDestaDica');
      del.setAttribute('aria-label', t('pasta.tirarDesta'));
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        const arquivo = nomeDeArquivoDe(summary);
        void this.#mudarIndice((i) => tirarDeTodas(i, arquivo)).then((ok) => {
          if (ok) toast(t('pasta.quadroSaiuDe', summary.name, nomeDeExibicao(pasta)));
        });
      });
    } else {
      del.title = t('quadro.excluirEste');
      del.setAttribute('aria-label', t('quadro.excluirEste'));
      del.addEventListener('click', (e) => void this.#excluirQuadro(e, summary));
    }

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
   * A regra de QUAL lugar aceita O QUE mora aqui, num lugar so:
   *   - uma PASTA da tela principal: o quadro entra nela;
   *   - outro QUADRO da tela principal: pasta nova com os dois;
   *   - a JANELA da pasta aberta, vindo da tela principal: entra nessa pasta;
   *   - qualquer outro lugar do menu, vindo da JANELA: sai da pasta -- o
   *     [...] do Windows, que foi o pedido.
   * Dentro da propria janela nada e alvo: a pasta que um quadro criaria ali
   * estaria dentro desta, e pasta dentro de pasta nao existe no indice.
   */
  #alvoEm(el: Element | null, origem: HTMLElement): AlvoDeArrasto<Alvo> | null {
    if (!el || !this.el.contains(el)) return null;
    const daJanela = this.#janela.contains(origem);
    const sobreJanela = !this.#janela.hidden && this.#janela.contains(el);

    if (sobreJanela) {
      if (daJanela) return null;
      const aberta = this.#abertaResolvida();
      return aberta
        ? { el: this.#janela, alvo: { tipo: 'pasta', id: aberta.id, nome: nomeDeExibicao(aberta) } }
        : null;
    }

    const card = el.closest<HTMLElement>('.qb-card');
    if (card && card !== origem && this.#grid.contains(card)) {
      const pastaId = card.dataset['pastaId'];
      if (pastaId !== undefined) {
        // A pasta de onde o quadro veio nao e alvo: soltar nela nao mudaria
        // nada, e acender prometeria alguma coisa.
        if (daJanela && pastaId === this.#pastaAberta) return null;
        const pasta = this.#ultimo.pastas.find((p) => p.id === pastaId);
        return pasta
          ? { el: card, alvo: { tipo: 'pasta', id: pasta.id, nome: nomeDeExibicao(pasta) }, encolher: true }
          : null;
      }
      const arquivo = card.dataset['arquivo'];
      if (arquivo) return { el: card, alvo: { tipo: 'quadro', arquivo }, encolher: true };
    }

    // Da janela para o resto do menu: acende o painel inteiro, porque o alvo
    // e "a tela principal", e nao um lugar dela.
    if (daJanela) return { el: this.#painel, alvo: { tipo: 'fora' } };
    return null;
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
        toast(t('pasta.quadroFoiPara', origem.name, alvo.nome));
        this.#pulsarRecebedor(alvo.id);
      }
      return;
    }

    if (alvo.tipo === 'fora') {
      if (await this.#mudarIndice((i) => tirarDeTodas(i, arquivo))) {
        toast(t('pasta.quadroSaiu', origem.name));
      }
      return;
    }

    // Quadro sobre quadro: uma pasta nova com os dois, e o nome e perguntado
    // -- decisao de produto. Cancelar nao muda nada, e e por isso que a pergunta vem
    // ANTES de qualquer gravacao.
    const nome = await promptText({
      title: t('pasta.dialogoNovaTitulo'),
      label: t('pasta.dialogoNomeComDois'),
      value: nomeLivre(
        this.#ultimo.pastas.map((p) => p.nome),
        t('pasta.nomePadrao'),
      ),
      confirmLabel: t('comum.criar'),
    });
    if (nome === null) return;
    const id = createId();
    // O que estava parado vem primeiro: ele ja estava ali, o outro chegou.
    if (await this.#mudarIndice((i) => criarPastaCom(i, id, nome, [alvo.arquivo, arquivo]))) {
      this.#focarPasta(id);
    }
  }

  /**
   * O "recebi" do nivel maximo: quem recebeu o quadro incha e volta.
   *
   * Procurado DEPOIS da gravacao, e nao guardado do arrasto: o `refresh()`
   * refaz a grade, e o card de pasta que acendeu durante o arrasto ja nao e o
   * que esta na tela. O atraso casa com o fim do fantasma sendo sugado.
   */
  #pulsarRecebedor(pastaId: string): void {
    if (!movimentoMaximo()) return;
    if (!this.#janela.hidden && this.#pastaAberta === pastaId) {
      void pulsar(this.#janela, { atraso: 120, intensidade: 0.02 });
    }
    for (const el of this.#grid.querySelectorAll<HTMLElement>('.qb-card--pasta')) {
      if (el.dataset['pastaId'] === pastaId) void pulsar(el, { atraso: 180, intensidade: 0.1 });
    }
  }

  async #excluirQuadro(e: MouseEvent, summary: BoardSummary): Promise<void> {
    // Sem isso o clique borbulha para o card e abriria o quadro que acabou de
    // ser excluido.
    e.stopPropagation();
    const ok = await confirmDialog({
      title: t('quadro.dialogoExcluirTitulo'),
      message: t('quadro.dialogoExcluirMensagem', summary.name),
      confirmLabel: t('comum.excluir'),
      danger: true,
    });
    if (!ok) return;
    try {
      await window.quadro.board.remove(summary.path);
      // O quadro sumiu do disco; a busca da biblioteca nao pode continuar
      // oferecendo resultados que abririam um arquivo inexistente.
      invalidateLibraryIndex();
      await this.#esquecerNoIndice(summary);
      toast(t('quadro.excluido', summary.name));
      await this.refresh();
    } catch (err) {
      toast(t('quadro.erroExcluir', String(err)), 'error');
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
  return pasta.nome === '' ? t('pasta.semNome') : pasta.nome;
}

function contagemDeQuadros(n: number): string {
  return t('pasta.contagem', n);
}

/**
 * Botao da barra da janela de pasta. NAO e `.qb-btn`: dentro do lobby essa
 * classe ganha o vidro do cabecalho (`backdrop-filter`), e um desfoque sobre a
 * janela opaca custaria sem mostrar nada.
 */
function botaoDaJanela(nome: IconName, rotulo: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'qb-pasta-janela__botao';
  b.title = rotulo;
  b.setAttribute('aria-label', rotulo);
  b.append(icon(nome, 16));
  b.addEventListener('click', onClick);
  return b;
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
