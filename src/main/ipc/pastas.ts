import { ipcMain } from 'electron';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { IPC } from '@shared/ipc-contract';
import { indiceVazio, lerIndice, nomeDeArquivoValido, VERSAO_INDICE } from '@shared/pastas';
import type { IndicePastas } from '@shared/pastas';
import { ensureBoardsDir } from '../storage/wbdFile';

/**
 * O indice de pastas em disco.
 *
 * Duas operacoes, e o main nao sabe o que e "criar pasta" nem "mover quadro":
 * essas sao decisoes de interface, e cada uma que ele conhecesse seria uma regra
 * a mais para manter em dois lugares. Ele le e grava o arquivo inteiro.
 *
 * O ARQUIVO VIVE NA PASTA DOS QUADROS, e nao no `userData`, e isso e a decisao
 * 1 do ENGENHARIA.md: o que o aplicativo precisa para funcionar mora junto com
 * os quadros. Levar a pasta para outra maquina leva o agrupamento junto.
 * `.creation-board/` ja e inerte para o resto do app -- `listBoards` e
 * `readLibraryIndex` filtram `isFile()` e sufixo `.wbd`.
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
const MAX_BYTES = 2 * 1024 * 1024;

export function registerPastasIpc(): void {
  ipcMain.handle(IPC.pastasLer, async (): Promise<IndicePastas> => {
    try {
      const caminho = await arquivo();
      const info = await fs.stat(caminho);
      if (info.size > MAX_BYTES) return indiceVazio();
      return lerIndice(await fs.readFile(caminho, 'utf8'));
    } catch {
      // Arquivo ausente e o caso COMUM -- quem nunca criou pasta nao tem um --,
      // e por isso ele nao merece ruido no terminal nem erro no renderer.
      return indiceVazio();
    }
  });

  ipcMain.handle(IPC.pastasGravar, async (_e, indice: unknown): Promise<void> => {
    const limpo = higienizar(indice);
    const caminho = await arquivo();

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
  });
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
function higienizar(indice: unknown): IndicePastas {
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

async function arquivo(): Promise<string> {
  const dir = join(await ensureBoardsDir(), '.creation-board');
  await fs.mkdir(dir, { recursive: true });
  return join(dir, 'pastas.json');
}

export { VERSAO_INDICE };
