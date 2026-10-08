import { MAX_ZOOM, MIN_ZOOM } from '../core/Camera';
import { icon, type IconName } from './icons';
import { formatarData, t } from '@shared/i18n';

export interface ViewportBarActions {
  zoomIn(): void;
  zoomOut(): void;
  zoomTo(zoom: number): void;
  fitToContent(): void;
  toggleGrid(): void;
  toggleRulers(): void;
  toggleLayers(): void;
  toggleTheme(): void;
  save(): void;
  exportBoard(): void;
  backToLobby(): void;
  showShortcuts(): void;
  undo(): void;
  redo(): void;
}

/**
 * A ESCALA QUE A BARRA MOSTRA (07/10/2026): de 1% a 100%, do zoom
 * minimo ao maximo do app. Por baixo o zoom continua indo de 1% a 6400% do
 * tamanho real; o que muda e o numero escrito. Ex.: 1% -> 1%, o tamanho real ->
 * 53%, 6400% -> 100%.
 *
 * Logaritmica, e nao linear: o zoom anda por fatores (cada + multiplica por
 * 1,25), e numa escala linear os primeiros 99 passos do mouse caberiam em
 * menos de 2% do numero.
 */
export function escalaDaBarra(zoom: number): number {
  return 1 + (99 * Math.log(zoom / MIN_ZOOM)) / Math.log(MAX_ZOOM / MIN_ZOOM);
}

/** O inverso de `escalaDaBarra`: o zoom de verdade de um numero da barra. */
export function zoomDaEscala(escala: number): number {
  return MIN_ZOOM * Math.pow(MAX_ZOOM / MIN_ZOOM, (escala - 1) / 99);
}

/** Os niveis do menu, na escala da barra: 100% e o zoom maximo. */
const NIVEIS = [1, 5, 25, 50, 100];

/**
 * Barra flutuante inferior do quadro.
 *
 * Desenhada como a barra de tarefas do Windows 11: **icone em vez de palavra**,
 * fundo translucido com desfoque, cantos arredondados e os controles separados
 * em grupos por assunto. A versao anterior escrevia tudo por extenso -- doze
 * rotulos lado a lado --, e a leitura de cada um custava mais que o desenho
 * correspondente.
 *
 * O unico texto que sobrou e o NIVEL DE ZOOM, porque ele e informacao e nao
 * rotulo de comando -- trocar "55%" por um icone esconderia justamente o que se
 * precisa ler. O nome do quadro tambem era escrito aqui e saiu em 20/09/2026:
 * ver o comentario na construcao.
 *
 * Desde 20/09/2026 ela hospeda TAMBEM a fila de ferramentas, que era uma
 * segunda barra flutuante. Ver `mountTools`.
 *
 * Cada botao carrega `data-action`, e e por ele que o auto-teste encontra os
 * botoes -- procurar pelo texto quebraria a cada mudanca de rotulo, e foi
 * exatamente o que aconteceu quando o `?` virou "comandos".
 */
export class ViewportBar {
  readonly el: HTMLElement;
  #zoomLabel: HTMLButtonElement;
  #plusBtn!: HTMLButtonElement;
  #menu: HTMLElement;
  #gridBtn: HTMLButtonElement;
  #rulerBtn: HTMLButtonElement;
  #layersBtn: HTMLButtonElement;
  #themeBtn: HTMLButtonElement;
  /** Lugar reservado da fila de ferramentas; ver `mountTools`. */
  #toolsSlot: HTMLElement;
  /** Leva o ponto de "alteracoes nao salvas"; ver o comentario na construcao. */
  #saveBtn: HTMLButtonElement;
  #undoBtn: HTMLButtonElement;
  #redoBtn: HTMLButtonElement;
  #savedTitle = '';
  #boardName = t('quadro.semNome');

  constructor(private readonly actions: ViewportBarActions) {
    this.el = document.createElement('div');
    this.el.className = 'qb-bar';

    // A marca chegou a ancorar esta barra a esquerda, e SAIU em 12/08/2026.
    //
    // O motivo e o mesmo do lobby: a barra de titulo da janela ja mostra o icone
    // do aplicativo, e repeti-lo aqui era a segunda copia na mesma tela. Dentro
    // da interface o icone nao se repete -- ele mora onde o sistema o poe, e na
    // tela de abertura.
    const backBtn = iconButton('voltar', 'voltar', t('barra.voltar'), () =>
      this.actions.backToLobby(),
    );

    /*
      O NOME DO QUADRO SAIU DA BARRA em 20/09/2026.

      Ele ocupava a maior largura da fila e, na esmagadora maioria do tempo,
      dizia "Quadro sem nome" -- um rotulo que nao informa nada gastando o espaco
      mais caro da interface. Com as ferramentas agora aqui dentro, esse espaco
      passou a fazer falta de verdade.

      O nome nao se perdeu: ele esta na BARRA DE TITULO da janela, que e onde o
      sistema operacional ja o mostra de graca.

      O que NAO podia se perder junto era o aviso de alteracoes nao salvas -- o
      pontinho que ficava ao lado do nome. Ele mudou de lugar para o botao de
      salvar, que e, alias, onde ele sempre deveria ter estado: o aviso e um
      chamado para uma acao, e agora ele mora em cima do botao que a executa.
    */
    this.#saveBtn = iconButton('salvar', 'salvar', t('barra.salvar'), () => this.actions.save());
    this.#saveBtn.classList.add('qb-bar__btn--primary');
    const saveBtn = this.#saveBtn;
    const exportBtn = iconButton('exportar', 'exportar', t('barra.exportar'), () =>
      this.actions.exportBoard(),
    );

    this.#undoBtn = iconButton('desfazer', 'desfazer', t('barra.desfazer'), () =>
      this.actions.undo(),
    );
    this.#redoBtn = iconButton('refazer', 'refazer', t('barra.refazer'), () =>
      this.actions.redo(),
    );
    this.setHistory(false, false);

    this.#gridBtn = iconButton('grade', 'grade', t('barra.grade'), () =>
      this.actions.toggleGrid(),
    );
    this.#rulerBtn = iconButton('regua', 'regua', t('barra.reguas'), () =>
      this.actions.toggleRulers(),
    );
    const fitBtn = iconButton('ajustar', 'ajustar', t('barra.ajustar'), () =>
      this.actions.fitToContent(),
    );
    // No grupo de "o que vejo", junto com grade, ima e regua: o painel de
    // camadas responde "o que esta no quadro", que e a mesma familia. Botao, e
    // nao so o atalho -- recurso sem botao e recurso que ninguem descobre, que
    // foi a licao do M1.
    this.#layersBtn = iconButton('camadas', 'camadas', t('barra.camadas'), () =>
      this.actions.toggleLayers(),
    );
    // Sol ou lua conforme o tema, e nao um circulo meio preenchido.
    //
    // O icone mostra PARA ONDE o clique leva -- de dia aparece a lua, de noite o
    // sol. E a leitura que um interruptor de uma tecla so pede: ele nao esta
    // relatando o estado atual, esta oferecendo o proximo.
    this.#themeBtn = iconButton('lua', 'tema', t('barra.alternarTema'), () =>
      this.actions.toggleTheme(),
    );
    const helpBtn = iconButton('comandos', 'comandos', t('barra.atalhos'), () =>
      this.actions.showShortcuts(),
    );

    const minus = iconButton('menos', 'zoom-menos', t('barra.zoomMenos'), () =>
      this.actions.zoomOut(),
    );
    const plus = iconButton('mais', 'zoom-mais', t('barra.zoomMais'), () =>
      this.actions.zoomIn(),
    );
    this.#plusBtn = plus;

    this.#zoomLabel = document.createElement('button');
    this.#zoomLabel.type = 'button';
    this.#zoomLabel.className = 'qb-bar__btn qb-bar__zoom';
    this.#zoomLabel.dataset['action'] = 'zoom';
    this.#zoomLabel.textContent = `${Math.round(escalaDaBarra(1))}%`;
    this.#zoomLabel.title = t('barra.niveisDeZoom');
    this.#zoomLabel.addEventListener('click', () => this.#toggleMenu());

    this.#menu = document.createElement('div');
    this.#menu.className = 'qb-bar__menu';
    this.#menu.hidden = true;
    for (const nivel of NIVEIS) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'qb-bar__menu-item';
      item.textContent = `${nivel}%`;
      item.addEventListener('click', () => {
        this.actions.zoomTo(zoomDaEscala(nivel));
        this.#menu.hidden = true;
      });
      this.#menu.append(item);
    }

    const zoomGroup = group(minus, this.#zoomLabel, plus, this.#menu);

    this.#toolsSlot = document.createElement('div');
    this.#toolsSlot.className = 'qb-bar__group qb-bar__tools';

    // Sair, salvar e exportar juntos na ponta esquerda: sao as tres coisas que
    // se faz com o ARQUIVO, e agora ocupam o espaco que o nome desperdicava.
    this.el.append(
      group(backBtn, saveBtn, exportBtn),
      divider(),
      this.#toolsSlot,
      divider(),
      group(this.#undoBtn, this.#redoBtn),
      divider(),
      group(this.#gridBtn, this.#rulerBtn, this.#layersBtn, fitBtn),
      divider(),
      group(this.#themeBtn, helpBtn),
      divider(),
      zoomGroup,
    );

    // Clique fora fecha o menu de presets.
    document.addEventListener('pointerdown', (e) => {
      if (!this.#menu.hidden && !this.el.contains(e.target as Node)) this.#menu.hidden = true;
    });
  }

  /**
   * Encaixa a fila de ferramentas DENTRO desta barra.
   *
   * Ate 20/09/2026 a fila era uma segunda barra flutuante, colada na borda
   * esquerda. Duas barras e uma escolha cara: elas competem pela mesma atencao,
   * cada uma traz o proprio fundo, a propria sombra e a propria borda, e o
   * quadro -- que e o assunto -- fica espremido entre as duas. Uma so.
   *
   * A fila entra por injecao e nao por construcao: quem monta os botoes continua
   * sendo o `ToolBar`, que sabe de ferramenta, cor e espessura. Esta barra so
   * cede o lugar. Sem isso, um dos dois teria de aprender o assunto do outro.
   */
  mountTools(tools: HTMLElement): void {
    // Logo depois do nome do quadro: o nome ancora a esquerda porque e titulo, e
    // as ferramentas vem em seguida por serem o que mais se clica.
    this.#toolsSlot.append(tools);
  }

  setZoom(zoom: number): void {
    this.#zoomLabel.textContent = `${Math.round(escalaDaBarra(zoom))}%`;
    // Apagado so no teto do app.
    this.#plusBtn.disabled = zoom >= MAX_ZOOM - 1e-9;
  }

  setGridEnabled(on: boolean): void {
    this.#gridBtn.classList.toggle('qb-bar__btn--active', on);
  }


  setRulers(on: boolean): void {
    this.#rulerBtn.classList.toggle('qb-bar__btn--active', on);
  }

  setLayers(on: boolean): void {
    this.#layersBtn.classList.toggle('qb-bar__btn--active', on);
  }

  /** Troca o glifo do interruptor de tema para o do PROXIMO tema. */
  setTheme(theme: 'light' | 'dark'): void {
    this.#themeBtn.replaceChildren(icon(theme === 'dark' ? 'sol' : 'lua'));
    this.#themeBtn.title = theme === 'dark' ? t('lobby.paraTemaClaro') : t('lobby.paraTemaEscuro');
    this.#themeBtn.setAttribute('aria-label', this.#themeBtn.title);
  }

  setHistory(canUndo: boolean, canRedo: boolean): void {
    this.#undoBtn.disabled = !canUndo;
    this.#redoBtn.disabled = !canRedo;
  }

  /**
   * Nome do quadro e estado de gravacao.
   *
   * O nome nao aparece mais aqui (ver a construcao) -- quem o mostra e a barra
   * de titulo da janela. O que sobrou para esta barra e o ESTADO: um ponto sobre
   * o botao de salvar quando ha alteracao pendente. A assinatura continua
   * recebendo o nome porque ele ainda serve de dica do botao, e e o que responde
   * "salvar o que?" sem obrigar ninguem a olhar para a moldura da janela.
   */
  setBoardName(name: string, dirty: boolean): void {
    this.#saveBtn.classList.toggle('qb-bar__btn--dirty', dirty);
    this.#saveBtn.title = dirty
      ? t('barra.salvarNomeSujo', name)
      : `${t('barra.salvarNome', name)}${this.#savedTitle ? ` — ${this.#savedTitle}` : ''}`;
    this.#saveBtn.setAttribute('aria-label', this.#saveBtn.title);
    this.#boardName = name;
  }

  /**
   * Marca o horario do ultimo salvamento automatico.
   *
   * Fica na dica do botao de salvar, e nao como aviso na tela: autosave que
   * anuncia a cada gravacao vira ruido -- o que importa e poder conferir quando
   * quiser.
   */
  setAutosaved(at: Date): void {
    const hora = formatarData(at.getTime(), { hour: '2-digit', minute: '2-digit' });
    this.#savedTitle = t('barra.salvoAutomatico', hora);
    if (!this.#saveBtn.classList.contains('qb-bar__btn--dirty')) {
      this.setBoardName(this.#boardName, false);
    }
  }

  #toggleMenu(): void {
    this.#menu.hidden = !this.#menu.hidden;
  }
}

function iconButton(
  name: IconName,
  action: string,
  title: string,
  onClick: () => void,
): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'qb-bar__btn qb-bar__btn--icon';
  b.dataset['action'] = action;
  // Sem texto visivel, o nome do botao vive aqui -- e e isto que um leitor de
  // tela anuncia e o que o auto-teste procura.
  b.title = title;
  b.setAttribute('aria-label', title);
  b.append(icon(name));
  b.addEventListener('click', onClick);
  return b;
}

function group(...children: Array<Node>): HTMLElement {
  const g = document.createElement('div');
  g.className = 'qb-bar__group';
  g.append(...children);
  return g;
}

function divider(): HTMLElement {
  const d = document.createElement('span');
  d.className = 'qb-bar__divider';
  return d;
}
