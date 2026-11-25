# Brick Builder

A browser game for building brick sets in an isometric 3D view. You can rebuild a real set from its official instruction PDFs, or build freely on an empty baseplate.

It runs in Safari on iOS, iPadOS and macOS 26, and in Chrome, Edge and Firefox. Everything stays on your device. There is no account and no server.

## Game modes

### Build a Set

1. Click **Build a Set → Import instructions**.
2. Type the set number from the box (for example `10497`) and click **Find instructions**. The set's official page opens on lego.com.
3. Download the instruction PDFs. Bigger sets have several booklets. Drop or choose them all in the import window, and use the arrows to put them in build order.
4. Click **Import**.

The instructions open next to the baseplate, or above it on a phone. Turning the page past the end of one booklet goes on to the next. Your booklet and page are saved, and the progress bar covers the whole set. You can add a booklet you forgot later from **••• → Add booklet**.

> Why not download the PDFs automatically? LEGO's servers don't allow other websites to fetch their files (no CORS headers), so the browser blocks it. Downloading them yourself takes one tap and keeps the game fully offline.

You can also drop PDFs anywhere on the home screen to open the import window.

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

All parts come in 23 colors, including 3 transparent ones, and rotate in four directions. To find a part quickly, type a size such as `2x4` or a name such as `cone` in the palette filter. The filter searches every category.

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
| Show or hide instructions | `I` | Book button |

## Saving and sharing

- Builds, thumbnails and instruction PDFs are saved automatically in the browser (IndexedDB).
- **••• → Export build** saves a `.brickbuild.json` file. Use **Import a build file** on the home screen, or drag the file onto it, to open it on another device.
- **••• → Save image** saves a picture of your build.
- **Parts list** counts every part by color and type.
- On iPhone and iPad, choose **Share → Add to Home Screen** to open it full screen like an app.

## Development

Requires Node 22 or newer.

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

### Deploying

`.github/workflows/deploy.yml` builds the game and publishes `dist/` to GitHub Pages whenever `main` is pushed. To enable it, go to **Settings → Pages** and set the source to **GitHub Actions**.

## Disclaimer

Brick Builder is a fan project and is not affiliated with, sponsored by or endorsed by the LEGO Group. LEGO® is a trademark of the LEGO Group. Instruction PDFs belong to their owners and are only stored on your own device.
