# User guide

[Português](USO.md) · **English**

How to use **Creation Board** day to day. If you haven't installed it yet, start with the
[README](../README.en.md).

---

## Home screen

This is the screen the app opens on: your boards, each with a thumbnail, date, object count and size.

- **New board** (or `Ctrl+N`) creates a board and asks for a name and the paper color. A named board starts out saved.
- The **+** at the end of the grid creates a board or a folder.
- **Import file** brings in boards exported from another app (see [Importing](#importing-from-other-apps)).
- **Search all boards**, at the top of the panel, looks for text across your whole library at once, including text inside images.
- The badge with the path, next to the title, opens the boards folder in File Explorer.

### Folders

- **New folder** (or the **+**) creates an empty folder. **Dragging one board onto another** creates a folder with both and asks for a name.
- Drag a board onto a folder to put it inside.
- Click a folder to open it in a window, with the home screen still in view. Dragging a board from the window onto the home screen takes it out of the folder. `Esc` closes the window.
- Rename (pencil or `F2`) and delete are on the folder card itself. **Deleting a folder never deletes boards**: they go back to the home screen.

Folders are an organization inside the app, not Windows folders: the `.wbd` files all stay together in the boards folder, and dragging never moves a file.

### Settings

The settings button, next to the theme button, opens:

- **Language:** Português (Brasil) or English (US). On first launch, the app follows Windows: Brazilian Portuguese opens in Portuguese, and any other language in English.
- **Animations:** Off, On or **Maximum** (default).
- **Tutorial:** **Show again** replays the guided steps for the home screen and the board.
- **Light / dark theme background:** your own image instead of the photo that comes with the app. The image is copied into the boards folder, without its hidden data (such as GPS location). **Restore default** goes back to the original photo.
- **Graphics compatibility:** turns off GPU acceleration. Use it if the screen flickers or the drawing appears doubled; the glitch depends on each computer's graphics card.

Language and graphics compatibility take effect when you click **Apply changes**, at the bottom (graphics compatibility reopens the app).

The sun/moon button switches between the light and dark themes.

---

## Shortcuts

Every shortcut is listed inside the app: press **`F1`**, or the keyboard button on the board toolbar.

| Action | How |
|---|---|
| New board | `Ctrl+N` · on the home screen or inside a board |
| Save | `Ctrl+S` · after the first save, it saves on its own 3 s after the last change |
| Export | `Ctrl+E` — PNG, SVG or PDF; the whole board or the selection |
| Back to the home screen | `Ctrl+O` |
| Tools | `V` select · `P` pen · `M` highlighter · `T` text · `N` sticky note · `F` shapes · `E` eraser |
| Thickness | Slider from 0 to 100% · `[` and `]` step by 10% (for text it's the font size; for the eraser, the diameter) |
| Edit text | `F2` or `Enter` on the selection · double-click the box |
| Format (inside the box) | `Ctrl+B` · `Ctrl+I` · `Ctrl+U` · `Esc` leaves keeping the text |
| Select | Click · `Shift`+click adds · drag on empty space to lasso · `Ctrl+A` all · `Esc` clears |
| Move · resize · rotate | Drag the selection · a handle · the top handle |
| Undo / redo | `Ctrl+Z` / `Ctrl+Shift+Z` (or `Ctrl+Y`) |
| Duplicate / delete | `Ctrl+D` / `Delete` |
| Copy · cut · paste | `Ctrl+C` · `Ctrl+X` · `Ctrl+V` (pastes at the cursor) |
| Bring to front / send to back | `Ctrl+Shift+]` / `Ctrl+Shift+[` |
| Find on board | `Ctrl+F` · `Enter` next · `Shift+Enter` previous · `Esc` closes |
| Pan the board | **Right-click + drag** · middle button · two fingers on the trackpad · mouse wheel |
| Zoom | `Ctrl` + wheel · pinch · `Ctrl+0` actual size · `Ctrl+1` fits to screen |
| Dot grid · rulers · units | `G` · `R` · `U` (px or cm) · the dot grid and rulers start off, and the app remembers your choice |
| Layers panel | `C` |
| Context menu | Right-click without dragging |

The bar shows zoom from **1% to 100%**, minimum to maximum (64 times actual size). Actual size shows as 53%.

---

## Drawing

The toolbar sits at the bottom. With a drawing tool active, a panel rises from the bar with color, thickness and the tool's options. Clicking the active tool again closes the panel. Each tool remembers its own color and thickness.

- **Pen** and **highlighter**. The highlighter goes **under** the content, so it highlights without covering the text.
- **Eraser:** erases **by piece** (default, only what it covers) or the **whole stroke** it touches. It erases ink only: text, sticky notes and images are deleted by selecting them and pressing `Delete`.
- **Color:** the palette or the **+**, which opens the system color picker. If the chosen color would be unreadable in one of the themes, the app warns you and shows it adjusted; the file always keeps the original color.
- While writing near the edge, you can pan the board with the right button **without breaking the stroke**.

### Shapes and snapping

**Shapes** (`F`) has rectangle, ellipse, triangle, diamond, line and arrow; pick the type in the panel. `Shift` locks a square, a circle or 15° angle steps; `Alt` grows the shape from the center.

While moving, resizing or creating, **orange guides** appear when you line up with the edge or center of a nearby object. Holding `Ctrl` while dragging ignores snapping.

The **rulers** (`R`) show your position along the top and left, in px or cm (`U`).

---

## Text, sticky notes and flags

- **Text** (`T`): click to create a box; drag to set its width. Clicking an existing box opens it instead of creating another one.
- **Resizing text** doesn't distort the letters: the **corner** changes the font size and the **side** changes the box width (the text reflows).
- **Bold, italic and underline** apply while you type, even to a single word. Pasting inside a box pastes plain text.
- **Text color:** select a passage and pick a color in the Text panel. `Ctrl+A` inside the box changes the whole text; with the box selected on the board, the whole box changes.
- The panel's **size slider** applies to the text being edited or selected.
- A **sticky note** (`N`) has its own size. Its color and **flag** (important, question, review) are chosen in the panel, and the same buttons change the selected note.
- A **pinned** sticky note (context menu) becomes a card in the corner of the screen while it's out of view.

---

## Images

- **Paste** (`Ctrl+V`) or **drag the file** into the board. A dragged image lands where you drop it; several come in side by side.
- A large image comes in scaled down to fit the screen (720 px on its longest side); small ones keep their natural size.
- **Crop image:** double-click the image (or use the context menu). `Enter` confirms, `Esc` cancels, and **Remove crop** brings the whole image back.
- The image is stored **without the hidden data** of the original file (GPS location, device model, date), at the same quality.

---

## Searching

- **`Ctrl+F` on a board** lists the results with the text around each match. `Enter` goes to the next one, `Shift+Enter` goes back, `Esc` closes.
- Search **ignores accents and case**.
- **Text inside images** is found too: the app reads images with Windows' own text recognition, without sending anything anywhere.
- **On the home screen**, `Ctrl+F` searches **all boards** at once, including the ones inside folders.

---

## Exporting and saving

`Ctrl+E` opens the options: **PNG**, **SVG** or **PDF**; the whole board or the selection; 1x, 2x or 3x resolution; with a background or transparent. Rulers, handles, guides and search highlights don't go into the file.

- A very large board exported as PNG comes out **in parts**, across several files, to keep the resolution you asked for. The dialog tells you how many before exporting.
- SVG is vector and keeps the text selectable.

**Saving:** `Ctrl+S`. After the first save, the app saves on its own 3 seconds after the last change. A board that was never saved is protected by a warning when you leave.

---

## Selecting and arranging

| Gesture | What it does |
|---|---|
| Click | Selects the object under the cursor (by its drawing, not its bounding box) |
| `Shift` + click | Adds to the selection; on a selected object, removes it |
| Drag on empty space | Lasso: grabs everything in the area |
| Drag the selection | Moves — `Shift` locks to one axis |
| Drag a handle | Resizes — `Shift` keeps the proportions, `Alt` anchors at the center |
| Drag the top handle | Rotates — `Shift` snaps to 15° steps |
| Arrow keys | Move 1 px; with `Shift`, 10 px |

Copy and paste **works across boards**, images included. `Ctrl+V` pastes centered on the cursor.

The **layers panel** (`C`) lists what's on screen, with buttons to bring forward, send backward, hide (eye) and lock (padlock).

---

## Importing from other apps

**Import file**, on the home screen, accepts the `.zip` exported from Microsoft Whiteboard (or the `.html` inside it), several at a time. Each file becomes a separate `.wbd` board.

The content comes back **editable**: text, ink, images and sticky notes, each in the right place. Elements the app doesn't have yet (links and reactions) are skipped.

---

## Where your boards live

Each board is a `.wbd` file in **`C:\Creation Board`**. The folder sits at the root of the drive **on purpose**, not in Documents: on many computers Documents syncs with OneDrive, and your boards would go to the cloud without anyone asking.

- To take a board to another computer, copy the `.wbd` file; it opens normally there.
- If the root of the drive is locked down, the app uses `%USERPROFILE%\Creation Board` instead.
- Uninstalling the app **doesn't delete** your boards.

---

## Light and dark theme

Colors are adapted **for display only**, so nothing disappears: black ink shows up light in the dark theme, and vice versa. Strong colors (red, blue, green) and surfaces (sticky notes, highlighter) stay as they are. The file always keeps the color you chose, and that's what exports use.
