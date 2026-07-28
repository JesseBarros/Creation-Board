import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';

// Aliases compartilhados pelos tres builds. `@shared` aponta para o codigo que
// atravessa a fronteira main <-> renderer (tipos do modelo, geometria, contrato IPC).
const alias = {
  '@shared': resolve(__dirname, 'src/shared'),
  '@renderer': resolve(__dirname, 'src/renderer'),
};

export default defineConfig({
  main: {
    // externalizeDepsPlugin mantem as dependencias de runtime fora do bundle do main,
    // resolvidas via node_modules dentro do asar em vez de inlined.
    plugins: [externalizeDepsPlugin()],
    resolve: { alias },
    build: {
      outDir: 'out/main',
      rollupOptions: { input: { index: resolve(__dirname, 'src/main/index.ts') } },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias },
    build: {
      outDir: 'out/preload',
      rollupOptions: { input: { index: resolve(__dirname, 'src/preload/index.ts') } },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: { alias },
    build: {
      outDir: resolve(__dirname, 'out/renderer'),
      rollupOptions: { input: { index: resolve(__dirname, 'src/renderer/index.html') } },
      // Alvo moderno: so precisa rodar no Chromium que vem com o Electron.
      target: 'chrome130',
    },
  },
});
