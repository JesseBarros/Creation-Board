import { unzip, type Unzipped } from 'fflate';
import { t } from '@shared/i18n';

/**
 * Descompactar com TETO -- a defesa contra a bomba de zip.
 *
 * Auditoria de 30/09/2026. O app descompacta arquivo que veio de fora em tres
 * lugares: o `.zip` importado de outro aplicativo, o `.wbd` aberto e o `.wbd`
 * lido pela busca. Os tres aceitavam qualquer tamanho descompactado, e um zip
 * de poucos KB que se expande para gigabytes derrubava o PROCESSO PRINCIPAL --
 * o app inteiro, com o quadro aberto e nao salvo.
 *
 * O teto e conferido ANTES de descompactar, pelo tamanho que cada entrada
 * declara no diretorio central do zip, e soma so as entradas que quem chama
 * aceitou. As que o filtro recusa nem sao descompactadas.
 */

export interface LimitesZip {
  /** Soma maxima, em bytes, do que sera descompactado. */
  bytes: number;
  /** Numero maximo de entradas aceitas. */
  entradas: number;
}

/** Um `.wbd` e o nosso formato, mas pode ter vindo de outra pessoa. */
export const LIMITE_WBD: LimitesZip = { bytes: 1024 * 1024 * 1024, entradas: 20_000 };
/** O `.zip` importado so precisa dos `.html`, que ja trazem as imagens embutidas. */
export const LIMITE_IMPORTACAO: LimitesZip = { bytes: 512 * 1024 * 1024, entradas: 2_000 };

export class ZipGrandeDemais extends Error {
  constructor(motivo: string) {
    super(t('erro.zipRecusado', motivo));
  }
}

export function descompactar(
  dados: Uint8Array,
  limites: LimitesZip,
  aceitar: (nome: string) => boolean = () => true,
): Promise<Unzipped> {
  let total = 0;
  let entradas = 0;
  let estouro: string | null = null;
  return new Promise((resolve, reject) => {
    unzip(
      dados,
      {
        filter: (f) => {
          if (estouro || !aceitar(f.name)) return false;
          entradas++;
          total += f.originalSize;
          if (entradas > limites.entradas) estouro = t('erro.zipEntradas', limites.entradas);
          else if (total > limites.bytes) estouro = t('erro.zipBytes', Math.round(limites.bytes / 1024 / 1024));
          return estouro === null;
        },
      },
      (err, out) => {
        if (estouro) reject(new ZipGrandeDemais(estouro));
        else if (err) reject(err);
        else resolve(out);
      },
    );
  });
}
