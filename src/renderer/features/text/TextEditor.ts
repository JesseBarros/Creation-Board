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
        this.commit();
      },
      { capture: true },
    );

    // Perder o foco da janela no meio da digitacao grava o que existe: o
    // contrario -- descartar -- perderia texto sem aviso.
    on(window, 'blur', () => this.commit());
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
