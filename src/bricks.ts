import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** World units: 1 stud pitch = 1 unit. Heights are counted in plate layers. */
export const PLATE_H = 0.4;
export const BRICK_LAYERS = 3;

/** Palette tab a part is listed under. */
export type Category = 'brick' | 'plate' | 'tile' | 'slope' | 'round';
export type Shape = 'box' | 'slope' | 'slope-inv' | 'round' | 'cone';

export interface BrickType {
  id: string;
  category: Category;
  shape: Shape;
  /** studs across (x, before rotation) */
  w: number;
  /** studs deep (z, before rotation). For slopes this is the run of the slope. */
  d: number;
  layers: number;
  studs: boolean;
  /** slopes: number of flat stud rows at the back */
  flat?: number;
  /** slopes: height of the vertical lip at the low end, world units */
  lip?: number;
  label: string;
  name: string;
}

export interface BrickColor {
  id: string;
  name: string;
  hex: string;
}

export type Rotation = 0 | 1 | 2 | 3;

export interface PlacedBrick {
  id: number;
  /** brick type id */
  t: string;
  /** color id */
  c: string;
  /** min-corner grid cell */
  x: number;
  z: number;
  /** bottom layer (plate units) */
  y: number;
  /** quarter turns around the vertical axis */
  r: Rotation;
}

const box = (category: 'brick' | 'plate' | 'tile', w: number, d: number): BrickType => ({
  id: `${category}-${w}x${d}`,
  category,
  shape: 'box',
  w,
  d,
  layers: category === 'brick' ? BRICK_LAYERS : 1,
  studs: category !== 'tile',
  label: `${w}×${d}`,
  name: `${category} ${w}×${d}`,
});

const slope = (
  id: string,
  label: string,
  name: string,
  w: number,
  d: number,
  o: { flat?: number; layers?: number; lip?: number; inverted?: boolean } = {},
): BrickType => ({
  id,
  category: 'slope',
  shape: o.inverted ? 'slope-inv' : 'slope',
  w,
  d,
  layers: o.layers ?? BRICK_LAYERS,
  studs: (o.flat ?? 1) > 0 || !!o.inverted,
  flat: o.flat ?? 1,
  lip: o.lip ?? 0.12,
  label,
  name,
});

const round = (id: string, label: string, name: string, w: number, layers: number, o: { studs?: boolean; cone?: boolean } = {}): BrickType => ({
  id,
  category: 'round',
  shape: o.cone ? 'cone' : 'round',
  w,
  d: w,
  layers,
  studs: o.studs ?? true,
  label,
  name,
});

export const BRICK_TYPES: BrickType[] = [
  ...([[1, 1], [1, 2], [1, 3], [1, 4], [1, 6], [1, 8], [2, 2], [2, 3], [2, 4], [2, 6], [2, 8]] as const).map(([w, d]) => box('brick', w, d)),
  ...([[1, 1], [1, 2], [1, 3], [1, 4], [1, 6], [1, 8], [2, 2], [2, 3], [2, 4], [2, 6], [2, 8], [4, 4], [4, 6], [6, 6], [6, 8]] as const).map(([w, d]) => box('plate', w, d)),
  ...([[1, 1], [1, 2], [1, 3], [1, 4], [1, 6], [2, 2], [2, 4]] as const).map(([w, d]) => box('tile', w, d)),

  slope('slope45-2x1', '45° 2×1', 'slope 45° 2×1', 1, 2),
  slope('slope45-2x2', '45° 2×2', 'slope 45° 2×2', 2, 2),
  slope('slope45-2x4', '45° 2×4', 'slope 45° 2×4', 4, 2),
  slope('slope33-3x1', '33° 3×1', 'slope 33° 3×1', 1, 3),
  slope('slope33-3x2', '33° 3×2', 'slope 33° 3×2', 2, 3),
  slope('slope33-3x4', '33° 3×4', 'slope 33° 3×4', 4, 3),
  slope('slope30-1x1', 'Cheese', 'slope 30° 1×1 (cheese)', 1, 1, { flat: 0, layers: 2, lip: 0.05 }),
  slope('slope30-2x1', '30° 1×2', 'slope 30° 1×2 (2 plates)', 1, 2, { flat: 0, layers: 2, lip: 0.05 }),
  slope('slope45inv-2x1', 'Inv 2×1', 'inverted slope 45° 2×1', 1, 2, { inverted: true }),
  slope('slope45inv-2x2', 'Inv 2×2', 'inverted slope 45° 2×2', 2, 2, { inverted: true }),

  round('round-brick-1x1', 'Brick 1×1', 'round brick 1×1', 1, BRICK_LAYERS),
  round('round-brick-2x2', 'Brick 2×2', 'round brick 2×2', 2, BRICK_LAYERS),
  round('round-plate-1x1', 'Plate 1×1', 'round plate 1×1', 1, 1),
  round('round-plate-2x2', 'Plate 2×2', 'round plate 2×2', 2, 1),
  round('round-tile-1x1', 'Tile 1×1', 'round tile 1×1', 1, 1, { studs: false }),
  round('round-tile-2x2', 'Tile 2×2', 'round tile 2×2', 2, 1, { studs: false }),
  round('cone-1x1', 'Cone 1×1', 'cone 1×1', 1, BRICK_LAYERS, { cone: true }),
];

export const TYPE_BY_ID = new Map(BRICK_TYPES.map((t) => [t.id, t]));

export const CATEGORIES: [Category, string][] = [
  ['brick', 'Bricks'],
  ['plate', 'Plates'],
  ['tile', 'Tiles'],
  ['slope', 'Slopes'],
  ['round', 'Round'],
];

export const COLORS: BrickColor[] = [
  { id: 'white', name: 'White', hex: '#f4f4f4' },
  { id: 'lightgray', name: 'Light Gray', hex: '#a0a5a9' },
  { id: 'darkgray', name: 'Dark Gray', hex: '#6c6e68' },
  { id: 'black', name: 'Black', hex: '#1f2124' },
  { id: 'red', name: 'Red', hex: '#c91a09' },
  { id: 'darkred', name: 'Dark Red', hex: '#720e0f' },
  { id: 'orange', name: 'Orange', hex: '#fe8a18' },
  { id: 'yellow', name: 'Yellow', hex: '#f2cd37' },
  { id: 'lime', name: 'Lime', hex: '#bbe90b' },
  { id: 'green', name: 'Green', hex: '#237841' },
  { id: 'darkgreen', name: 'Dark Green', hex: '#184632' },
  { id: 'azure', name: 'Azure', hex: '#36aebf' },
  { id: 'blue', name: 'Blue', hex: '#0055bf' },
  { id: 'darkblue', name: 'Dark Blue', hex: '#0a3463' },
  { id: 'purple', name: 'Purple', hex: '#81007b' },
  { id: 'pink', name: 'Pink', hex: '#e4adc8' },
  { id: 'tan', name: 'Tan', hex: '#e4cd9e' },
  { id: 'darktan', name: 'Dark Tan', hex: '#958a73' },
  { id: 'brown', name: 'Brown', hex: '#583927' },
  { id: 'nougat', name: 'Nougat', hex: '#d09168' },
  { id: 'clear', name: 'Trans Clear', hex: '#e8f4ff' },
  { id: 'transblue', name: 'Trans Blue', hex: '#5fa8e8' },
  { id: 'transred', name: 'Trans Red', hex: '#e8423a' },
];

export const COLOR_BY_ID = new Map(COLORS.map((c) => [c.id, c]));

export const isTransparent = (colorId: string) => colorId === 'clear' || colorId.startsWith('trans');

/** Grid footprint after rotation. */
export function footprint(b: Pick<PlacedBrick, 't' | 'r'>): { w: number; d: number; layers: number } {
  const t = TYPE_BY_ID.get(b.t)!;
  return b.r % 2 ? { w: t.d, d: t.w, layers: t.layers } : { w: t.w, d: t.d, layers: t.layers };
}

const STUD_R = 0.3;
const STUD_H = 0.17;
const GAP = 0.015;
const SEG = 28;

function stud(x: number, y: number, z: number, r = STUD_R): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, STUD_H, 20);
  g.translate(x, y + STUD_H / 2, z);
  return g;
}

/** Side profile (z, y) of a slope, extruded across its width. Low end faces -z. */
function slopeBody(t: BrickType, h: number): THREE.BufferGeometry {
  const d = t.d - GAP * 2;
  const flat = t.flat ?? 1;
  const lip = t.lip ?? 0.12;
  const s = new THREE.Shape();
  if (t.shape === 'slope') {
    const run = d - flat; // where the flat top starts
    s.moveTo(0, 0);
    s.lineTo(d, 0);
    s.lineTo(d, h);
    s.lineTo(run, h);
    s.lineTo(0, lip);
  } else {
    // inverted: flat top over the full depth, underside cut away towards the front
    const foot = 1 - GAP * 2;
    s.moveTo(d - foot, 0);
    s.lineTo(d, 0);
    s.lineTo(d, h);
    s.lineTo(0, h);
    s.lineTo(0, h - lip * 2);
  }
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: t.w - GAP * 2, bevelEnabled: false, curveSegments: 1 });
  // shape x → world z, shape y → world y, extrusion → world x
  g.rotateY(-Math.PI / 2);
  g.translate(t.w - GAP, 0, GAP);
  return g;
}

const geoCache = new Map<string, THREE.BufferGeometry>();

/** Geometry for an un-rotated part, centered on x/z, resting on y = 0. */
export function brickGeometry(t: BrickType): THREE.BufferGeometry {
  const cached = geoCache.get(t.id);
  if (cached) return cached;

  const h = t.layers * PLATE_H - GAP;
  const parts: THREE.BufferGeometry[] = [];

  switch (t.shape) {
    case 'box': {
      const body = new THREE.BoxGeometry(t.w - GAP * 2, h, t.d - GAP * 2);
      body.translate(t.w / 2, h / 2, t.d / 2);
      parts.push(body);
      if (t.studs) for (let i = 0; i < t.w; i++) for (let j = 0; j < t.d; j++) parts.push(stud(i + 0.5, h, j + 0.5));
      break;
    }
    case 'slope':
    case 'slope-inv': {
      parts.push(slopeBody(t, h));
      const rows = t.shape === 'slope' ? t.flat ?? 1 : t.d;
      for (let i = 0; i < t.w; i++) for (let j = t.d - rows; j < t.d; j++) parts.push(stud(i + 0.5, h, j + 0.5));
      break;
    }
    case 'round': {
      const r = t.w / 2 - GAP;
      const body = new THREE.CylinderGeometry(r, r, h, SEG * t.w);
      body.translate(t.w / 2, h / 2, t.d / 2);
      parts.push(body);
      if (t.studs) {
        if (t.w === 1) parts.push(stud(0.5, h, 0.5));
        else for (let i = 0; i < t.w; i++) for (let j = 0; j < t.d; j++) parts.push(stud(i + 0.5, h, j + 0.5));
      }
      break;
    }
    case 'cone': {
      const top = 0.26;
      const body = new THREE.CylinderGeometry(top, t.w / 2 - GAP, h, SEG);
      body.translate(t.w / 2, h / 2, t.d / 2);
      parts.push(body);
      parts.push(stud(t.w / 2, h, t.d / 2, 0.22));
      break;
    }
  }

  const merged = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  parts.forEach((p) => p.dispose());
  merged.translate(-t.w / 2, 0, -t.d / 2);
  // Point the low side of slopes towards the default camera.
  if (t.shape === 'slope' || t.shape === 'slope-inv') merged.rotateY(Math.PI);
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  geoCache.set(t.id, merged);
  return merged;
}

const matCache = new Map<string, THREE.MeshStandardMaterial>();

export function brickMaterial(colorId: string): THREE.MeshStandardMaterial {
  const cached = matCache.get(colorId);
  if (cached) return cached;
  const color = COLOR_BY_ID.get(colorId) ?? COLORS[0];
  const transparent = isTransparent(color.id);
  const mat = new THREE.MeshStandardMaterial({
    color: color.hex,
    roughness: transparent ? 0.1 : 0.35,
    metalness: 0,
    transparent,
    opacity: transparent ? 0.55 : 1,
  });
  matCache.set(colorId, mat);
  return mat;
}
