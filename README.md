# Brick Builder

A browser game for building brick sets in an isometric 3D view. You can rebuild a real set from its official instruction PDFs, or build freely on an empty baseplate.

It runs in Safari on macOS 26, and in Chrome, Edge and Firefox. Everything stays on your device. There is no account and no server.

## How to play

No installation needed.

1. On GitHub, click **Code → Download ZIP**.
2. Unzip the file.
3. Double-click **`BrickBuilder.html`**.

The game opens in your browser and works offline. `BrickBuilder.html` is the whole game in one file, so you can also copy that file on its own to another computer or a USB stick.

> Your builds are saved in the browser you opened the file with, for that file's location. If you move the file or use another browser, you start with an empty list. Use **••• → Export build** to take a build with you.

## Game modes

### Build a Set

1. Click **Build a Set → Import instructions**.
2. Type the set number from the box (for example `10497`) and click **Find instructions**. The set's official page opens on lego.com.
3. Download the instruction PDFs. Bigger sets have several booklets. Drop or choose them all in the import window, and use the arrows to put them in build order.
4. Click **Import**.

The instructions open next to the baseplate, or above it on a phone. Turning the page past the end of one booklet goes on to the next. Your booklet and page are saved, and the progress bar covers the whole set. You can add a booklet you forgot later from **••• → Add booklet**.

> Why not download the PDFs automatically? LEGO's servers don't allow other websites to fetch their files (no CORS headers), so the browser blocks it. Downloading them yourself takes one tap and keeps the game fully offline.

You can also drop PDFs anywhere on the home screen to open the import window.

### Build from a Photo

Turn any picture into a brick mosaic and build it step by step.

1. Click **Build from a Photo** and choose a picture, or drop one on the home screen.
2. Choose the options. The preview updates as you go:
   - **Size:** 16×16, 32×32, 48×48, or **Fit picture** (keeps the picture's shape, up to 48 studs)
   - **Parts:** round tiles (like the official art sets), square tiles, or plates
   - **Bigger parts:** areas of the same color are covered with larger tiles or plates (up to 2×8), so you need fewer parts
   - **Colors:** all 33 solid colors, or a limit of 24, 16, 12, 8, 4 or 2, chosen from the colors your picture uses most
   - **Dithering:** mixes neighboring colors to suggest shades the palette doesn't have
3. Click **Create build**.

How the guided build works:
- The picture is split into 16×16 sections, built 4 rows at a time.
- For each step, the panel shows where the step goes, the original picture, and the parts you need with a count for each.
- See-through outlines on the board show where every part goes, and the camera moves to each step.
- Tap a part in the list to select it with the right color and rotation, then place it on its outline.
- A step completes by itself once all its parts are in place, and the next step starts.
- **Place for me** fills in the current step.

How the conversion works: the picture is center-cropped and each stud's area is averaged, mixing in linear light. Every stud then gets the nearest brick color, compared in CIELAB color space, which measures color difference the way the eye sees it.

### Free Build

An empty 48×48 baseplate with the full parts catalog.

## Parts

Free Build gives you an **unlimited supply of every part**, in the official sizes. There are 108 parts in 5 categories:

| Category | Sizes |
| --- | --- |
| Bricks (19) | 1×1, 1×2, 1×3, 1×4, 1×6, 1×8, 1×10, 1×12, 1×16 · 2×2, 2×3, 2×4, 2×6, 2×8, 2×10 · 4×6, 4×10, 4×12, 4×18 |
| Tall bricks (8) | 1×1×3, 1×1×5, 1×2×2, 1×2×3, 1×2×5, 1×4×3, 1×6×5, 2×2×3 |
| Plates (33) | 1×1 to 1×12 · 2×2 to 2×16 · 3×3 · 4×4 to 4×12 · 6×6 to 6×16, 6×24 · 8×8, 8×16 · 16×16 |
| Tiles (12) | 1×1, 1×2, 1×3, 1×4, 1×6, 1×8 · 2×2, 2×3, 2×4, 2×6 · 6×6 · 8×16 |
| Slopes (21) | 45° 2×1, 2×2, 2×3, 2×4 · 33° 3×1, 3×2, 3×3, 3×4 · 18° 4×1, 4×2 · 65° 2×1×2, 2×2×2 · 75° 2×1×3, 2×2×3 · 30° 1×1 (cheese), 1×2 · inverted 45° 2×1, 2×2 · inverted 33° 3×1, 3×2 · inverted 75° 2×1×3 |
| Round (15) | round brick 1×1, 2×2, 4×4 · round plate 1×1, 2×2, 4×4, 6×6, 8×8 · round tile 1×1, 2×2, 3×3, 4×4 · cone 1×1, 2×2×2, 4×4×2 |

All parts come in 36 colors, including 3 transparent ones, and rotate in four directions. To find a part quickly, type a size such as `2x4` or a name such as `cone` in the palette filter. The filter searches every category.

## Controls

| Action | Mouse / keyboard | Touch |
| --- | --- | --- |
| Place part | Click | Tap, or drag to aim and lift to place |
| Rotate part | `R` | Rotate button |
| Tools: Build / Paint / Erase / Pick | `1` `2` `3` `4` | Toolbar |
| Rotate view | Right-drag, `Q` / `E` | View buttons |
| Pan / zoom | Middle-drag / scroll | Two-finger drag / pinch |
| Undo / redo | `⌘Z` / `⇧⌘Z` | Top bar |
| Instruction pages | `←` `→` | Swipe |
| Clear the part filter | `Esc` | Clear button |
| Show or hide instructions or steps | `I` | Book button |
| Next / previous step (photo builds) | `→` `←` | Step arrows |
| Top view of the whole board | `T` | Grid button |

## Saving and sharing

- Builds, thumbnails and instruction PDFs are saved automatically in the browser (IndexedDB).
- **••• → Export build** saves a `.brickbuild.json` file. Use **Import a build file** on the home screen, or drag the file onto it, to open it on another device.
- **••• → Save image** saves a picture of your build.
- **Parts list** counts every part by color and type.

## Development

Only needed if you want to change the code. Requires Node 22 or newer.

```sh
npm install
npm run dev       # http://localhost:5173
npm run build     # type-check and build to dist/
npm run preview   # serve the production build
```

### Project layout

```
src/
  main.ts          hash router (#/ = home, #/build/<id> = builder)
  home.ts          home screen, project list, build-file import
  importDialog.ts  set number lookup and multi-booklet PDF import
  mosaicDialog.ts  "Build from a Photo" window with live preview
  mosaic.ts        picture to mosaic: sampling, color matching, dithering, parts, steps
  guidePanel.ts    guided steps panel: outlines, parts per step, progress
  builderView.ts   builder screen: toolbar, palette, instructions panel
  builder.ts       Three.js scene, isometric camera, stud-grid placement, undo/redo
  bricks.ts        parts catalog, colors, part geometry
  partIcons.ts     renders the palette's part thumbnails in the current color
  pdfViewer.ts     pdf.js page rendering (loaded only when needed)
  storage.ts       IndexedDB persistence for projects and PDFs
  ui.ts            DOM helpers, icons, toasts
```

Stack: TypeScript, Vite, Three.js, pdf.js, idb-keyval.

### How placement works

The baseplate is a 48×48 stud grid. Heights are counted in plate layers, and a brick is 3 plates tall. The game records which cells every placed part fills. When you place a part, it lands on top of whatever you are pointing at and moves up until it no longer overlaps anything.

### Updating BrickBuilder.html

`BrickBuilder.html` is generated. After changing the source, rebuild it and commit the result:

```sh
npm run build:standalone
```

This bundles the game, Three.js, pdf.js (including its worker), the styles and the icon into a single file that runs from `file://`. The settings are in `vite.standalone.config.ts`. `npm run build` still produces the normal multi-file web build in `dist/` for hosting on a web server.

## Disclaimer

Brick Builder is a fan project and is not affiliated with, sponsored by or endorsed by the LEGO Group. LEGO® is a trademark of the LEGO Group. Instruction PDFs belong to their owners and are only stored on your own device.
