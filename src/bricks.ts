import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** World units: 1 stud pitch = 1 unit. Heights are counted in plate layers. */
export const PLATE_H = 0.4;
export const BRICK_LAYERS = 3;

export type Kind = 'brick' | 'plate' | 'tile';

export interface BrickType {
  id: string;
  kind: Kind;
  w: number;
  d: number;
  layers: number;
}

export interface BrickColor {
  id: string;
  name: string;
  hex: string;
}

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
  /** 1 = rotated 90° (w/d swapped) */
  r: 0 | 1;
}

const sizes: Record<Kind, [number, number][]> = {
  brick: [[1, 1], [1, 2], [1, 3], [1, 4], [1, 6], [1, 8], [2, 2], [2, 3], [2, 4], [2, 6], [2, 8]],
  plate: [[1, 1], [1, 2], [1, 3], [1, 4], [1, 6], [1, 8], [2, 2], [2, 3], [2, 4], [2, 6], [2, 8], [4, 4], [4, 6], [6, 6], [6, 8]],
  tile: [[1, 1], [1, 2], [1, 3], [1, 4], [1, 6], [2, 2], [2, 4]],
};

export const BRICK_TYPES: BrickType[] = (Object.keys(sizes) as Kind[]).flatMap((kind) =>
  sizes[kind].map(([w, d]) => ({
    id: `${kind}-${w}x${d}`,
    kind,
    w,
    d,
    layers: kind === 'brick' ? BRICK_LAYERS : 1,
  })),
);

export const TYPE_BY_ID = new Map(BRICK_TYPES.map((t) => [t.id, t]));

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

export function footprint(b: Pick<PlacedBrick, 't' | 'r'>): { w: number; d: number; layers: number } {
  const t = TYPE_BY_ID.get(b.t)!;
  return b.r ? { w: t.d, d: t.w, layers: t.layers } : { w: t.w, d: t.d, layers: t.layers };
}

export function typeLabel(t: BrickType): string {
  return `${t.w}×${t.d}`;
}

const STUD_R = 0.3;
const STUD_H = 0.17;
const GAP = 0.015;

const geoCache = new Map<string, THREE.BufferGeometry>();

/** Geometry with its min corner at the origin, extending +x (w), +y, +z (d). */
export function brickGeometry(w: number, d: number, layers: number, kind: Kind): THREE.BufferGeometry {
  const key = `${w}x${d}x${layers}${kind}`;
  const cached = geoCache.get(key);
  if (cached) return cached;

  const h = layers * PLATE_H;
  const parts: THREE.BufferGeometry[] = [];
  const body = new THREE.BoxGeometry(w - GAP * 2, h - GAP, d - GAP * 2);
  body.translate(w / 2, (h - GAP) / 2, d / 2);
  parts.push(body);

  if (kind !== 'tile') {
    for (let i = 0; i < w; i++) {
      for (let j = 0; j < d; j++) {
        const stud = new THREE.CylinderGeometry(STUD_R, STUD_R, STUD_H, 20);
        stud.translate(i + 0.5, h - GAP + STUD_H / 2, j + 0.5);
        parts.push(stud);
      }
    }
  }

  const merged = mergeGeometries(parts.map((p) => p.toNonIndexed()));
  parts.forEach((p) => p.dispose());
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  geoCache.set(key, merged);
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
