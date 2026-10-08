# Segurança

**O que este app faz para proteger os dados de quem o usa, e por quê.**

Creation Board guarda material de estudo — resumos inteiros, às vezes anos de anotações. As
decisões abaixo saíram desse ponto de partida: **o dado é do usuário, mora na máquina de teste, e
não pode sumir nem vazar por descuido do programa.**

Nenhuma delas é teórica. Cada uma está no código, e várias nasceram de um problema real
registrado no [BUGS.md](BUGS.md).

---

## Modelo de ameaça

Vale dizer o que este app **não** enfrenta, porque isso explica as escolhas.

Ele é **desktop, local e de usuário único**. Não tem servidor, não tem conta, não tem
autenticação, não recebe conexão de fora. Não existe atacante remoto no modelo — não há porta
aberta para atacar.

O que sobra, e é onde o esforço foi:

| Risco | Resposta |
|---|---|
| **Perder trabalho** — arquivo corrompido, gravação pela metade, quadro que some da vista | Escrita atômica, falha alta em vez de silenciosa, biblioteca única |
| **Vazar sem querer** — o dado sair da máquina sem o usuário pedir | Zero rede, zero telemetria, pasta fora do OneDrive |
| **Conteúdo importado hostil** — o `.zip` importado é um arquivo de terceiros interpretado pelo app | Interpretação sem `eval`, no renderer isolado |
| **Cadeia de suprimentos** — dependência comprometida executando na máquina | Duas dependências em produção, zero módulos nativos |

---

## Isolamento do processo

Electron separa **processo principal** (acesso ao sistema) de **renderer** (a interface). A
configuração da janela fecha essa separação:

```ts
webPreferences: {
  contextIsolation: true,   // o mundo do preload não se mistura com o da página
  nodeIntegration: false,   // a página não tem require, fs, child_process
  sandbox: true,            // o renderer roda na sandbox do Chromium
}
```

**Consequência prática:** todo o código de interface — 84 arquivos, cerca de 17 mil linhas —
**não consegue ler nem escrever um arquivo.** Se algo ali fosse comprometido, não alcançaria o
disco.

### A ponte tem 82 linhas, e isso é o ponto

A única passagem entre os dois mundos é `src/preload/index.ts`. Ela **não expõe `ipcRenderer`**:
expõe um objeto com funções nomeadas e tipadas, uma por capacidade.

```ts
const api: CreationBoardApi = {
  getAppInfo, definirIdioma,
  board: { save, list, load, remove, folder, revealFolder, searchIndex },
  importer: { pick, read },
  fundo: { escolher, ler, limpar },
  pastas: { ler, gravar },
  exporter: { save },
  ocr: { recognize },
};
contextBridge.exposeInMainWorld('quadro', api);
```

**E o outro lado da ponte não confia no que chega.** Os canais que recebem um caminho de arquivo
só aceitam um `.wbd` **dentro** da pasta de quadros (`caminhoDeQuadro`, em `wbdFile.ts`); o tema
do fundo e o índice de pastas são validados antes de tocar o disco. Se algo dentro da página
fosse comprometido, o estrago não sairia da pasta de quadros — ver a
[auditoria de 30/09/2026](#auditoria-de-30092026).

Expor `ipcRenderer` cru daria à página o direito de chamar **qualquer** canal, inclusive os
que ainda não existem. Do jeito que está, a superfície cresce só quando alguém a aumenta de
propósito — e o arquivo ser curto é o que torna essa revisão viável.

Os nomes de canal também não são strings soltas: vivem num contrato único
(`src/shared/ipc-contract.ts`), e renomear um quebra a compilação dos dois lados.

---

## Nada sai da máquina

- **Sem telemetria, sem análise de uso, sem [...].**
- **Sem auto-update.** O `electron-builder.yml` traz `publish: null`, então o app não consulta
  servidor nenhum ao abrir.
- **Sem nuvem, por decisão registrada.** A alternativa (ligar uma pasta do Google Drive) foi
  avaliada inteira e recusada — está escrita como decisão 0 do [ENGENHARIA.md](ENGENHARIA.md).
- **O reconhecimento de texto em imagens é local.** Usa `Windows.Media.Ocr`, o motor que já vem
  no sistema. Nenhuma imagem é enviada para serviço nenhum, e nada é baixado.
- **E isso é imposto, não só prometido.** Desde 30/09/2026 o próprio Chromium cancela toda
  requisição `http(s)` e `ws(s)` da página (`src/main/blindagem.ts`), a CSP do app instalado é
  `connect-src 'self'`, e toda permissão do navegador — câmera, microfone, localização,
  notificação — é negada. Antes, nada saía porque o código não chamava rede; agora, nada sai
  mesmo que alguma coisa tente.
- **As imagens dos quadros vão sem metadados.** Uma foto de celular colada num quadro levava, até
  30/09/2026, o GPS de onde foi tirada, o aparelho e a data — e ia assim para qualquer `.wbd` ou
  SVG compartilhado. Hoje o app tira os metadados na entrada, sem recomprimir a imagem. Ver a
  auditoria abaixo.

A pasta dos quadros fica em `C:\Creation Board`, **na raiz do disco e não em Documentos**. O
motivo é de vazamento: em muitas instalações do Windows a pasta Documentos está sincronizada
com o OneDrive, e salvar ali faria todo quadro subir para a nuvem sem ninguém pedir.

---

## Integridade dos dados

### Gravação atômica

```ts
const tmp = `${path}.tmp`;
await fs.writeFile(tmp, bytes);
await fs.rename(tmp, path);   // rename é atômico no NTFS
```

Escrever por cima do arquivo direto significa que uma queda no meio da escrita destrói o
quadro anterior **e** não termina o novo. Com temporário e renomeação, ou o arquivo antigo
sobrevive inteiro, ou o novo aparece inteiro. Não existe estado intermediário no disco.

Isso também é o que torna seguro colocar a pasta dentro de um cliente de sincronização, para
quem quiser: ele nunca enxerga um `.wbd` pela metade.

### Falhar alto em vez de gravar noutro lugar

Se a pasta de quadros existir, **tiver quadros dentro** e recusar escrita, o app **para com
erro** em vez de escolher outra pasta.

Parece o oposto de robustez, e é deliberado: mudar de pasta com trabalho salvo lá dentro faz
o usuário abrir o app e não encontrar mais nada. Um erro visível é melhor que dados invisíveis.

### A pasta resolvida sai sempre no terminal

`[boards] pasta: C:\Creation Board`, a cada abertura. *"Em que pasta o app está gravando"* foi
a pergunta que faltou responder durante toda a investigação de um bug, e a falta dessa linha
levou a um diagnóstico errado que durou dias.

---

## O achado que originou boa parte disto: uma condição de corrida

Registrado como **[B11](BUGS.md)**, e vale ler inteiro.

**O sintoma:** a biblioteca do usuário se partiu em **duas pastas**. Quadros salvos numa
sessão não apareciam na seguinte, e não havia pista nenhuma do porquê.

**A causa.** Para decidir onde gravar, o app testava se a pasta aceitava escrita criando e
apagando um arquivo de prova — com **nome fixo**:

```ts
// ERRADO: nome fixo
const prova = join(dir, '.escrita-ok');
try { await fs.writeFile(prova, ''); await fs.unlink(prova); return true; }
catch {}                       // e este catch vazio é a segunda metade do bug
return false;
```

Com **dois processos do app sondando a mesma pasta ao mesmo tempo**, cada um apagava o arquivo
do outro entre a escrita e a remoção. O `unlink` falhava, o `catch {}` vazio traduzia isso
como [...] — sobre uma pasta perfeitamente gravável — e o app caía
**calado** para uma pasta alternativa, levando os dados do usuário junto.

É um **TOCTOU** (*time-of-check to time-of-use*) clássico: a condição verificada deixa de
valer entre a verificação e o uso, e o programa age sobre uma resposta que já é falsa.

**Medido, e não deduzido:**

| Cenário | Sondas que falharam |
|---|---|
| Um processo sozinho (controle) | **0 / 300** |
| Dois processos, nome fixo | **120 / 300** e **144 / 300** |
| Dois processos, nome único por processo | **0 / 300** |
| Três processos, nome único | **0 / 300** cada |

**A correção tem três partes, e só a primeira é o conserto:**

1. **Nome de sonda único por processo** — `.escrita-ok-<pid>-<aleatório>`. Mata a corrida.
2. **Nunca mais cair de pasta calado** — a falha alta descrita acima.
3. **A resolução guarda a promessa, e não o resultado** — duas chamadas concorrentes dentro do
   mesmo processo entravam juntas antes de a primeira terminar, e cada uma sondava por conta
   própria.

**Verificação no auto-teste:** a pasta é pedida **quatro vezes ao mesmo tempo**, e as quatro
respostas têm de ser idênticas. Uma chamada de cada vez nunca teria pego isto — que é
exatamente por que ninguém pegou por nove dias.

---

## Superfície de configuração

`QB_BOARDS` troca a pasta dos quadros, e existe para testar com uma biblioteca vazia sem
apagar a de verdade. **Ela é ignorada no app empacotado:**

```ts
return custom && !app.isPackaged ? custom : null;
```

Sem essa trava, um atalho com a variável definida — feito por engano ou por terceiro —
apontaria os quadros de alguém para o lugar errado. O mesmo vale para os outros modos `QB_*`:
são instrumentos de desenvolvimento, não configuração de usuário.

---

## Execução de processo externo

O OCR chama `powershell.exe` para alcançar a API de reconhecimento do Windows. Como isso é a
única execução externa do app, ela é feita com cuidado explícito:


---

## Cadeia de suprimentos

```
dependências de produção:  2   (fflate, rbush)
módulos nativos:           0
```

**Duas dependências**, ambas puro JavaScript, ambas pequenas e de propósito único:
descompactar (`fflate`) e índice espacial (`rbush`). Não há build nativo, o que significa que
`npm install` não compila código C++ da máquina de ninguém — e que não existe binário opaco no
pacote.

As versões estão travadas no `package-lock.json`. O Electron **não** está fixado em versão exata no
`package.json` (`^33.2.1`, que aceita atualização menor) — até 30/09/2026 este parágrafo dizia o
contrário; quem trava a versão instalada (33.4.11) é o lock. E o **Electron 33 está fora de
suporte**: ver as decisões pendentes da auditoria abaixo.

---

## Tipagem como barreira

O TypeScript roda em modo estrito nos dois projetos, com `noUncheckedIndexedAccess`,
`noImplicitOverride`, `noUnusedLocals` e `noUnusedParameters`.

| Sinal | Contagem em ~22 mil linhas |
|---|---|
| `any`, em qualquer forma | **0** |
| `@ts-ignore` / `@ts-expect-error` | **0** |

`noUncheckedIndexedAccess` é o que mais carrega peso aqui: ele obriga a tratar **todo acesso
por índice** como possivelmente indefinido. É a diferença entre um `undefined` que aparece em
produção e um que o compilador recusa.

---

## Verificação

O projeto não confia em revisão manual para dizer que continua de pé:

```
npm run typecheck     # tsc estrito nos dois projetos
npm run selftest      # 180 verificações no app REAL, com eventos de mouse e teclado
npm run check:imagens # metadados: o corte, e toda imagem versionada no repositório
npm run check:pastas  # inclui caminho fora da pasta de quadros e bomba de zip
npm run check:fundo   # a validação da imagem de fundo escolhida pelo usuário
npm run check:colors  # contraste de todas as cores nos dois temas
npm run check:dist    # o MESMO auto-teste rodando dentro do .exe empacotado
```

O último importa para segurança: o instalador entrega um artefato diferente do que o
desenvolvedor roda — empacotado em `asar`, com caminhos absolutos diferentes e `isPackaged`
verdadeiro. Verificar só o app de desenvolvimento deixaria o artefato distribuído sem
verificação nenhuma.

---

## Distribuição

O instalador **não é assinado digitalmente**. Um certificado de assinatura de código custa
algumas centenas de dólares por ano, e este é um projeto aberto e gratuito.

A consequência é visível e está documentada em vez de escondida: o **SmartScreen do Windows**
avisa na primeira execução. O [README](README.md) explica o que é o aviso, por que ele
aparece, e — o mais importante — **publica o SHA-256 do instalador**, para que qualquer pessoa
possa conferir que o arquivo que baixou é o que foi publicado:

```powershell
Get-FileHash "Creation Board-Setup-1.1.0.exe" -Algorithm SHA256
```

Mandar alguém ignorar um aviso de segurança sem dar como verificar o arquivo seria pedir
confiança cega. Com o hash publicado, o aviso vira um fato explicável em vez de um obstáculo.

---

## Auditoria de 30/09/2026

Revisão geral do aplicativo contra vazamento de dados, chaves e credenciais, com
base no **OWASP Top 10**, na **lista de segurança do Electron**
(electronjs.org/docs/latest/tutorial/security) e na limpeza de **metadados de
imagem**. As seções acima dizem o que o app faz para proteger os dados; aqui fica o que foi procurado, o que foi achado,
o que mudou e o que ficou para decidir.

**Modelo de ameaça** (o mesmo do início deste documento): aplicativo desktop, local, de
usuário único, sem servidor e sem conta. Não há atacante remoto. Os riscos que
sobram são **o dado sair da máquina sem o usuário perceber** e **conteúdo de
terceiro** (um `.zip`, `.html` ou `.wbd` recebido de outra pessoa, uma imagem
colada) **fazer o app agir contra quem o usa**.

---

### Resumo

| # | Achado | Gravidade | Estado |
|---|---|---|---|
| 1 | Imagens coladas num quadro guardavam **todos os metadados originais** (GPS, aparelho, data, miniatura) no `.wbd` e no SVG exportado; o **nome do arquivo** também ia junto | Alta | **Corrigido** |
| 2 | Salvar, abrir e excluir quadro aceitavam **caminho vindo da página** sem confinar à pasta de quadros | Alta | **Corrigido** |
| 3 | `shell.openExternal` sem filtro de protocolo | Alta | **Corrigido** |
| 4 | O exportador gravava em **qualquer caminho, sem diálogo**, também no app instalado | Média | **Corrigido** |
| 5 | CSP de desenvolvimento no app instalado (`ws:` para qualquer servidor); nenhum bloqueio de rede nem de permissões | Média | **Corrigido** |
| 6 | **Bomba de zip**: descompactação sem teto em três lugares | Média | **Corrigido** |
| 7 | Tipo da imagem (`mime`) sem escape no SVG exportado | Média | **Corrigido** |
| 8 | Metadados nas imagens do repositório (manifesto C2PA da OpenAI no logo); nome de usuário do Windows num `.md` | Baixa | **Corrigido** na árvore e no histórico |
| 9 | **Electron 33 fora de suporte**; fuses do Electron não configurados | Média | **Decisão pendente** |
| 10 | 22 alertas do `npm audit` nas **ferramentas de build** (nenhum no que vai para o instalador) | Baixa | **Decisão pendente** |

**Chaves e credenciais: nenhuma.** A varredura cobriu a árvore atual **e todo o
histórico do git** (todos os ramos), procurando os formatos de chave da AWS,
Google, OpenAI, GitHub, Slack, GitLab, npm e Hugging Face, chaves
privadas PEM e atribuições do tipo `api_key = "..."`, `senha`, `token`. Nenhum
arquivo `.env`, `.pem`, `.pfx` ou `.npmrc` versionado. Os commits usam o e-mail
anônimo do GitHub (`…@users.noreply.github.com`).

---

### 1. Metadados das imagens dentro dos quadros

**O que acontecia.** O `AssetStore` guardava a imagem [...] — decisão antiga, tomada para não perder qualidade. Junto com os
pixels iam:

- o **EXIF** — em foto de celular, a **posição de GPS** de onde foi tirada, o
  modelo do aparelho, a data e a hora, e uma **miniatura** da foto *original*
  (o vazamento clássico: a foto recortada que ainda carrega, na miniatura, a
  foto inteira);
- **XMP** e **IPTC** — autor, programa de edição, histórico;
- o **MPF** e o que vem grudado depois do fim do JPEG — imagens secundárias,
  mapa de profundidade do modo retrato, o vídeo da [...];
- o **manifesto C2PA** de imagem gerada por IA;
- o **nome do arquivo** colado ("RG frente.jpg"), gravado e nunca lido por nada.

Quem recebesse o `.wbd` — ou o **SVG exportado**, que embute os mesmos bytes —
podia ler tudo isso com qualquer leitor de EXIF.

**O que mudou.** `src/shared/metadadosImagem.ts` tira os metadados **por
contêiner, sem recomprimir**: os blocos de dados da imagem (a varredura do JPEG,
o `IDAT` do PNG, o `VP8` do WebP) são copiados como estão. **Os pixels saem
idênticos** — conferido decodificando as duas versões. Fica só o que muda o
desenho: perfil de cor, animação e a **orientação** da foto, porque sem ela a
foto do celular apareceria deitada. Quando a orientação não é a normal, o EXIF
inteiro é trocado por um mínimo de 26 bytes com essa única informação.

O corte acontece no `AssetStore.add`, por onde passa **toda** imagem — colar,
arrastar, importar e **reabrir** um quadro. Por isso um quadro antigo sai limpo
na próxima vez que for salvo, sem migração. O nome do arquivo deixou de ser
gravado. A foto escolhida como **fundo do menu** também é guardada limpa.

Formatos cobertos: JPEG, PNG, WebP e GIF. BMP não tem onde guardar metadado.
AVIF, HEIC e SVG não são cortados (ver "Limites conhecidos").

### 2. Caminhos de arquivo vindos da página

A página não tem acesso ao disco; ela pede ao processo principal. Cinco canais
recebiam um **caminho** dela:

| Canal | Antes | Agora |
|---|---|---|
| `board.save` | gravava um `.wbd` por cima de **qualquer arquivo** gravável | só `.wbd` **dentro** da pasta de quadros |
| `board.load` | lia de qualquer caminho | idem |
| `board.remove` | conferia com `startsWith`, que aceitava a pasta vizinha `C:\Creation Board-outra\` | idem, por `path.relative` |
| `exporter.save` | caminho pronto gravava **sem diálogo**, em qualquer lugar, também no app instalado | caminho pronto só fora do app instalado (mesma trava do `QB_BOARDS`) |
| `importer.read` | lê o caminho pedido | mantido: só `.html`, `.htm` e `.zip`, e agora com teto de tamanho |

A conferência nova (`caminhoDeQuadro`, em `wbdFile.ts`) resolve `..`, não
confunde pasta de nome parecido, ignora maiúsculas como o NTFS e recusa
subpasta, caminho relativo e extensão diferente de `.wbd`.

Isto **não** corrige nada que um usuário normal pudesse disparar: é a barreira
para o dia em que algo dentro da página for comprometido (uma falha do
Chromium explorada por um arquivo importado, por exemplo) — o estrago não sai da
pasta de quadros.

### 3. Links externos

`setWindowOpenHandler` entregava **qualquer** URL a `shell.openExternal`, que a
repassa ao Windows. Protocolos como `file:` (abre executável), `ms-msdt:` (o
caminho do ataque "Follina") e `search-ms:` fazem o sistema agir. Agora só
`https:`, `http:` e `mailto:` passam (`src/main/blindagem.ts`).

### 4 e 5. Rede, permissões e CSP

O SECURITY.md promete [...]. Era verdade porque o código não
chamava rede — mas **nada impedia** que chamasse, e a CSP do app instalado tinha
`connect-src ... ws: http://localhost:*`, afrouxamento que existe para o
recarregamento do Vite e ia junto para o `.exe`. `ws:` sem host permite abrir
WebSocket para qualquer servidor.

Agora são três barreiras independentes:

1. **CSP estrita no `index.html`**: `connect-src 'self'`, mais `object-src`,
   `base-uri` e `form-action` fechados. Um plugin do Vite acrescenta o
   `localhost` **só no servidor de desenvolvimento** (`electron.vite.config.ts`).
2. **Rede bloqueada pelo próprio Chromium**, no processo principal: toda
   requisição `http(s)`/`ws(s)` é cancelada; em desenvolvimento, só o servidor
   do Vite passa.
3. **Nenhuma permissão do navegador** (câmera, microfone, localização,
   notificação…). O app não usa nenhuma — colar imagem vai pelo evento `paste`,
   que não pede permissão.

E toda página que o app criar, não só a janela principal, nega janela nova e
`<webview>` por padrão.

### 6. Bomba de zip

Um `.zip` de poucos KB que se expande para gigabytes derrubava o **processo
principal** — o app inteiro, com o quadro aberto e não salvo. Três lugares
descompactavam sem teto: o importador, a abertura do `.wbd` e a busca. Agora os
três passam por `src/main/storage/zipSeguro.ts`, que confere o tamanho
**declarado** de cada entrada **antes** de descompactar: 1 GB e 20 mil entradas
para `.wbd`; 512 MB e 2 mil entradas para importação — que, além disso, passou a
descompactar só os `.html`, os únicos arquivos que usa.

### 7. Injeção no SVG exportado

O exportador escapa texto e números, mas o tipo da imagem entrava cru no `href`:
`data:${mime};base64,…`. O `Blob` do Chromium aceita aspas no tipo, e o tipo
gravado num `.wbd` é texto livre — um `.wbd` alterado com o tipo
`image/png" onload="…` injetava um atributo que o navegador executaria ao abrir o
SVG. Duas barreiras agora: o tipo é **deduzido dos bytes** na entrada, e o `href`
passa pelo mesmo `esc()` do texto.

### 8. O repositório

| Arquivo | O que tinha | O que foi feito |
|---|---|---|
| `build/logo-creation-board.png` | Manifesto **C2PA** de 29 KB: gerado pelo `gpt-image 2.0` da OpenAI em 30/07/2026, com identificador da geração e cadeia de certificados. Nenhum dado pessoal. | Removido sem recomprimir; pixels idênticos |
| `build/logo.png` | `pHYs` (densidade de impressão) | Removido; pixels idênticos |
| logo embutida no `index.html` | — | Já estava limpa |
| `icon.ico`, fotos de fundo, capturas do README | — | Já estavam limpos |
| um relatório interno de desenvolvimento | Caminho com o nome de usuário do Windows | Trocado; o relatório saiu do repositório na 1.1.0 |

**Guarda permanente:** `npm run check:privacidade` reprova caminho de usuário,
e-mail que não seja o anônimo do GitHub, formato de chave e termos privados (estes
comparados por SHA-256, para o próprio script não os conter), nos arquivos e em
todas as mensagens de commit. Roda antes de todo envio ao GitHub.

**Histórico do git limpo em 07/10/2026**: a versão do logo com o manifesto C2PA
foi trocada pela limpa (mesmos pixels), e o nome de usuário do Windows saiu de todos
os arquivos antigos, em todos os ramos e tags. Os instaladores publicados não
continham nenhum dos dois.

O manifesto também diz `c2pa.watermarked`: a OpenAI marca a imagem com uma
**marca d'água invisível nos pixels**, que remover metadado não tira. Não é dado
pessoal; fica registrado para ninguém achar que o arquivo ficou "sem rastro".

---

### Decisões pendentes (do mantenedor)


### Riscos aceitos, por escrito

- **DevTools (`F12`) no app instalado.** Decisão anterior, documentada no
  `main/index.ts`: sem ele, um erro no app instalado não aparece em lugar
  nenhum. Num app de usuário único, quem aperta `F12` já é dono da máquina.
- **`style-src 'unsafe-inline'`.** O app usa estilo inline em toda parte, e o
  `script-src` continua fechado — é o que importa contra injeção.
- **Instalador sem assinatura digital.** Já documentado no SECURITY.md, com o
  SHA-256 publicado.

### Limites conhecidos do corte de metadados

- **AVIF, HEIC e SVG** passam sem corte. O colar do Chromium entrega PNG, e
  arrastar arquivo desses formatos é raro; o SVG, como imagem, não executa
  script.
- Um contêiner **truncado ou malformado** volta como está (marcado
  `ILEGIVEL`): não há como cortar com segurança o que não se consegue ler, e
  recusar apagaria, num quadro antigo, uma imagem que talvez ainda desenhe.
- O teto da bomba de zip confere o tamanho **declarado** no zip.

---

### Como conferir

```
npm run typecheck
npm run selftest       # inclui o bloco "seguranca"
npm run check:imagens  # o corte de metadados + toda imagem versionada
npm run check:pastas   # inclui os caminhos fora da pasta e a bomba de zip
npm run check:fundo
```

| Guarda | O que confere |
|---|---|
| `check:imagens` | JPEG, PNG, WebP e GIF montados com um "segredo" em cada metadado: nenhum sobrevive, os bytes da imagem saem idênticos, a orientação fica, limpar duas vezes é igual a limpar uma; **toda imagem versionada** e **toda imagem embutida** (`data:`) em arquivo de texto do repositório está limpa |
| `check:pastas` | salvar, abrir e excluir recusam caminho fora, pasta vizinha, `..`, subpasta, relativo e extensão errada — nas funções **reais**, no disco; a bomba de zip é recusada e a lista continua de pé |
| selftest, bloco `seguranca` | uma foto JPEG com GPS e orientação 6 entra no quadro sem o GPS e sem o nome, **desenhada igual pelo Chromium**; tipo forjado vira `image/jpeg`; toda permissão responde "negado"; a CSP só fala com ela mesma |

Cada guarda nova foi **conferida ao contrário** — quebrando de propósito o que
ela guarda e confirmando que acusa. Numa rodada só, sete quebras: o corte
desligado no `AssetStore`, o confinamento de caminho aceitando tudo, o teto do
zip desligado, as permissões liberadas, a rede liberada, `ws:` de volta na CSP e
o corte perdendo a orientação. **As sete acusaram**, cada uma na guarda certa.

**A prova do bloqueio de rede**, que a CSP sozinha não dá: em desenvolvimento a
CSP *permite* `http://localhost:*` (o Vite precisa), então um pedido a outra
porta do localhost só pode ser barrado pelo processo principal. Um servidor na
porta 5999 contando visitas recebeu **zero** durante o selftest, e o main
registrou `[blindagem] requisicao de rede bloqueada`. Com o bloqueio desligado
de propósito, o mesmo servidor recebeu a visita.

**O que vai no instalador**: `npm run build` sai com
`connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'` —
sem `localhost`, sem `ws:`. `npm audit --omit=dev`: **0 vulnerabilidades** nas
dependências de produção.

Resultado final: typecheck limpo, selftest **179/179**, `check:imagens`,
`check:pastas` e `check:fundo` passando.

---

## Reportar um problema de segurança

Encontrou algo? Abra uma
**[issue](https://github.com/JesseBarros/Creation-Board/issues)** descrevendo o que observou e
como reproduzir.

Como o app é local, sem rede e de usuário único, não há dado de terceiros em risco e não há
urgência de divulgação coordenada — pode relatar publicamente. Se ainda assim preferir contato
reservado, use a aba de segurança do repositório.
