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
  /** Cor do quadro NA TELA. */
  boardBg: string;
  /**
   * Cor do quadro NO ARQUIVO exportado.
   *
   * Separada de `boardBg` porque tela e papel nao pedem a mesma coisa: a tela e
   * uma fonte de luz e um branco puro em area grande cansa a vista, entao o
   * quadro claro e um branco quebrado; o arquivo e refletivo, e um fundo cinza
   * nele so parece sujo -- e gasta tinta ao imprimir.
   *
   * No tema escuro as duas sao a mesma cor: o fundo escuro do arquivo E a
   * intencao de quem exporta um quadro escuro.
   */
  exportBg: string;
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

  /*
    ARRASTAR SEM REDESENHAR TUDO (B32, 30/09/2026).

    Medido no quadro de teste (1.063 objetos), arrastando com o botao direito:
    56-59 quadros por segundo, com 13 ms de desenho por quadro -- TODOS os objetos
    visiveis redesenhados a cada quadro, para mostrar o mesmo conteudo alguns
    pixels ao lado. Com a composicao pela CPU (o padrao, por causa do B18) o
    canvas e desenhado por software, e 13 ms e quase o quadro inteiro de 16.

    Arrastar sem mudar o zoom so DESLOCA a imagem. Entao o quadro anterior e
    copiado deslocado sobre si mesmo, e so as faixas que entraram na tela agora
    sao desenhadas -- fundo, grade e os objetos que tocam a faixa, recortados
    nela. A copia custa o mesmo para 10 ou 10 mil objetos.

    O deslocamento e em pixels INTEIROS: meio pixel borraria a imagem, e o
    borrao se acumularia a cada quadro. Quando o movimento real nao e inteiro
    (escala de tela de 125% ou 150%), a imagem fica ate meio pixel fora do lugar
    durante o arrasto, e `precisaDeOutroQuadro` pede um quadro completo assim
    que a camera para.

    So desliza quando o quadro anterior e confiavel. Qualquer outra coisa faz o
    desenho completo de sempre:
    - zoom, tamanho ou objeto escondido diferentes;
    - o documento, as preferencias ou o tema mudaram desde entao;
    - faltou alguma imagem (ainda decodificando: o lugar dela tem um substituto);
    - algum texto ficou com o bitmap de outra escala (o teto do B31);
    - a camera NAO mexeu: um pedido de redesenho sem movimento e alguem dizendo
      que algo mudou, e o desenho completo e a resposta segura.

    O selftest compara, pixel a pixel, um quadro deslizado com o desenho
    completo da mesma posicao.
  */
  #anterior: {
    zoom: number;
    camX: number;
    camY: number;
    /** Translacao REAL usada no quadro, em px fisicos (pode diferir da ideal em ate meio pixel). */
    tx: number;
    ty: number;
    oculto: ObjectId | null;
  } | null = null;
  #faltouImagem = false;
  #textoAtrasado = false;
  #assentar = false;
  #visiveis = 0;
  #deslizes = 0;

  /** Desliga o deslizar -- so para as medicoes compararem os dois caminhos. */
  deslizarLigado = true;

  /** Quantos quadros foram deslizados em vez de desenhados por inteiro -- para as medicoes. */
  get deslizes(): number {
    return this.#deslizes;
  }

  /**
   * O ultimo quadro deixou algo para depois: texto com bitmap de outra escala
   * (B31) ou a imagem meio pixel fora do lugar (B32). Quem agenda os quadros
   * deve pedir mais um.
   */
  get precisaDeOutroQuadro(): boolean {
    return this.#textoAtrasado || this.#assentar;
  }

  /** O proximo quadro sera desenhado por inteiro, sem aproveitar o anterior. */
  descartarQuadroAnterior(): void {
    this.#anterior = null;
  }

  /** Resolve a imagem e anota quando ela ainda nao existe (o lugar dela recebe um substituto). */
  readonly #resolverImagem = (assetId: string): ImageBitmap | undefined => {
    const b = this.resolveImage?.(assetId);
    if (!b) this.#faltouImagem = true;
    return b;
  };

  /** Numeros do cache de bitmap -- para as medicoes (`QB_BENCH_QUADRO`). */
  get estatisticasDoCache(): { entradas: number; mb: number; acertos: number; erros: number } {
    return this.#raster.stats;
  }

  #theme: RenderTheme = { boardBg: '#f2f4f7', exportBg: '#ffffff', gridColor: '#d3d9e4' };
  #adapt: ColorAdapter = (c) => c;

  get theme(): RenderTheme {
    return this.#theme;
  }

  #grade = false;

  /** O pontilhado de fundo: preferencia do app, posta pelo App (ver `toggleGrid`). */
  get grade(): boolean {
    return this.#grade;
  }

  set grade(ligada: boolean) {
    if (ligada === this.#grade) return;
    this.#grade = ligada;
    // O proximo frame nao pode reaproveitar o anterior deslocado: ele tem a
    // grade no estado velho.
    this.#anterior = null;
  }

  /** Trocar o tema reconstroi o adaptador de cor (e com ele, seu cache). */
  set theme(t: RenderTheme) {
    this.#theme = t;
    this.#adapt = createColorAdapter(t.boardBg);
    this.#anterior = null;
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

  /** Chamado ao fim de um quadro que deixou algo para depois (ver `precisaDeOutroQuadro`). */
  aoPrecisarDeOutroQuadro: (() => void) | undefined;

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

    /*
      `alpha: false` na camada estatica: sem canal alfa o compositor pode pular
      a mistura com o fundo, o que mede alguns pontos percentuais de ganho.

      `QB_ALPHA=1` DESLIGA essa escolha, e existe para caçar o B18 -- o rastro
      ao dar zoom. E a unica coisa no NOSSO codigo que muda como o compositor
      trata esta superficie, e ate 21/09/2026 nunca tinha sido testada.

      A tese: canvas opaco entra por um caminho de composicao diferente do
      translucido. Um compositor que se permite pular a mistura tambem se
      permite contas de cobertura mais agressivas, e uma conta de cobertura
      agressiva com dano mal calculado e exatamente como conteudo velho
      sobrevive em retangulos -- a forma que o rastro tem na captura de teste.

      E instrumento, e nao conserto: se curar, a troca (alguns pontos
      percentuais contra o rastro) passa a ser uma decisao de produto, tomada com o
      numero na mao e registrada por escrito.
    */
    const params = new URLSearchParams(location.search);
    const semAlfa = params.get('alpha') !== '1';

    /*
      `QB_DESYNC=1` liga `desynchronized` nos DOIS canvas. Tambem e instrumento
      para o B18, e e o ultimo lever que resta do nosso lado.

      `desynchronized` pede ao navegador para tirar o canvas da fila normal de
      composicao e leva-lo a tela por um caminho de baixa latencia, com buffer
      proprio. Foi feito para caneta, onde o atraso entre riscar e ver incomoda.

      Por que tentar aqui: o fantasma sao DOIS frames na tela ao mesmo tempo, nos
      dois canvas, e os dois sao limpos por inteiro. Isso e a entrega do quadro,
      e nao o desenho dele -- e `desynchronized` e a unica coisa que muda a
      ENTREGA sem sair do nosso codigo para a linha de comando.

      Pode sair pior: o caminho de baixa latencia troca sincronismo por atraso, e
      "sem sincronismo" tem como sintoma classico justamente a tela partida. Se
      piorar, a informacao tambem serve -- confirma que o problema esta na
      entrega, e nao no desenho.
    */
    const desync = params.get('desync') === '1';

    this.#staticCtx = must(
      this.staticCanvas.getContext('2d', { alpha: !semAlfa, desynchronized: desync }),
    );
    this.#overlayCtx = must(this.overlayCanvas.getContext('2d', { desynchronized: desync }));

    // Conteudo mudou: o quadro anterior deixa de valer para o deslizar (B32).
    doc.on('objects', () => (this.#anterior = null));
    doc.on('prefs', () => (this.#anterior = null));
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
    this.#anterior = null;

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
    const zoom = this.camera.zoom;
    const lod = lodForZoom(zoom);
    const s = zoom * this.#dpr;
    this.#raster.iniciarQuadro();

    const deslizado = this.#deslizar(zoom, lod, s);
    const drawn = deslizado ?? this.#desenharTudo(zoom, lod, s);
    this.#textoAtrasado = this.#raster.pendente;
    if (this.precisaDeOutroQuadro) this.aoPrecisarDeOutroQuadro?.();

    return {
      total: this.doc.size,
      visible: this.#visiveis,
      drawn,
      renderMs: performance.now() - t0,
      lod,
    };
  }

  /**
   * Desloca o quadro anterior e desenha so as faixas novas (B32). Devolve
   * quantos objetos desenhou, ou `null` quando o quadro anterior nao serve.
   */
  #deslizar(zoom: number, lod: LodLevel, s: number): number | null {
    const a = this.#anterior;
    if (
      !a ||
      !this.deslizarLigado ||
      a.zoom !== zoom ||
      a.oculto !== this.hiddenId ||
      this.#faltouImagem ||
      this.#textoAtrasado ||
      (a.camX === this.camera.x && a.camY === this.camera.y)
    ) {
      return null;
    }
    const W = this.staticCanvas.width;
    const H = this.staticCanvas.height;
    const dx = Math.round(-this.camera.x * s - a.tx);
    const dy = Math.round(-this.camera.y * s - a.ty);
    // Pulo grande (mais de meia tela de faixa nova): o completo custa o mesmo.
    if (Math.abs(dx) * H + Math.abs(dy) * W > (W * H) / 2) return null;

    const ctx = this.#staticCtx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (dx !== 0 || dy !== 0) ctx.drawImage(this.staticCanvas, dx, dy);

    const tx = a.tx + dx;
    const ty = a.ty + dy;
    // A grade da faixa e calculada pela translacao REAL, e nao pela camera: e
    // ela que casa com o que foi deslocado.
    const cam = { x: -tx / s, y: -ty / s, zoom };

    const faixas: Array<{ x: number; y: number; w: number; h: number }> = [];
    if (dx > 0) faixas.push({ x: 0, y: 0, w: dx, h: H });
    else if (dx < 0) faixas.push({ x: W + dx, y: 0, w: -dx, h: H });
    const x0 = dx > 0 ? dx : 0;
    const x1 = dx < 0 ? W + dx : W;
    if (dy > 0) faixas.push({ x: x0, y: 0, w: x1 - x0, h: dy });
    else if (dy < 0) faixas.push({ x: x0, y: H + dy, w: x1 - x0, h: -dy });

    let drawn = 0;
    for (const f of faixas) {
      if (f.w <= 0 || f.h <= 0) continue;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.beginPath();
      ctx.rect(f.x, f.y, f.w, f.h);
      ctx.clip();
      ctx.fillStyle = this.#theme.boardBg;
      ctx.fillRect(f.x, f.y, f.w, f.h);
      paintGrid(ctx, cam, this.#cssW, this.#cssH, this.doc.prefs, this.#grade, this.#theme.gridColor, this.#dpr);
      const mundo = inflate({ x: (f.x - tx) / s, y: (f.y - ty) / s, w: f.w / s, h: f.h / s }, 4 / zoom);
      ctx.setTransform(s, 0, 0, s, tx, ty);
      drawn += this.#pintarObjetos(ctx, this.doc.queryVisible(mundo), zoom, lod, s);
      ctx.restore();
    }

    a.camX = this.camera.x;
    a.camY = this.camera.y;
    a.tx = tx;
    a.ty = ty;
    this.#assentar = Math.abs(tx + this.camera.x * s) > 1e-3 || Math.abs(ty + this.camera.y * s) > 1e-3;
    this.#deslizes++;
    return drawn;
  }

  /** O desenho completo: fundo, grade e todos os objetos visiveis. */
  #desenharTudo(zoom: number, lod: LodLevel, s: number): number {
    const ctx = this.#staticCtx;
    this.#faltouImagem = false;
    this.#assentar = false;

    /*
      A LIMPEZA NAO PODE DEPENDER DE NINGUEM TER SE COMPORTADO.

      `fillRect` obedece ao `globalAlpha` e ao `globalCompositeOperation`. Se um
      pintor baixar o alfa e nao devolver -- o marca-texto trabalha a 0,4 --, o
      "apagar" do frame seguinte vira uma LAVAGEM translucida e o frame anterior
      sobrevive por baixo, mais apagado. Some depois de varios frames, um pouco a
      cada lavagem.

      Os pintores devolvem o alfa A MAO (`= 1` no fim) em vez de `save`/
      `restore`, entao basta uma saida antecipada entre os dois para vazar. Auditar
      todos hoje nao resolve: o proximo pintor nasce sem saber da regra.

      Tres linhas aqui tornam a limpeza incondicional, e o selftest tem uma guarda
      que acusa o vazamento se ele existir ([...]). Ver o B18 no BUGS.md.
    */
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = this.#theme.boardBg;
    ctx.fillRect(0, 0, this.staticCanvas.width, this.staticCanvas.height);

    // A grade e desenhada em pixel fisico, e por isso recebe o DPR (B33).
    paintGrid(ctx, this.camera, this.#cssW, this.#cssH, this.doc.prefs, this.#grade, this.#theme.gridColor, this.#dpr);

    // Culling: o indice espacial devolve so o que intersecta o viewport.
    // A margem cobre tracos cuja espessura extrapola um pouco o AABB.
    const view = inflate(this.camera.viewportRect(this.#cssW, this.#cssH), 4 / zoom);
    const objects = this.doc.queryVisible(view);
    this.#visiveis = objects.length;

    // Transformacao mundo -> device px, aplicada uma vez para todos os objetos.
    const tx = -this.camera.x * s;
    const ty = -this.camera.y * s;
    ctx.setTransform(s, 0, 0, s, tx, ty);
    const drawn = this.#pintarObjetos(ctx, objects, zoom, lod, s);

    this.#anterior = { zoom, camX: this.camera.x, camY: this.camera.y, tx, ty, oculto: this.hiddenId };
    return drawn;
  }

  /** Desenha a lista na ordem dada, pulando o objeto escondido e o que e menor que meio pixel. */
  #pintarObjetos(
    ctx: CanvasRenderingContext2D,
    objects: readonly BoardObject[],
    zoom: number,
    lod: LodLevel,
    s: number,
  ): number {

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
    // apareciam como quadrados coloridos, e foi assim que se viu o quadro ao
    // afastar. Saiu, com o custo aceito e medido (B12).
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
    return drawn;
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
      image: this.resolveImage ? this.#resolverImagem : undefined,
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
    // Mesma razao do reset na camada estatica: quem desenha aqui tambem mexe em
    // alfa (o laco de selecao trabalha a 0,1) e tambem devolve a mao.
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
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
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
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
