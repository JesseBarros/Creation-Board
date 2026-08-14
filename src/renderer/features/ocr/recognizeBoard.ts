import type { ImageObject } from '@shared/model/types';
import type { AssetStore } from '../images/AssetStore';
import type { Document } from '../../core/Document';

/**
 * Le o texto das imagens do quadro, em segundo plano, e guarda no documento.
 *
 * ## As tres regras que definem o comportamento
 *
 * 1. **Roda uma vez por imagem na vida do quadro.** O resultado vai para
 *    `ImageObject.ocr` e e gravado no .wbd. Imagem sem texto guarda `''`, e nao
 *    `undefined` -- sem essa distincao, um diagrama sem uma letra seria relido
 *    a cada abertura, para sempre.
 * 2. **Nao entra no undo/redo.** A leitura e dado DERIVADO da imagem, nao uma
 *    edicao dele. Passar por um comando faria `Ctrl+Z` "desler" a imagem, o que
 *    nao e coisa que alguem queira desfazer -- e ainda empurraria a edicao de
 *    verdade dele para tras na pilha.
 * 3. **Em pedacos, e nao tudo de uma vez.** Cada pedaco que volta ja fica
 *    buscavel. Num quadro com muitas imagens, o `Ctrl+F` comeca a achar antes de
 *    a ultima ser lida.
 *
 * ## O custo, medido antes de existir este arquivo
 *
 * Nas 36 imagens do *Cybersec resumao* (4,12 MB): **1,65 s no total**, 46 ms de
 * media, 30 imagens com texto, **3.456 palavras**, zero erros. Na segunda
 * abertura, zero -- o texto ja esta no arquivo.
 */

/**
 * Imagens por chamada.
 *
 * Doze e um meio-termo medido: o custo fixo do lote e a partida do PowerShell
 * (algumas centenas de ms), entao lotes pequenos demais a pagam muitas vezes; e
 * lotes grandes demais atrasam o primeiro resultado ficar buscavel.
 */
const LOTE = 12;

export interface OcrProgresso {
  /** Imagens ja lidas, do total agendado. */
  feitas: number;
  total: number;
  /** Quantas tinham texto. */
  comTexto: number;
}

/**
 * Le as imagens que ainda nao tem texto.
 *
 * Devolve quantas foram lidas. Nunca lanca: OCR e conforto, e um quadro que
 * abre e mais importante que o texto de uma imagem.
 */
export async function recognizeBoardImages(
  doc: Document,
  assets: AssetStore,
  onProgresso?: (p: OcrProgresso) => void,
  cancelado?: () => boolean,
): Promise<number> {
  const api = window.quadro?.ocr;
  if (!api) return 0;

  // Agrupa por ASSET, e nao por objeto: a mesma imagem colada duas vezes no
  // quadro e um arquivo so, e le-la duas vezes seria pagar o dobro pelo mesmo
  // resultado.
  const porAsset = new Map<string, ImageObject[]>();
  for (const obj of doc.all()) {
    if (obj.type !== 'image' || obj.ocr !== undefined) continue;
    if (!assets.get(obj.assetId)) continue;
    const lista = porAsset.get(obj.assetId);
    if (lista) lista.push(obj);
    else porAsset.set(obj.assetId, [obj]);
  }

  const ids = [...porAsset.keys()];
  if (ids.length === 0) return 0;

  let feitas = 0;
  let comTexto = 0;

  for (let i = 0; i < ids.length; i += LOTE) {
    if (cancelado?.()) break;
    const pedaco = ids.slice(i, i + LOTE);

    const itens = pedaco.flatMap((id) => {
      const asset = assets.get(id);
      if (!asset) return [];
      // `slice()` porque o buffer do asset e reaproveitado pelo store: mandar a
      // referencia crua pelo IPC transferiria a posse em alguns caminhos.
      return [{ id, mime: asset.meta.mime, data: asset.bytes.slice().buffer as ArrayBuffer }];
    });
    if (itens.length === 0) continue;

    let relatorio;
    try {
      relatorio = await api.recognize(itens);
    } catch {
      break;
    }
    // Maquina sem OCR: parar aqui e deixar `ocr` indefinido e deliberado. Marcar
    // tudo como '' mentiria -- e no dia em que o idioma for instalado, o quadro
    // ja estaria carimbado como "sem texto".
    if (!relatorio.available) break;
    if (cancelado?.()) break;

    const atualizados: ImageObject[] = [];
    for (const item of relatorio.items) {
      const objs = porAsset.get(item.id);
      if (!objs) continue;
      for (const obj of objs) {
        // Le do documento de novo: entre o pedido e a resposta o objeto pode ter
        // sido movido ou recortado, e escrever a copia velha desfaria isso.
        const atual = doc.get(obj.id);
        if (!atual || atual.type !== 'image') continue;
        atualizados.push({ ...atual, ocr: item.text });
      }
      feitas++;
      if (item.text.length > 0) comTexto++;
    }

    if (atualizados.length > 0) doc.replaceMany(atualizados);
    onProgresso?.({ feitas, total: ids.length, comTexto });
  }

  return feitas;
}
