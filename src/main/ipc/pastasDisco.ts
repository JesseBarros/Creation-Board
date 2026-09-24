import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { indiceVazio, lerIndice, nomeDeArquivoValido } from '@shared/pastas';
import type { IndicePastas } from '@shared/pastas';

/**
 * O indice de pastas em DISCO, sem o Electron.
 *
 * Separado do `pastas.ts` pelo mesmo motivo do `fundoValidacao.ts`: o que
 * importa do Electron so roda dentro do aplicativo, e o que so roda dentro do
 * aplicativo nao e exercitado por nenhum `check:*`. Aqui tudo recebe a pasta de
 * quadros como parametro, e o `check:pastas` roda estas funcoes numa pasta
 * temporaria de verdade -- com arquivo de verdade, rename de verdade e o
 * Windows de verdade no meio.
 *
 * NADA AQUI PODE IMPEDIR O LOBBY DE ABRIR. Ler devolve indice vazio em qualquer
 * erro, e a validacao de `shared/pastas.ts` tolera arquivo corrompido em vez de
 * lancar. O agrupamento vale menos que abrir.
 */

/**
 * Teto de tamanho do indice.
 *
 * Nomes de arquivo, nao conteudo: mil quadros com nome longo nao chegam perto
 * disto. Existe para um arquivo trocado ou inchado por engano morrer antes de
 * ser lido inteiro para a memoria -- mesma ideia do teto do `fundo.ts`, e pela
 * mesma razao: o arquivo vem de fora do nosso controle.
 */
export const MAX_BYTES = 2 * 1024 * 1024;

/**
 * O arquivo vive NA PASTA DOS QUADROS, e nao no `userData`, e isso e a decisao
 * 1 do ENGENHARIA.md: o que o aplicativo precisa para funcionar mora junto com
 * os quadros. Levar a pasta para outra maquina leva o agrupamento junto.
 * `.creation-board/` ja e inerte para o resto do app -- `listBoards` e
 * `readLibraryIndex` filtram `isFile()` e sufixo `.wbd`.
 */
export function caminhoDoIndice(pastaDeQuadros: string): string {
  return join(pastaDeQuadros, '.creation-board', 'pastas.json');
}

/**
 * LER NAO ESCREVE. Ate 24/09/2026 a leitura criava `.creation-board/` antes de
 * procurar o arquivo, e como o lobby le o indice toda vez que abre, a pasta
 * aparecia na pasta de quadros de todo mundo -- inclusive de quem nunca criou
 * pasta nenhuma. Achado pelo `check:pastas` rodando no disco.
 */
export async function lerIndiceDaPasta(pastaDeQuadros: string): Promise<IndicePastas> {
  const caminho = caminhoDoIndice(pastaDeQuadros);
  try {
    const info = await fs.stat(caminho);
    if (info.size > MAX_BYTES) return indiceVazio();
    return lerIndice(await fs.readFile(caminho, 'utf8'));
  } catch {
    // Arquivo ausente e o caso COMUM -- quem nunca criou pasta nao tem um --,
    // e por isso ele nao merece ruido no terminal nem erro no renderer.
    return indiceVazio();
  }
}

/**
 * As gravacoes, UMA DE CADA VEZ, na ordem em que foram pedidas.
 *
 * Todas passam pelo mesmo `pastas.json.tmp`. Duas ao mesmo tempo e a primeira
 * a renomear leva embora o temporario da outra, que falha com ENOENT -- o
 * `check:pastas` rodando no disco pos 25 de uma vez e 21 falharam. Na
 * interface e raro, porque os dialogos sao modais, mas nao e impossivel, e
 * quando acontece o usuario ve "nao foi possivel salvar as pastas".
 *
 * Fila, e nao um temporario com nome unico: com nome unico as gravacoes
 * deixariam de falhar, mas quem terminasse por ultimo ganharia -- e a ordem de
 * termino nao e a ordem dos cliques. Na fila, vale a ultima PEDIDA.
 */
let fila: Promise<unknown> = Promise.resolve();

export function gravarIndiceNaPasta(pastaDeQuadros: string, indice: unknown): Promise<void> {
  const vez = fila.then(() => gravarAgora(pastaDeQuadros, indice));
  // A fila anda mesmo quando uma gravacao falha: um disco cheio numa delas nao
  // pode travar todas as seguintes para sempre.
  fila = vez.catch(() => undefined);
  return vez;
}

async function gravarAgora(pastaDeQuadros: string, indice: unknown): Promise<void> {
  const limpo = higienizar(indice);
  const caminho = caminhoDoIndice(pastaDeQuadros);
  await fs.mkdir(join(pastaDeQuadros, '.creation-board'), { recursive: true });

  /*
    Grava num temporario e RENOMEIA por cima.

    `rename` dentro do mesmo volume e atomico: quem ler ou ve o arquivo
    antigo inteiro, ou o novo inteiro, nunca metade de cada. Escrever por
    cima direto tem uma janela em que o arquivo existe truncado -- e uma
    queda de energia ali deixaria o agrupamento destruido em vez de velho.

    O `.tmp` fica na MESMA pasta de propósito: `rename` entre volumes nao e
    atomico, e a pasta de quadros pode estar num disco diferente do temp do
    sistema.
  */
  const temp = `${caminho}.tmp`;
  await fs.writeFile(temp, JSON.stringify(limpo, null, 2), 'utf8');
  await fs.rename(temp, caminho);
}

/**
 * Passa pelo mesmo filtro da leitura antes de gravar.
 *
 * O renderer e nosso, mas a fronteira de IPC nao confia nele -- foi um `tema`
 * vindo do renderer que escapou da pasta em 21/09/2026 (ver `fundo.ts`).
 * Higienizar na entrada garante que um renderer comprometido nao consiga gravar
 * no indice um nome que aponte para fora, mesmo que ninguem mais valide depois.
 *
 * Serializa e desserializa porque `lerIndice` ja e o filtro completo, e ter
 * DOIS filtros seria ter dois lugares para divergirem.
 */
export function higienizar(indice: unknown): IndicePastas {
  try {
    const lido = lerIndice(JSON.stringify(indice));
    // Cinto e suspensorio: `lerIndice` ja descarta o que nao passa, e conferir
    // de novo aqui custa nada e documenta a invariante na saida.
    for (const p of lido.pastas) {
      if (!p.quadros.every((q) => nomeDeArquivoValido(q))) return indiceVazio();
    }
    return lido;
  } catch {
    // `JSON.stringify` lanca em estrutura circular, que e o que um renderer
    // comprometido mandaria para derrubar o handler.
    return indiceVazio();
  }
}
