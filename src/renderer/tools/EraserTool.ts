import type { Vec2 } from '@shared/geometry/vec2';
import { worldToLocal } from '@shared/model/bbox';
import {
  isInk,
  type BoardObject,
  type EraseMark,
  type InkObject,
  type ObjectId,
} from '@shared/model/types';
import { EraseInk, EraseObjects } from '../commands';
import type { Camera } from '../core/Camera';
import { hitsObject } from '../features/selection/hitTest';
import { isFullyErased } from '../render/painters/erase';
import type { DrawStyle } from './DrawStyle';
import type { Tool, ToolContext, ToolPointer } from './types';

/**
 * Borracha, em dois modos (escolhidos na barra).
 *
 * **Peça** apaga por onde passa e deixa o resto do traço no lugar. É o que se
 * espera de uma borracha de verdade, e o que outros aplicativos de quadro fazem: quem
 * errou uma letra apaga a letra, não a palavra.
 *
 * **Traço inteiro** remove o objeto que ela toca. Continua existindo porque é o
 * gesto certo para limpar uma anotação inteira sem ter que cobri-la toda.
 *
 * O modo peça NÃO recorta a geometria: ele acrescenta um rastro à lista `erased`
 * do objeto, e quem abre o buraco é o painter (ver render/painters/erase.ts). O
 * motivo está lá -- a caligrafia importada é contorno preenchido, e recortá-la
 * exigiria subtração booleana de contornos.
 *
 * Nos dois modos, só TINTA (`stroke` e `path`). Um gesto largo passando por cima
 * de uma caixa de texto ou de uma imagem apagaria o resumo inteiro sem que
 * ninguém tivesse pedido; para essas, o caminho é selecionar e Delete, que
 * mostra o que vai sumir antes de sumir.
 */
export class EraserTool implements Tool {
  readonly id = 'eraser' as const;

  #erasing = false;
  /** Estado original de cada objeto tocado neste gesto -- base do undo. */
  #before = new Map<ObjectId, BoardObject>();
  /** Objetos removidos por inteiro no modo traço. */
  #removed: BoardObject[] = [];
  /**
   * O rastro que cada objeto está recebendo NESTE gesto.
   *
   * É contra ele que se decide continuar ou começar outro — sair de um traço e
   * voltar nele depois não pode apagar a linha reta entre a saída e a volta.
   * Ver `#eraseSpot`.
   */
  #markInProgress = new Map<ObjectId, EraseMark>();

  /** Última posição do ponteiro, em px de tela. Null até ele entrar no quadro. */
  #cursor: Vec2 | null = null;
  /** Última posição processada em MUNDO, para varrer o intervalo entre eventos. */
  #lastWorld: Vec2 | null = null;

  constructor(
    private readonly ctx: ToolContext,
    private readonly style: DrawStyle,
  ) {}

  // --------------------------------------------------------------- ponteiro

  onPointerDown(p: ToolPointer): void {
    this.#erasing = true;
    this.#before.clear();
    this.#markInProgress.clear();
    this.#removed = [];
    this.#lastWorld = p.world;
    this.#cursor = p.screen;
    this.#eraseAt(p.world);
  }

  onPointerMove(p: ToolPointer): void {
    this.#cursor = p.screen;

    if (!this.#erasing) {
      // Fora do gesto o movimento ainda importa: é ele que arrasta o círculo da
      // borracha pela tela, que é o único aviso do tamanho dela antes de apagar.
      this.ctx.invalidateOverlay();
      return;
    }

    const from = this.#lastWorld ?? p.world;
    this.#eraseAlong(from, p.world);
    this.#lastWorld = p.world;
  }

  onPointerUp(_p: ToolPointer): void {
    if (!this.#erasing) return;
    this.#erasing = false;
    this.#lastWorld = null;

    if (this.#before.size > 0) {
      // O modo traço já tem os removidos em mãos; o modo peça precisa varrer os
      // tocados e ver quais ficaram sem nenhum pixel visível.
      const survivors = this.#finishInk();
      this.ctx.history.push(
        this.#removed.length > 0 && survivors.length === 0
          ? new EraseObjects(this.ctx.doc, this.#removed)
          : new EraseInk(this.ctx.doc, [...this.#before.values()], survivors),
      );
      this.ctx.history.seal();
      this.ctx.markDirty();
    }

    this.#reset();
    this.ctx.invalidate();
  }

  cancel(): boolean {
    if (!this.#erasing) return false;
    this.#erasing = false;
    this.#lastWorld = null;

    // Nada disto passou pelo histórico ainda, então desfazer não alcançaria:
    // devolver os objetos ao estado original aqui é a única forma de o Esc
    // valer para a borracha.
    const back = [...this.#before.values()];
    const missing = back.filter((o) => this.ctx.doc.get(o.id) === undefined);
    const present = back.filter((o) => this.ctx.doc.get(o.id) !== undefined);
    if (missing.length > 0) this.ctx.doc.add(missing);
    if (present.length > 0) this.ctx.doc.replaceMany(present);

    this.#reset();
    this.ctx.invalidate();
    return true;
  }

  // ------------------------------------------------------------- apagamento

  /**
   * Varre o intervalo entre dois eventos de ponteiro.
   *
   * Um movimento rápido entrega saltos de dezenas de pixels entre um
   * `pointermove` e o seguinte. Testando só as posições recebidas, a borracha
   * passaria POR CIMA de um traço fino sem tocá-lo -- o gesto some do meio do
   * risco e nada é apagado.
   */
  #eraseAlong(from: Vec2, to: Vec2): void {
    const radius = this.#radiusWorld();
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    // Passos menores que o raio, para o rastro sair contínuo e não pontilhado.
    const steps = Math.max(1, Math.ceil(dist / Math.max(radius / 2, 1e-6)));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      this.#eraseAt({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
    }
  }

  #eraseAt(world: Vec2): void {
    const { doc } = this.ctx;
    const r = this.#radiusWorld();
    const probe = { x: world.x - r, y: world.y - r, w: r * 2, h: r * 2 };

    const touched: InkObject[] = [];
    for (const obj of doc.queryVisible(probe)) {
      if (obj.locked || !isInk(obj)) continue;
      if (!hitsObject(obj, world.x, world.y, r)) continue;
      touched.push(obj);
    }
    if (touched.length === 0) return;

    if (this.style.eraserMode === 'objeto') {
      this.#eraseWhole(touched);
      return;
    }
    this.#eraseSpot(touched, world, r);
  }

  /** Modo traço inteiro: o objeto sai do quadro agora. */
  #eraseWhole(touched: readonly InkObject[]): void {
    const doomed = touched.filter((o) => !this.#before.has(o.id));
    if (doomed.length === 0) return;

    for (const obj of doomed) this.#before.set(obj.id, obj);
    this.#removed.push(...doomed);
    // Sai do documento agora: a borracha precisa mostrar o resultado enquanto o
    // gesto acontece. O passo de undo só nasce ao soltar.
    this.ctx.doc.remove(doomed.map((o) => o.id));
    this.ctx.markDirty();
  }

  /**
   * Modo peça: acrescenta o ponto ao rastro de cada objeto tocado.
   *
   * CONTINUIDADE POR DISTÂNCIA, e não por passo adjacente. Isto era o bug das
   * "bolas", relatado em 21/09/2026.
   *
   * O critério anterior era `lastTouch === step - 1`: o objeto tinha de ser
   * tocado no passo imediatamente anterior para o rastro continuar. Mas `#step`
   * conta TODA posição varrida, inclusive as que não tocam nada — e ao apagar
   * sobre um rabisco a borracha encosta num traço, perde contato por um passo, e
   * encosta de novo. O passo vazio quebrava a sequência, e cada retoque criava um
   * rastro NOVO de um ponto só, que o painter desenha como disco. Daí a fileira
   * de bolas com beirada serrilhada.
   *
   * Agora o que decide é a distância: se o ponto novo está perto do fim do
   * rastro em curso, ele CONTINUA aquele rastro; se está longe, começa um novo.
   * "Perto" é o próprio diâmetro da borracha — dentro dele, o segmento reto até
   * o ponto novo cobre só o terreno que a borracha de fato atravessou, porque o
   * `#eraseAlong` varre o intervalo em passos de meio raio.
   *
   * O rastro também só continua dentro do MESMO gesto: `#markInProgress` é
   * limpo no `pointerdown`. Sem isso, soltar a borracha e recomeçar do outro
   * lado do quadro traçaria uma reta apagando tudo no caminho.
   */
  #eraseSpot(touched: readonly InkObject[], world: Vec2, radius: number): void {
    const updated: BoardObject[] = [];

    for (const obj of touched) {
      if (!this.#before.has(obj.id)) this.#before.set(obj.id, obj);

      // O rastro é gravado no espaço LOCAL do objeto: assim ele acompanha mover,
      // girar e redimensionar depois, como toda a geometria deste projeto.
      const t = obj.transform;
      const local = worldToLocal(t, world.x, world.y);
      const scale = Math.min(Math.abs(t.scaleX) || 1, Math.abs(t.scaleY) || 1);
      const width = (radius * 2) / scale;

      /*
        O rastro EM CURSO é mutado no lugar, e os antigos são reaproveitados.

        A versão anterior copiava todas as marcas e todos os pontos a cada
        posição varrida. Como o rastro cresce a cada passo, o custo do gesto era
        quadrático — e um gesto longo sobre um rabisco denso chega a centenas de
        passos. O estado original já está guardado em `#before`, que é o que o
        undo usa, então mutar o rastro deste gesto não perde nada.
      */
      const emCurso = this.#markInProgress.get(obj.id);
      let marks: EraseMark[];

      if (emCurso && perto(emCurso.points, local, width)) {
        emCurso.points.push(local.x, local.y);
        marks = obj.erased as EraseMark[];
      } else {
        const novo: EraseMark = { points: [local.x, local.y], width };
        marks = [...(obj.erased ?? []), novo];
        this.#markInProgress.set(obj.id, novo);
      }

      updated.push({ ...obj, erased: marks, rev: obj.rev + 1, updatedAt: Date.now() });
    }

    if (updated.length === 0) return;
    this.ctx.doc.replaceMany(updated);
    this.ctx.markDirty();
  }

  /**
   * Fecha o modo peça: quem ficou sem nenhum pixel visível sai do quadro.
   *
   * Sem isto, apagar um traço inteiro aos poucos deixaria para trás um objeto
   * invisível que continua no índice espacial, entra no laço e conta no Ctrl+A.
   */
  #finishInk(): BoardObject[] {
    const survivors: BoardObject[] = [];
    const doomed: ObjectId[] = [];

    for (const id of this.#before.keys()) {
      const obj = this.ctx.doc.get(id);
      if (!obj) continue; // já removido pelo modo traço
      if (isInk(obj) && isFullyErased(obj, this.#probeContext())) {
        doomed.push(id);
        continue;
      }
      survivors.push(obj);
    }

    if (doomed.length > 0) this.ctx.doc.remove(doomed);
    return survivors;
  }

  /** Contexto mínimo para a rasterização de conferência (ver isFullyErased). */
  #probeContext() {
    return {
      ctx: null as unknown as CanvasRenderingContext2D,
      zoom: 1,
      lod: 'full' as const,
      deviceScale: 1,
      objectScale: 1,
      adapt: this.ctx.adapt,
    };
  }

  #reset(): void {
    this.#before.clear();
    this.#markInProgress.clear();
    this.#removed = [];
  }

  #radiusWorld(): number {
    return this.style.width('eraser') / 2 / this.ctx.camera.zoom;
  }

  // ---------------------------------------------------------------- visual

  cursorFor(): string {
    // O cursor do sistema some: quem indica onde e de que tamanho a borracha
    // apaga é o círculo desenhado no overlay, que acompanha o zoom.
    return 'none';
  }

  paintOverlay(ctx: CanvasRenderingContext2D, _camera: Camera): void {
    const c = this.#cursor;
    if (!c) return;

    ctx.save();
    ctx.beginPath();
    ctx.arc(c.x, c.y, this.style.width('eraser') / 2, 0, Math.PI * 2);
    // Preenchimento claro com contorno escuro: o círculo precisa ficar visível
    // tanto sobre o quadro branco quanto sobre uma mancha de tinta.
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(31, 41, 51, 0.75)';
    // Tracejado no modo traço inteiro: os dois modos apagam coisas muito
    // diferentes, e o aviso tem de estar onde os olhos já estão -- no cursor.
    ctx.setLineDash(this.style.eraserMode === 'objeto' ? [4, 3] : []);
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * O ponto novo continua o rastro em curso, ou começa outro?
 *
 * A comparação é com o ÚLTIMO ponto do rastro, e o limite é o diâmetro da
 * borracha. Dentro dele, o segmento reto até o ponto novo cobre só terreno que
 * a borracha de fato atravessou: `#eraseAlong` varre o intervalo entre dois
 * eventos de ponteiro em passos de meio raio, então dois toques no mesmo objeto
 * a menos de um diâmetro um do outro têm o caminho inteiro varrido entre eles.
 *
 * Acima disso a borracha saiu do traço e voltou longe, e ligar os dois pontos
 * abriria um buraco reto por onde ela nunca passou.
 */
function perto(points: readonly number[], p: { x: number; y: number }, width: number): boolean {
  const n = points.length;
  if (n < 2) return false;
  const dx = p.x - points[n - 2]!;
  const dy = p.y - points[n - 1]!;
  return dx * dx + dy * dy <= width * width;
}
