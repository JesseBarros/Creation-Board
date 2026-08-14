# Compilar e empacotar

Verificação de tipos, build de produção, geração do instalador .exe e as armadilhas do
Windows que este projeto encontrou pelo caminho. Para as decisões de arquitetura e como
conferir que tudo continua de pé, veja o [ENGENHARIA.md](../ENGENHARIA.md).

---
## Verificação de tipos

```
npm run typecheck
```

Roda `tsc` nos dois projetos (`tsconfig.node.json` para main/preload/shared,
`tsconfig.web.json` para renderer/shared). O `npm run build` já executa isso antes
de empacotar — build não passa com erro de tipo.

## Build de produção

```
npm run build
```

Gera os três bundles em `out/` (`main/`, `preload/`, `renderer/`). Não gera executável.

## Gerar o instalador .exe

```
npm run dist
```

Saída em `release/`:

| Arquivo | O que é |
|---|---|
| `Creation Board-Setup-0.1.0.exe` | **Instalador NSIS** — é este que você executa |
| `win-unpacked/Creation Board.exe` | App já descompactado, para testar sem instalar |

O instalador é *per-user* (não pede admin), permite escolher a pasta de instalação
e **cria o atalho na área de trabalho automaticamente**. Depois de instalado, o app
abre pelo atalho — nunca por terminal.

Para gerar só a pasta descompactada, sem instalador (bem mais rápido durante o
desenvolvimento):

```
npm run dist:dir
```

### SmartScreen na primeira execução

O instalador não é assinado digitalmente (assinatura de código custa algumas centenas
de dólares por ano e não faz sentido para uso pessoal). Na primeira execução o Windows
mostra a tela azul do SmartScreen: clique em **"Mais informações" → "Executar assim mesmo"**.
Só acontece uma vez.

### Ícone do app

O `build/icon.ico` é gerado a partir da logo, sem dependências de imagem:

```
npm run icon
```

A origem é `build/logo.png` — a versão **só do símbolo**, sem o texto
"Creation Board". Num atalho de 32px o nome escrito viraria uma mancha ilegível,
enquanto o símbolo sozinho continua reconhecível. O script decodifica o PNG à mão
(zlib do Node + desfiltragem das linhas), centraliza num quadrado e reduz para 256px
por média de área. Para usar outra imagem:

```
node build/make-icon.js build/icon.ico caminho/da/imagem.png
```

## Estrutura de pastas

```
src/
├─ main/          Processo principal (Node). Janela, menus, disco, IPC.
│  ├─ index.ts        bootstrap e ciclo de vida
│  └─ ipc/            handlers IPC, um módulo por área
├─ preload/       Ponte contextBridge → window.quadro (única superfície exposta)
├─ shared/        Código que atravessa main ↔ renderer
│  ├─ model/          tipos dos objetos, esquema do .wbd, migrações
│  ├─ geometry/       Vec2, Rect, interseções
│  └─ ipc-contract.ts nomes de canais + tipos de payload
└─ renderer/      Interface e canvas (sem acesso a Node)
   ├─ core/           Document, SpatialIndex, Camera, Scheduler, History
   ├─ commands/       um comando por mutação (base do undo/redo)
   ├─ render/         Renderer, camadas, painters, bitmap cache
   │  └─ text/           layout de texto (medida, quebra, linhas) — usado por
   │                     painter, importador e editor
   ├─ tools/          uma ferramenta por arquivo, interface Tool comum
   ├─ features/       text, search, snapping, clipboard, images, import, storage
   ├─ ui/             toolbar, painéis, modais
   ├─ state/          preferências, tema, favoritos
   └─ styles/
```

**Como adicionar uma ferramenta nova:** um arquivo em `tools/`, um painter em
`render/painters/`, um tipo em `shared/model/types.ts`. Nada mais precisa ser tocado.

## Decisões de arquitetura

| Tema | Escolha | Motivo |
|---|---|---|
| Renderização | Canvas 2D puro, sem framework | Controle total do loop; WebGL só se a meta de 60fps com 10k objetos não bater |
| UI fora do canvas | TS vanilla + CSS | Zero dependências, uma única fonte de verdade de estado |
| Índice espacial | R-tree (`rbush`) | Lida bem com AABBs de tamanhos muito diferentes — traço curto e imagem gigante no mesmo quadro |
| Formato `.wbd` | Container ZIP | `document.json` + `assets/` com binários originais: arquivo único, sem inchaço de base64 |
| Texto | `contentEditable` sobre o canvas ao editar | Cursor, seleção, acentuação e IME de graça; renderiza no canvas quando ocioso |
| PDF | Vetorial via SVG | Zoom sem perda e texto selecionável; reaproveita o exportador SVG |
| Undo/redo | Command pattern | Snapshots de estado inteiro estourariam a memória com muitos objetos |
| Camadas (`z`) | Fractional index | "Trazer para frente" é O(1), sem renumerar a lista |

## Notas de build (Windows)

O `npm run dist` chama `scripts/prepare-wincodesign.mjs` antes do electron-builder.
Isso resolve uma falha específica do Windows: o pacote `winCodeSign` do electron-builder
contém symlinks do macOS, e criar symlink no Windows exige Modo de Desenvolvedor ou
admin — sem isso a extração falha e o empacotamento aborta, **mesmo sem assinar nada**.
O script extrai o pacote excluindo a pasta `darwin`, que é irrelevante aqui. É idempotente
e roda em segundos.
