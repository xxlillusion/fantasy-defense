// Procedural canvas textures for the environment (Stream B). No image files: everything is painted here.
import * as THREE from 'three';
import { GRID_COLS, GRID_ROWS } from '../../core/grid';
import type { TileCoord } from '../../core/types';
import { fbm, rng } from './noise';
import { PAL, type EnvPalette } from './palette';

const DEFAULT_PAL: EnvPalette = PAL;

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  return [c, ctx];
}

// Painting is CPU-heavy (per-pixel fbm). Map switches rebuild the world, so pure painters are
// memoized: the canvases are reused (GPU textures are still created/disposed per world).
const canvasCache = new Map<string, HTMLCanvasElement>();
function memo(key: string, paint: () => HTMLCanvasElement): HTMLCanvasElement {
  let c = canvasCache.get(key);
  if (!c) {
    c = paint();
    canvasCache.set(key, c);
  }
  return c;
}

export function toTexture(canvas: HTMLCanvasElement, opts: { srgb?: boolean; repeat?: boolean; anisotropy?: number } = {}): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas);
  if (opts.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  if (opts.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = opts.anisotropy ?? 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
function mixHex(a: string, b: string, t: number): [number, number, number] {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return [ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t];
}

// ------------------------------------------------------------------ grass

/** Tileable painterly grass/moss (size x size px). Covers GRASS_TILE_WORLD world units per repeat. */
export const GRASS_TILE_WORLD = 4;

/** Per-theme knobs for the tiling ground texture. */
export interface GrassStyle {
  dabs: number;
  blades: number;
  /** Blade length multiplier (short = gravel / ash grains). */
  bladeLen: number;
  flowers: number;
  flowerAlpha: number;
  /** Warm glowing cracks (forge). 0 = none. */
  cracks: number;
  crackColor: string;
}

export const DEFAULT_GRASS: GrassStyle = { dabs: 900, blades: 7000, bladeLen: 1, flowers: 40, flowerAlpha: 0.55, cracks: 0, crackColor: '#ff8a3a' };

export function paintGrassTile(size = 512, seed = 7, PAL: EnvPalette = DEFAULT_PAL, style: GrassStyle = DEFAULT_GRASS): HTMLCanvasElement {
  return memo(`grass:${size}:${seed}:${JSON.stringify(PAL)}:${JSON.stringify(style)}`, () => paintGrassTileRaw(size, seed, PAL, style));
}

function paintGrassTileRaw(size = 512, seed = 7, PAL: EnvPalette = DEFAULT_PAL, style: GrassStyle = DEFAULT_GRASS): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(size, size);
  const r = rng(seed);
  // 1. soft low-frequency base (tileable fbm), computed at half res and scaled up.
  const lo = size / 2;
  const [bc, bctx] = makeCanvas(lo, lo);
  const img = bctx.createImageData(lo, lo);
  for (let y = 0; y < lo; y++) {
    for (let x = 0; x < lo; x++) {
      const n = fbm((x / lo) * 4, (y / lo) * 4, 4, seed, 4);
      const m = fbm((x / lo) * 8 + 3, (y / lo) * 8 + 9, 3, seed + 5, 8);
      const t = Math.min(1, Math.max(0, (n - 0.3) * 1.9));
      const col = t < 0.5 ? mixHex(PAL.grassDeep, PAL.grassBase, t * 2) : mixHex(PAL.grassBase, PAL.grassMid, (t - 0.5) * 2);
      const mossy = Math.max(0, m - 0.55) * 1.4;
      const mc = hexToRgb(PAL.moss);
      const i = (y * lo + x) * 4;
      img.data[i] = col[0] + (mc[0] - col[0]) * mossy;
      img.data[i + 1] = col[1] + (mc[1] - col[1]) * mossy;
      img.data[i + 2] = col[2] + (mc[2] - col[2]) * mossy;
      img.data[i + 3] = 255;
    }
  }
  bctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(bc, 0, 0, size, size);

  const wrapped = (x: number, y: number, pad: number, draw: (ox: number, oy: number) => void) => {
    for (const ox of [0, -size, size]) {
      if ((ox < 0 && x < size - pad) || (ox > 0 && x > pad)) continue;
      for (const oy of [0, -size, size]) {
        if ((oy < 0 && y < size - pad) || (oy > 0 && y > pad)) continue;
        draw(ox, oy);
      }
    }
  };
  // 2. painterly dabs (broad soft strokes)
  const dabCols = [PAL.grassDark, PAL.grassMid, PAL.grassBase, PAL.moss, PAL.grassLight];
  for (let i = 0; i < style.dabs; i++) {
    const x = r() * size;
    const y = r() * size;
    const rw = 6 + r() * 14;
    const rh = rw * (0.35 + r() * 0.3);
    const rot = -0.4 + r() * 0.8;
    ctx.fillStyle = rgba(dabCols[Math.floor(r() * dabCols.length)]!, 0.1 + r() * 0.14);
    wrapped(x, y, 24, (ox, oy) => {
      ctx.beginPath();
      ctx.ellipse(x + ox, y + oy, rw, rh, rot, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  // 3. grass blades
  ctx.lineCap = 'round';
  const bladeCols = [PAL.grassDark, PAL.grassDeep, PAL.grassMid, PAL.grassLight, PAL.grassTip];
  const weights = [0.28, 0.14, 0.28, 0.2, 0.1];
  const pick = () => {
    let v = r();
    for (let k = 0; k < weights.length; k++) {
      v -= weights[k]!;
      if (v <= 0) return bladeCols[k]!;
    }
    return bladeCols[0]!;
  };
  for (let i = 0; i < style.blades; i++) {
    const x = r() * size;
    const y = r() * size;
    const len = (4 + r() * 9) * style.bladeLen;
    const lean = (r() - 0.5) * 5;
    const col = pick();
    ctx.strokeStyle = rgba(col, 0.25 + r() * 0.35);
    ctx.lineWidth = 1 + r() * 1.8;
    wrapped(x, y, 16, (ox, oy) => {
      ctx.beginPath();
      ctx.moveTo(x + ox, y + oy);
      ctx.quadraticCurveTo(x + ox + lean * 0.3, y + oy - len * 0.6, x + ox + lean, y + oy - len);
      ctx.stroke();
    });
  }
  // 4. tiny pale cool flowers / clover
  for (let i = 0; i < style.flowers; i++) {
    const x = r() * size;
    const y = r() * size;
    ctx.fillStyle = rgba(r() < 0.5 ? PAL.flowerA : PAL.flowerB, style.flowerAlpha);
    wrapped(x, y, 4, (ox, oy) => {
      ctx.beginPath();
      ctx.arc(x + ox, y + oy, 1.2 + r() * 1.1, 0, Math.PI * 2);
      ctx.fill();
    });
  }
  // 5. warm glowing cracks (forge basalt)
  if (style.cracks > 0) {
    const rc = rng(seed + 77);
    for (let i = 0; i < style.cracks; i++) {
      const pts: [number, number][] = [];
      let x = rc() * size;
      let y = rc() * size;
      let a = rc() * Math.PI * 2;
      pts.push([x, y]);
      const n = 4 + Math.floor(rc() * 6);
      for (let k = 0; k < n; k++) {
        a += (rc() - 0.5) * 1.3;
        const step = 6 + rc() * 14;
        x += Math.cos(a) * step;
        y += Math.sin(a) * step;
        pts.push([x, y]);
      }
      const glow = 0.25 + rc() * 0.45;
      wrapped(pts[0]![0], pts[0]![1], 90, (ox, oy) => {
        const stroke = (style_: string, w: number) => {
          ctx.strokeStyle = style_;
          ctx.lineWidth = w;
          ctx.beginPath();
          pts.forEach(([px, py], k) => (k ? ctx.lineTo(px + ox, py + oy) : ctx.moveTo(px + ox, py + oy)));
          ctx.stroke();
        };
        stroke('rgba(14,12,12,0.55)', 3.2);
        stroke(rgba(style.crackColor, glow * 0.35), 2.2);
        stroke(rgba(style.crackColor, glow), 0.9);
      });
    }
  }
  return c;
}

// ------------------------------------------------------------------ playfield ground

export type PaintTileType = 'grass' | 'path' | 'portal' | 'statue' | 'tree' | 'rock' | 'lava';

export interface GroundPaintInput {
  /** Tile type per in-bounds tile. */
  typeAt: (t: TileCoord) => PaintTileType | null;
  /** Extra off-map path tiles (e.g. the spawn trails), with an opacity. */
  extraPath: readonly { tile: TileCoord; alpha: number }[];
  /** Extra off-map lava tiles (channels running off the edge). */
  extraLava?: readonly TileCoord[];
}

/** Per-theme knobs for the painted playfield. */
export interface GroundStyle {
  /** Chance a slab gets moss creeping in from a corner. */
  slabMoss: number;
  /** Chance of a worn crack on a slab. */
  slabCrack: number;
  /** Chance a sub-slab is missing (broken ruins), showing moss/earth. */
  missing: number;
  /** Soot smudges on slabs (forge). */
  soot: number;
  /** Iron rivets at slab corners (forge flagstones). */
  rivets: boolean;
  /** Warm glow painted around lava tiles, or null. */
  lavaGlow: string | null;
  /** Grid line color on buildable tiles. */
  grid: string;
}

export const DEFAULT_GROUND: GroundStyle = { slabMoss: 0.55, slabCrack: 0.45, missing: 0, soot: 0, rivets: false, lavaGlow: null, grid: 'rgba(14,30,26,0.16)' };

/** World extent of the painted ground canvas (tiles beyond the grid on each side). */
export const GROUND_PAD = { left: 3, right: 3, top: 1, bottom: 3 } as const;

export function paintGround(
  input: GroundPaintInput,
  grassTile: HTMLCanvasElement,
  ppt = 80,
  seed = 21,
  PAL: EnvPalette = DEFAULT_PAL,
  style: GroundStyle = DEFAULT_GROUND,
): HTMLCanvasElement {
  const colsTotal = GRID_COLS + GROUND_PAD.left + GROUND_PAD.right;
  const rowsTotal = GRID_ROWS + GROUND_PAD.top + GROUND_PAD.bottom;
  const W = colsTotal * ppt;
  const H = rowsTotal * ppt;
  const [c, ctx] = makeCanvas(W, H);
  const r = rng(seed);
  const tx = (col: number) => (col + GROUND_PAD.left) * ppt;
  const ty = (row: number) => (row + GROUND_PAD.top) * ppt;

  // 1. tiling grass, aligned to world space so it matches the outer ground plane exactly.
  const pat = ctx.createPattern(grassTile, 'repeat')!;
  const s = (ppt * GRASS_TILE_WORLD) / grassTile.width;
  // world (0,0) = grid center = canvas (tx(GRID_COLS/2), ty(GRID_ROWS/2))
  pat.setTransform(new DOMMatrix().translateSelf(tx(GRID_COLS / 2), ty(GRID_ROWS / 2)).scaleSelf(s, s));
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, W, H);

  // Fade mask for decorations near the canvas border so the edge stays seamless.
  const edgeFade = (x: number, y: number) => {
    const d = Math.min(x, y, W - x, H - y) / (ppt * 1.2);
    return Math.max(0, Math.min(1, d));
  };

  // 2. soft tint blotches to break the repeat inside the clearing
  for (let i = 0; i < 70; i++) {
    const x = r() * W;
    const y = r() * H;
    const rad = ppt * (0.8 + r() * 2.2);
    const f = edgeFade(x, y) * edgeFade(Math.min(W, x + rad), y) * edgeFade(Math.max(0, x - rad), y);
    if (f <= 0) continue;
    const col = [PAL.grassDeep, PAL.grassLight, PAL.moss, PAL.grassDark][Math.floor(r() * 4)]!;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, rgba(col, 0.16 * f));
    g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }

  // 2b. lava beds: scorched rock under the (separately rendered) molten channels, plus a warm glow halo
  const lavaTiles: TileCoord[] = [...(input.extraLava ?? [])];
  for (let row = 0; row < GRID_ROWS; row++) for (let col = 0; col < GRID_COLS; col++) if (input.typeAt({ col, row }) === 'lava') lavaTiles.push({ col, row });
  if (lavaTiles.length) {
    const rl = rng(seed + 313);
    if (style.lavaGlow) {
      for (const t of lavaTiles) {
        const cx = tx(t.col) + ppt / 2;
        const cy = ty(t.row) + ppt / 2;
        const rad = ppt * (1.35 + rl() * 0.4);
        const g = ctx.createRadialGradient(cx, cy, ppt * 0.3, cx, cy, rad);
        g.addColorStop(0, rgba(style.lavaGlow, 0.3));
        g.addColorStop(1, rgba(style.lavaGlow, 0));
        ctx.fillStyle = g;
        ctx.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
      }
    }
    for (const t of lavaTiles) {
      const x = tx(t.col);
      const y = ty(t.row);
      ctx.fillStyle = 'rgba(20,14,14,0.92)';
      ctx.fillRect(x - ppt * 0.08, y - ppt * 0.08, ppt * 1.16, ppt * 1.16);
      for (let k = 0; k < 10; k++) {
        ctx.fillStyle = rl() < 0.5 ? 'rgba(60,36,30,0.5)' : 'rgba(8,6,6,0.5)';
        ctx.beginPath();
        ctx.ellipse(x + rl() * ppt, y + rl() * ppt, 4 + rl() * 12, 3 + rl() * 8, rl() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // 3. baked contact AO under set pieces
  const blob = (cx: number, cy: number, rad: number, a: number, sy = 1) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, sy);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rad);
    g.addColorStop(0, `rgba(12,24,22,${a})`);
    g.addColorStop(1, 'rgba(12,24,22,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-rad, -rad, rad * 2, rad * 2);
    ctx.restore();
  };

  // 4. stone slabs
  const rs = rng(seed + 521); // style extras use their own stream so the shrine stays identical to v1
  const drawSlab = (x: number, y: number, w: number, h: number, alpha: number) => {
    const inset = ppt * 0.035;
    const rr = ppt * 0.07;
    const sx = x + inset;
    const sy = y + inset;
    const sw = w - inset * 2;
    const sh = h - inset * 2;
    if (style.missing > 0 && rs() < style.missing) {
      // broken / missing flagstone: sunken earth with moss
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.roundRect(sx, sy, sw, sh, rr * 1.6);
      ctx.fillStyle = PAL.grassDeep;
      ctx.fill();
      ctx.clip();
      for (let k = 0; k < 26; k++) {
        ctx.fillStyle = rgba([PAL.moss, PAL.grassMid, PAL.grassDark][Math.floor(rs() * 3)]!, 0.35 + rs() * 0.4);
        ctx.beginPath();
        ctx.ellipse(sx + rs() * sw, sy + rs() * sh, 2 + rs() * 6, 1.5 + rs() * 4, rs() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      return;
    }
    const tone = r();
    const base = tone < 0.33 ? PAL.stoneDark : tone < 0.8 ? PAL.stone : PAL.stoneLight;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.roundRect(sx, sy, sw, sh, rr);
    ctx.fillStyle = base;
    ctx.fill();
    ctx.clip();
    // mottling
    for (let i = 0; i < (sw * sh) / 60; i++) {
      const px = sx + r() * sw;
      const py = sy + r() * sh;
      ctx.fillStyle = rgba(r() < 0.5 ? PAL.stoneDark : PAL.stoneLight, 0.08 + r() * 0.12);
      ctx.beginPath();
      ctx.ellipse(px, py, 2 + r() * 7, 1.5 + r() * 4, r() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // bevel: light top-left, dark bottom-right
    const g = ctx.createLinearGradient(sx, sy, sx + sw, sy + sh);
    g.addColorStop(0, 'rgba(230,240,245,0.16)');
    g.addColorStop(0.35, 'rgba(230,240,245,0)');
    g.addColorStop(0.7, 'rgba(20,30,35,0)');
    g.addColorStop(1, 'rgba(20,30,35,0.22)');
    ctx.fillStyle = g;
    ctx.fillRect(sx, sy, sw, sh);
    // soot smudges (forge)
    for (let k = 0; k < style.soot; k++) {
      const px = sx + rs() * sw;
      const py = sy + rs() * sh;
      const rad = 4 + rs() * ppt * 0.25;
      const sg = ctx.createRadialGradient(px, py, 0, px, py, rad);
      sg.addColorStop(0, 'rgba(18,16,18,0.35)');
      sg.addColorStop(1, 'rgba(18,16,18,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
    }
    // iron rivets (forge flagstones)
    if (style.rivets && sw > ppt * 0.3 && sh > ppt * 0.3) {
      const d = ppt * 0.08;
      for (const [px, py] of [[sx + d, sy + d], [sx + sw - d, sy + d], [sx + d, sy + sh - d], [sx + sw - d, sy + sh - d]] as const) {
        ctx.fillStyle = 'rgba(25,25,28,0.7)';
        ctx.beginPath();
        ctx.arc(px + 0.8, py + 0.8, ppt * 0.028, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(190,196,204,0.55)';
        ctx.beginPath();
        ctx.arc(px, py, ppt * 0.022, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // worn crack
    if (r() < style.slabCrack) {
      ctx.strokeStyle = 'rgba(35,45,48,0.45)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      let px = sx + r() * sw;
      let py = sy + r() * sh;
      ctx.moveTo(px, py);
      for (let k = 0; k < 4; k++) {
        px += (r() - 0.5) * sw * 0.4;
        py += (r() - 0.5) * sh * 0.4;
        ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    // moss creeping in from a corner
    if (r() < style.slabMoss) {
      const cx = r() < 0.5 ? sx : sx + sw;
      const cy = r() < 0.5 ? sy : sy + sh;
      for (let k = 0; k < 14; k++) {
        ctx.fillStyle = rgba(r() < 0.5 ? PAL.moss : PAL.grassMid, 0.3 + r() * 0.3);
        ctx.beginPath();
        ctx.ellipse(cx + (r() - 0.5) * ppt * 0.3, cy + (r() - 0.5) * ppt * 0.3, 2 + r() * 5, 1.5 + r() * 3.5, r() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  };

  const layouts: number[][][] = [
    [[0, 0, 1, 1]],
    [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]],
    [[0, 0, 1, 0.5], [0, 0.5, 1, 0.5]],
    [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]],
    [[0, 0, 0.6, 1], [0.6, 0, 0.4, 0.45], [0.6, 0.45, 0.4, 0.55]],
    [[0, 0, 1, 0.4], [0, 0.4, 0.55, 0.6], [0.55, 0.4, 0.45, 0.6]],
  ];

  const pathTiles: { tile: TileCoord; alpha: number; kind: 'path' | 'portal' | 'statue' }[] = [];
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const t = input.typeAt({ col, row });
      if (t === 'path' || t === 'portal' || t === 'statue') pathTiles.push({ tile: { col, row }, alpha: 1, kind: t });
    }
  }
  for (const e of input.extraPath) pathTiles.push({ tile: e.tile, alpha: e.alpha, kind: 'path' });

  // seams / bedding under the slabs (slightly irregular edge)
  for (const p of pathTiles) {
    const x = tx(p.tile.col);
    const y = ty(p.tile.row);
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = PAL.seam;
    ctx.fillRect(x, y, ppt, ppt);
    ctx.restore();
  }
  for (const p of pathTiles) {
    const x = tx(p.tile.col);
    const y = ty(p.tile.row);
    if (p.kind === 'portal') {
      drawSlab(x, y, ppt, ppt, p.alpha);
      continue;
    }
    const lay = p.kind === 'statue' ? layouts[0]! : layouts[Math.floor(r() * layouts.length)]!;
    for (const [lx, ly, lw, lh] of lay) drawSlab(x + lx! * ppt, y + ly! * ppt, lw! * ppt, lh! * ppt, p.alpha);
  }

  // grass fringe overhanging the slab edges
  ctx.lineCap = 'round';
  const pathSet = new Set(pathTiles.map((p) => `${p.tile.col},${p.tile.row}`));
  const isPathTile = (col: number, row: number) => pathSet.has(`${col},${row}`);
  for (const p of pathTiles) {
    const { col, row } = p.tile;
    const x = tx(col);
    const y = ty(row);
    const sides: [boolean, number, number, number, number][] = [
      [!isPathTile(col, row - 1), x, y, ppt, 0],
      [!isPathTile(col, row + 1), x, y + ppt, ppt, 0],
      [!isPathTile(col - 1, row), x, y, 0, ppt],
      [!isPathTile(col + 1, row), x + ppt, y, 0, ppt],
    ];
    for (const [open, sx, sy, dx, dy] of sides) {
      if (!open) continue;
      const nx = dx === 0 ? (sx === x ? 1 : -1) : 0; // inward normal
      const ny = dy === 0 ? (sy === y ? 1 : -1) : 0;
      ctx.save();
      ctx.globalAlpha = p.alpha;
      for (let i = 0; i < 40; i++) {
        const t = r();
        const bx = sx + dx * t;
        const by = sy + dy * t;
        const reach = ppt * (0.02 + r() * 0.12);
        ctx.strokeStyle = rgba([PAL.grassMid, PAL.grassLight, PAL.moss, PAL.grassDark][Math.floor(r() * 4)]!, 0.5 + r() * 0.4);
        ctx.lineWidth = 1.2 + r() * 2;
        ctx.beginPath();
        ctx.moveTo(bx - nx * 4, by - ny * 4);
        ctx.lineTo(bx + nx * reach + (r() - 0.5) * 5, by + ny * reach + (r() - 0.5) * 5);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // portal dais: concentric carved rings
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      if (input.typeAt({ col, row }) !== 'portal') continue;
      const cx = tx(col) + ppt / 2;
      const cy = ty(row) + ppt / 2;
      ctx.strokeStyle = 'rgba(40,52,56,0.6)';
      ctx.lineWidth = 2;
      for (const rad of [0.46, 0.34]) {
        ctx.beginPath();
        ctx.arc(cx, cy, ppt * rad, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(150,235,245,0.35)';
      ctx.lineWidth = 1.5;
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * ppt * 0.36, cy + Math.sin(a) * ppt * 0.36);
        ctx.lineTo(cx + Math.cos(a) * ppt * 0.44, cy + Math.sin(a) * ppt * 0.44);
        ctx.stroke();
      }
    }
  }

  // AO under trees, rocks, statues
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const t = input.typeAt({ col, row });
      const cx = tx(col) + ppt / 2;
      const cy = ty(row) + ppt / 2;
      if (t === 'tree') blob(cx, cy, ppt * 0.85, 0.55);
      else if (t === 'rock') blob(cx, cy, ppt * 0.6, 0.45);
      else if (t === 'statue' && input.typeAt({ col, row: row - 1 }) !== 'statue') blob(cx, cy + ppt * 0.5, ppt * 0.95, 0.4, 1.4);
    }
  }

  // 5. subtle grid on buildable tiles (unique segments)
  ctx.strokeStyle = style.grid;
  ctx.lineWidth = Math.max(1, ppt / 60);
  const seg = new Set<string>();
  const addSeg = (x0: number, y0: number, x1: number, y1: number) => {
    const k = `${x0},${y0},${x1},${y1}`;
    if (seg.has(k)) return;
    seg.add(k);
    ctx.beginPath();
    ctx.moveTo(tx(x0), ty(y0));
    ctx.lineTo(tx(x1), ty(y1));
    ctx.stroke();
  };
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      if (input.typeAt({ col, row }) !== 'grass') continue;
      addSeg(col, row, col + 1, row);
      addSeg(col, row + 1, col + 1, row + 1);
      addSeg(col, row, col, row + 1);
      addSeg(col + 1, row, col + 1, row + 1);
    }
  }
  // corner ticks slightly stronger, helps reading the grid without a heavy mesh
  ctx.fillStyle = 'rgba(190,220,210,0.10)';
  for (let row = 0; row <= GRID_ROWS; row++) {
    for (let col = 0; col <= GRID_COLS; col++) {
      const near = [input.typeAt({ col: col - 1, row: row - 1 }), input.typeAt({ col, row: row - 1 }), input.typeAt({ col: col - 1, row }), input.typeAt({ col, row })];
      if (!near.includes('grass')) continue;
      ctx.beginPath();
      ctx.arc(tx(col), ty(row), ppt * 0.03, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return c;
}

/** Overlay grid shown while placing: bright lines around buildable tiles only (white on transparent). */
export function paintGridOverlay(isBuildable: (t: TileCoord) => boolean, ppt = 64): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(GRID_COLS * ppt, GRID_ROWS * ppt);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2;
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      if (!isBuildable({ col, row })) continue;
      ctx.fillRect(col * ppt + 3, row * ppt + 3, ppt - 6, ppt - 6);
      ctx.strokeRect(col * ppt + 1.5, row * ppt + 1.5, ppt - 3, ppt - 3);
    }
  }
  return c;
}

// ------------------------------------------------------------------ stone

/** Grey noise stone (use as color map multiplied with material color). Optional carved spiral. */
export function paintStone(size = 256, seed = 3, spiral = false): HTMLCanvasElement {
  return memo(`stone:${size}:${seed}:${spiral}`, () => paintStoneRaw(size, seed, spiral));
}

function paintStoneRaw(size = 256, seed = 3, spiral = false): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(size, size);
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm((x / size) * 6, (y / size) * 6, 5, seed, 6);
      const v = 150 + (n - 0.5) * 150;
      const i = (y * size + x) * 4;
      img.data[i] = v;
      img.data[i + 1] = v + 4;
      img.data[i + 2] = v + 8;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const r = rng(seed + 1);
  for (let i = 0; i < 12; i++) {
    ctx.strokeStyle = `rgba(60,66,72,${0.2 + r() * 0.3})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    let px = r() * size;
    let py = r() * size;
    ctx.moveTo(px, py);
    for (let k = 0; k < 5; k++) {
      px += (r() - 0.5) * 40;
      py += (r() - 0.5) * 40;
      ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  if (spiral) {
    const cx = size / 2;
    const cy = size / 2;
    const turns = 3.2;
    const drawSpiral = (dx: number, dy: number, style: string, w: number) => {
      ctx.strokeStyle = style;
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i <= 220; i++) {
        const t = i / 220;
        const a = t * turns * Math.PI * 2;
        const rad = 6 + t * size * 0.36;
        const x = cx + dx + Math.cos(a) * rad;
        const y = cy + dy + Math.sin(a) * rad;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    };
    drawSpiral(1.5, 1.5, 'rgba(235,242,248,0.35)', 5);
    drawSpiral(0, 0, 'rgba(40,46,54,0.75)', 5);
    // border band
    ctx.strokeStyle = 'rgba(40,46,54,0.5)';
    ctx.lineWidth = 4;
    ctx.strokeRect(8, 8, size - 16, size - 16);
    ctx.strokeStyle = 'rgba(235,242,248,0.2)';
    ctx.lineWidth = 2;
    ctx.strokeRect(12, 12, size - 24, size - 24);
  }
  return c;
}

// ------------------------------------------------------------------ fx sprites

/** Soft radial dot, white on transparent. */
export function paintSoftDot(size = 64, hardness = 0): HTMLCanvasElement {
  return memo(`dot:${size}:${hardness}`, () => paintSoftDotRaw(size, hardness));
}

function paintSoftDotRaw(size = 64, hardness = 0): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(Math.min(0.9, 0.2 + hardness * 0.6), 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}

/** Cloudy mist puff (white, alpha varies), for mist sprites. */
export function paintMistPuff(size = 128, seed = 11): HTMLCanvasElement {
  return memo(`mist:${size}:${seed}`, () => paintMistPuffRaw(size, seed));
}

function paintMistPuffRaw(size = 128, seed = 11): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(size, size);
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x / size - 0.5;
      const dy = y / size - 0.5;
      const d = Math.sqrt(dx * dx + dy * dy) * 2;
      const n = fbm((x / size) * 5, (y / size) * 5, 4, seed);
      const a = Math.max(0, 1 - d) ** 1.5 * (0.45 + n * 0.8);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.min(255, a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Vertical light shaft: bright along the center line, fading to the sides and both ends. */
export function paintBeam(w = 64, h = 256): HTMLCanvasElement {
  return memo(`beam:${w}:${h}`, () => paintBeamRaw(w, h));
}

function paintBeamRaw(w = 64, h = 256): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    const v = y / (h - 1);
    const along = Math.sin(Math.PI * Math.min(1, v * 1.15)) ** 1.2 * (0.35 + 0.65 * (1 - v));
    for (let x = 0; x < w; x++) {
      const u = x / (w - 1) - 0.5;
      const across = Math.exp(-(u * u) / 0.03);
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.max(0, Math.min(255, across * along * 255));
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Small translucent spirit-girl silhouette hint (white glow), 128 x 192. */
export function paintSpirit(): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(128, 192);
  ctx.filter = 'blur(3px)';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  // head
  ctx.beginPath();
  ctx.arc(64, 52, 17, 0, Math.PI * 2);
  ctx.fill();
  // long flowing hair
  ctx.beginPath();
  ctx.moveTo(46, 48);
  ctx.quadraticCurveTo(36, 100, 50, 128);
  ctx.lineTo(78, 128);
  ctx.quadraticCurveTo(94, 100, 82, 48);
  ctx.closePath();
  ctx.fillStyle = 'rgba(235,250,255,0.55)';
  ctx.fill();
  // dress
  ctx.beginPath();
  ctx.moveTo(56, 70);
  ctx.lineTo(72, 70);
  ctx.quadraticCurveTo(92, 140, 100, 176);
  ctx.quadraticCurveTo(64, 186, 28, 176);
  ctx.quadraticCurveTo(36, 140, 56, 70);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fill();
  // arms folded (prayer)
  ctx.beginPath();
  ctx.ellipse(64, 96, 10, 7, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.fill();
  ctx.filter = 'none';
  return c;
}

/** Rounded tile highlight: soft fill + bright border (white; tinted by material color). */
export function paintTileHighlight(size = 128): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(size, size);
  const inset = size * 0.06;
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  ctx.beginPath();
  ctx.roundRect(inset, inset, size - inset * 2, size - inset * 2, size * 0.12);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,1)';
  ctx.lineWidth = size * 0.05;
  ctx.stroke();
  return c;
}

// ------------------------------------------------------------------ v2 theme painters

/**
 * Soft lava mask over the padded ground area (same extent as paintGround): white where lava flows,
 * blurred so the channel edges are organic. Red channel is read by the lava shader.
 */
export function paintLavaMask(tiles: readonly TileCoord[], ppt = 16): HTMLCanvasElement {
  const colsTotal = GRID_COLS + GROUND_PAD.left + GROUND_PAD.right;
  const rowsTotal = GRID_ROWS + GROUND_PAD.top + GROUND_PAD.bottom;
  const W = colsTotal * ppt;
  const H = rowsTotal * ppt;
  const [src, sctx] = makeCanvas(W, H);
  sctx.fillStyle = '#000';
  sctx.fillRect(0, 0, W, H);
  sctx.fillStyle = '#fff';
  const r = rng(91);
  for (const t of tiles) {
    const x = (t.col + GROUND_PAD.left) * ppt;
    const y = (t.row + GROUND_PAD.top) * ppt;
    // slightly inset, wobbly blob per tile; neighbours merge after the blur
    sctx.beginPath();
    sctx.ellipse(x + ppt / 2 + (r() - 0.5) * ppt * 0.1, y + ppt / 2 + (r() - 0.5) * ppt * 0.1, ppt * (0.62 + r() * 0.08), ppt * (0.62 + r() * 0.08), r() * 3, 0, Math.PI * 2);
    sctx.fill();
  }
  const [c, ctx] = makeCanvas(W, H);
  ctx.filter = `blur(${Math.max(1, ppt * 0.22)}px)`;
  ctx.drawImage(src, 0, 0);
  ctx.filter = 'none';
  return c;
}

/** Teardrop flame (white core, alpha falloff), for additive fire sprites. 64 x 128. */
export function paintFlame(): HTMLCanvasElement {
  return memo('flame', () => paintFlameRaw());
}

function paintFlameRaw(): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(64, 128);
  ctx.filter = 'blur(4px)';
  const g = ctx.createRadialGradient(32, 92, 2, 32, 84, 44);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.75)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(32, 8);
  ctx.bezierCurveTo(44, 44, 56, 70, 52, 96);
  ctx.bezierCurveTo(48, 122, 16, 122, 12, 96);
  ctx.bezierCurveTo(8, 70, 20, 44, 32, 8);
  ctx.fill();
  ctx.filter = 'none';
  return c;
}

/** Night sky card: vertical gradient (zenith -> horizon haze) with sparse stars. */
export function paintNightSky(w = 512, h = 512, zenith = '#11132e', horizon = '#3a3f70', seed = 5): HTMLCanvasElement {
  return memo(`sky:${w}:${h}:${zenith}:${horizon}:${seed}`, () => paintNightSkyRaw(w, h, zenith, horizon, seed));
}

function paintNightSkyRaw(w = 512, h = 512, zenith = '#11132e', horizon = '#3a3f70', seed = 5): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, zenith);
  g.addColorStop(0.65, mixCss(zenith, horizon, 0.55));
  g.addColorStop(1, horizon);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const r = rng(seed);
  for (let i = 0; i < 260; i++) {
    const x = r() * w;
    const y = Math.pow(r(), 1.4) * h * 0.8;
    const a = (0.25 + r() * 0.75) * (1 - y / (h * 0.85));
    ctx.fillStyle = `rgba(225,232,255,${a.toFixed(3)})`;
    const s = r() < 0.06 ? 1.6 : 0.8;
    ctx.fillRect(x, y, s, s);
  }
  // faint wispy cloud bands
  for (let i = 0; i < 16; i++) {
    const x = r() * w;
    const y = h * (0.35 + r() * 0.45);
    const rw = w * (0.12 + r() * 0.2);
    const cg = ctx.createRadialGradient(x, y, 0, x, y, rw);
    cg.addColorStop(0, 'rgba(120,130,190,0.10)');
    cg.addColorStop(1, 'rgba(120,130,190,0)');
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 0.18);
    ctx.translate(-x, -y);
    ctx.fillStyle = cg;
    ctx.fillRect(x - rw, y - rw, rw * 2, rw * 2);
    ctx.restore();
  }
  return c;
}

function mixCss(a: string, b: string, t: number): string {
  const [r, g, bl] = mixHex(a, b, t);
  return `rgb(${r | 0},${g | 0},${bl | 0})`;
}

/** Pale moon disc with soft maria, on transparent. */
export function paintMoon(size = 256): HTMLCanvasElement {
  return memo(`moon:${size}`, () => paintMoonRaw(size));
}

function paintMoonRaw(size = 256): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(size, size);
  const img = ctx.createImageData(size, size);
  const R = size * 0.46;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - size / 2;
      const dy = y - size / 2;
      const d = Math.sqrt(dx * dx + dy * dy);
      const i = (y * size + x) * 4;
      const a = Math.max(0, Math.min(1, (R - d) / 2.5));
      const n = fbm(x / size * 5, y / size * 5, 4, 17);
      const maria = Math.max(0, n - 0.5) * 1.6;
      const limb = 1 - Math.pow(d / R, 4) * 0.25;
      const v = (0.93 - maria * 0.35) * limb;
      img.data[i] = 235 * v;
      img.data[i + 1] = 240 * v;
      img.data[i + 2] = 255 * v;
      img.data[i + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
