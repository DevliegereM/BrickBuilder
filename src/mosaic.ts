import { COLORS, COLOR_BY_ID, type PlacedBrick, TYPE_BY_ID, isTransparent } from './bricks';

export type MosaicStyle = 'round' | 'tile' | 'plate';

export interface MosaicOptions {
  /** studs across */
  width: number;
  /** studs down */
  height: number;
  style: MosaicStyle;
  /** merge same-coloured areas into bigger parts (not possible with round tiles) */
  mixed: boolean;
  /** 0 = use every colour */
  maxColors: number;
  dither: boolean;
}

export interface Mosaic {
  width: number;
  height: number;
  /** colour id per stud, row-major */
  cells: string[];
  /** every part of the finished build, in build order */
  bricks: PlacedBrick[];
  /** bricks grouped into build steps */
  steps: PlacedBrick[][];
  colors: string[];
}

export const BOARD = 48;
const SECTION = 16;
const BAND = 4;

// ---------- colour science ----------

type Lab = [number, number, number];

const srgbToLinear = (c: number) => {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

function rgbToLab(r: number, g: number, b: number): Lab {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const x = f((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047);
  const y = f(R * 0.2126 + G * 0.7152 + B * 0.0722);
  const z = f((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

const hexToLab = (hex: string): Lab => {
  const n = parseInt(hex.slice(1), 16);
  return rgbToLab((n >> 16) & 255, (n >> 8) & 255, n & 255);
};

const dist2 = (a: Lab, b: Lab) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/** Opaque colours only: transparent parts don't read well in a picture. */
const MOSAIC_COLORS = COLORS.filter((c) => !isTransparent(c.id)).map((c) => ({ id: c.id, lab: hexToLab(c.hex) }));

function nearest(lab: Lab, palette: typeof MOSAIC_COLORS) {
  let best = palette[0];
  let bestD = Infinity;
  for (const p of palette) {
    const d = dist2(lab, p.lab);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

// ---------- image sampling ----------

/** Centre-crops the image to the mosaic's aspect ratio and averages each stud's area. */
function sample(img: CanvasImageSource & { width: number; height: number }, w: number, h: number): Lab[] {
  const SS = 6; // sub-samples per stud along each axis
  const canvas = document.createElement('canvas');
  canvas.width = w * SS;
  canvas.height = h * SS;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const target = w / h;
  const src = img.width / img.height;
  let sw = img.width;
  let sh = img.height;
  if (src > target) sw = img.height * target;
  else sh = img.width / target;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#fff'; // transparent PNG areas become white
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

  const out: Lab[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Average in linear light, then convert once.
      let r = 0;
      let g = 0;
      let b = 0;
      for (let j = 0; j < SS; j++) {
        for (let i = 0; i < SS; i++) {
          const k = ((y * SS + j) * canvas.width + x * SS + i) * 4;
          r += srgbToLinear(data[k]);
          g += srgbToLinear(data[k + 1]);
          b += srgbToLinear(data[k + 2]);
        }
      }
      const n = SS * SS;
      const toSrgb = (v: number) => 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);
      out.push(rgbToLab(toSrgb(r / n), toSrgb(g / n), toSrgb(b / n)));
    }
  }
  return out;
}

function quantize(labs: Lab[], w: number, h: number, palette: typeof MOSAIC_COLORS, dither: boolean): string[] {
  const work = labs.map((l) => [...l] as Lab);
  const out: string[] = new Array(labs.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const p = nearest(work[i], palette);
      out[i] = p.id;
      if (!dither) continue;
      // Floyd–Steinberg, damped a little so flat areas stay calm.
      const err = [0, 1, 2].map((c) => (work[i][c] - p.lab[c]) * 0.85);
      const push = (dx: number, dy: number, f: number) => {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= w || ny >= h) return;
        const t = work[ny * w + nx];
        for (let c = 0; c < 3; c++) t[c] += err[c] * f;
      };
      push(1, 0, 7 / 16);
      push(-1, 1, 3 / 16);
      push(0, 1, 5 / 16);
      push(1, 1, 1 / 16);
    }
  }
  return out;
}

// ---------- parts and steps ----------

const partId = (style: MosaicStyle, w: number, d: number) =>
  style === 'round' ? 'round-tile-1x1' : `${style}-${w}x${d}`;

/** Rectangles to try, biggest first, limited to parts that exist in the catalogue. */
function partSizes(style: MosaicStyle, mixed: boolean): { w: number; d: number; id: string; r: 0 | 1 }[] {
  if (style === 'round' || !mixed) return [{ w: 1, d: 1, id: partId(style, 1, 1), r: 0 }];
  const out: { w: number; d: number; id: string; r: 0 | 1 }[] = [];
  for (const [a, b] of [[2, 8], [2, 6], [2, 4], [2, 3], [2, 2], [1, 8], [1, 6], [1, 4], [1, 3], [1, 2], [1, 1]]) {
    const id = partId(style, a, b);
    if (!TYPE_BY_ID.has(id)) continue;
    // Catalogue parts are a×b with a across; r = 1 turns them so b runs across.
    out.push({ w: b, d: a, id, r: 1 });
    if (a !== b) out.push({ w: a, d: b, id, r: 0 });
  }
  return out.sort((p, q) => q.w * q.d - p.w * p.d || q.w - p.w);
}

/**
 * Splits the picture into 16×16 sections built four rows at a time, and covers each
 * band with the largest same-coloured parts that fit inside it.
 */
function buildSteps(cells: string[], w: number, h: number, opts: MosaicOptions): PlacedBrick[][] {
  const ox = Math.floor((BOARD - w) / 2);
  const oz = Math.floor((BOARD - h) / 2);
  const sizes = partSizes(opts.style, opts.mixed);
  const used = new Uint8Array(w * h);
  const steps: PlacedBrick[][] = [];
  let id = 1;

  for (let sy = 0; sy < h; sy += SECTION) {
    for (let sx = 0; sx < w; sx += SECTION) {
      const sx2 = Math.min(sx + SECTION, w);
      const sy2 = Math.min(sy + SECTION, h);
      for (let by = sy; by < sy2; by += BAND) {
        const by2 = Math.min(by + BAND, sy2);
        const step: PlacedBrick[] = [];
        for (let y = by; y < by2; y++) {
          for (let x = sx; x < sx2; x++) {
            if (used[y * w + x]) continue;
            const color = cells[y * w + x];
            const fit = sizes.find((s) => {
              if (x + s.w > sx2 || y + s.d > by2) return false;
              for (let j = 0; j < s.d; j++)
                for (let i = 0; i < s.w; i++) {
                  const k = (y + j) * w + x + i;
                  if (used[k] || cells[k] !== color) return false;
                }
              return true;
            })!;
            for (let j = 0; j < fit.d; j++) for (let i = 0; i < fit.w; i++) used[(y + j) * w + x + i] = 1;
            step.push({ id: id++, t: fit.id, c: color, x: ox + x, y: 0, z: oz + y, r: fit.r });
          }
        }
        if (step.length) steps.push(step);
      }
    }
  }
  return steps;
}

export function createMosaic(img: CanvasImageSource & { width: number; height: number }, opts: MosaicOptions): Mosaic {
  const { width: w, height: h } = opts;
  const labs = sample(img, w, h);

  let palette = MOSAIC_COLORS;
  if (opts.maxColors > 0 && opts.maxColors < palette.length) {
    // Keep the colours the picture uses most, then map again with only those.
    const counts = new Map<string, number>();
    for (const l of labs) {
      const id = nearest(l, MOSAIC_COLORS).id;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const keep = new Set([...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, opts.maxColors).map(([id]) => id));
    palette = MOSAIC_COLORS.filter((c) => keep.has(c.id));
  }

  const cells = quantize(labs, w, h, palette, opts.dither);
  const steps = buildSteps(cells, w, h, opts);
  return { width: w, height: h, cells, steps, bricks: steps.flat(), colors: [...new Set(cells)] };
}

/** Draws the mosaic as studs/tiles; optionally dims everything but the given step. */
export function drawMosaic(
  canvas: HTMLCanvasElement,
  m: Pick<Mosaic, 'width' | 'height' | 'steps'>,
  style: MosaicStyle,
  focus?: { step: number; done?: (b: PlacedBrick) => boolean },
) {
  const px = Math.max(4, Math.floor(Math.min(canvas.width / m.width, canvas.height / m.height)));
  const ctx = canvas.getContext('2d')!;
  canvas.width = m.width * px;
  canvas.height = m.height * px;
  ctx.fillStyle = '#1b1c20';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const ox = Math.floor((BOARD - m.width) / 2);
  const oz = Math.floor((BOARD - m.height) / 2);

  m.steps.forEach((step, si) => {
    for (const b of step) {
      const t = TYPE_BY_ID.get(b.t)!;
      const fw = b.r % 2 ? t.d : t.w;
      const fd = b.r % 2 ? t.w : t.d;
      const x = (b.x - ox) * px;
      const y = (b.z - oz) * px;
      let alpha = 1;
      if (focus) {
        if (si > focus.step) alpha = 0.18;
        else if (si === focus.step) alpha = focus.done?.(b) ? 1 : 0.95;
      }
      ctx.globalAlpha = alpha;
      ctx.fillStyle = COLOR_BY_ID.get(b.c)!.hex;
      if (style === 'round') {
        ctx.beginPath();
        ctx.arc(x + px / 2, y + px / 2, px * 0.46, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(x + 0.5, y + 0.5, fw * px - 1, fd * px - 1);
        if (style === 'plate' && px >= 6) {
          ctx.fillStyle = 'rgba(255,255,255,0.18)';
          for (let i = 0; i < fw; i++)
            for (let j = 0; j < fd; j++) {
              ctx.beginPath();
              ctx.arc(x + (i + 0.5) * px, y + (j + 0.5) * px, px * 0.3, 0, Math.PI * 2);
              ctx.fill();
            }
        }
      }
    }
  });
  ctx.globalAlpha = 1;

  if (focus && m.steps[focus.step]) {
    // Outline the current step's area.
    const s = m.steps[focus.step];
    const xs = s.map((b) => b.x - ox);
    const zs = s.map((b) => b.z - oz);
    const maxX = Math.max(...s.map((b) => b.x - ox + (b.r % 2 ? TYPE_BY_ID.get(b.t)!.d : TYPE_BY_ID.get(b.t)!.w)));
    const maxZ = Math.max(...s.map((b) => b.z - oz + (b.r % 2 ? TYPE_BY_ID.get(b.t)!.w : TYPE_BY_ID.get(b.t)!.d)));
    ctx.strokeStyle = '#f5c518';
    ctx.lineWidth = Math.max(2, px / 3);
    ctx.strokeRect(Math.min(...xs) * px, Math.min(...zs) * px, (maxX - Math.min(...xs)) * px, (maxZ - Math.min(...zs)) * px);
  }
}
