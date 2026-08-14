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
 * Fica na raiz do disco do sistema, e NAO em Documentos, de proposito: em muitas
 * instalacoes do Windows a pasta Documentos esta redirecionada para o OneDrive, e
 * salvar la faria todo quadro sincronizar para a nuvem -- o oposto do que o app
 * se propoe a ser. Aqui o arquivo nao sai da maquina; sincronizar e uma decisao
 * manual (copiar o .wbd para onde quiser).
 */
const DIR_NAME = 'Creation Board';

/**
 * Nomes que a pasta dos quadros JA TEVE, do mais recente para o mais antigo.
 *
 * Cada renomeacao do app deixou quadros para tras num nome antigo, e a lista e o
 * que os traz de volta. Ela cresce por acrescimo no comeco, nunca por
 * substituicao: apagar uma entrada daqui e apagar o caminho de volta dos quadros
 * de quem pulou uma versao.
 *
 *  - `Resumos-quadrobranco` na raiz do disco -- ate 14/08/2026, quando o nome
 *    provisorio do projeto saiu do que o usuario ve.
 *  - `Documentos\QuadroBranco` -- as primeiras versoes, antes de a pasta sair de
 *    Documentos por causa do OneDrive.
 */
const LEGACY_DIRS: ReadonlyArray<() => string> = [
  () => join(process.env['SystemDrive'] ?? 'C:', '\\', 'Resumos-quadrobranco'),
  () => join(app.getPath('home'), 'Resumos-quadrobranco'),
  () => join(app.getPath('documents'), 'QuadroBranco'),
];

/**
 * QB_BOARDS=<caminho> troca a pasta dos quadros.
 *
 * Existe para testar com uma biblioteca VAZIA sem apagar a de verdade. A
 * pergunta "o problema vem do conteudo salvo?" so se responde tirando o
 * conteudo do caminho -- e tirar do caminho nao precisa significar destruir
 * 6,6 MB de resumo. O app nunca sabe a diferenca: e a mesma pasta, noutro
 * lugar.
 *
 * So em desenvolvimento. No app empacotado a variavel e ignorada, para nao
 * existir jeito de um atalho mal feito apontar os quadros de alguem para o
 * lugar errado.
 */
function overrideDir(): string | null {
  const custom = process.env['QB_BOARDS'];
  return custom && !app.isPackaged ? custom : null;
}

let resolvedDir: string | null = null;
let resolvendo: Promise<string> | null = null;

/** Caminho ja resolvido. Chame ensureBoardsDir() antes de depender disto. */
export function boardsDir(): string {
  return resolvedDir ?? overrideDir() ?? join(process.env['SystemDrive'] ?? 'C:', '\\', DIR_NAME);
}

/**
 * Testa se da para ESCREVER na pasta -- `mkdir` pode passar e a escrita nao,
 * quando politica de grupo ou ACL customizada bloqueiam.
 *
 * O nome do arquivo de prova carrega o PID e um sufixo aleatorio, e isso nao e
 * capricho: com um nome fixo, dois processos do app sondando a mesma pasta ao
 * mesmo tempo apagam o arquivo um do outro. Medido em 08/08/2026 -- um processo
 * sozinho falha 0 em 300 tentativas, dois processos falham 120 e 144 em 300,
 * com ENOENT e EPERM. Era o B11: a sonda dizia "esta pasta nao aceita escrita"
 * sobre uma pasta perfeitamente gravavel, e a biblioteca do usuario se partia em
 * duas. Em desenvolvimento isso acontece toda vez que o electron-vite reinicia o
 * processo principal, porque o velho ainda nao morreu quando o novo ja sonda.
 */
async function podeEscrever(dir: string): Promise<true | string> {
  const probe = join(dir, `.escrita-ok-${process.pid}-${Math.random().toString(36).slice(2, 8)}`);
  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(probe, '');
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code ?? String(err);
  } finally {
    // Sempre limpa, inclusive quando a escrita passou e o resto falhou. Falhar
    // aqui nao muda o veredito: o que importava era conseguir escrever.
    await fs.unlink(probe).catch(() => {});
  }
}

/** Ha quadros salvos nesta pasta? */
async function temQuadros(dir: string): Promise<boolean> {
  try {
    const nomes = await fs.readdir(dir);
    return nomes.some((n) => n.toLowerCase().endsWith(WBD_EXT));
  } catch {
    return false;
  }
}

/**
 * A resolucao roda UMA vez por processo, e o que se guarda e a PROMESSA, nao o
 * resultado: guardar so o resultado deixa a porta aberta para duas chamadas
 * concorrentes entrarem juntas antes da primeira terminar, e cada uma sondar a
 * pasta por conta propria. Com a sonda de nome fixo, isso era metade do B11.
 */
export function ensureBoardsDir(): Promise<string> {
  if (resolvedDir) return Promise.resolve(resolvedDir);
  resolvendo ??= resolverDir().then(
    (dir) => {
      resolvedDir = dir;
      return dir;
    },
    (err) => {
      // Deixa tentar de novo na proxima chamada: um erro guardado para sempre
      // transformaria uma falha temporaria em app inutilizavel ate reiniciar.
      resolvendo = null;
      throw err;
    },
  );
  return resolvendo;
}

async function resolverDir(): Promise<string> {
  const custom = overrideDir();
  if (custom) {
    await fs.mkdir(custom, { recursive: true });
    // Sem migracao: puxar os quadros antigos para ca desfaria o proposito de
    // comecar vazio.
    console.log(`[boards] pasta trocada por QB_BOARDS: ${custom}`);
    return custom;
  }

  const primary = join(process.env['SystemDrive'] ?? 'C:', '\\', DIR_NAME);
  const fallback = join(app.getPath('home'), DIR_NAME);

  let escolhida: string;
  const veredito = await podeEscrever(primary);
  if (veredito === true) {
    escolhida = primary;
  } else {
    // Cair para outra pasta CALADO foi o B11: o usuario ficava com metade dos
    // quadros invisiveis e nenhuma pista do porque. Se a pasta principal ja tem
    // quadros, mudar de pasta e a pior saida possivel -- some com o trabalho que
    // esta la. Melhor falhar alto.
    if (await temQuadros(primary)) {
      throw new Error(
        `A pasta de quadros "${primary}" existe e tem quadros salvos, mas nao aceitou ` +
          `escrita (${veredito}). Os quadros NAO foram movidos: corrija a permissao da ` +
          `pasta em vez de deixar o app gravar em outro lugar.`,
      );
    }

    console.warn(`[boards] "${primary}" recusou escrita (${veredito}); tentando "${fallback}"`);
    const alternativo = await podeEscrever(fallback);
    if (alternativo !== true) {
      throw new Error(
        `Nao foi possivel gravar a pasta de quadros em "${primary}" (${veredito}) ` +
          `nem em "${fallback}" (${alternativo}).`,
      );
    }
    escolhida = fallback;
  }

  // Sempre no terminal, e nao so quando algo foge do padrao: "em que pasta o app
  // esta gravando" foi a pergunta que faltou responder durante o B8 inteiro, e a
  // falta dela levou a um diagnostico errado que ficou dias no BUGS.md.
  console.log(`[boards] pasta: ${escolhida}`);
  if (escolhida === fallback) {
    console.warn(`[boards] ATENCAO: usando a pasta alternativa, e nao "${primary}".`);
  }

  await migrateLegacyBoards(escolhida);
  return escolhida;
}

/**
 * Traz para a pasta atual os quadros deixados nos nomes antigos.
 *
 * Roda a cada abertura e e silenciosa quando nao ha o que fazer: falhar a
 * migracao nao pode impedir o app de abrir.
 *
 * **Move, e nao copia.** Duas copias do mesmo quadro em pastas diferentes foi
 * literalmente o B11 -- o item mais grave que este projeto teve --, e a licao
 * dele e que biblioteca dividida e pior que biblioteca mudada de lugar.
 *
 * **Nada e apagado.** Um arquivo que nao seja `.wbd` fica onde esta, e a pasta
 * antiga so some se tiver ficado vazia sozinha (`rmdir`, que recusa pasta com
 * conteudo). Subpastas como `_exports-originais` continuam la, e isso e
 * deliberado: sao os arquivos de origem do usuario, e mexer neles nao e assunto
 * de uma migracao de nome.
 */
async function migrateLegacyBoards(target: string): Promise<void> {
  for (const resolver of LEGACY_DIRS) {
    let legacy: string;
    try {
      legacy = resolver();
    } catch {
      continue;
    }
    if (legacy === target) continue;

    let entries: string[];
    try {
      entries = await fs.readdir(legacy);
    } catch {
      continue; // pasta antiga nao existe: nada a fazer
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

    if (moved > 0) {
      console.log(`[storage] ${moved} quadro(s) migrado(s) de "${legacy}" para "${target}"`);
    }
    // Remove a pasta antiga apenas se ela ficou vazia.
    await fs.rmdir(legacy).catch(() => undefined);
  }
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
