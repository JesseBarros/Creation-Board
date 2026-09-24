/**
 * O VIDRO DO PAINEL DO MENU, desfocado UMA VEZ em vez de a cada quadro.
 *
 * Medido em 24/09/2026 com `QB_BENCH_LOBBY`, depois do relato de "10 fps"
 * ao arrastar um quadro:
 *
 *   composicao | desfoque | cards levantando | arrastando
 *   CPU        | ligado   |   14 q/s         |   14 q/s     <- o padrao
 *   CPU        | desligado|  136             |  103
 *   GPU        | ligado   |  142             |  143
 *
 * A composicao pela CPU e a correcao do B18 (fantasma no zoom), e o modo
 * padrao ainda repinta a TELA INTEIRA a cada quadro (a correcao do B8). Juntas,
 * elas fazem o `backdrop-filter` de tela cheia do painel ser refeito na CPU a
 * cada quadro em que qualquer coisa se mexe -- ~70 ms por quadro.
 *
 * Mas o que esta atras do painel e uma FOTO PARADA. Nao ha por que desfoca-la
 * de novo a cada quadro: ela e desfocada aqui, uma vez, pequena, e o painel a
 * pinta alinhada com o fundo (`background-attachment: fixed`, ver `base.css`).
 * Prototipo medido antes de adotar: 85 q/s levantando e 76 arrastando. Decisao
 * dele, entre as tres saidas, com esses numeros na mesa.
 *
 * O PRECO ASSUMIDO: o painel perde a leve ondulacao de refracao
 * (`url(#qb-refracao)`), que e um deslocamento calculado sobre o que esta
 * atras AO VIVO. Os elementos pequenos (botoes e busca) mantem o vidro inteiro.
 */

/** Largura da versao desfocada. Ela e esticada para a tela, e isso tambem desfoca. */
const LARGURA = 480;
/**
 * Raio em pixels DA IMAGEM PEQUENA. A 480 px esticados para uma janela de
 * ~1400, 4 px viram ~12 px na tela -- perto dos 10 px do `--chrome-blur`, com a
 * suavidade do esticamento por cima.
 */
const RAIO = 4;

const prontos = new Map<string, Promise<string>>();

/** A versao desfocada de uma foto, como `blob:`. Uma vez por foto. */
export function vidroDe(fonte: string): Promise<string> {
  let p = prontos.get(fonte);
  if (!p) {
    p = desfocar(fonte);
    prontos.set(fonte, p);
    // Uma falha nao pode ficar guardada para sempre: a proxima tentativa refaz.
    p.catch(() => prontos.delete(fonte));
  }
  return p;
}

/**
 * Esquece a versao desfocada de uma foto -- quando a foto e trocada e o `blob:`
 * de origem e revogado. Sem isto, a memoria da versao pequena nunca voltaria.
 */
export function esquecerVidro(fonte: string): void {
  const p = prontos.get(fonte);
  if (!p) return;
  prontos.delete(fonte);
  void p.then((url) => URL.revokeObjectURL(url)).catch(() => undefined);
}

async function desfocar(fonte: string): Promise<string> {
  const img = new Image();
  img.src = fonte;
  await img.decode();

  const w = LARGURA;
  const h = Math.max(1, Math.round((LARGURA * img.naturalHeight) / img.naturalWidth));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('sem contexto 2d');

  // O mesmo `saturate` do vidro ao vivo, para a cor nao mudar na troca.
  ctx.filter = `blur(${RAIO}px) saturate(1.8)`;
  // Desenha um pouco MAIOR que o canvas. O desfoque mistura a borda com o
  // transparente de fora, e sem essa sobra a versao pronta teria uma moldura
  // escurecida que o vidro ao vivo nao tem. A sobra desalinha a imagem em ~3%
  // nas bordas -- invisivel numa imagem desfocada.
  const m = RAIO * 3;
  ctx.drawImage(img, -m, -m, w + 2 * m, h + 2 * m);

  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  if (!blob) throw new Error('toBlob devolveu nada');
  return URL.createObjectURL(blob);
}

/**
 * A URL da foto que o fundo do menu esta REALMENTE desenhando, lida do
 * `background-image` calculado do palco.
 *
 * Nao sai do token `--lobby-foto`: o valor de uma variavel volta como texto, com
 * o `url()` do jeito que foi escrito -- relativo, no app empacotado --, e
 * resolve-lo contra o endereco errado daria uma imagem que nao carrega. O
 * `background-image` calculado ja vem com o endereco absoluto que o navegador
 * usou.
 */
export function fotoDoPalco(palco: HTMLElement): string | null {
  const bg = getComputedStyle(palco).backgroundImage;
  const m = /url\((["']?)(.*?)\1\)/.exec(bg);
  return m?.[2] ?? null;
}
