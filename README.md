# Brick Builder

A browser game for building brick sets in an isometric 3D view. Runs in Safari on iOS/iPadOS/macOS 26, and in Chrome, Firefox and Edge.

## Game modes

- **Build a Set**: upload an official building-instruction PDF. The instructions open next to the baseplate, and you rebuild the model page by page. Your page and progress are saved.
- **Free Build**: an empty 48×48 baseplate with bricks, plates and tiles in 23 colors.

## Controls

| Action | Mouse / keyboard | Touch |
| --- | --- | --- |
| Place brick | Click | Tap, or drag to aim and lift to place |
| Rotate brick | `R` | Rotate button |
| Tools: Build / Paint / Erase / Pick | `1` `2` `3` `4` | Toolbar |
| Orbit camera | Right-drag, `Q` / `E` | View buttons |
| Pan / zoom | Middle-drag / scroll | Two-finger drag / pinch |
| Undo / redo | `⌘Z` / `⇧⌘Z` | Toolbar |
| Instruction pages | `←` `→`, `I` toggles panel | Swipe |

Builds and PDFs are stored locally in IndexedDB. Nothing is uploaded.

## Development

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # outputs dist/
```

Stack: TypeScript, Vite, Three.js, pdf.js, idb-keyval.

Brick Builder is a fan project and is not affiliated with or endorsed by the LEGO Group. LEGO® is a trademark of the LEGO Group.
