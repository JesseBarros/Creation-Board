import type { WbdDocument, WbdManifest } from './model/document';

/**
 * Layout do container .wbd (um ZIP):
 *
 *   manifest.json   metadados leves -- lidos sozinhos para montar o lobby
 *   document.json   objetos, preferencias e camera
 *   preview.png     miniatura do quadro, para o card do lobby
 *   assets/<id>     binarios originais das imagens (Fase 7)
 *
 * O lobby le apenas manifest.json + preview.png de cada arquivo. Por isso abrir
 * a lista e barato mesmo com quadros grandes: o document.json, que e a parte
 * pesada, so e descompactado quando o quadro e realmente aberto.
 */
export const WBD_EXT = '.wbd';

export const WBD_ENTRY = {
  manifest: 'manifest.json',
  document: 'document.json',
  preview: 'preview.png',
  assetsDir: 'assets/',
} as const;

/** Metadados exibidos no lobby, sem carregar o documento inteiro. */
export interface BoardSummary {
  path: string;
  name: string;
  updatedAt: number;
  createdAt: number;
  /** Tamanho do arquivo em bytes. */
  bytes: number;
  objectCount: number;
  /** data: URL da miniatura, ou null se o arquivo nao tiver preview. */
  preview: string | null;
}

/** Binario de imagem gravado em assets/ dentro do container. */
export interface WbdAsset {
  id: string;
  mime: string;
  data: Uint8Array;
}

/** Payload que o renderer manda para o main gravar. */
export interface SaveBoardRequest {
  /** Caminho existente para sobrescrever, ou null para criar um novo. */
  path: string | null;
  name: string;
  document: WbdDocument;
  /** PNG da miniatura ja codificado. */
  preview: Uint8Array | null;
  /** Somente os assets referenciados por algum objeto. */
  assets: WbdAsset[];
}

export interface SaveBoardResult {
  path: string;
  name: string;
  updatedAt: number;
}

export interface LoadBoardResult {
  path: string;
  name: string;
  manifest: WbdManifest;
  document: WbdDocument;
  assets: WbdAsset[];
}

// Caracteres proibidos pelo Windows em nome de arquivo, escritos por codigo
// para nao depender de uma classe de regex cheia de escapes.
const FORBIDDEN = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*']);

// Nomes de dispositivo reservados: existem no sistema e nao podem virar arquivo.
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** Normaliza um nome digitado pelo usuario para um nome de arquivo valido. */
export function sanitizeBoardName(name: string): string {
  let out = '';
  for (const ch of name) {
    // Codigos abaixo de 32 sao caracteres de controle.
    if (FORBIDDEN.has(ch) || ch.charCodeAt(0) < 32) continue;
    out += ch;
  }

  const cleaned = out
    .replace(/\s+/g, ' ')
    .trim()
    // O Windows tambem rejeita nomes terminando em ponto ou espaco.
    .replace(/[. ]+$/, '');

  if (cleaned.length === 0 || RESERVED.test(cleaned)) return 'Quadro sem nome';
  return cleaned.slice(0, 120);
}
