import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc-contract';
import { indiceVazio, VERSAO_INDICE } from '@shared/pastas';
import type { IndicePastas } from '@shared/pastas';
import { ensureBoardsDir } from '../storage/wbdFile';
import { gravarIndiceNaPasta, lerIndiceDaPasta } from './pastasDisco';

/**
 * O indice de pastas, exposto ao renderer.
 *
 * Duas operacoes, e o main nao sabe o que e "criar pasta" nem "mover quadro":
 * essas sao decisoes de interface, e cada uma que ele conhecesse seria uma regra
 * a mais para manter em dois lugares. Ele le e grava o arquivo inteiro.
 *
 * Este arquivo so liga os canais. O que toca o disco mora em `pastasDisco.ts`,
 * que nao importa o Electron -- e e por isso que o `check:pastas` consegue
 * exercita-lo numa pasta de verdade.
 */
export function registerPastasIpc(): void {
  ipcMain.handle(IPC.pastasLer, async (): Promise<IndicePastas> => {
    // A pasta de quadros pode nao resolver (sem permissao, disco fora). Ler
    // o indice nao e o lugar de avisar isso -- o `listBoards` avisa --, e
    // aqui a regra continua: ler nunca derruba o lobby.
    let dir: string;
    try {
      dir = await ensureBoardsDir();
    } catch {
      return indiceVazio();
    }
    return lerIndiceDaPasta(dir);
  });

  ipcMain.handle(IPC.pastasGravar, async (_e, indice: unknown): Promise<void> => {
    await gravarIndiceNaPasta(await ensureBoardsDir(), indice);
  });
}

export { VERSAO_INDICE };
