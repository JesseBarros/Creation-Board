import type { AssetMeta } from '@shared/model/document';
import { createId } from '@shared/model/id';
import { limparMetadados } from '@shared/metadadosImagem';
import { sniffMime } from './dataUri';

/**
 * Guarda os binarios das imagens do quadro e as versoes decodificadas usadas
 * para desenhar.
 *
 * Duas representacoes por asset, de proposito:
 *
 *  - `bytes`: o arquivo ORIGINAL em pixels -- mesma compressao, mesma
 *    resolucao --, SEM OS METADADOS. E ele que vai para o .wbd e para o SVG
 *    exportado. Guardar o original importa especialmente para migracao: um
 *    resumo de um quadro importado precisa continuar legivel quando voce der
 *    zoom.
 *
 *    Os metadados saem na ENTRADA, desde a auditoria de 30/09/2026: ate ali a
 *    foto de celular colada num quadro levava junto o GPS de onde foi tirada,
 *    o aparelho e a data, e quem recebesse o quadro podia ler. Ver
 *    `@shared/metadadosImagem`. Como `adopt` tambem passa por `add`, um quadro
 *    ANTIGO sai limpo na proxima vez que for salvo.
 *
 *  - `bitmap`: um ImageBitmap para o canvas, com o numero de pixels limitado.
 *    Uma imagem de 12000x9000 viraria ~430 MB de textura na GPU; o teto evita
 *    que abrir um quadro com meia duzia delas derrube o app.
 */

/** Teto de pixels do bitmap de desenho (~40 MP, cerca de 160 MB em RGBA). */
const MAX_RENDER_PIXELS = 40_000_000;

export interface Asset {
  meta: AssetMeta;
  /** Arquivo original sem os metadados (os pixels sao os mesmos). */
  bytes: Uint8Array;
  bitmap: ImageBitmap;
}

export interface SerializedAsset {
  id: string;
  mime: string;
  data: Uint8Array;
}

export class AssetStore {
  #assets = new Map<string, Asset>();

  get size(): number {
    return this.#assets.size;
  }

  get(id: string): Asset | undefined {
    return this.#assets.get(id);
  }

  bitmap(id: string): ImageBitmap | undefined {
    return this.#assets.get(id)?.bitmap;
  }

  /**
   * Registra um arquivo de imagem: tira os metadados, decodifica e limita o
   * bitmap.
   *
   * O nome do arquivo NAO e guardado (era, ate 30/09/2026, sem que nada o
   * lesse): "RG frente.jpg" ou "exame-joao.png" diz mais sobre quem colou do
   * que a imagem, e viajava dentro de todo quadro compartilhado.
   *
   * O TIPO sai dos bytes, e nao do que foi declarado: o tipo gravado num `.wbd`
   * recebido de outra pessoa e texto livre, e ia parar sem escape no SVG
   * exportado (`data:${mime};base64,...`).
   */
  async add(blob: Blob): Promise<Asset> {
    const { bytes } = limparMetadados(new Uint8Array(await blob.arrayBuffer()));
    const mime = sniffMime(bytes) ?? tipoDeImagem(blob.type);
    // Decodifica a versao LIMPA, e nao a de entrada: e ela que sera gravada, e
    // a orientacao da foto tem de sair dela -- se o corte errasse, o quadro
    // mostraria agora o que mostraria ao reabrir.
    const limpo = new Blob([bytes.slice().buffer as ArrayBuffer], { type: mime });

    // `createImageBitmap` decodifica fora da thread principal; decodificar via
    // <img> bloquearia a interface enquanto uma imagem grande e processada.
    const full = await createImageBitmap(limpo);
    const naturalW = full.width;
    const naturalH = full.height;

    let bitmap = full;
    const pixels = naturalW * naturalH;
    if (pixels > MAX_RENDER_PIXELS) {
      const scale = Math.sqrt(MAX_RENDER_PIXELS / pixels);
      bitmap = await createImageBitmap(limpo, {
        resizeWidth: Math.max(1, Math.round(naturalW * scale)),
        resizeHeight: Math.max(1, Math.round(naturalH * scale)),
        resizeQuality: 'high',
      });
      full.close(); // libera a versao integral, ja substituida
    }

    const asset: Asset = {
      meta: {
        id: createId(),
        mime,
        bytes: bytes.byteLength,
        width: naturalW,
        height: naturalH,
      },
      bytes,
      bitmap,
    };

    this.#assets.set(asset.meta.id, asset);
    return asset;
  }

  /**
   * Registra um binario sob um id JA CONHECIDO, sem mexer no resto do store.
   *
   * Existe porque `add` sorteia um id novo, e ha dois casos em que o id precisa
   * ser o que ja esta gravado nos objetos: reabrir um .wbd e colar uma imagem
   * copiada de outro quadro. Nos dois, um id novo faria o ImageObject apontar
   * para o nada.
   */
  async adopt(id: string, mime: string, bytes: Uint8Array): Promise<boolean> {
    if (this.#assets.has(id)) return true;
    try {
      const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: mime });
      const asset = await this.add(blob);
      this.#assets.delete(asset.meta.id);
      asset.meta.id = id;
      this.#assets.set(id, asset);
      return true;
    } catch {
      return false;
    }
  }

  /** Reidrata os assets vindos de um .wbd aberto. */
  async load(serialized: readonly SerializedAsset[]): Promise<void> {
    this.clear();
    // Um asset corrompido nao pode impedir o quadro inteiro de abrir; o objeto
    // correspondente cai no marcador de imagem ausente. `adopt` engole a falha.
    await Promise.all(
      serialized.map((s) => this.adopt(s.id, s.mime, s.data)),
    );
  }

  /** Assets referenciados pelos objetos, prontos para gravar. */
  serialize(usedIds: ReadonlySet<string>): SerializedAsset[] {
    const out: SerializedAsset[] = [];
    for (const [id, asset] of this.#assets) {
      // Nao grava imagem orfa: apagar o objeto deixaria o binario preso no
      // arquivo para sempre, inflando o .wbd a cada edicao.
      if (!usedIds.has(id)) continue;
      out.push({ id, mime: asset.meta.mime, data: asset.bytes });
    }
    return out;
  }

  metas(usedIds: ReadonlySet<string>): Record<string, AssetMeta> {
    const out: Record<string, AssetMeta> = {};
    for (const [id, asset] of this.#assets) {
      if (usedIds.has(id)) out[id] = asset.meta;
    }
    return out;
  }

  clear(): void {
    for (const asset of this.#assets.values()) asset.bitmap.close();
    this.#assets.clear();
  }
}

/** Tipo declarado, aceito so se tiver cara de tipo de imagem -- senao PNG. */
function tipoDeImagem(declarado: string): string {
  return /^image\/[a-z0-9.+-]{1,40}$/.test(declarado) ? declarado : 'image/png';
}
