import { app } from 'electron';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { OcrItem, OcrReport, OcrText } from '@shared/ocr';

/**
 * Reconhecimento de texto em imagens, pelo motor do proprio Windows.
 *
 * ## Por que o motor do Windows, e nao uma biblioteca
 *
 * A escolha foi MEDIDA nas 36 imagens do resumo de teste, em 14/08/2026, antes
 * de escrever este arquivo:
 *
 * | | Windows.Media.Ocr |
 * |---|---|
 * | tamanho no instalador | **0 MB** -- ja vem no sistema |
 * | idioma | pt-BR ja instalado na maquina de teste |
 * | 36 imagens (4,12 MB) | **1,65 s**, media de 46 ms |
 * | imagens com texto | 30 de 36, **3.456 palavras** |
 * | erros | 0 |
 *
 * A alternativa era Tesseract em WebAssembly, que traria o motor mais os dados
 * de portugues -- dezenas de MB num instalador que hoje tem 142 MB. E o app e
 * **local e offline** por decisao de projeto (decisao 0 do ENGENHARIA.md), o que tira
 * qualquer servico de nuvem da mesa.
 *
 * ## Por que PowerShell, e nao um modulo nativo
 *
 * `Windows.Media.Ocr` e WinRT, e chega-lo do Node pediria um modulo nativo
 * (NodeRT). Este projeto **nao tem nenhuma dependencia nativa**, e nao ter e
 * parte de por que ele compila em segundos e o instalador nunca quebrou.
 *
 * O PowerShell ja esta em toda maquina Windows e alcanca WinRT. O custo dele e a
 * PARTIDA do processo (algumas centenas de ms), nao a chamada -- por isso este
 * modulo recebe um LOTE e paga essa partida uma vez para N imagens. Numa imagem
 * so seria um mau negocio; em 36, some no ruido.
 *
 * ## Detalhes que custaram tempo e nao se deduzem
 *
 * - **`-EncodedCommand`, e nao um arquivo `.ps1`.** Um `.ps1` depende da politica
 *   de execucao da maquina, que pode recusar rodar scripts. Comando codificado
 *   nao passa por essa porta, e ainda elimina qualquer escape de aspas.
 * - **`ELECTRON_RUN_AS_NODE` e limpado do ambiente do filho.** O terminal do VS
 *   Code exporta essa variavel, e ela ja fez o `check:dist` parecer quebrado.
 * - **Uma pasta temporaria por lote, apagada no fim.** O motor le de arquivo
 *   (`StorageFile`), entao os bytes precisam tocar o disco; deixar rastro seria
 *   encher o temp do usuario a cada quadro aberto.
 */

/** Quanto o lote pode demorar antes de desistir. */
const TIMEOUT_MS = 5 * 60 * 1000;

const INDISPONIVEL: OcrReport = { available: false, language: '', items: [], ms: 0 };

/** O prefixo das pastas de lote: e por ele que a varredura reconhece as sobras. */
const PREFIXO = 'qb-ocr-';
/** Nenhuma leitura dura isto; uma pasta mais velha e sobra, e nao lote em andamento. */
const SOBRA_DEPOIS_DE_MS = 10 * 60 * 1000;

/**
 * Apaga as pastas de lote que SOBRARAM na pasta temporaria (B30, 30/09/2026).
 *
 * Cada lote apaga a propria pasta no `finally` -- mas so se o app continuar
 * aberto ate a leitura terminar. Fechar o app no meio de uma leitura (ou o
 * selftest terminar logo depois de colar uma imagem) deixava a pasta para
 * tras, com a print dentro: uma copia da imagem da pessoa esquecida no disco.
 * Esta varredura roda ao iniciar, nao depende de o app ter fechado bem, e so
 * toca no que e dele: o prefixo `qb-ocr-` e mais velho que qualquer leitura.
 */
export async function limparSobrasDeOcr(): Promise<number> {
  const tmp = app.getPath('temp');
  let nomes: string[];
  try {
    nomes = await fs.readdir(tmp);
  } catch {
    return 0;
  }
  let apagadas = 0;
  for (const nome of nomes) {
    if (!nome.startsWith(PREFIXO)) continue;
    const caminho = join(tmp, nome);
    try {
      const info = await fs.stat(caminho);
      if (!info.isDirectory() || Date.now() - info.mtimeMs < SOBRA_DEPOIS_DE_MS) continue;
      await fs.rm(caminho, { recursive: true, force: true });
      apagadas++;
    } catch {
      // Sobra que nao saiu agora sai na proxima abertura.
    }
  }
  if (apagadas > 0) console.log(`[ocr] ${apagadas} pasta(s) de leitura esquecida(s) apagada(s)`);
  return apagadas;
}

export async function recognize(items: readonly OcrItem[]): Promise<OcrReport> {
  if (items.length === 0) return { available: true, language: '', items: [], ms: 0 };
  if (process.platform !== 'win32') return INDISPONIVEL;

  const inicio = Date.now();
  const dir = join(app.getPath('temp'), `${PREFIXO}${process.pid}-${Date.now().toString(36)}`);
  await fs.mkdir(dir, { recursive: true });

  try {
    // O nome do arquivo e o INDICE no lote, com zeros a esquerda. O id do asset
    // nao vira nome de arquivo de proposito: ele vem de fora e nao ha garantia de
    // que seja um nome valido no Windows.
    const nomes = items.map((item, i) => `${String(i).padStart(4, '0')}${extensao(item.mime)}`);
    await Promise.all(
      items.map((item, i) => fs.writeFile(join(dir, nomes[i]!), Buffer.from(item.data))),
    );

    const saida = await rodarPowerShell(script(dir));
    const porIndice = new Map<number, { texto: string; erro?: string }>();
    let idioma = '';
    let disponivel = false;

    for (const linha of saida.split(/\r?\n/)) {
      const cru = linha.trim();
      if (cru.length === 0 || !cru.startsWith('{')) continue;
      let obj: { motor?: string; i?: number; texto?: string; erro?: string };
      try {
        obj = JSON.parse(cru) as typeof obj;
      } catch {
        continue;
      }
      if (typeof obj.motor === 'string') {
        idioma = obj.motor;
        disponivel = obj.motor.length > 0;
        continue;
      }
      if (typeof obj.i === 'number') {
        porIndice.set(obj.i, { texto: obj.texto ?? '', ...(obj.erro ? { erro: obj.erro } : {}) });
      }
    }

    if (!disponivel) return { ...INDISPONIVEL, ms: Date.now() - inicio };

    const out: OcrText[] = items.map((item, i) => {
      const r = porIndice.get(i);
      return {
        id: item.id,
        text: (r?.texto ?? '').trim(),
        ...(r?.erro ? { error: r.erro } : {}),
      };
    });
    return { available: true, language: idioma, items: out, ms: Date.now() - inicio };
  } catch (err) {
    console.log(`[ocr] falhou: ${String(err)}`);
    return { ...INDISPONIVEL, ms: Date.now() - inicio };
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch((e: unknown) => console.warn(`[ocr] nao apagou ${dir}: ${String(e)}`));
  }
}

function extensao(mime: string): string {
  if (mime.includes('jpeg') || mime.includes('jpg')) return '.jpg';
  if (mime.includes('gif')) return '.gif';
  if (mime.includes('bmp')) return '.bmp';
  return '.png';
}

/**
 * O script que roda dentro do PowerShell.
 *
 * Ele emite **uma linha de JSON por imagem**, e nao um JSON no fim: assim uma
 * imagem que derrube o processo nao leva junto o resultado das anteriores. A
 * primeira linha anuncia o motor, e e por ela que o chamador sabe se ha OCR
 * nesta maquina.
 *
 * `Await` existe porque as APIs WinRT sao assincronas e o PowerShell 5.1 nao tem
 * `await`: e a ponte padrao de `IAsyncOperation` para `Task`.
 */
function script(dir: string): string {
  const pasta = dir.replace(/'/g, "''");
  return `
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.Encoding]::UTF8
$OutputEncoding=[System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTask=([System.WindowsRuntimeSystemExtensions].GetMethods()|Where-Object{$_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1'})[0]
function Await($op,$tipo){$t=$asTask.MakeGenericMethod($tipo).Invoke($null,@($op));$t.Wait(-1)|Out-Null;$t.Result}
try{
  $null=[Windows.Storage.StorageFile,Windows.Foundation,ContentType=WindowsRuntime]
  $null=[Windows.Graphics.Imaging.BitmapDecoder,Windows.Foundation,ContentType=WindowsRuntime]
  $null=[Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]
  $eng=[Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
}catch{$eng=$null}
if(-not $eng){ Write-Output '{"motor":""}'; exit }
Write-Output ([pscustomobject]@{motor=$eng.RecognizerLanguage.LanguageTag}|ConvertTo-Json -Compress)
foreach($p in (Get-ChildItem -LiteralPath '${pasta}' -File | Sort-Object Name)){
  $i=[int]($p.BaseName)
  try{
    $f=Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($p.FullName)) ([Windows.Storage.StorageFile])
    $s=Await ($f.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    $d=Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($s)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $b=Await ($d.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $r=Await ($eng.RecognizeAsync($b)) ([Windows.Media.Ocr.OcrResult])
    Write-Output ([pscustomobject]@{i=$i;texto=$r.Text}|ConvertTo-Json -Compress)
    $b.Dispose(); $s.Dispose()
  }catch{
    Write-Output ([pscustomobject]@{i=$i;texto='';erro=$_.Exception.Message}|ConvertTo-Json -Compress)
  }
}
`;
}

/**
 * O comando de partida: FIXO, sem nada variavel dentro. Ele poe a entrada em
 * UTF-8 (o padrao do console e a pagina de codigo antiga, e um caminho com
 * acento -- C:\Users\José -- chegaria corrompido) e executa, como UM bloco, o
 * script que chega pela entrada padrao.
 *
 * POR QUE PELA ENTRADA, e nao `-EncodedCommand` (B29, 30/09/2026). Era
 * `-EncodedCommand`, escolhido para nao montar comando por concatenacao nem
 * depender da politica de execucao. Mas PowerShell com comando codificado,
 * disparado por um programa desconhecido, e a assinatura classica de malware, e
 * o antivirus do Windows segurava a CRIACAO do processo para inspecionar:
 * 1,8 s por leitura (3,5 s na primeira), medido no app instalado. Criar
 * processo e chamada sincrona no processo principal, entao a janela inteira
 * congelava a cada print colada. Pela entrada padrao a criacao leva ~10 ms, e as
 * duas garantias continuam: nada e concatenado na linha de comando, e script
 * lido da entrada nao passa pela politica de execucao.
 *
 * `-Command -` sozinho NAO serve: ele le a entrada linha a linha, como alguem
 * digitando, e blocos de varias linhas nao rodam -- conferido.
 */
const PARTIDA =
  '[Console]::InputEncoding=[System.Text.Encoding]::UTF8; ' +
  '& ([scriptblock]::Create([Console]::In.ReadToEnd()))';

function rodarPowerShell(texto: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env['ELECTRON_RUN_AS_NODE'];

    // Criar o processo e uma chamada SINCRONA no processo principal: enquanto
    // ela nao volta, a janela inteira nao responde. Medido e registrado quando
    // passa de 100 ms -- ver o B29 no BUGS.md.
    const antesDoSpawn = performance.now();
    const filho = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', PARTIDA],
      { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    const custoDoSpawn = performance.now() - antesDoSpawn;
    if (custoDoSpawn > 100) console.warn(`[ocr] criar o PowerShell segurou o processo principal por ${Math.round(custoDoSpawn)} ms`);

    let out = '';
    let err = '';
    filho.stdout.setEncoding('utf8');
    filho.stderr.setEncoding('utf8');
    filho.stdout.on('data', (c: string) => (out += c));
    filho.stderr.on('data', (c: string) => (err += c));

    const guarda = setTimeout(() => {
      filho.kill();
      reject(new Error(`OCR passou de ${TIMEOUT_MS / 1000}s`));
    }, TIMEOUT_MS);

    // O script inteiro de uma vez, e a entrada fechada: e o fim dela que diz ao
    // `ReadToEnd` que o script acabou.
    filho.stdin.on('error', () => undefined);
    filho.stdin.end(texto, 'utf8');

    filho.on('error', (e) => {
      clearTimeout(guarda);
      reject(e);
    });
    filho.on('close', () => {
      clearTimeout(guarda);
      if (out.length === 0 && err.length > 0) reject(new Error(err.slice(0, 300)));
      else resolve(out);
    });
  });
}
