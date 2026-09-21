import { BrowserWindow, dialog, ipcMain } from 'electron';
import { promises as fs } from 'node:fs';
import { basename, join } from 'node:path';
import { IPC } from '@shared/ipc-contract';
import type { FundoImagem, TemaFundo } from '@shared/ipc-contract';
import { ensureBoardsDir } from '../storage/wbdFile';
import { MAX_BYTES, mimeDosBytes, temaValido, validarImagem } from './fundoValidacao';

/**
 * A imagem de fundo do menu principal, quando o usuario poe a dele.
 *
 * O aplicativo ja traz uma foto por tema (ver `renderer/assets/fundos/`), e
 * elas continuam sendo o "padrao" para onde o botao Restaurar volta. O que mora
 * aqui e a escolha pessoal: um arquivo por tema, guardado numa subpasta da
 * pasta de quadros.
 *
 * TRES DECISOES QUE NAO SAO OBVIAS:
 *
 * 1. **Copia o arquivo, e nao guarda o caminho.** Guardar caminho faria o fundo
 *    sumir sem aviso no dia em que ele movesse a foto de lugar, e romperia a
 *    autocontencao da pasta `Creation Board` -- que e a decisao 1 do
 *    ENGENHARIA.md: o que o aplicativo precisa para funcionar mora junto.
 *
 * 2. **O renderer nunca manda caminho -- so o tema.** Nao ha como a interface
 *    pedir [...] ou [...]. A superficie de
 *    ataque de um IPC que aceita caminho arbitrario nao se justifica para
 *    escolher papel de parede.
 *
 * 3. **O tipo vem da ASSINATURA dos bytes, nao da extensao.** Um `.png` que na
 *    verdade e outra coisa vira erro claro aqui, em vez de uma imagem quebrada
 *    silenciosa la na frente -- e evita que o renderer monte um `blob:` com um
 *    mime que nao corresponde ao conteudo.
 *
 * A validacao propriamente dita mora em `fundoValidacao.ts`, que nao importa
 * nada do Electron -- e por isso e exercitavel por `npm run check:fundo`, sem
 * levantar janela nem clicar em diálogo. Ver la o registro de por que o teto
 * deixou de ser em bytes.
 *
 * **O `tema` e conferido no runtime em TODOS os tres canais.** Ele e
 * interpolado no caminho do arquivo, e a decisao 2 acima so vale de verdade com
 * essa conferencia: sem ela, `tema` era o caminho arbitrario que o comentario
 * jurava nao existir.
 */

export function registerFundoIpc(): void {
  ipcMain.handle(IPC.fundoEscolher, async (e, tema: TemaFundo): Promise<FundoImagem | null> => {
    if (!temaValido(tema)) throw new Error('Tema invalido.');
    const win = BrowserWindow.fromWebContents(e.sender);
    // Amarrada a janela quando da: o dialogo sai modal em vez de virar outra
    // janela solta na barra de tarefas. Mesmo criterio do importador.
    const result = win
      ? await dialog.showOpenDialog(win, opcoes())
      : await dialog.showOpenDialog(opcoes());

    const escolhido = result.canceled ? undefined : result.filePaths[0];
    if (!escolhido) return null;

    // Confere o tamanho ANTES de ler: nao ha razao para carregar um arquivo de
    // 2 GB na memoria so para depois dizer que ele e grande demais.
    const info = await fs.stat(escolhido);
    if (info.size > MAX_BYTES) {
      throw new Error(
        `"${basename(escolhido)}" tem ${(info.size / 1024 / 1024).toFixed(1)} MB. ` +
          `O limite e ${MAX_BYTES / 1024 / 1024} MB.`,
      );
    }

    const bytes = await fs.readFile(escolhido);
    const veredito = validarImagem(bytes, basename(escolhido));
    if (!veredito.ok) throw new Error(veredito.erro);

    const dir = await fundosDir();
    // Apaga qualquer versao anterior ANTES de gravar: a extensao pode ter
    // mudado (trocar um .png por um .webp deixaria os dois na pasta, e o
    // `ler` encontraria o errado).
    await limparArquivos(dir, tema);
    // A extensao sai do MIME DETECTADO, nunca do nome escolhido -- senao um
    // JPEG de verdade chamado `foto.bat` viraria `fundo-claro.bat`.
    const destino = join(dir, `fundo-${tema}${veredito.extensao}`);
    await fs.writeFile(destino, bytes);

    return { bytes: paraArrayBuffer(bytes), mime: veredito.mime, nome: basename(escolhido) };
  });

  ipcMain.handle(IPC.fundoLer, async (_e, tema: TemaFundo): Promise<FundoImagem | null> => {
    if (!temaValido(tema)) throw new Error('Tema invalido.');
    const dir = await fundosDir();
    const arquivo = await acharArquivo(dir, tema);
    if (!arquivo) return null;

    const bytes = await fs.readFile(join(dir, arquivo));
    const mime = mimeDosBytes(bytes);
    // Arquivo ilegivel ou corrompido nao derruba o lobby: some o fundo dele, e
    // a imagem que vem com o aplicativo assume.
    if (!mime) return null;

    return { bytes: paraArrayBuffer(bytes), mime, nome: arquivo };
  });

  ipcMain.handle(IPC.fundoLimpar, async (_e, tema: TemaFundo): Promise<void> => {
    if (!temaValido(tema)) throw new Error('Tema invalido.');
    await limparArquivos(await fundosDir(), tema);
  });
}

/**
 * Onde a imagem escolhida mora.
 *
 * Dentro da pasta de quadros, numa subpasta com ponto. Ela e INERTE para o
 * resto do aplicativo: tanto `listBoards` quanto `readLibraryIndex` filtram
 * `isFile()` e sufixo `.wbd`, entao uma subpasta aqui nao aparece em lugar
 * nenhum nem entra na busca.
 */
async function fundosDir(): Promise<string> {
  const dir = join(await ensureBoardsDir(), '.creation-board', 'fundos');
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/** O arquivo deste tema, qualquer que seja a extensao. */
async function acharArquivo(dir: string, tema: TemaFundo): Promise<string | undefined> {
  const nomes = await fs.readdir(dir).catch(() => [] as string[]);
  return nomes.find((n) => n.startsWith(`fundo-${tema}.`));
}

async function limparArquivos(dir: string, tema: TemaFundo): Promise<void> {
  const nomes = await fs.readdir(dir).catch(() => [] as string[]);
  for (const n of nomes) {
    if (!n.startsWith(`fundo-${tema}.`)) continue;
    await fs.unlink(join(dir, n)).catch(() => undefined);
  }
}

/**
 * `Uint8Array` do Node -> `ArrayBuffer` proprio, para o clone estruturado.
 *
 * `readFile` devolve um Buffer que costuma ser uma FATIA de um bloco maior
 * reaproveitado pelo Node. Mandar o `.buffer` dele cru enviaria o bloco inteiro
 * -- possivelmente com bytes de outros arquivos junto.
 */
function paraArrayBuffer(b: Uint8Array): ArrayBuffer {
  const copia = new ArrayBuffer(b.byteLength);
  new Uint8Array(copia).set(b);
  return copia;
}

function opcoes(): Electron.OpenDialogOptions {
  return {
    title: 'Escolher imagem de fundo',
    buttonLabel: 'Usar esta imagem',
    properties: ['openFile'],
    filters: [
      // O filtro e conveniencia do diálogo, e NAO a validacao: ele so decide o
      // que aparece na lista, e "Todos os arquivos" contorna ele de propósito.
      // Quem valida e `validarImagem`, pelos bytes.
      { name: 'Imagens', extensions: ['jpg', 'jpeg', 'png', 'webp', 'avif'] },
      { name: 'Todos os arquivos', extensions: ['*'] },
    ],
  };
}
