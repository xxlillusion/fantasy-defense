// Tiny software pixel canvas used to build procedural sprites.
// Pixels are 0xRRGGBB, or -1 for transparent. Parts are usually drawn on separate layers,
// outlined individually (colored "sel-out" outline) and composited back to front.

import { outlineOf, type Ramp } from './palette';

export const CLEAR = -1;

/** Color or a per-pixel shader. u, v are normalized [-1, 1] within the shape's bounds. */
export type Paint = number | ((u: number, v: number, x: number, y: number) => number);

/** Upper-left key light cel shading with 3 tones + optional highlight pixels. */
export function cel(r: Ramp, opts: { hi?: number; lx?: number; ly?: number; soft?: number } = {}): Paint {
  const lx = opts.lx ?? -0.55;
  const ly = opts.ly ?? -0.8;
  const soft = opts.soft ?? 0;
  return (u, v) => {
    const d = u * lx + v * ly;
    if (opts.hi !== undefined && d > opts.hi) return r.h;
    if (d > 0.45 - soft) return r.l;
    if (d < -0.35 + soft) return r.d;
    return r.m;
  };
}

/** Vertical cylinder shading (bright band left of center, dark right edge). */
export function cylinderX(r: Ramp): Paint {
  return (u) => (u < -0.75 ? r.m : u < -0.3 ? r.l : u < -0.1 ? r.h : u < 0.5 ? r.m : r.d);
}

/** Horizontal cylinder shading (bright band near top). */
export function cylinderY(r: Ramp): Paint {
  return (_u, v) => (v < -0.75 ? r.m : v < -0.35 ? r.l : v < -0.1 ? r.h : v < 0.45 ? r.m : r.d);
}

export class PixelCanvas {
  readonly px: Int32Array;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.px = new Int32Array(w * h).fill(CLEAR);
  }

  get(x: number, y: number): number {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return CLEAR;
    return this.px[y * this.w + x]!;
  }

  set(x: number, y: number, c: number): void {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.px[y * this.w + x] = c;
  }

  /** Set only where already opaque (for painting details onto an existing shape). */
  paintOver(x: number, y: number, c: number): void {
    if (this.get(x, y) !== CLEAR) this.set(x, y, c);
  }

  clone(): PixelCanvas {
    const p = new PixelCanvas(this.w, this.h);
    p.px.set(this.px);
    return p;
  }

  rect(x: number, y: number, w: number, h: number, paint: Paint): this {
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const u = w > 1 ? (i / (w - 1)) * 2 - 1 : 0;
        const v = h > 1 ? (j / (h - 1)) * 2 - 1 : 0;
        this.set(x + i, y + j, resolve(paint, u, v, x + i, y + j));
      }
    return this;
  }

  /** Filled ellipse centered at (cx, cy) (pixel-center coordinates allowed, e.g. 10.5). */
  ellipse(cx: number, cy: number, rx: number, ry: number, paint: Paint, clip?: (x: number, y: number) => boolean): this {
    const x0 = Math.floor(cx - rx), x1 = Math.ceil(cx + rx);
    const y0 = Math.floor(cy - ry), y1 = Math.ceil(cy + ry);
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const u = (x + 0.5 - cx) / rx;
        const v = (y + 0.5 - cy) / ry;
        if (u * u + v * v > 1) continue;
        if (clip && !clip(x, y)) continue;
        this.set(x, y, resolve(paint, u, v, x, y));
      }
    return this;
  }

  /** Filled polygon (even-odd), shaded relative to its bounding box. */
  poly(pts: readonly (readonly [number, number])[], paint: Paint): this {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of pts) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++)
      for (let x = Math.floor(minX); x <= Math.ceil(maxX); x++) {
        const px = x + 0.5, py = y + 0.5;
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i]!;
          const [xj, yj] = pts[j]!;
          if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
        }
        if (!inside) continue;
        const u = maxX > minX ? ((px - minX) / (maxX - minX)) * 2 - 1 : 0;
        const v = maxY > minY ? ((py - minY) / (maxY - minY)) * 2 - 1 : 0;
        this.set(x, y, resolve(paint, u, v, x, y));
      }
    return this;
  }

  /** Bresenham line, optional thickness (square brush). */
  line(x0: number, y0: number, x1: number, y1: number, c: number, thick = 1): this {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      for (let a = 0; a < thick; a++) for (let b = 0; b < thick; b++) this.set(x0 + a, y0 + b, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
    return this;
  }

  /** Stamp a character grid. '.' and ' ' are transparent; unknown chars are skipped. */
  rows(grid: readonly string[], pal: Record<string, number>, ox: number, oy: number, flipX = false): this {
    grid.forEach((row, j) => {
      for (let i = 0; i < row.length; i++) {
        const ch = row[i]!;
        const c = pal[ch];
        if (c === undefined) continue;
        const x = flipX ? ox + row.length - 1 - i : ox + i;
        this.set(x, oy + j, c);
      }
    });
    return this;
  }

  /** Add a 1px colored outline around the opaque silhouette (4-neighbour). */
  outline(color?: number): this {
    const src = this.px.slice();
    const { w, h } = this;
    const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? CLEAR : src[y * w + x]!);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (src[y * w + x] !== CLEAR) continue;
        const n = [at(x, y - 1), at(x - 1, y), at(x + 1, y), at(x, y + 1)].find((c) => c !== CLEAR);
        if (n !== undefined) this.px[y * w + x] = color ?? outlineOf(n);
      }
    return this;
  }

  /** Composite another canvas on top (opaque pixels only). */
  blit(src: PixelCanvas, ox = 0, oy = 0, flipX = false): this {
    for (let y = 0; y < src.h; y++)
      for (let x = 0; x < src.w; x++) {
        const c = src.px[y * src.w + x]!;
        if (c === CLEAR) continue;
        this.set(flipX ? ox + src.w - 1 - x : ox + x, oy + y, c);
      }
    return this;
  }

  /** Shift all pixels (used for bob/breath frames). */
  shifted(dx: number, dy: number): PixelCanvas {
    const p = new PixelCanvas(this.w, this.h);
    p.blit(this, dx, dy);
    return p;
  }

  toCanvas(scale = 1): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = this.w * scale;
    canvas.height = this.h * scale;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(this.w, this.h);
    for (let i = 0; i < this.px.length; i++) {
      const c = this.px[i]!;
      if (c === CLEAR) continue;
      img.data[i * 4] = (c >> 16) & 255;
      img.data[i * 4 + 1] = (c >> 8) & 255;
      img.data[i * 4 + 2] = c & 255;
      img.data[i * 4 + 3] = 255;
    }
    if (scale === 1) {
      ctx.putImageData(img, 0, 0);
      return canvas;
    }
    const tmp = document.createElement('canvas');
    tmp.width = this.w;
    tmp.height = this.h;
    tmp.getContext('2d')!.putImageData(img, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tmp, 0, 0, canvas.width, canvas.height);
    return canvas;
  }
}

function resolve(p: Paint, u: number, v: number, x: number, y: number): number {
  return typeof p === 'number' ? p : p(u, v, x, y);
}

/** A horizontal strip of equally sized frames. */
export interface SpriteSheet {
  readonly canvas: HTMLCanvasElement;
  readonly frameW: number;
  readonly frameH: number;
  readonly frames: number;
}

export function makeSheet(frames: readonly PixelCanvas[]): SpriteSheet {
  const fw = frames[0]!.w;
  const fh = frames[0]!.h;
  const strip = new PixelCanvas(fw * frames.length, fh);
  frames.forEach((f, i) => strip.blit(f, i * fw, 0));
  return { canvas: strip.toCanvas(1), frameW: fw, frameH: fh, frames: frames.length };
}

/** Deterministic PRNG so procedural sprites are stable between runs. */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}

/**
 * Rotated bar from (x0, y0) to (x1, y1) with a given thickness. The paint receives
 * a = position along the bar [-1, 1] and b = across the bar [-1, 1] (negative = upper-left side).
 */
export function bar(p: PixelCanvas, x0: number, y0: number, x1: number, y1: number, thick: number, paint: Paint): void {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const ax = dx / len, ay = dy / len;
  // Perpendicular chosen so that b < 0 faces up/left (toward the key light).
  let nx = -ay, ny = ax;
  if (nx + ny > 0) { nx = -nx; ny = -ny; }
  const half = thick / 2;
  const minX = Math.floor(Math.min(x0, x1) - half - 1), maxX = Math.ceil(Math.max(x0, x1) + half + 1);
  const minY = Math.floor(Math.min(y0, y1) - half - 1), maxY = Math.ceil(Math.max(y0, y1) + half + 1);
  for (let y = minY; y <= maxY; y++)
    for (let x = minX; x <= maxX; x++) {
      const rx = x + 0.5 - x0, ry = y + 0.5 - y0;
      const along = rx * ax + ry * ay;
      const across = rx * nx + ry * ny;
      if (along < 0 || along > len || Math.abs(across) > half) continue;
      const a = (along / len) * 2 - 1;
      const b = -across / half; // b < 0 on the lit side
      p.set(x, y, typeof paint === 'number' ? paint : paint(a, b, x, y));
    }
}

/** Triangle spike from a base point outward along an angle (degrees, 0 = right, -90 = up). */
export function spike(p: PixelCanvas, bx: number, by: number, angleDeg: number, len: number, width: number, paint: Paint): void {
  const a = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(a), dy = Math.sin(a);
  const nx = -dy, ny = dx;
  p.poly(
    [
      [bx + nx * width * 0.5, by + ny * width * 0.5],
      [bx - nx * width * 0.5, by - ny * width * 0.5],
      [bx + dx * len, by + dy * len],
    ],
    paint,
  );
}

/** Dithered (checkerboard) ellipse fill: fakes translucency in a cut-out sprite. */
export function ditherEllipse(p: PixelCanvas, cx: number, cy: number, rx: number, ry: number, c: number, phase = 0): void {
  p.ellipse(cx, cy, rx, ry, c, (x, y) => (x + y + phase) % 2 === 0);
}
