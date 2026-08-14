import { ipcMain } from 'electron';
import { IPC } from '@shared/ipc-contract';
import type { OcrItem, OcrReport } from '@shared/ocr';
import { recognize } from '../ocr/windowsOcr';

/**
 * Ponte do OCR.
 *
 * Uma chamada por LOTE, e nao por imagem: o custo do motor esta na partida do
 * processo, e paga-la por imagem multiplicaria por 36 o que hoje custa uma vez
 * so (ver `ocr/windowsOcr.ts`).
 *
 * As chamadas sao **serializadas** aqui. Sem isso, abrir um quadro e trocar de
 * quadro rapidamente levantaria dois PowerShell ao mesmo tempo, competindo pela
 * mesma CPU para fazer trabalho que um deles vai jogar fora.
 */
let fila: Promise<unknown> = Promise.resolve();

export function registerOcrIpc(): void {
  ipcMain.handle(IPC.ocrRecognize, async (_e, items: OcrItem[]): Promise<OcrReport> => {
    const proxima = fila.then(() => recognize(items));
    // A fila nao pode morrer com uma falha: um lote que der erro deixaria todos
    // os seguintes pendurados.
    fila = proxima.catch(() => undefined);
    return proxima;
  });
}
