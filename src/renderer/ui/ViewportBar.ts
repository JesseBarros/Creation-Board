import { icon, type IconName } from './icons';

export interface ViewportBarActions {
  zoomIn(): void;
  zoomOut(): void;
  zoomTo(zoom: number): void;
  fitToContent(): void;
  toggleGrid(): void;
  toggleSnap(): void;
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

const PRESETS = [0.01, 0.05, 0.25, 0.5, 1, 2, 4, 8, 16, 64];

/**
 * Barra flutuante inferior do quadro.
 *
 * Desenhada como a barra de tarefas do Windows 11: **icone em vez de palavra**,
 * fundo translucido com desfoque, cantos arredondados e os controles separados
 * em grupos por assunto. A versao anterior escrevia tudo por extenso -- doze
 * rotulos lado a lado --, e a leitura de cada um custava mais que o desenho
 * correspondente.
 *
 * O que continua escrito e o que E informacao, e nao rotulo de comando: o nome
 * do quadro (com o ponto de alteracoes nao salvas) e o nivel de zoom. Trocar
 * esses dois por icone esconderia justamente o que se precisa ler.
 *
 * Cada botao carrega `data-action`, e e por ele que o auto-teste encontra os
 * botoes -- procurar pelo texto quebraria a cada mudanca de rotulo, e foi
 * exatamente o que aconteceu quando o `?` virou "comandos".
 */
export class ViewportBar {
  readonly el: HTMLElement;
  #zoomLabel: HTMLButtonElement;
  #menu: HTMLElement;
  #gridBtn: HTMLButtonElement;
  #snapBtn: HTMLButtonElement;
  #rulerBtn: HTMLButtonElement;
  #layersBtn: HTMLButtonElement;
  #themeBtn: HTMLButtonElement;
  #nameLabel: HTMLElement;
  #undoBtn: HTMLButtonElement;
  #redoBtn: HTMLButtonElement;
  #savedTitle = '';

  constructor(private readonly actions: ViewportBarActions) {
    this.el = document.createElement('div');
    this.el.className = 'qb-bar';

    // A marca chegou a ancorar esta barra a esquerda, e SAIU em 12/08/2026.
    //
    // O motivo e o mesmo do lobby: a barra de titulo da janela ja mostra o icone
    // do aplicativo, e repeti-lo aqui era a segunda copia na mesma tela. Dentro
    // da interface o icone nao se repete -- ele mora onde o sistema o poe, e na
    // tela de abertura.
    const backBtn = iconButton('voltar', 'voltar', 'Voltar aos quadros (Ctrl+O)', () =>
      this.actions.backToLobby(),
    );

    this.#nameLabel = document.createElement('span');
    this.#nameLabel.className = 'qb-bar__name';
    this.#nameLabel.textContent = 'Quadro sem nome';

    const saveBtn = iconButton('salvar', 'salvar', 'Salvar (Ctrl+S)', () => this.actions.save());
    saveBtn.classList.add('qb-bar__btn--primary');
    const exportBtn = iconButton('exportar', 'exportar', 'Exportar PNG, SVG ou PDF (Ctrl+E)', () =>
      this.actions.exportBoard(),
    );

    this.#undoBtn = iconButton('desfazer', 'desfazer', 'Desfazer (Ctrl+Z)', () =>
      this.actions.undo(),
    );
    this.#redoBtn = iconButton('refazer', 'refazer', 'Refazer (Ctrl+Shift+Z)', () =>
      this.actions.redo(),
    );
    this.setHistory(false, false);

    this.#gridBtn = iconButton('grade', 'grade', 'Grade de fundo (G)', () =>
      this.actions.toggleGrid(),
    );
    this.#snapBtn = iconButton('ima', 'ima', 'Grade magnetica: encaixar na grade (A)', () =>
      this.actions.toggleSnap(),
    );
    this.#rulerBtn = iconButton('regua', 'regua', 'Reguas nas bordas (R)', () =>
      this.actions.toggleRulers(),
    );
    const fitBtn = iconButton('ajustar', 'ajustar', 'Ajustar a tela (Ctrl+1)', () =>
      this.actions.fitToContent(),
    );
    // No grupo de "o que vejo", junto com grade, ima e regua: o painel de
    // camadas responde "o que esta no quadro", que e a mesma familia. Botao, e
    // nao so o atalho -- recurso sem botao e recurso que ninguem descobre, que
    // foi a licao do M1.
    this.#layersBtn = iconButton('camadas', 'camadas', 'Painel de camadas (C)', () =>
      this.actions.toggleLayers(),
    );
    // Sol ou lua conforme o tema, e nao um circulo meio preenchido.
    //
    // O icone mostra PARA ONDE o clique leva -- de dia aparece a lua, de noite o
    // sol. E a leitura que um interruptor de uma tecla so pede: ele nao esta
    // relatando o estado atual, esta oferecendo o proximo.
    this.#themeBtn = iconButton('lua', 'tema', 'Alternar tema claro/escuro', () =>
      this.actions.toggleTheme(),
    );
    const helpBtn = iconButton('comandos', 'comandos', 'Atalhos e comandos (F1)', () =>
      this.actions.showShortcuts(),
    );

    const minus = iconButton('menos', 'zoom-menos', 'Diminuir zoom (Ctrl+-)', () =>
      this.actions.zoomOut(),
    );
    const plus = iconButton('mais', 'zoom-mais', 'Aumentar zoom (Ctrl++)', () =>
      this.actions.zoomIn(),
    );

    this.#zoomLabel = document.createElement('button');
    this.#zoomLabel.type = 'button';
    this.#zoomLabel.className = 'qb-bar__btn qb-bar__zoom';
    this.#zoomLabel.dataset['action'] = 'zoom';
    this.#zoomLabel.textContent = '100%';
    this.#zoomLabel.title = 'Niveis de zoom';
    this.#zoomLabel.addEventListener('click', () => this.#toggleMenu());

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

    const zoomGroup = group(minus, this.#zoomLabel, plus, this.#menu);

    this.el.append(
      group(backBtn, this.#nameLabel),
      divider(),
      group(saveBtn, exportBtn),
      divider(),
      group(this.#undoBtn, this.#redoBtn),
      divider(),
      group(this.#gridBtn, this.#snapBtn, this.#rulerBtn, this.#layersBtn, fitBtn),
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

  setLayers(on: boolean): void {
    this.#layersBtn.classList.toggle('qb-bar__btn--active', on);
  }

  /** Troca o glifo do interruptor de tema para o do PROXIMO tema. */
  setTheme(theme: 'light' | 'dark'): void {
    this.#themeBtn.replaceChildren(icon(theme === 'dark' ? 'sol' : 'lua'));
    this.#themeBtn.title = theme === 'dark' ? 'Mudar para o tema claro' : 'Mudar para o tema escuro';
    this.#themeBtn.setAttribute('aria-label', this.#themeBtn.title);
  }

  setHistory(canUndo: boolean, canRedo: boolean): void {
    this.#undoBtn.disabled = !canUndo;
    this.#redoBtn.disabled = !canRedo;
  }

  /** O ponto antes do nome sinaliza alteracoes ainda nao gravadas. */
  setBoardName(name: string, dirty: boolean): void {
    this.#nameLabel.textContent = dirty ? `• ${name}` : name;
    this.#nameLabel.classList.toggle('qb-bar__name--dirty', dirty);
    this.#nameLabel.title = dirty ? 'Alteracoes nao salvas' : this.#savedTitle || name;
  }

  /**
   * Marca o horario do ultimo salvamento automatico.
   *
   * Fica na dica do nome, e nao como aviso na tela: autosave que anuncia a cada
   * gravacao vira ruido -- o que importa e poder conferir quando quiser.
   */
  setAutosaved(at: Date): void {
    const hora = at.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    this.#savedTitle = `Salvo automaticamente as ${hora}`;
    if (!this.#nameLabel.classList.contains('qb-bar__name--dirty')) {
      this.#nameLabel.title = this.#savedTitle;
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
