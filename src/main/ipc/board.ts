import { ipcMain, shell } from 'electron';
import { IPC } from '@shared/ipc-contract';
import type {
  BoardSummary,
  LoadBoardResult,
  SaveBoardRequest,
  SaveBoardResult,
} from '@shared/wbd';
import {
  boardsDir,
  deleteBoard,
  ensureBoardsDir,
  listBoards,
  loadBoard,
  saveBoard,
} from '../storage/wbdFile';
import { readLibraryIndex } from '../storage/libraryIndex';
import type { LibraryIndex } from '@shared/librarySearch';

export function registerBoardIpc(): void {
  ipcMain.handle(IPC.boardSave, (_e, req: SaveBoardRequest): Promise<SaveBoardResult> => {
    // O preview chega como ArrayBuffer pelo canal estruturado; normaliza aqui.
    const preview = req.preview ? new Uint8Array(req.preview) : null;
    return saveBoard({ ...req, preview });
  });

  ipcMain.handle(IPC.boardList, (): Promise<BoardSummary[]> => listBoards());

  ipcMain.handle(IPC.boardSearchIndex, (): Promise<LibraryIndex> => readLibraryIndex());

  ipcMain.handle(IPC.boardLoad, (_e, path: string): Promise<LoadBoardResult> => loadBoard(path));

  ipcMain.handle(IPC.boardDelete, (_e, path: string): Promise<void> => deleteBoard(path));

  ipcMain.handle(IPC.boardFolder, async (): Promise<string> => {
    const dir = await ensureBoardsDir();
    return dir;
  });

  ipcMain.handle(IPC.boardRevealFolder, async (): Promise<void> => {
    await ensureBoardsDir();
    await shell.openPath(boardsDir());
  });
}
