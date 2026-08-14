import { promises as fs } from 'node:fs';
import { basename, join } from 'node:path';
import { unzip, type Unzipped } from 'fflate';
import { WBD_ENTRY, WBD_EXT } from '@shared/wbd';
import type { WbdDocument } from '@shared/model/document';
import type { LibraryBoard, LibraryEntry, LibraryIndex } from '@shared/librarySearch';
import { ensureBoardsDir } from './wbdFile';

/**
 * Le o texto buscavel de TODOS os quadros da biblioteca.
 *
 * ## Por que ler tudo, e nao manter um indice
 *
 * Medido na biblioteca real dele em 14/08/2026, antes de escrever este arquivo:
 *
 * | Quadro | Arquivo | document.json | Custo |
 * |---|---|---|---|
 * | Continuacao cybersec | 1,58 MB | 459 KB | 26 ms |
 * | CURSO 5 | 0,33 MB | 68 KB | 5 ms |
 * | Cybersec resumao | 4,75 MB | 2.528 KB | 37 ms |
 * | **Total** | | | **68 ms** |
 *
 * Sessenta e oito milissegundos para a biblioteca inteira. Um indice guardado em
 * disco precisaria ser mantido a cada salvamento, a cada importacao e a cada
 * apagamento -- e ficaria errado no dia em que alguem copiasse um `.wbd` para a
 * pasta pela mao. Ler na hora nunca fica velho.
 *
 * **O custo cresce junto com a biblioteca**, e isso e o que vale vigiar: com 100
 * quadros do tamanho do maior dele seriam ~2 s. Quando (e se) incomodar, a saida
 * ja esta desenhada -- gravar o texto pronto numa entrada propria do `.wbd`, que
 * seria lida sem descompactar o `document.json`. Nao vale complicar antes disso.
 *
 * ## Por que so o `document.json`
 *
 * O filtro do `unzip` derruba `preview.png` e a pasta `assets/` **antes** de
 * descompactar: no maior quadro dele, isso e a diferenca entre tocar 2,5 MB e
 * tocar 4,75 MB. O texto do OCR das imagens ja esta dentro do documento (Fase
 * 7.5), entao nada se perde.
 */

const decoder = new TextDecoder('utf-8');

function unzipAsync(data: Uint8Array, filter: (name: string) => boolean): Promise<Unzipped> {
  return new Promise((resolve, reject) => {
    unzip(data, { filter: (f) => filter(f.name) }, (err, out) => (err ? reject(err) : resolve(out)));
  });
}

export async function readLibraryIndex(): Promise<LibraryIndex> {
  const inicio = Date.now();
  const dir = await ensureBoardsDir();
  const entries = await fs.readdir(dir, { withFileTypes: true });

  const lidos = await Promise.all(
    entries
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(WBD_EXT))
      .map((e) => lerQuadro(join(dir, e.name), basename(e.name, WBD_EXT))),
  );

  const boards = lidos.filter((b): b is LibraryBoard => b !== null);
  // Mais recente primeiro: e a ordem em que ele reconhece os proprios quadros,
  // e a mesma do lobby.
  boards.sort((a, b) => b.updatedAt - a.updatedAt);

  return { boards, ms: Date.now() - inicio, falhas: lidos.length - boards.length };
}

async function lerQuadro(path: string, name: string): Promise<LibraryBoard | null> {
  try {
    const [raw, stat] = await Promise.all([fs.readFile(path), fs.stat(path)]);
    const out = await unzipAsync(raw, (n) => n === WBD_ENTRY.document);
    const bytes = out[WBD_ENTRY.document];
    if (!bytes) return null;

    const doc = JSON.parse(decoder.decode(bytes)) as WbdDocument;
    return {
      path,
      name,
      updatedAt: stat.mtimeMs,
      entries: extrairTexto(doc),
    };
  } catch {
    // Um quadro corrompido ou aberto por outro programa nao pode derrubar a
    // busca nos demais -- mesma regra da listagem do lobby.
    return null;
  }
}

/**
 * Junta o que e buscavel num quadro.
 *
 * A lista de tipos e a MESMA de `features/search/search.ts`, e precisa continuar
 * sendo: um texto que o `Ctrl+F` acha dentro do quadro e nao aparece na busca da
 * biblioteca faria a segunda parecer quebrada.
 */
function extrairTexto(doc: WbdDocument): LibraryEntry[] {
  const out: LibraryEntry[] = [];
  for (const obj of doc.objects ?? []) {
    if (obj.type === 'text' || obj.type === 'note') {
      let texto = '';
      for (const span of obj.content ?? []) texto += span.text ?? '';
      if (texto.trim().length > 0) out.push({ id: obj.id, kind: obj.type, text: texto });
    } else if (obj.type === 'image' && obj.ocr && obj.ocr.length > 0) {
      out.push({ id: obj.id, kind: 'image', text: obj.ocr });
    }
    if (obj.name && obj.name.length > 0) {
      out.push({ id: obj.id, kind: 'name', text: obj.name });
    }
  }
  return out;
}
