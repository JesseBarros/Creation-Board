/// <reference types="vite/client" />

import type { QuadroBrancoApi } from '@shared/ipc-contract';

declare global {
  interface Window {
    quadro: QuadroBrancoApi;
  }
}

export {};
