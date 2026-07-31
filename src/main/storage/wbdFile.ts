import { app } from 'electron';
import { promises as fs } from 'node:fs';
import { basename, join } from 'node:path';
import { unzip, zip, type Unzipped, type Zippable } from 'fflate';
import {
  WBD_ENTRY,
  WBD_EXT,
  sanitizeBoardName,
  type BoardSummary,
  type LoadBoardResult,
  type SaveBoardRequest,
  type SaveBoardResult,
  type WbdAsset,
} from '@shared/wbd';
import { WBD_SCHEMA_VERSION, type WbdDocument, type WbdManifest } from '@shared/model/document';

/**
 * Leitura e escrita dos arquivos .wbd.
 *
 * Toda compactacao usa a API assincrona do fflate, que joga o trabalho em worker
 * threads. A versao sincrona bloquearia o processo principal, e com ela a janela
 * inteira congelaria durante o salvamento de um quadro grande.
 */

/**
 * Pasta dos quadros.
 *
 * Fica na raiz do disco do sistema, e NAO em Documentos, de proposito: a pasta
 * Documentos deste usuario esta redirecionada para o OneDrive, e salvar la faria
 * todo quadro sincronizar para a nuvem -- o oposto do que o app se propoe a ser.
 * Aqui o arquivo nao sai da maquina; sincronizar e uma decisao manual (copiar o
 * .wbd para onde quiser).
 */
const DIR_NAME = 'Resumos-quadrobranco';

let resolvedDir: string | null = null;

/** Caminho ja resolvido. Chame ensureBoardsDir() antes de depender disto. */
export function boardsDir(): string {
  return resolvedDir ?? join(process.env['SystemDrive'] ?? 'C:', '\\', DIR_NAME);
}

export async function ensureBoardsDir(): Promise<string> {
  if (resolvedDir) return resolvedDir;

  const primary = join(process.env['SystemDrive'] ?? 'C:', '\\', DIR_NAME);
  const fallback = join(app.getPath('home'), DIR_NAME);

  // A raiz de C: normalmente permite que um usuario comum crie pastas, mas nem
  // toda maquina: politica de grupo ou ACL customizada podem bloquear. Testamos
  // criando e removendo um arquivo, porque `mkdir` pode passar e a escrita nao.
  for (const candidate of [primary, fallback]) {
    try {
      await fs.mkdir(candidate, { recursive: true });
      const probe = join(candidate, '.escrita-ok');
      await fs.writeFile(probe, '');
      await fs.unlink(probe);
      resolvedDir = candidate;
      break;
    } catch {
      // tenta o proximo
    }
  }

  if (!resolvedDir) {
    throw new Error(
      `Nao foi possivel criar a pasta de quadros em "${primary}" nem em "${fallback}".`,
    );
  }

  await migrateLegacyBoards(resolvedDir);
  return resolvedDir;
}

/**
 * Move quadros salvos por versoes anteriores, que usavam Documentos.
 * Roda uma vez e e silenciosa: falhar a migracao nao pode impedir o app de abrir.
 */
async function migrateLegacyBoards(target: string): Promise<void> {
  // Nome antigo de proposito: e onde as versoes anteriores gravaram de verdade.
  // Renomear junto com o app faria a migracao procurar uma pasta que nunca
  // existiu, e os quadros dessas versoes ficariam para tras.
  const legacy = join(app.getPath('documents'), 'QuadroBranco');
  if (legacy === target) return;

  let entries: string[];
  try {
    entries = await fs.readdir(legacy);
  } catch {
    return; // pasta antiga nao existe: nada a fazer
  }

  let moved = 0;
  for (const name of entries) {
    if (!name.toLowerCase().endsWith(WBD_EXT)) continue;
    try {
      const from = join(legacy, name);
      const to = await uniquePath(target, basename(name, WBD_EXT));
      await fs.rename(from, to);
      moved++;
    } catch {
      // Um arquivo travado nao pode abortar a migracao dos outros.
    }
  }

  if (moved > 0) console.log(`[storage] ${moved} quadro(s) migrado(s) de "${legacy}" para "${target}"`);
  // Remove a pasta antiga apenas se ela ficou vazia.
  await fs.rmdir(legacy).catch(() => undefined);
}

function zipAsync(files: Zippable): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    // Nivel 6: o JSON do documento comprime muito bem e o ganho do nivel 9 nao
    // paga o tempo extra num salvamento interativo.
    zip(files, { level: 6 }, (err, data) => (err ? reject(err) : resolve(data)));
  });
}

function unzipAsync(data: Uint8Array, filter?: (name: string) => boolean): Promise<Unzipped> {
  return new Promise((resolve, reject) => {
    unzip(
      data,
      { filter: filter ? (f) => filter(f.name) : undefined },
      (err, out) => (err ? reject(err) : resolve(out)),
    );
  });
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Gera um caminho livre, acrescentando " (2)", " (3)"... se ja existir. */
async function uniquePath(dir: string, name: string): Promise<string> {
  let candidate = join(dir, name + WBD_EXT);
  let n = 2;
  for (;;) {
    try {
      await fs.access(candidate);
      candidate = join(dir, `${name} (${n})${WBD_EXT}`);
      n++;
    } catch {
      return candidate;
    }
  }
}

export async function saveBoard(req: SaveBoardRequest): Promise<SaveBoardResult> {
  const dir = await ensureBoardsDir();
  const name = sanitizeBoardName(req.name);
  const now = Date.now();

  const path = req.path ?? (await uniquePath(dir, name));

  const manifest: WbdManifest = {
    schemaVersion: WBD_SCHEMA_VERSION,
    app: 'Creation Board',
    appVersion: app.getVersion(),
    createdAt: now,
    updatedAt: now,
    objectCount: req.document.objects.length,
  };

  // Preserva o createdAt original ao sobrescrever um arquivo existente.
  if (req.path) {
    const previous = await readManifest(req.path).catch(() => null);
    if (previous) manifest.createdAt = previous.createdAt;
  }

  const files: Zippable = {
    [WBD_ENTRY.manifest]: encoder.encode(JSON.stringify(manifest)),
    [WBD_ENTRY.document]: encoder.encode(JSON.stringify(req.document)),
  };
  if (req.preview) {
    // O PNG ja esta comprimido; recomprimir so gastaria CPU sem reduzir nada.
    files[WBD_ENTRY.preview] = [req.preview, { level: 0 }];
  }

  for (const asset of req.assets ?? []) {
    // Mesma razao: PNG e JPEG ja vem comprimidos. SVG e texto e vale comprimir.
    const level = asset.mime.includes('svg') ? 6 : 0;
    files[WBD_ENTRY.assetsDir + asset.id] = [new Uint8Array(asset.data), { level }];
  }

  const bytes = await zipAsync(files);

  // Grava num temporario e renomeia. Um crash no meio da escrita destruiria o
  // arquivo anterior se escrevessemos por cima dele direto.
  const tmp = `${path}.tmp`;
  await fs.writeFile(tmp, bytes);
  await fs.rename(tmp, path);

  return { path, name: basename(path, WBD_EXT), updatedAt: manifest.updatedAt };
}

async function readManifest(path: string): Promise<WbdManifest> {
  const raw = await fs.readFile(path);
  const out = await unzipAsync(raw, (n) => n === WBD_ENTRY.manifest);
  const entry = out[WBD_ENTRY.manifest];
  if (!entry) throw new Error('manifest.json ausente');
  return JSON.parse(decoder.decode(entry)) as WbdManifest;
}

export async function loadBoard(path: string): Promise<LoadBoardResult> {
  const raw = await fs.readFile(path);
  const out = await unzipAsync(
    raw,
    (n) =>
      n === WBD_ENTRY.manifest ||
      n === WBD_ENTRY.document ||
      n.startsWith(WBD_ENTRY.assetsDir),
  );

  const manifestEntry = out[WBD_ENTRY.manifest];
  const documentEntry = out[WBD_ENTRY.document];
  if (!manifestEntry || !documentEntry) {
    throw new Error('Arquivo .wbd invalido: entradas obrigatorias ausentes');
  }

  const manifest = JSON.parse(decoder.decode(manifestEntry)) as WbdManifest;
  const document = JSON.parse(decoder.decode(documentEntry)) as WbdDocument;

  if (manifest.schemaVersion > WBD_SCHEMA_VERSION) {
    throw new Error(
      `Este quadro foi salvo por uma versao mais nova do Creation Board ` +
        `(formato ${manifest.schemaVersion}, esta versao le ate ${WBD_SCHEMA_VERSION}).`,
    );
  }

  const assets: WbdAsset[] = [];
  for (const [entryName, data] of Object.entries(out)) {
    if (!entryName.startsWith(WBD_ENTRY.assetsDir)) continue;
    const id = entryName.slice(WBD_ENTRY.assetsDir.length);
    assets.push({ id, mime: document.assets[id]?.mime ?? 'image/png', data });
  }

  return { path, name: basename(path, WBD_EXT), manifest, document, assets };
}

/**
 * Lista os quadros salvos.
 *
 * Le so manifest.json e preview.png de cada arquivo -- o document.json, que
 * carrega todos os objetos, fica compactado no disco. Sem isso, abrir o lobby
 * com dez quadros grandes significaria desserializar dezenas de MB de JSON.
 */
export async function listBoards(): Promise<BoardSummary[]> {
  const dir = await ensureBoardsDir();
  const entries = await fs.readdir(dir, { withFileTypes: true });

  const summaries = await Promise.all(
    entries
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(WBD_EXT))
      .map(async (e): Promise<BoardSummary | null> => {
        const path = join(dir, e.name);
        try {
          const [raw, stat] = await Promise.all([fs.readFile(path), fs.stat(path)]);
          const out = await unzipAsync(
            raw,
            (n) => n === WBD_ENTRY.manifest || n === WBD_ENTRY.preview,
          );

          const manifestEntry = out[WBD_ENTRY.manifest];
          if (!manifestEntry) return null;
          const manifest = JSON.parse(decoder.decode(manifestEntry)) as WbdManifest;

          const previewEntry = out[WBD_ENTRY.preview];
          const preview = previewEntry
            ? `data:image/png;base64,${Buffer.from(previewEntry).toString('base64')}`
            : null;

          return {
            path,
            name: basename(e.name, WBD_EXT),
            createdAt: manifest.createdAt,
            updatedAt: manifest.updatedAt,
            bytes: stat.size,
            objectCount: manifest.objectCount ?? 0,
            preview,
          };
        } catch {
          // Um arquivo corrompido nao pode derrubar a listagem inteira.
          return null;
        }
      }),
  );

  return summaries
    .filter((s): s is BoardSummary => s !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteBoard(path: string): Promise<void> {
  // Confere que o alvo esta mesmo na pasta de quadros: o caminho vem do
  // renderer, e apagar arquivo arbitrario a pedido dele seria imprudente.
  const dir = await ensureBoardsDir();
  const normalized = join(path);
  if (!normalized.startsWith(dir) || !normalized.toLowerCase().endsWith(WBD_EXT)) {
    throw new Error('Caminho fora da pasta de quadros');
  }
  await fs.unlink(normalized);
}
