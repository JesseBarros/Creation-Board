import type { NoteObject, ObjectId, RichSpan, TextObject } from '@shared/model/types';
import { computeBbox } from '@shared/model/bbox';
import { AddObjects, PatchObjects, RemoveObjects } from '../../commands';
import type { ObjectPatch } from '../../commands/patch';
import type { ToolContext } from '../../tools/types';
import {
  NOTE_FONT_FAMILY,
  NOTE_FONT_SIZE,
  NOTE_LINE_HEIGHT,
  NOTE_PAD,
  noteInset,
  noteStyle,
} from '../../render/painters/text';
import { contentHeight, layoutOf, styleOf } from '../../render/text/layout';
import { readableTextOn } from '../../render/colorAdapt';
import { domToSpans, isBlank, spansToDom } from './spans';

/** Objetos que se editam escrevendo. */
export type Editable = TextObject | NoteObject;

export interface EditorCallbacks {
  /** O objeto deixou de ser desenhado no canvas (ou voltou a ser). */
  onEditingChanged(id: ObjectId | null): void;
  /** Caixa nova confirmada com conteudo: quem chamou decide o que selecionar. */
  onCreated(obj: Editable): void;
}

/**
 * Edicao de texto sobre o canvas.
 *
 * A caixa editavel e um `contentEditable` posicionado por cima do quadro, e nao
 * um editor desenhado dentro do canvas. E a decisao de arquitetura da Fase 5:
 * cursor, selecao por arraste, acentuacao, IME, teclas de navegacao e area de
 * transferencia saem prontos do Chromium. Reimplementar isso no canvas seria
 * reescrever um motor de texto -- meses de trabalho para chegar, na melhor das
 * hipoteses, ao que o navegador ja faz.
 *
 * Enquanto a edicao esta aberta o objeto NAO e desenhado na camada estatica: o
 * `<div>` e que aparece no lugar dele. Sem isso o texto sairia duplicado, com o
 * desenho do canvas atras e o editavel na frente, meio pixel fora.
 *
 * Uma sessao de edicao inteira vira UM passo de undo, empurrado so no fim.
 */
export class TextEditor {
  readonly el: HTMLElement;

  #ctx: ToolContext;
  #callbacks: EditorCallbacks;
  #target: Editable | null = null;
  /** Caixa recem-criada: ainda nao esta no documento. */
  #isNew = false;
  #disposers: Array<() => void> = [];
  /**
   * A ultima selecao feita DENTRO da caixa. Clicar no "+" da paleta (o seletor
   * de cor do Windows) tira a selecao daqui, e e a esta que a cor escolhida
   * tem de voltar.
   */
  #intervalo: Range | null = null;
  /**
   * O seletor de cor do Windows esta aberto por cima da caixa: o `blur` da
   * janela que ele causa NAO e [...], e nao pode fechar a edicao.
   */
  #seletorAberto = false;

  constructor(host: HTMLElement, ctx: ToolContext, callbacks: EditorCallbacks) {
    this.#ctx = ctx;
    this.#callbacks = callbacks;

    this.el = document.createElement('div');
    this.el.className = 'qb-text-edit';
    this.el.contentEditable = 'true';
    this.el.spellcheck = false;
    this.el.hidden = true;
    host.append(this.el);

    this.#bind();
  }

  get isEditing(): boolean {
    return this.#target !== null;
  }

  /** Id do objeto em edicao, para o renderer pular o desenho dele. */
  get editingId(): ObjectId | null {
    return this.#target && !this.#isNew ? this.#target.id : null;
  }

  /**
   * Abre a edicao.
   *
   * Uma caixa nova (`isNew`) chega aqui SEM estar no documento: enquanto se
   * digita ela e so o `<div>`. Assim uma caixa abandonada em branco nao precisa
   * ser removida nem deixa rastro no historico -- ela nunca existiu.
   */
  begin(obj: Editable, { isNew = false, selectAll = false } = {}): void {
    if (this.#target) this.commit();

    this.#target = obj;
    this.#isNew = isNew;

    spansToDom(obj.content, this.el);
    this.#applyStyle(obj);
    this.el.hidden = false;
    this.sync();

    this.el.focus({ preventScroll: true });
    placeCaret(this.el, selectAll ? 'all' : 'end');

    this.#callbacks.onEditingChanged(this.editingId);
    this.#ctx.invalidate();
  }

  /**
   * Reposiciona o editor sobre o objeto. Chamado a cada frame enquanto a edicao
   * esta aberta: pan, zoom e redimensionamento da janela mexem na posicao, e
   * qualquer um deles deixaria a caixa flutuando fora do lugar.
   */
  sync(): void {
    const obj = this.#target;
    if (!obj) return;

    const { camera } = this.#ctx;
    const t = obj.transform;
    const origin = camera.worldToScreen({ x: t.x, y: t.y });
    const k = camera.zoom;
    const inset = obj.type === 'note' ? { x: noteInset(obj), y: NOTE_PAD } : { x: 0, y: 0 };

    // Uma transformacao so, na ordem em que o objeto e desenhado: leva a origem
    // para a tela, gira, escala e so entao aplica o recuo -- que e medido em
    // unidades do objeto, e nao em pixel de tela. Com isso tudo dentro do
    // `<div>` (largura, corpo da fonte) fica em unidades de MUNDO, iguais as que
    // o painter usa.
    this.el.style.transform =
      `translate(${origin.x}px, ${origin.y}px) rotate(${t.rotation}rad) ` +
      `scale(${k * t.scaleX}, ${k * t.scaleY}) translate(${inset.x}px, ${inset.y}px)`;
  }

  /**
   * Fecha a edicao gravando o resultado.
   *
   * Tres desfechos: caixa nova com texto vira um `AddObjects`; caixa existente
   * que ficou em branco e removida (uma caixa vazia e invisivel e inclicavel);
   * o caso comum vira um `EditText` com conteudo e altura.
   */
  commit(): void {
    const obj = this.#target;
    if (!obj) return;

    const content = domToSpans(this.el);
    // O estado e lido ANTES de fechar: `#close` zera `#isNew`, e consulta-lo
    // depois faria toda caixa nova ser gravada como edicao de uma caixa que nao
    // existe no documento -- um passo de undo que nao muda nada.
    const isNew = this.#isNew;
    this.#close();

    const blank = isBlank(content);
    const { history, doc } = this.#ctx;

    if (isNew) {
      if (blank) return; // caixa criada e abandonada: nunca existiu
      const created = { ...obj, content, h: this.#heightFor(obj, content) };
      created.bbox = computeBbox(created);
      history.push(new AddObjects(doc, [created], obj.type === 'note' ? 'Inserir post-it' : 'Inserir texto'));
      history.seal();
      this.#ctx.markDirty();
      this.#callbacks.onCreated(created);
      return;
    }

    if (blank && obj.type === 'text') {
      history.push(new RemoveObjects(doc, [obj.id]));
      history.seal();
      this.#ctx.markDirty();
      return;
    }

    if (sameContent(obj.content, content)) return;

    const after: ObjectPatch = { content, h: this.#heightFor(obj, content) };
    const before: ObjectPatch = { content: obj.content, h: obj.h };
    history.push(
      new PatchObjects(doc, new Map([[obj.id, before]]), new Map([[obj.id, after]]), 'Editar texto'),
    );
    history.seal();
    this.#ctx.markDirty();
  }

  /**
   * Reaplica o estilo do objeto ao editor aberto.
   *
   * Existe para mudancas que valem para a CAIXA e podem acontecer com ela
   * aberta -- alinhamento e o caso de hoje. Sem isto o texto continuaria
   * alinhado como estava ate a caixa fechar, e a pessoa veria o botao aceso e o
   * texto parado.
   *
   * Le o objeto do documento de novo: quem patchou foi o App, e a copia guardada
   * aqui e a de quando a edicao comecou.
   */
  refreshStyle(): void {
    const alvo = this.#target;
    if (!alvo || this.#isNew) return;
    const atual = this.#ctx.doc.get(alvo.id);
    if (!atual || (atual.type !== 'text' && atual.type !== 'note')) return;
    this.#target = atual;
    this.#applyStyle(atual);
  }

  /**
   * Corpo da fonte de uma caixa NOVA, que ainda nao existe no documento (a
   * barra de tamanho do menu de Texto, com a caixa recem-criada aberta). Ela
   * nasce desta copia no `commit`, entao basta trocar aqui. Devolve false se o
   * que esta aberto nao e um texto novo -- ai o App patcha o documento.
   */
  setNewFontSize(size: number): boolean {
    const alvo = this.#target;
    if (!alvo || !this.#isNew || alvo.type !== 'text') return false;
    this.#target = { ...alvo, fontSize: size };
    this.#applyStyle(this.#target);
    this.sync();
    return true;
  }

  /**
   * Devolve o foco a caixa aberta (depois da barra de tamanho do menu). O
   * Chromium restaura a selecao que ficou dentro dela; se nao ficou nenhuma, o
   * cursor vai para o fim, que e onde quem estava digitando parou.
   */
  retomarFoco(): void {
    if (!this.#target) return;
    this.#seletorAberto = false;
    this.el.focus({ preventScroll: true });
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && this.el.contains(sel.anchorNode)) return;
    // A selecao saiu da caixa (o clique no "+" da paleta a levou junto): volta
    // a ultima feita aqui dentro, e so sem ela o cursor vai para o fim.
    const salvo = this.#intervalo;
    if (sel && salvo && this.el.contains(salvo.startContainer) && this.el.contains(salvo.endContainer)) {
      sel.removeAllRanges();
      sel.addRange(salvo);
      return;
    }
    placeCaret(this.el, 'end');
  }

  /** O foco do teclado esta na caixa aberta? */
  get temFoco(): boolean {
    return this.#target !== null && this.el.contains(document.activeElement);
  }

  /**
   * Pinta o trecho SELECIONADO na caixa aberta (07/10/2026, pedido: [...];
   * com `Ctrl+A` dentro da caixa, muda o texto todo). Sem selecao, vale para as
   * proximas letras, como o negrito.
   *
   * Pelo `execCommand`, o mesmo caminho do `Ctrl+B`: o navegador ja sabe partir
   * um trecho no meio e juntar com o vizinho, e o `Ctrl+Z` de dentro da caixa
   * desfaz. Com `styleWithCSS` a cor sai em `style="color"`, que e o que o
   * `domToSpans` le -- sem ele viria um `<font color>`, que ele nao conhece.
   *
   * So caixa de TEXTO: o post-it tem a cor do texto presa ao papel.
   */
  aplicarCor(cor: string): boolean {
    if (!this.#target || this.#target.type !== 'text') return false;
    this.retomarFoco();
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand('foreColor', false, cor);
    document.execCommand('styleWithCSS', false, 'false');
    return true;
  }

  /** Fecha sem gravar. Usado ao trocar de quadro. */
  abort(): void {
    if (!this.#target) return;
    this.#close();
  }

  dispose(): void {
    for (const d of this.#disposers) d();
    this.#disposers = [];
  }

  // ------------------------------------------------------------------ interno

  #close(): void {
    this.#target = null;
    this.#isNew = false;
    this.#intervalo = null;
    this.#seletorAberto = false;
    this.el.hidden = true;
    this.el.replaceChildren();
    this.#callbacks.onEditingChanged(null);
    this.#ctx.invalidate();
  }

  /** Altura da caixa depois da edicao. O post-it tem tamanho proprio e nao cresce. */
  #heightFor(obj: Editable, content: readonly RichSpan[]): number {
    if (obj.type === 'note') return obj.h;
    if (!obj.autoHeight) return obj.h;
    return contentHeight(content, styleOf(obj));
  }

  #applyStyle(obj: Editable): void {
    const s = this.el.style;
    if (obj.type === 'note') {
      const style = noteStyle(obj);
      // O mesmo elemento serve aos dois tipos: o recuo de lista do texto tem de
      // ser zerado aqui, senao ele sobra no post-it seguinte.
      s.paddingLeft = '0px';
      s.width = `${style.width}px`;
      s.minHeight = `${Math.max(0, obj.h - NOTE_PAD * 2)}px`;
      s.fontFamily = NOTE_FONT_FAMILY;
      s.fontSize = `${NOTE_FONT_SIZE}px`;
      s.lineHeight = `${NOTE_LINE_HEIGHT}`;
      s.textAlign = 'left';
      // O post-it nao passa pelo adaptador de tema: o papel e superficie, e o
      // texto acompanha o papel -- o mesmo criterio do painter.
      s.color = readableTextOn(obj.bg);
      return;
    }

    // Numa lista, o recuo do marcador vira padding do editor: o marcador em si e
    // desenhado pelo painter, e sem o padding o texto saltaria para a esquerda
    // ao entrar na edicao e voltaria ao sair.
    const indent = obj.list === 'bullet' ? layoutOf(obj).indent : 0;
    s.paddingLeft = `${indent}px`;
    s.width = `${Math.max(1, obj.w - indent)}px`;
    s.minHeight = `${obj.fontSize * obj.lineHeight}px`;
    s.fontFamily = obj.fontFamily;
    s.fontSize = `${obj.fontSize}px`;
    s.lineHeight = `${obj.lineHeight}`;
    s.textAlign = obj.align;
    // A cor mostrada e a adaptada ao tema, igual ao painter: sem isso, editar um
    // texto quase preto no quadro escuro seria escrever no escuro.
    s.color = this.#ctx.adapt(obj.color);
  }

  #bind(): void {
    const on = <E extends Event>(
      target: EventTarget,
      type: string,
      fn: (e: E) => void,
      opts?: AddEventListenerOptions,
    ): void => {
      const handler = fn as EventListener;
      target.addEventListener(type, handler, opts);
      this.#disposers.push(() => target.removeEventListener(type, handler, opts));
    };

    on<KeyboardEvent>(this.el, 'keydown', (e) => {
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
        // Escape aqui SAI da caixa, e nao descarta o que foi escrito: o texto ja
        // esta na tela e some-lo seria perda de trabalho. Quem quer descartar
        // usa Ctrl+Z, que desfaz a sessao inteira de uma vez.
        e.preventDefault();
        e.stopPropagation();
        this.commit();
        return;
      }

      if (e.key === 'Enter') {
        // Quebra de linha simples, sempre. O padrao do Chromium e criar um
        // bloco novo, e ai a estrutura deixa de ser rasa.
        e.preventDefault();
        document.execCommand('insertLineBreak');
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        const cmd = FORMAT_KEYS[e.key.toLowerCase()];
        if (cmd) {
          e.preventDefault();
          document.execCommand(cmd);
        }
      }
    });

    // Texto colado entra como TEXTO: colar de um site traria fonte, corpo e cor
    // da origem, e o resumo viraria uma colcha de retalhos.
    on<ClipboardEvent>(this.el, 'paste', (e) => {
      e.preventDefault();
      const text = e.clipboardData?.getData('text/plain') ?? '';
      if (text) document.execCommand('insertText', false, text);
    });

    // Clique fora fecha a caixa. Na fase de captura porque a ferramenta ativa
    // tambem reage ao mesmo clique -- e ela precisa ver o quadro ja com o texto
    // gravado, senao clicar de uma caixa direto para outra perderia a primeira.
    on<PointerEvent>(
      window,
      'pointerdown',
      (e) => {
        if (!this.#target) return;
        if (e.target instanceof Node && this.el.contains(e.target)) return;
        // Controle de formatacao (o B/I/U da barra) age DENTRO da caixa, e nao
        // fora dela: fechar a edicao aqui era o que fazia o negrito valer para o
        // objeto inteiro em vez da palavra seguinte. Ver ToolBar.
        const controle = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-keep-edit]') : null;
        if (controle) {
          // O "+" da paleta abre o seletor do Windows, que tira o foco da janela.
          if (controle.dataset['keepEdit'] === 'seletor') this.#seletorAberto = true;
          return;
        }
        this.commit();
      },
      { capture: true },
    );

    // Guarda a selecao feita dentro da caixa (ver `#intervalo`).
    on(document, 'selectionchange', () => {
      if (!this.#target) return;
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && this.el.contains(sel.anchorNode) && this.el.contains(sel.focusNode)) {
        this.#intervalo = sel.getRangeAt(0).cloneRange();
      }
    });

    // Perder o foco da janela no meio da digitacao grava o que existe: o
    // contrario -- descartar -- perderia texto sem aviso. A excecao e o seletor
    // de cor do Windows aberto a partir da paleta: ele e parte da edicao.
    on(window, 'blur', () => {
      if (this.#seletorAberto) return;
      this.commit();
    });
    // Voltar a janela encerra a excecao: um segundo `blur` ja e sair do app.
    on(window, 'focus', () => {
      if (!this.#seletorAberto) return;
      // O `change` do seletor chega depois do foco; da tempo a ele.
      setTimeout(() => {
        this.#seletorAberto = false;
      }, 0);
    });
  }
}

/** Ctrl+B / Ctrl+I / Ctrl+U, os tres que valem dentro de uma caixa. */
const FORMAT_KEYS: Record<string, string> = {
  b: 'bold',
  i: 'italic',
  u: 'underline',
};

function sameContent(a: readonly RichSpan[], b: readonly RichSpan[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (
      x.text !== y.text ||
      !!x.bold !== !!y.bold ||
      !!x.italic !== !!y.italic ||
      !!x.underline !== !!y.underline ||
      (x.color ?? null) !== (y.color ?? null)
    ) {
      return false;
    }
  }
  return true;
}

/** Cursor no fim (caixa existente) ou selecao inteira (para trocar tudo). */
function placeCaret(el: HTMLElement, where: 'end' | 'all'): void {
  const range = document.createRange();
  range.selectNodeContents(el);
  if (where === 'end') range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}
