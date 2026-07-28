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

export interface BoardPrefs {
  background: string;
  grid: { enabled: boolean; kind: 'dots' | 'lines'; size: number };
  snapToGrid: boolean;
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
      background: '#ffffff',
      grid: { enabled: true, kind: 'dots', size: 20 },
      snapToGrid: false,
      unit: 'px',
    },
    camera: { x: 0, y: 0, zoom: 1 },
    assets: {},
  };
}
