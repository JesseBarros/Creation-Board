# Segurança

**O que este app faz para proteger os dados de quem o usa, e por quê.**

Creation Board guarda material de estudo — resumos inteiros, às vezes anos de anotações. As
decisões abaixo saíram desse ponto de partida: **o dado é do usuário, mora na máquina dele, e
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
| **Conteúdo importado hostil** — o `.zip` do Whiteboard é um arquivo de terceiros interpretado pelo app | Interpretação sem `eval`, no renderer isolado |
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

### A ponte tem 55 linhas, e isso é o ponto

A única passagem entre os dois mundos é `src/preload/index.ts`. Ela **não expõe `ipcRenderer`**:
expõe um objeto com funções nomeadas e tipadas, uma por capacidade.

```ts
const api: CreationBoardApi = {
  board: { save, list, load, remove, folder, revealFolder, searchIndex },
  importer: { pick, read },
  exporter: { save },
  ocr: { recognize },
};
contextBridge.exposeInMainWorld('quadro', api);
```

Expor `ipcRenderer` cru daria à página o direito de chamar **qualquer** canal, inclusive os
que ainda não existem. Do jeito que está, a superfície cresce só quando alguém a aumenta de
propósito — e o arquivo ser curto é o que torna essa revisão viável.

Os nomes de canal também não são strings soltas: vivem num contrato único
(`src/shared/ipc-contract.ts`), e renomear um quebra a compilação dos dois lados.

---

## Nada sai da máquina

- **Sem telemetria, sem análise de uso, sem "enviar relatório de erro".**
- **Sem auto-update.** O `electron-builder.yml` traz `publish: null`, então o app não consulta
  servidor nenhum ao abrir.
- **Sem nuvem, por decisão registrada.** A alternativa (ligar uma pasta do Google Drive) foi
  avaliada inteira e recusada — está escrita como decisão 0 do [ENGENHARIA.md](ENGENHARIA.md).
- **O reconhecimento de texto em imagens é local.** Usa `Windows.Media.Ocr`, o motor que já vem
  no sistema. Nenhuma imagem é enviada para serviço nenhum, e nada é baixado.

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
como *"esta pasta não aceita escrita"* — sobre uma pasta perfeitamente gravável — e o app caía
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

| Escolha | Por quê |
|---|---|
| **`-EncodedCommand`** em vez de gravar um `.ps1` | Não depende da política de execução da máquina **e elimina qualquer escape de aspas** — não há string de comando sendo montada por concatenação |
| **`-NoProfile -NonInteractive`** | O perfil do usuário não é carregado, e o processo nunca fica esperando entrada |
| **`ELECTRON_RUN_AS_NODE` removido** do ambiente do filho | Herdar essa variável muda o comportamento do binário; limpar é fechar uma via de influência externa |
| **`windowsHide: true`** | Nenhuma janela de console pisca na tela |
| **Pasta temporária por lote, apagada no fim** | Os bytes precisam tocar o disco (a API lê de arquivo); deixar rastro seria acumular imagens do usuário no temp |
| **Teto de tempo** | Um lote que trave não deixa o processo pendurado |

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

As versões estão travadas no `package-lock.json`, e o Electron está fixado em versão exata.

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
npm run typecheck    # tsc estrito nos dois projetos
npm run selftest     # ~140 verificações no app REAL, com eventos de mouse e teclado
npm run check:colors # contraste de todas as cores nos dois temas
npm run check:dist   # o MESMO auto-teste rodando dentro do .exe empacotado
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
Get-FileHash "Creation Board-Setup-1.0.0.exe" -Algorithm SHA256
```

Mandar alguém ignorar um aviso de segurança sem dar como verificar o arquivo seria pedir
confiança cega. Com o hash publicado, o aviso vira um fato explicável em vez de um obstáculo.

---

## Reportar um problema de segurança

Encontrou algo? Abra uma
**[issue](https://github.com/JesseBarros/Creation-Board/issues)** descrevendo o que observou e
como reproduzir.

Como o app é local, sem rede e de usuário único, não há dado de terceiros em risco e não há
urgência de divulgação coordenada — pode relatar publicamente. Se ainda assim preferir contato
reservado, use a aba de segurança do repositório.
