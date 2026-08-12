import { simplifyFlat } from '@shared/geometry/simplify';
import { computeBbox } from '@shared/model/bbox';
import { keyBetween } from '@shared/model/fractional';
import { createId } from '@shared/model/id';
import type { StrokeObject } from '@shared/model/types';
import { AddObjects } from '../commands';
import type { Camera } from '../core/Camera';
import { STROKE_STRIDE } from '../render/painters/stroke';
import type { DrawStyle } from './DrawStyle';
import type { DrawToolId, Tool, ToolContext, ToolPointer } from './types';

/**
 * Caneta, marca-texto e lapis.
 *
 * Uma classe so, tres instancias: as tres desenham o mesmo `StrokeObject` e
 * diferem apenas na `variant` (que o painter interpreta) e no estilo corrente.
 * Separa-las em tres classes duplicaria toda a captura de pontos para nada.
 *
 * Os pontos sao guardados em espaco LOCAL, relativos ao primeiro ponto do traco,
 * que vira o `transform` do objeto. Guardar em mundo faria todo traco nascer com
 * transform na origem e um AABB que depende de onde o quadro estava -- mover o
 * traco depois deixaria de ser mexer no transform.
 */
export class DrawTool implements Tool {
  #drawing = false;
  /** Primeiro ponto do traco em mundo; e a origem do espaco local. */
  #anchor = { x: 0, y: 0 };
  /** Triplas [x, y, pressao] em espaco local. */
  #points: number[] = [];
  /** Ultimo ponto aceito, em px de tela, para o filtro de distancia. */
  #lastScreen = { x: 0, y: 0 };

  constructor(
    readonly id: DrawToolId,
    private readonly ctx: ToolContext,
    private readonly style: DrawStyle,
  ) {}

  // --------------------------------------------------------------- ponteiro

  onPointerDown(p: ToolPointer): void {
    this.#drawing = true;
    this.#anchor = { x: p.world.x, y: p.world.y };
    this.#points = [0, 0, p.pressure];
    this.#lastScreen = { x: p.screen.x, y: p.screen.y };
    this.ctx.invalidateOverlay();
  }

  onPointerMove(p: ToolPointer): void {
    if (!this.#drawing) return;

    // Uma mesa digitalizadora entrega ate 240 pontos por segundo, muitos deles a
    // menos de um pixel do anterior. Guardar todos incha o arquivo e o custo de
    // desenho sem mudar um pixel do resultado.
    const dx = p.screen.x - this.#lastScreen.x;
    const dy = p.screen.y - this.#lastScreen.y;
    if (dx * dx + dy * dy < MIN_STEP_PX * MIN_STEP_PX) return;

    this.#lastScreen = { x: p.screen.x, y: p.screen.y };
    this.#points.push(p.world.x - this.#anchor.x, p.world.y - this.#anchor.y, p.pressure);
    this.ctx.invalidateOverlay();
  }

  onPointerUp(p: ToolPointer): void {
    if (!this.#drawing) return;
    this.#drawing = false;

    const points = this.#points;
    this.#points = [];

    // Toque sem arraste: um ponto so nao forma segmento e o painter nao desenha
    // nada. Duplicar o ponto transforma o toque num pingo, que e o que o usuario
    // acabou de pedir ao encostar a caneta.
    if (points.length === STROKE_STRIDE) {
      points.push(points[0]!, points[1]!, p.pressure);
    }

    const stroke = this.#build(points);
    this.ctx.history.push(new AddObjects(this.ctx.doc, [stroke], LABELS[this.id]));
    this.ctx.history.seal();
    this.ctx.markDirty();
    this.ctx.invalidate();
  }

  cancel(): boolean {
    if (!this.#drawing) return false;
    this.#drawing = false;
    this.#points = [];
    this.ctx.invalidate();
    return true;
  }

  // ----------------------------------------------------------------- objeto

  #build(points: number[]): StrokeObject {
    const now = Date.now();
    const width = this.style.width(this.id);
    const stroke: StrokeObject = {
      id: createId(),
      type: 'stroke',
      variant: this.id,
      parentId: null,
      // Provisorio: a camada do marca-texto depende de o que ele COBRE, e para
      // saber isso e preciso do AABB, que so existe depois do `computeBbox`
      // abaixo.
      z: '',
      transform: { x: this.#anchor.x, y: this.#anchor.y, rotation: 0, scaleX: 1, scaleY: 1 },
      bbox: { x: 0, y: 0, w: 0, h: 0 },
      opacity: 1,
      locked: false,
      hidden: false,
      rev: 0,
      createdAt: now,
      updatedAt: now,
      points,
      lod: simplifyFlat(points, STROKE_STRIDE, LOD_EPSILON),
      color: this.style.color(this.id),
      width,
    };
    // O AABB e sempre derivado, nunca escrito a mao; `computeBbox` ja infla pela
    // espessura, que extrapola a linha de centro dos pontos para os dois lados.
    stroke.bbox = computeBbox(stroke);
    stroke.z = this.#nextZ(stroke);
    return stroke;
  }

  /**
   * Camada do traco novo.
   *
   * Caneta e lapis entram por CIMA, que e onde se espera encontrar o que se
   * acabou de escrever.
   *
   * O marca-texto entra por BAIXO -- grifar um resumo importado com ele no topo
   * cobriria com uma faixa translucida justamente o texto que se quis destacar.
   * **Mas "por baixo de tudo" estava errado, e o M8 nasceu disso:** ele relatou
   * que grifar sobre uma print colada nao mostra nada. Esta certo, e a diferenca
   * e fisica -- texto e tinta escura sobre fundo claro, e o grifo aparece atras
   * das letras como um marcador de verdade; uma IMAGEM e opaca, e nao ha "atras"
   * que se veja. A regra foi escrita na Fase 4, quando o app nao tinha imagens;
   * elas chegaram na Fase 7 e ninguem revisitou.
   *
   * A correcao e local, e nao global: o grifo sobe ate logo ACIMA da imagem mais
   * alta que ele encosta, e nao acima de todas as imagens do quadro. Subir
   * sempre faria um grifo passar na frente de um texto que esta acima de alguma
   * imagem distante, sem ninguem ter pedido.
   */
  #nextZ(stroke: StrokeObject): string {
    const { doc } = this.ctx;
    if (this.id !== 'highlighter') return keyBetween(doc.topZ(), null);

    // A imagem mais alta que este traco cobre. `queryVisible` ja devolve em
    // ordem de camada, entao a ultima da lista e a de cima.
    let alvo: string | null = null;
    for (const o of doc.queryVisible(stroke.bbox)) {
      if (o.type === 'image') alvo = o.z;
    }
    if (alvo === null) return keyBetween('', doc.bottomZ());

    // Entre a imagem e o que vier logo acima dela no quadro INTEIRO: `z` e uma
    // ordem global, e usar so os vizinhos que o traco encosta produziria uma
    // chave que colide com objetos fora dele.
    let acima: string | null = null;
    for (const o of doc.all()) {
      if (o.z > alvo && (acima === null || o.z < acima)) acima = o.z;
    }
    return keyBetween(alvo, acima);
  }

  // ---------------------------------------------------------------- visual

  cursorFor(): string {
    return PEN_CURSOR;
  }

  /**
   * Traco em andamento, desenhado em px de TELA.
   *
   * O contexto que chega aqui e o de tela (ver App.#paintOverlay), entao os
   * pontos sao convertidos pela camera e a espessura e multiplicada pelo zoom.
   * As opcoes de linha sao as mesmas do painter de proposito: o que se ve
   * durante o gesto tem de ser identico ao que fica quando o botao solta.
   */
  paintOverlay(ctx: CanvasRenderingContext2D, camera: Camera): void {
    const pts = this.#points;
    if (!this.#drawing || pts.length < STROKE_STRIDE) return;

    const zoom = camera.zoom;
    const toScreenX = (lx: number): number => (lx + this.#anchor.x - camera.x) * zoom;
    const toScreenY = (ly: number): number => (ly + this.#anchor.y - camera.y) * zoom;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(toScreenX(pts[0]!), toScreenY(pts[1]!));
    for (let i = STROKE_STRIDE; i + 1 < pts.length; i += STROKE_STRIDE) {
      ctx.lineTo(toScreenX(pts[i]!), toScreenY(pts[i + 1]!));
    }
    // Um traco de um ponto so ainda nao tem segmento: o `lineCap` redondo sozinho
    // nao pinta nada, entao o pingo precisa de um ponto explicito.
    if (pts.length === STROKE_STRIDE) {
      ctx.lineTo(toScreenX(pts[0]!), toScreenY(pts[1]!));
    }

    // Marca-texto e superficie e nao passa pelo adaptador, igual ao painter:
    // adaptar sua cor no tema escuro o transformaria num traco opaco.
    const color = this.style.color(this.id);
    ctx.strokeStyle = this.id === 'highlighter' ? color : this.ctx.adapt(color);
    ctx.lineWidth = this.style.width(this.id) * zoom;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = this.id === 'highlighter' ? 0.4 : 1;
    ctx.stroke();
    ctx.restore();
  }
}

/** Deslocamento minimo, em px de tela, para um ponto novo entrar no traco. */
const MIN_STEP_PX = 1;

/**
 * Tolerancia do RDP que gera o LOD, em unidades de mundo. O mesmo valor que a
 * carga de teste usa (dev/stress.ts): abaixo de meio zoom a diferenca entre a
 * polilinha cheia e a simplificada nao chega a um pixel.
 */
const LOD_EPSILON = 2.5;

const LABELS: Record<DrawToolId, string> = {
  pen: 'Desenhar',
  highlighter: 'Grifar',
};

/**
 * Cursor de caneta, com a PONTA no ponto que vai desenhar.
 *
 * A cruz do navegador dizia "aqui" sem dizer "com o quê", e destoava de um app
 * cujo resto e desenhado. O SVG vai embutido no proprio valor de `cursor`,
 * entao nao depende de arquivo em disco nem de caminho de build.
 *
 * O par de numeros no fim (`2 20`) e o ponto quente: sem ele o sistema usa o
 * canto superior esquerdo da imagem, e a tinta sairia deslocada do cursor. O
 * `crosshair` no fim e o plano B para um ambiente que recuse a imagem.
 */
const PEN_CURSOR = (() => {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">` +
    // Contorno branco por baixo: sem ele a caneta preta sumiria sobre tinta
    // escura, que e exatamente onde ela costuma estar.
    `<path d="M3 21l1.6-5.2L16.8 3.6l3.6 3.6L8.2 19.4z" fill="%23fff" stroke="%23fff" stroke-width="3.5" stroke-linejoin="round"/>` +
    `<path d="M3 21l1.6-5.2L16.8 3.6l3.6 3.6L8.2 19.4z" fill="%231f2933"/>` +
    `<path d="M14.6 5.8l3.6 3.6" stroke="%23fff" stroke-width="1.4"/>` +
    `</svg>`;
  return `url('data:image/svg+xml;utf8,${svg}') 2 20, crosshair`;
})();
