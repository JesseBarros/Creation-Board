import { inflate } from '@shared/geometry/rect';
import type { BoardObject, ObjectId } from '@shared/model/types';
import type { Camera } from '../core/Camera';
import type { Document } from '../core/Document';
import { paintGrid } from './Grid';
import { paintObject } from './painters';
import { RASTER_PAD, RasterCache, bucketScale, contextoDeRaster } from './rasterCache';
import { type LodLevel, type PaintContext, lodForZoom } from './painters/types';
import { createColorAdapter, type ColorAdapter } from './colorAdapt';

export interface RenderStats {
  /** Objetos no documento. */
  total: number;
  /** Objetos devolvidos pelo indice espacial para o viewport atual. */
  visible: number;
  /** Objetos efetivamente desenhados (visiveis menos os descartados por tamanho). */
  drawn: number;
  renderMs: number;
  lod: LodLevel;
}

export interface RenderTheme {
  boardBg: string;
  gridColor: string;
}

/**
 * Renderer em duas camadas.
 *
 * - `static`: fundo, grade e todos os objetos consolidados. So e redesenhado
 *   quando a camera ou o conteudo mudam.
 * - `overlay`: o que esta sendo desenhado ou manipulado agora (traco em
 *   andamento, alcas de selecao, guias de snap). Redesenhado a cada frame de
 *   interacao, mas quase sempre vazio.
 *
 * A separacao existe para que arrastar uma caneta nao obrigue a redesenhar 10
 * mil objetos por frame -- so a camada de cima muda.
 */
export class Renderer {
  readonly staticCanvas: HTMLCanvasElement;
  readonly overlayCanvas: HTMLCanvasElement;

  #staticCtx: CanvasRenderingContext2D;
  #overlayCtx: CanvasRenderingContext2D;
  #dpr = 1;
  #cssW = 0;
  #cssH = 0;
  #overlayHasContent = false;

  /**
   * Objetos ja rasterizados. Ver rasterCache.ts para a medicao que o justifica.
   */
  readonly #raster = new RasterCache();

  #theme: RenderTheme = { boardBg: '#ffffff', gridColor: '#d7dce5' };
  #adapt: ColorAdapter = (c) => c;

  get theme(): RenderTheme {
    return this.#theme;
  }

  /** Trocar o tema reconstroi o adaptador de cor (e com ele, seu cache). */
  set theme(t: RenderTheme) {
    this.#theme = t;
    this.#adapt = createColorAdapter(t.boardBg);
    // Os bitmaps guardam a cor JA adaptada: mantidos, o tema novo mostraria a
    // cor do tema velho.
    this.#raster.clear();
  }

  /**
   * O adaptador de cor do tema atual.
   *
   * Exposto para quem desenha previa de gesto no overlay: a previa tem de usar a
   * mesma traducao dos painters, senao ela mostra uma cor e o objeto criado sai
   * com outra.
   */
  get adapt(): ColorAdapter {
    return this.#adapt;
  }

  /** Resolvedor de bitmaps, injetado para o Renderer nao depender do AssetStore. */
  resolveImage: ((assetId: string) => ImageBitmap | undefined) | undefined;

  /**
   * Objeto que NAO deve ser desenhado, porque outra coisa esta desenhando no
   * lugar dele: e a caixa em edicao, substituida por um `contentEditable`
   * sobreposto. Sem isto o texto sairia duplicado, meio pixel fora.
   */
  hiddenId: ObjectId | null = null;

  constructor(
    host: HTMLElement,
    private readonly doc: Document,
    private readonly camera: Camera,
  ) {
    this.staticCanvas = createLayer('qb-layer qb-layer--static');
    this.overlayCanvas = createLayer('qb-layer qb-layer--overlay');
    host.append(this.staticCanvas, this.overlayCanvas);

    // `alpha: false` na camada estatica: sem canal alfa o compositor pode pular
    // a mistura com o fundo, o que mede alguns pontos percentuais de ganho.
    this.#staticCtx = must(this.staticCanvas.getContext('2d', { alpha: false }));
    this.#overlayCtx = must(this.overlayCanvas.getContext('2d'));
  }

  get overlayCtx(): CanvasRenderingContext2D {
    return this.#overlayCtx;
  }

  get viewportW(): number {
    return this.#cssW;
  }

  get viewportH(): number {
    return this.#cssH;
  }

  /** Ajusta o backing store das duas camadas ao tamanho CSS e ao DPR da tela. */
  resize(cssW: number, cssH: number, dpr: number): boolean {
    if (cssW === this.#cssW && cssH === this.#cssH && dpr === this.#dpr) return false;
    this.#cssW = cssW;
    this.#cssH = cssH;
    this.#dpr = dpr;

    for (const c of [this.staticCanvas, this.overlayCanvas]) {
      c.width = Math.max(1, Math.round(cssW * dpr));
      c.height = Math.max(1, Math.round(cssH * dpr));
      c.style.width = `${cssW}px`;
      c.style.height = `${cssH}px`;
    }
    return true;
  }

  render(): RenderStats {
    const t0 = performance.now();
    const ctx = this.#staticCtx;
    const zoom = this.camera.zoom;
    const lod = lodForZoom(zoom);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = this.#theme.boardBg;
    ctx.fillRect(0, 0, this.staticCanvas.width, this.staticCanvas.height);

    // A grade e desenhada em px de tela; o scale do DPR fica por conta do ctx.
    ctx.setTransform(this.#dpr, 0, 0, this.#dpr, 0, 0);
    paintGrid(ctx, this.camera, this.#cssW, this.#cssH, this.doc.prefs, this.#theme.gridColor);

    // Culling: o indice espacial devolve so o que intersecta o viewport.
    // A margem cobre tracos cuja espessura extrapola um pouco o AABB.
    const view = inflate(this.camera.viewportRect(this.#cssW, this.#cssH), 4 / zoom);
    const objects = this.doc.queryVisible(view);

    // Transformacao mundo -> device px, aplicada uma vez para todos os objetos.
    const s = zoom * this.#dpr;
    ctx.setTransform(s, 0, 0, s, -this.camera.x * s, -this.camera.y * s);

    // Abaixo de meio pixel de tela o objeto nao contribui com nada visivel.
    const minWorldSize = 0.5 / zoom;
    let drawn = 0;

    // O `PaintContext` continua sendo montado por objeto, dentro do `#paintOne`,
    // e isso foi TESTADO em 12/08/2026: reaproveitar um so para o frame inteiro
    // -- 4.000 alocacoes por frame a menos -- nao mudou nada. Quatro execucoes de
    // cada lado, `stroke` 6,40-6,73 contra 6,38-6,79 e `shape` 5,67-5,98 contra
    // 5,63-6,23: faixas identicas. Alocar um objeto pequeno e novo em V8 e um
    // avanco de ponteiro, e o custo por objeto esta em outro lugar.
    //
    // Fica registrado para ninguem "otimizar" isto de novo por parecer obvio.

    // Um caminho so, para qualquer zoom. Ate 08/08/2026 havia um atalho aqui:
    // abaixo de 12% de zoom todo objeto virava um retangulo solido da cor
    // dominante, desenhado em lote. Era barato e mentia -- imagem e forma
    // apareciam como quadrados coloridos, e foi assim que ele viu o quadro ao
    // afastar. Saiu a pedido dele, com o custo aceito e medido (B12).
    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i]!;
      if (obj.id === this.hiddenId) continue;
      const b = obj.bbox;
      // Meio pixel de tela e limite FISICO, e nao politica de detalhe: nao ha
      // como mostrar coisa alguma num objeto menor que um pixel.
      if (b.w < minWorldSize && b.h < minWorldSize) continue;

      this.#paintOne(obj, ctx, zoom, lod, s);
      drawn++;
    }

    return {
      total: this.doc.size,
      visible: objects.length,
      drawn,
      renderMs: performance.now() - t0,
      lod,
    };
  }

  /**
   * Desenha UM objeto com a sua transformacao aplicada.
   *
   * Existe como metodo porque a miniatura do lobby desenha pelo mesmo caminho:
   * dois trechos iguais lado a lado divergem na primeira mudanca, e ai o quadro
   * mostraria uma coisa e a miniatura dele outra.
   */
  #paintOne(
    obj: BoardObject,
    ctx: CanvasRenderingContext2D,
    zoom: number,
    lod: LodLevel,
    s: number,
  ): void {
    const t = obj.transform;
    ctx.save();
    ctx.translate(t.x, t.y);
    if (t.rotation !== 0) ctx.rotate(t.rotation);
    if (t.scaleX !== 1 || t.scaleY !== 1) ctx.scale(t.scaleX, t.scaleY);

    const p: PaintContext = {
      ctx,
      zoom,
      lod,
      // `s` ja e zoom * dpr: o painter precisa dele para saber de que tamanho
      // uma unidade de mundo sai em pixel fisico.
      deviceScale: s,
      objectScale: Math.abs(t.scaleY),
      adapt: this.#adapt,
      image: this.resolveImage,
    };

    // Texto e post-it passam pelo cache: sao os unicos cujo desenho envolve
    // medir e montar texto, que e o custo que domina com muitos objetos na tela.
    if (obj.type === 'text' || obj.type === 'note') {
      const escala = bucketScale(p.deviceScale * p.objectScale);
      const bitmap = this.#raster.obter(obj, escala, (rctx) =>
        paintObject(obj, contextoDeRaster(rctx, escala, p)),
      );
      if (bitmap) {
        ctx.drawImage(
          bitmap,
          -RASTER_PAD,
          -RASTER_PAD,
          obj.w + RASTER_PAD * 2,
          obj.h + RASTER_PAD * 2,
        );
        ctx.restore();
        return;
      }
    }

    paintObject(obj, p);
    ctx.restore();
  }

  /** Prepara o overlay para um novo frame de interacao. */
  beginOverlay(): CanvasRenderingContext2D {
    const ctx = this.#overlayCtx;
    if (this.#overlayHasContent) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    }
    this.#overlayHasContent = true;
    const s = this.camera.zoom * this.#dpr;
    ctx.setTransform(s, 0, 0, s, -this.camera.x * s, -this.camera.y * s);
    return ctx;
  }

  /**
   * Overlay em coordenadas de TELA (CSS px), com o DPR ja aplicado.
   *
   * As alcas de selecao e o laco sao cromo de interface, nao conteudo: tem
   * tamanho fixo em pixel e devem sair nitidos em qualquer zoom. Desenhados no
   * espaco do mundo, cada espessura precisaria ser dividida pelo zoom a mao e
   * ainda cairia em meio pixel. Quem usa isto converte os pontos com
   * `camera.worldToScreen`.
   */
  beginOverlayScreen(): CanvasRenderingContext2D {
    const ctx = this.#overlayCtx;
    if (this.#overlayHasContent) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    }
    this.#overlayHasContent = true;
    ctx.setTransform(this.#dpr, 0, 0, this.#dpr, 0, 0);
    return ctx;
  }

  /** Limpa o overlay e marca que ele nao precisa mais ser limpo ate voltar a ter conteudo. */
  clearOverlay(): void {
    if (!this.#overlayHasContent) return;
    const ctx = this.#overlayCtx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    this.#overlayHasContent = false;
  }
}

function createLayer(className: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.className = className;
  return c;
}

function must(ctx: CanvasRenderingContext2D | null): CanvasRenderingContext2D {
  if (!ctx) throw new Error('Contexto 2D indisponivel neste dispositivo');
  return ctx;
}
