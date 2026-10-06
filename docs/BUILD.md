# Compilar e empacotar

**Português** · [English](BUILD.en.md)

Rodar em desenvolvimento, verificar, gerar o instalador e as armadilhas do Windows que o
projeto encontrou. As decisões de arquitetura e as medições estão no
[ENGENHARIA.md](../ENGENHARIA.md).

---

## Requisitos

- **Windows x64** e **Node.js ≥ 20.18**
- Nada mais: não há dependência nativa, então não precisa de Python nem de Visual Studio Build Tools.

```
npm install
npm run dev
```

`npm run dev` abre o app com recarga automática: editar `src/renderer/` atualiza na hora;
editar `src/main/` ou `src/preload/` reinicia o processo principal.

## Verificar

```
npm run typecheck       # TypeScript estrito nos dois projetos
npm run selftest        # o auto-teste no app de verdade (183 verificações)
npm run check:idiomas   # os dois idiomas: nada fixo no código, acentos, traduções
npm run check:imagens   # metadados de imagem: o corte e as imagens do repositório
npm run check:pastas    # índice de pastas, caminhos fora da pasta, bomba de zip
npm run check:fundo     # validação da imagem de fundo escolhida
npm run check:graficos  # a opção de compatibilidade gráfica: leitura e quem manda
npm run check:colors    # contraste das cores do quadro nos dois temas
npm run check:dist      # o auto-teste rodando dentro do app empacotado
```

Cada verificação nova é **conferida ao contrário**: quebra-se de propósito o que ela guarda
e confirma-se que ela acusa.

### Variáveis de desenvolvimento

Valem só fora do app instalado.

| Variável | O que faz |
|---|---|
| `QB_IDIOMA=pt-BR` ou `en-US` | Força o idioma sem gravar a preferência (o selftest roda em pt-BR se não houver outra) |
| `QB_THEME=light` ou `dark` | Força o tema sem gravar |
| `QB_ANIM=off`, `on` ou `max` | Força o nível de animações sem gravar |
| `QB_BOARDS=<pasta>` | Usa outra pasta de quadros (para testar sem tocar na sua) |
| `QB_PERFIL=<nome>` | Perfil do Electron separado: roda com o app aberto. **Sempre com `QB_BOARDS`** |
| `QB_SHOT=<arquivo.png>` | Fotografa a janela alguns segundos depois de abrir |
| `QB_BENCH_LOBBY=1` | Mede a fluidez do menu principal (parado, hover, arrasto, pasta) |
| `QB_BENCH_QUADRO=1` | Mede a fluidez do quadro aberto: arrastar e Ctrl+roda rápido no maior quadro de `QB_BOARDS` |
| `QB_GPU=<modo>` | Troca o modo de composição, por cima da opção de Configurações (ver `src/main/index.ts`) |

## Gerar o instalador

```
npm run dist
```

Saída em `release/`:

| Arquivo | O que é |
|---|---|
| `Creation Board-Setup-1.1.0.exe` | **Instalador** — é este que se distribui |
| `win-unpacked/Creation Board.exe` | O app já descompactado, para testar sem instalar |

O instalador não pede administrador, deixa escolher a pasta, cria atalhos no menu Iniciar e
na Área de Trabalho, e segue o idioma do Windows (português ou inglês). Desinstalar não
apaga os quadros.

`npm run dist:dir` gera só a pasta descompactada, bem mais rápido.

### SmartScreen

O instalador **não é assinado digitalmente**. Na primeira execução o Windows mostra
"O Windows protegeu o computador": **Mais informações → Executar assim mesmo**. O SHA-256
publicado no README é o que permite conferir o arquivo.

### Ícone

`npm run icon` gera o `build/icon.ico` a partir de `build/logo.png` (só o símbolo, sem o
nome: num atalho de 32 px o nome viraria uma mancha).

### winCodeSign no Windows

O `npm run dist` roda `scripts/prepare-wincodesign.mjs` antes do electron-builder. O pacote
`winCodeSign` traz symlinks do macOS, e criar symlink no Windows exige Modo de
Desenvolvedor — sem isso o empacotamento aborta **mesmo sem assinar nada**. O script
extrai o pacote sem a pasta `darwin`.

---

## Estrutura

```
src/
├─ main/          Processo principal: janela, disco, IPC, blindagem (rede e permissões)
│  ├─ ipc/            um módulo por área (quadros, pastas, fundo, importar, exportar, OCR)
│  ├─ storage/        arquivo .wbd, índice da busca, descompactação com teto
│  └─ ocr/            reconhecimento de texto pelo Windows
├─ preload/       A ponte: window.quadro, a única superfície exposta à página
├─ shared/        O que os dois lados usam
│  ├─ i18n/           dicionários pt-BR e en-US
│  ├─ model/          tipos dos objetos e esquema do .wbd
│  └─ ...             pastas, limpeza de metadados de imagem, contrato de IPC
└─ renderer/      Interface e canvas, sem acesso ao disco
   ├─ core/           documento, índice espacial, câmera, agendador, histórico
   ├─ commands/       um comando por alteração (a base do desfazer)
   ├─ render/         renderizador, painters, layout de texto
   ├─ tools/          uma ferramenta por arquivo
   ├─ features/       texto, busca, encaixe, imagens, importar, exportar, salvar
   ├─ ui/             menu principal, barras, painéis, diálogos, animações
   └─ dev/            auto-teste e medições
```

## Decisões de arquitetura

| Tema | Escolha | Motivo |
|---|---|---|
| Renderização | Canvas 2D, sem framework | Controle total do laço de desenho |
| Interface | TypeScript e CSS, sem framework | Zero dependências; um só lugar para o estado |
| Índice espacial | R-tree (`rbush`) | Lida bem com objetos de tamanhos muito diferentes |
| Formato `.wbd` | ZIP | `document.json` e as imagens num arquivo só, sem inflar em base64 |
| Editar texto | `contentEditable` sobre o canvas | Cursor, seleção, acentos e IME prontos |
| PDF | `printToPDF` do Chromium sobre o PNG | A mesma engine que desenhou o quadro |
| Desfazer | Um comando por alteração | Guardar o estado inteiro estouraria a memória |
| Ordem das camadas | Índice fracionário | "Trazer para a frente" sem renumerar a lista |
| Idiomas | Dicionário tipado, sem biblioteca | Chave sem tradução é erro de compilação |
