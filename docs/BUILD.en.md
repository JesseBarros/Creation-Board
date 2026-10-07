# Building and packaging

[Português](BUILD.md) · **English**

Running in development, verifying, building the installer, and the Windows pitfalls this
project ran into. Architecture decisions and measurements live in
[ENGENHARIA.md](../ENGENHARIA.md) (in Portuguese).

---

## Requirements

- **Windows x64** and **Node.js ≥ 20.18**
- Nothing else: there are no native dependencies, so no Python or Visual Studio Build Tools.

```
npm install
npm run dev
```

`npm run dev` opens the app with live reload: editing `src/renderer/` updates right away;
editing `src/main/` or `src/preload/` restarts the main process.

## Verifying

```
npm run typecheck       # strict TypeScript on both projects
npm run selftest        # the self-test inside the real app (193 checks)
npm run check:idiomas   # both languages: nothing hardcoded, accents, translations
npm run check:imagens   # image metadata: the stripping and the repository images
npm run check:pastas    # folder index, paths outside the folder, zip bombs
npm run check:fundo     # validation of the chosen background image
npm run check:graficos  # the graphics compatibility option: reading it and precedence
npm run check:abertura  # the splash screen follows the theme, with no flash
npm run check:colors    # board color contrast in both themes
npm run check:dist      # the self-test running inside the packaged app
```

Every new check is **verified in reverse**: break on purpose what it guards and confirm it
catches it.

### Development variables

They only work outside the installed app.

| Variable | What it does |
|---|---|
| `QB_IDIOMA=pt-BR` or `en-US` | Forces the language without saving it (the self-test runs in pt-BR unless told otherwise) |
| `QB_THEME=light` or `dark` | Forces the theme without saving it |
| `QB_ANIM=off`, `on` or `max` | Forces the animation level without saving it |
| `QB_BOARDS=<folder>` | Uses another boards folder (to test without touching yours) |
| `QB_PERFIL=<name>` | A separate Electron profile: runs with the app already open. **Always with `QB_BOARDS`** |
| `QB_SHOT=<file.png>` | Captures the window a few seconds after it opens |
| `QB_BENCH_LOBBY=1` | Measures the home screen's frame rate (idle, hover, drag, folder) |
| `QB_BENCH_QUADRO=1` | Measures an open board's frame rate: dragging and fast Ctrl+wheel on the largest board in `QB_BOARDS` |
| `QB_GPU=<mode>` | Switches the compositing mode, overriding the Settings option (see `src/main/index.ts`) |

## Building the installer

```
npm run dist
```

Output in `release/`:

| File | What it is |
|---|---|
| `Creation Board-Setup-1.1.0.exe` | **Installer** — this is the one you distribute |
| `win-unpacked/Creation Board.exe` | The unpacked app, for testing without installing |

The installer doesn't ask for admin rights, lets you choose the folder, creates Start menu
and desktop shortcuts, and follows the Windows language (Portuguese or English).
Uninstalling doesn't delete your boards.

`npm run dist:dir` builds only the unpacked folder, much faster.

### SmartScreen

The installer **isn't digitally signed**. On first run Windows shows "Windows protected
your PC": **More info → Run anyway**. The SHA-256 published in the README lets you verify
the file.

### Icon

`npm run icon` builds `build/icon.ico` from `build/logo.png` (the symbol only, without the
name: on a 32 px shortcut the name would turn into a smudge).

### winCodeSign on Windows

`npm run dist` runs `scripts/prepare-wincodesign.mjs` before electron-builder. The
`winCodeSign` package ships macOS symlinks, and creating symlinks on Windows requires
Developer Mode — without it packaging aborts **even when nothing is being signed**. The
script extracts the package without the `darwin` folder.

---

## Structure

```
src/
├─ main/          Main process: window, disk, IPC, hardening (network and permissions)
│  ├─ ipc/            one module per area (boards, folders, background, import, export, OCR)
│  ├─ storage/        .wbd file, search index, capped decompression
│  └─ ocr/            text recognition through Windows
├─ preload/       The bridge: window.quadro, the only surface exposed to the page
├─ shared/        What both sides use
│  ├─ i18n/           pt-BR and en-US dictionaries
│  ├─ model/          object types and the .wbd schema
│  └─ ...             folders, image metadata stripping, IPC contract
└─ renderer/      UI and canvas, with no disk access
   ├─ core/           document, spatial index, camera, scheduler, history
   ├─ commands/       one command per change (the basis of undo)
   ├─ render/         renderer, painters, text layout
   ├─ tools/          one tool per file
   ├─ features/       text, search, snapping, images, import, export, saving
   ├─ ui/             home screen, toolbars, panels, dialogs, animations
   └─ dev/            self-test and measurements
```

## Architecture decisions

| Topic | Choice | Why |
|---|---|---|
| Rendering | Canvas 2D, no framework | Full control of the drawing loop |
| UI | TypeScript and CSS, no framework | Zero dependencies; one place for state |
| Spatial index | R-tree (`rbush`) | Handles objects of very different sizes well |
| `.wbd` format | ZIP | `document.json` and images in a single file, without base64 bloat |
| Text editing | `contentEditable` over the canvas | Cursor, selection, accents and IME for free |
| PDF | Chromium's `printToPDF` over the PNG | The same engine that drew the board |
| Undo | One command per change | Storing the whole state would blow up memory |
| Layer order | Fractional index | "Bring to front" without renumbering the list |
| Languages | Typed dictionary, no library | A missing translation is a compile error |
