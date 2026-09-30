import { app, session, shell, type WebContents } from 'electron';

/**
 * A BLINDAGEM do processo principal: o que a pagina NAO pode fazer, mesmo se
 * um dia algo nela for comprometido. Auditoria de seguranca de 30/09/2026.
 *
 * A pagina ja roda isolada (sandbox, sem Node, `contextIsolation`), e o que ela
 * alcanca e so a ponte do preload. Isto fecha as tres portas que sobravam, e
 * cada uma segue uma recomendacao da lista de seguranca do Electron:
 *
 *   1. LINKS EXTERNOS so por http(s) e mailto. `shell.openExternal` entrega a
 *      URL ao Windows, e o Windows a entrega a quem estiver registrado para o
 *      protocolo -- `file:` abre executavel, `ms-msdt:` foi o caminho do ataque
 *      "Follina", `search-ms:` abre pasta remota. Antes, qualquer URL passava.
 *
 *   2. NENHUMA PERMISSAO do navegador (camera, microfone, localizacao,
 *      notificacao, area de transferencia por API...). O app nao usa nenhuma --
 *      colar imagem vai pelo evento `paste`, que nao pede permissao --, entao
 *      negar tudo nao custa nada e fecha o que nao foi pensado.
 *
 *   3. NENHUMA REDE. O SECURITY.md promete "nada sai da maquina"; ate aqui isso
 *      era verdade porque o codigo nao chamava rede, e nada IMPEDIA que
 *      chamasse. Agora o proprio Chromium cancela toda requisicao http(s) e
 *      ws(s) -- exceto, em desenvolvimento, as do servidor do Vite.
 */

const PROTOCOLOS_EXTERNOS = new Set(['https:', 'http:', 'mailto:']);

/** Abre no navegador do sistema -- so http(s) e mailto. Devolve se abriu. */
export function abrirLinkExterno(url: string): boolean {
  let alvo: URL;
  try {
    alvo = new URL(url);
  } catch {
    return false;
  }
  if (!PROTOCOLOS_EXTERNOS.has(alvo.protocol)) {
    console.warn(`[blindagem] link externo recusado (protocolo ${alvo.protocol})`);
    return false;
  }
  void shell.openExternal(alvo.href);
  return true;
}

/**
 * Vale para TODA pagina que o app criar, e nao so a janela principal -- a
 * janela invisivel do PDF inclusive. Registrado antes de qualquer janela.
 */
export function blindarPaginas(): void {
  app.on('web-contents-created', (_e, wc: WebContents) => {
    // O padrao e negar; a janela principal troca por `abrirLinkExterno`.
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
    // `<webview>` nao existe no app; se aparecer, nao anexa.
    wc.on('will-attach-webview', (ev) => ev.preventDefault());
  });
}

/**
 * Permissoes e rede, na sessao padrao. Chamar no `whenReady`, antes da janela.
 *
 * `origemDev` e o endereco do servidor do Vite em desenvolvimento -- o unico
 * lugar com que a pagina pode falar. No app instalado e `undefined`, e toda
 * requisicao de rede e cancelada.
 */
export function blindarSessao(origemDev: string | undefined): void {
  const s = session.defaultSession;
  s.setPermissionRequestHandler((_wc, _permissao, responder) => responder(false));
  s.setPermissionCheckHandler(() => false);

  const hostDev = origemDev ? new URL(origemDev).host : null;
  s.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
    (detalhes, responder) => {
      let permitido = false;
      try {
        permitido = hostDev !== null && new URL(detalhes.url).host === hostDev;
      } catch {
        permitido = false;
      }
      if (!permitido) console.warn(`[blindagem] requisicao de rede bloqueada: ${detalhes.url.slice(0, 120)}`);
      responder({ cancel: !permitido });
    },
  );
}
