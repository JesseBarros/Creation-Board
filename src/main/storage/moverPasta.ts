import { constants, promises as fs } from 'node:fs';
import { basename, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { caminhoDoIndice, gravarIndiceNaPasta, lerIndiceDaPasta } from '../ipc/pastasDisco';
import { juntarIndices } from '@shared/pastas';
import { t } from '@shared/i18n';

/**
 * TROCAR A PASTA DOS QUADROS, levando tudo junto (06/10/2026).
 *
 * O que mora na pasta de quadros e o que vai: os `.wbd`, o indice das pastas do
 * menu (`.creation-board/pastas.json`) e os fundos escolhidos
 * (`.creation-board/fundos/`). Nada mais e tocado -- outros arquivos que a
 * pessoa guarde ali ficam onde estao.
 *
 * TRES REGRAS, todas pela licao do B11 (a biblioteca partida em duas pastas, o
 * defeito mais grave deste projeto):
 *
 * 1. **MOVE, nunca copia.** Duas copias do mesmo quadro em duas pastas e
 *    exatamente o B11. Entre discos diferentes (onde `rename` nao funciona) a
 *    copia e conferida pelo tamanho antes de a original sair.
 * 2. **Nome repetido no destino RECUSA tudo, antes de mexer em qualquer coisa.**
 *    Renomear para "(2)" esconderia que ha duas versoes do mesmo quadro;
 *    sobrescrever perderia uma. Quem decide e a pessoa, com a lista na mao.
 * 3. **Ou vai tudo, ou nada.** Cada arquivo movido entra num diario; uma falha
 *    no meio devolve os ja movidos, na ordem inversa, e restaura o indice do
 *    destino. Uma mudanca pela metade seria a biblioteca partida de novo.
 *
 * Nao importa nada do Electron: e exercitado por `npm run check:mover-pasta`
 * em pastas temporarias de verdade.
 */

const WBD = '.wbd';
const META = '.creation-board';

const win = process.platform === 'win32';
const chave = (p: string): string => (win ? resolve(p).toLowerCase() : resolve(p));

export interface PlanoDeMudanca {
  origem: string;
  destino: string;
  /** Nomes dos `.wbd` que vao. */
  quadros: string[];
  /** Nomes que ja existem no destino: com algum, a mudanca e recusada. */
  conflitos: string[];
  /** A mudanca nao faz sentido: mesma pasta, ou uma dentro da outra. */
  problema: 'mesma' | 'dentro' | null;
}

export class MudancaRecusada extends Error {
  constructor(readonly plano: PlanoDeMudanca) {
    super(plano.problema ?? `conflitos: ${plano.conflitos.join(', ')}`);
  }
}

function problemaEntre(origem: string, destino: string): PlanoDeMudanca['problema'] {
  const a = chave(origem);
  const b = chave(destino);
  if (a === b) return 'mesma';
  const dentro = (pai: string, filho: string): boolean => {
    const rel = relative(pai, filho);
    return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
  };
  return dentro(a, b) || dentro(b, a) ? 'dentro' : null;
}

async function nomesDe(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir);
  } catch {
    return [];
  }
}

/** So arquivos `.wbd` de verdade (uma PASTA chamada `x.wbd` nao e quadro). */
async function quadrosEm(dir: string): Promise<string[]> {
  const nomes = (await nomesDe(dir)).filter((n) => n.toLowerCase().endsWith(WBD));
  const arquivos: string[] = [];
  for (const n of nomes) {
    const st = await fs.stat(join(dir, n)).catch(() => null);
    if (st?.isFile()) arquivos.push(n);
  }
  return arquivos.sort();
}

export async function planejarMudanca(origem: string, destino: string): Promise<PlanoDeMudanca> {
  const problema = problemaEntre(origem, destino);
  const quadros = problema ? [] : await quadrosEm(origem);
  const noDestino = new Set((await nomesDe(destino)).map((n) => n.toLowerCase()));
  const conflitos = quadros.filter((q) => noDestino.has(q.toLowerCase()));
  return { origem, destino, quadros, conflitos, problema };
}

/** Move um arquivo sem nunca sobrescrever. Entre discos, copia, confere e apaga. */
async function moverArquivo(de: string, para: string): Promise<void> {
  // `rename` no Windows SUBSTITUI o destino. A conferencia fica colada no
  // movimento, e nao so no plano: entre os dois alguem pode ter criado o arquivo.
  if (await fs.access(para).then(() => true, () => false)) {
    throw new Error(t('erro.moverJaExiste', para));
  }
  try {
    await fs.rename(de, para);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err;
    await fs.copyFile(de, para, constants.COPYFILE_EXCL);
    const [a, b] = await Promise.all([fs.stat(de), fs.stat(para)]);
    if (a.size !== b.size) {
      await fs.unlink(para).catch(() => undefined);
      throw new Error(t('erro.moverCopiaIncompleta', para));
    }
    await fs.unlink(de);
  }
}

/** Um nome livre dentro de `dir`, no padrao "nome (2).ext". */
async function livreEm(dir: string, nome: string): Promise<string> {
  const ext = extname(nome);
  const base = basename(nome, ext);
  let candidato = join(dir, nome);
  for (let n = 2; await fs.access(candidato).then(() => true, () => false); n++) {
    candidato = join(dir, `${base} (${n})${ext}`);
  }
  return candidato;
}

/**
 * Faz a mudanca. Devolve quantos quadros foram. Lanca `MudancaRecusada` quando
 * o plano nao permite, sem ter tocado em nada.
 */
export async function moverPasta(origem: string, destino: string): Promise<{ movidos: number }> {
  const plano = await planejarMudanca(origem, destino);
  if (plano.problema || plano.conflitos.length > 0) throw new MudancaRecusada(plano);

  await fs.mkdir(destino, { recursive: true });
  const diario: Array<{ de: string; para: string }> = [];
  const mover = async (de: string, para: string): Promise<void> => {
    await moverArquivo(de, para);
    diario.push({ de, para });
  };

  // O indice do destino como estava, para a volta. `null` = nao existia.
  const indiceDoDestino = caminhoDoIndice(destino);
  const indiceAntes = await fs.readFile(indiceDoDestino, 'utf8').catch(() => null);

  try {
    for (const q of plano.quadros) await mover(join(origem, q), join(destino, q));

    // FUNDOS: o da origem e o que a pessoa ve hoje, entao ele vale. Um fundo do
    // mesmo tema que ja estivesse no destino nao e apagado -- vai para
    // `fundos/anteriores/`, fora do caminho do app.
    const fundosDe = join(origem, META, 'fundos');
    const fundosPara = join(destino, META, 'fundos');
    const daOrigem = (await nomesDe(fundosDe)).filter((n) => n.startsWith('fundo-'));
    if (daOrigem.length > 0) {
      await fs.mkdir(fundosPara, { recursive: true });
      for (const f of daOrigem) {
        const tema = f.slice(0, f.indexOf('.'));
        for (const existente of (await nomesDe(fundosPara)).filter((n) => n.startsWith(`${tema}.`))) {
          const anteriores = join(fundosPara, 'anteriores');
          await fs.mkdir(anteriores, { recursive: true });
          await mover(join(fundosPara, existente), await livreEm(anteriores, existente));
        }
        await mover(join(fundosDe, f), join(fundosPara, f));
      }
    }

    // INDICE: o do destino com as pastas da origem somadas. Gravado ANTES de o
    // da origem sair: ate aqui, a origem continua sendo a verdade.
    // Sem indice nos dois lados, nada a gravar: criar um vazio poria
    // `.creation-board/` na pasta de quem nunca usou pastas.
    const indiceDaOrigem = await fs.access(caminhoDoIndice(origem)).then(() => true, () => false);
    if (indiceDaOrigem || indiceAntes !== null) {
      const juntos = juntarIndices(await lerIndiceDaPasta(destino), await lerIndiceDaPasta(origem));
      await gravarIndiceNaPasta(destino, juntos);
      await fs.unlink(caminhoDoIndice(origem)).catch(() => undefined);
    }
  } catch (err) {
    // A VOLTA: na ordem inversa, cada um para onde estava.
    for (const { de, para } of diario.reverse()) {
      await moverArquivo(para, de).catch(() => undefined);
    }
    if (indiceAntes === null) await fs.unlink(indiceDoDestino).catch(() => undefined);
    else await fs.writeFile(indiceDoDestino, indiceAntes, 'utf8').catch(() => undefined);
    throw err;
  }

  // Arrumacao: a estrutura do app na origem some se ficou vazia (`rmdir` recusa
  // pasta com conteudo). A pasta de origem em si fica -- e da pessoa.
  await fs.rmdir(join(origem, META, 'fundos')).catch(() => undefined);
  await fs.rmdir(join(origem, META)).catch(() => undefined);
  return { movidos: plano.quadros.length };
}
