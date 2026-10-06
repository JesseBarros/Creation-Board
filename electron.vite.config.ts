import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import type { Plugin } from 'vite';

/**
 * A CSP do `index.html` e a do APP INSTALADO: `connect-src 'self'`, nada de
 * rede. So o servidor de desenvolvimento precisa de mais -- o recarregamento
 * do Vite fala por WebSocket com o localhost --, e e so ali que ela afrouxa.
 *
 * Ate a auditoria de 30/09/2026 o afrouxamento morava no proprio `index.html`
 * e ia junto para o `.exe`: `ws:` sem host deixava a pagina abrir WebSocket
 * para QUALQUER servidor, o que contradizia o "nada sai da maquina" do
 * SECURITY.md. O main ainda bloqueia a rede por fora (ver `main/index.ts`);
 * esta e a segunda barreira.
 */
function cspDeDesenvolvimento(): Plugin {
  return {
    name: 'csp-de-desenvolvimento',
    apply: 'serve',
    transformIndexHtml: (html) =>
      html.replace("connect-src 'self'", "connect-src 'self' ws://localhost:* http://localhost:*"),
  };
}

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
    plugins: [cspDeDesenvolvimento()],
    build: {
      outDir: resolve(__dirname, 'out/renderer'),
      rollupOptions: { input: { index: resolve(__dirname, 'src/renderer/index.html') } },
      // Alvo moderno: so precisa rodar no Chromium que vem com o Electron.
      target: 'chrome130',
    },
  },
});
