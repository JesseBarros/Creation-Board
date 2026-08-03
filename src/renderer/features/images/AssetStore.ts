import type { AssetMeta } from '@shared/model/document';
import { createId } from '@shared/model/id';

/**
 * Guarda os binarios das imagens do quadro e as versoes decodificadas usadas
 * para desenhar.
 *
 * Duas representacoes por asset, de proposito:
 *
 *  - `bytes`: o arquivo ORIGINAL, exatamente como entrou. E ele que vai para o
 *    .wbd. Guardar o original importa especialmente para migracao: um resumo
 *    exportado do Whiteboard precisa continuar legivel quando voce der zoom.
 *
 *  - `bitmap`: um ImageBitmap para o canvas, com o numero de pixels limitado.
 *    Uma imagem de 12000x9000 viraria ~430 MB de textura na GPU; o teto evita
 *    que abrir um quadro com meia duzia delas derrube o app.
 */

/** Teto de pixels do bitmap de desenho (~40 MP, cerca de 160 MB em RGBA). */
const MAX_RENDER_PIXELS = 40_000_000;

export interface Asset {
  meta: AssetMeta;
  /** Arquivo original, preservado byte a byte. */
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

  /** Registra um arquivo de imagem, decodificando e limitando o bitmap. */
  async add(blob: Blob, filename?: string): Promise<Asset> {
    const bytes = new Uint8Array(await blob.arrayBuffer());

    // `createImageBitmap` decodifica fora da thread principal; decodificar via
    // <img> bloquearia a interface enquanto uma imagem grande e processada.
    const full = await createImageBitmap(blob);
    const naturalW = full.width;
    const naturalH = full.height;

    let bitmap = full;
    const pixels = naturalW * naturalH;
    if (pixels > MAX_RENDER_PIXELS) {
      const scale = Math.sqrt(MAX_RENDER_PIXELS / pixels);
      bitmap = await createImageBitmap(blob, {
        resizeWidth: Math.max(1, Math.round(naturalW * scale)),
        resizeHeight: Math.max(1, Math.round(naturalH * scale)),
        resizeQuality: 'high',
      });
      full.close(); // libera a versao integral, ja substituida
    }

    const asset: Asset = {
      meta: {
        id: createId(),
        mime: blob.type || 'image/png',
        bytes: bytes.byteLength,
        width: naturalW,
        height: naturalH,
        ...(filename ? { filename } : {}),
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
  async adopt(id: string, mime: string, bytes: Uint8Array, filename?: string): Promise<boolean> {
    if (this.#assets.has(id)) return true;
    try {
      const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: mime });
      const asset = await this.add(blob, filename);
      this.#assets.delete(asset.meta.id);
      asset.meta.id = id;
      this.#assets.set(id, asset);
      return true;
    } catch {
      return false;
    }
  }

  /** Reidrata os assets vindos de um .wbd aberto. */
  async load(serialized: readonly SerializedAsset[], metas: Record<string, AssetMeta>): Promise<void> {
    this.clear();
    // Um asset corrompido nao pode impedir o quadro inteiro de abrir; o objeto
    // correspondente cai no marcador de imagem ausente. `adopt` engole a falha.
    await Promise.all(
      serialized.map((s) => this.adopt(s.id, s.mime, s.data, metas[s.id]?.filename)),
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
