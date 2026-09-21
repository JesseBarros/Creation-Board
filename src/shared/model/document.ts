import type { BoardObject, ObjectId } from './types';

/**
 * Esquema do arquivo .wbd.
 *
 * O .wbd e um container ZIP:
 *   manifest.json   -> WbdManifest  (metadados leves, lidos sem descompactar tudo)
 *   document.json   -> WbdDocument  (objetos + preferencias do quadro)
 *   assets/<id>     -> binarios originais das imagens
 */

export const WBD_SCHEMA_VERSION = 1;

export interface WbdManifest {
  schemaVersion: number;
  app: string;
  appVersion: string;
  createdAt: number;
  updatedAt: number;
  /** Duplicado aqui de proposito: o lobby mostra a contagem sem abrir o documento. */
  objectCount: number;
}

/**
 * Preferencias do quadro.
 *
 * `snapToGrid` esteve aqui ate 20/09/2026 e foi REMOVIDO -- ver
 * features/snapping/snap.ts. Quadros gravados antes disso ainda trazem o campo
 * no JSON; ele e simplesmente ignorado na leitura, porque nada mais o consulta.
 * Nao ha migracao a fazer: campo a mais em objeto lido nao quebra nada, e tirar
 * o campo dos arquivos exigiria reescrever quadros que o usuario nao pediu para
 * mexer.
 */
export interface BoardPrefs {
  background: string;
  grid: { enabled: boolean; kind: 'dots' | 'lines'; size: number };
  /** Unidade das reguas das bordas. */
  unit: 'px' | 'cm';
}

export interface WbdDocument {
  schemaVersion: number;
  /** Ordem de insercao e irrelevante: a camada e definida pelo campo `z`. */
  objects: BoardObject[];
  prefs: BoardPrefs;
  /** Camera salva junto, para reabrir o quadro exatamente onde parei. */
  camera: { x: number; y: number; zoom: number };
  assets: Record<string, AssetMeta>;
}

export interface AssetMeta {
  id: string;
  mime: string;
  bytes: number;
  width: number;
  height: number;
  /** Nome do arquivo original, quando conhecido. */
  filename?: string;
}

export type ObjectIndex = Map<ObjectId, BoardObject>;

export function createEmptyDocument(): WbdDocument {
  return {
    schemaVersion: WBD_SCHEMA_VERSION,
    objects: [],
    prefs: {
      /*
        O PAPEL do quadro, escolhido ao criar (ver ui/dialogs.ts).

        Era `#ffffff` e nunca era lido -- só a importação o gravava. Passou a ser
        a cor do quadro na tela e no arquivo exportado, no tema claro. O padrão
        acompanha o neutro da paleta, e não o branco: branco puro em tela cheia
        foi o que cansava a vista.
      */
      background: '#e3e7ee',
      grid: { enabled: true, kind: 'dots', size: 20 },
      unit: 'px',
    },
    camera: { x: 0, y: 0, zoom: 1 },
    assets: {},
  };
}
