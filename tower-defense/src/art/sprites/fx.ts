// Small pixel-art textures for projectiles and ground effects. All point along +X (right).

import type { ProjectileKind } from '../../core/types';
import { C, pack, ramp } from './palette';
import { PixelCanvas, rng } from './pixelCanvas';

function arrow(): PixelCanvas {
  const p = new PixelCanvas(16, 5);
  const shaft = ramp(0xffb0d8), head = ramp(C.magenta);
  p.line(3, 2, 12, 2, shaft.l);
  p.poly([[11, 0], [16, 2.5], [11, 5]], head.m);
  p.set(13, 2, head.h);
  p.set(12, 1, head.l);
  p.rect(0, 1, 4, 1, 0xff70b8);
  p.rect(0, 3, 4, 1, 0xd03088);
  p.set(1, 2, 0xffd0ea);
  return p;
}

function frostbolt(): PixelCanvas {
  const p = new PixelCanvas(14, 7);
  const r = ramp(0x7fdcff);
  p.poly([[0, 3.5], [5, 0.5], [14, 3.5], [5, 6.5]], (_u, v) => (v < -0.2 ? r.h : v < 0.3 ? r.l : r.m));
  p.line(3, 3, 12, 3, 0xffffff);
  p.outline(0x2a70c0);
  return p;
}

function crescent(): PixelCanvas {
  const p = new PixelCanvas(12, 20);
  const r = ramp(0xb060ff);
  // Convex side toward +X (direction of travel).
  p.ellipse(3, 10, 8.5, 9.5, (u) => (u > 0.75 ? r.h : u > 0.55 ? r.l : r.m), (x, y) => {
    const u = (x + 0.5 - 0) / 7.5, v = (y + 0.5 - 10) / 8.5;
    return u * u + v * v > 1;
  });
  return p;
}

function orb(): PixelCanvas {
  const p = new PixelCanvas(10, 10);
  const r = ramp(0xff8a2a);
  p.ellipse(5, 5, 5, 5, r.m);
  p.ellipse(5, 5, 3.6, 3.6, r.l);
  p.ellipse(4.5, 4.5, 2, 2, 0xfff0b0);
  p.set(3, 3, 0xffffff);
  return p;
}

function burnPatch(seed: number): PixelCanvas {
  const n = 32;
  const p = new PixelCanvas(n, n);
  const rand = rng(seed);
  const cols = [0x8a1a10, 0xd83a14, 0xff7a1a, 0xffc040, 0xfff0a0];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const dx = (x + 0.5 - n / 2) / (n / 2), dy = (y + 0.5 - n / 2) / (n / 2);
      const d = Math.hypot(dx, dy);
      if (d > 1) continue;
      const heat = (1 - d) * 1.3 + (rand() - 0.5) * 0.9;
      if (heat < 0.15 || rand() > 0.85 - d * 0.3) continue;
      const idx = Math.max(0, Math.min(cols.length - 1, Math.floor(heat * cols.length)));
      p.set(x, y, cols[idx]!);
    }
  return p;
}

function coin(): PixelCanvas {
  const p = new PixelCanvas(6, 6);
  const g = ramp(C.gold);
  p.ellipse(3, 3, 3, 3, g.m);
  p.ellipse(3, 3, 1.8, 1.8, g.l);
  p.set(2, 2, g.h);
  p.outline(g.o);
  return p;
}

export const PROJECTILE_PIXELS: Record<ProjectileKind, () => PixelCanvas> = {
  arrow,
  frostbolt,
  crescent,
  shockwave: orb,
};

export function burnPatchPixels(variant: number): PixelCanvas {
  return burnPatch(1234 + variant * 777);
}

export function coinPixels(): PixelCanvas {
  return coin();
}


// ---------------------------------------------------------------- v2 effect textures

function scale(c: number, k: number): number {
  return pack(((c >> 16) & 255) * k, ((c >> 8) & 255) * k, (c & 255) * k);
}

/** Flaming meteor rock (camera-facing), hot side down-right. 18 x 18. */
export function meteorRockPixels(): PixelCanvas {
  const p = new PixelCanvas(18, 18);
  const rock = ramp(0x4a3a3a), lava = ramp(0xff7a1a);
  p.ellipse(9, 9, 7.5, 7, (u, v) => (u + v > 0.9 ? lava.l : u + v > 0.4 ? lava.d : u + v < -0.8 ? rock.l : rock.m));
  const rand = rng(4242);
  for (let i = 0; i < 9; i++) {
    const x = 4 + rand() * 10, y = 4 + rand() * 10;
    p.paintOver(x, y, rand() < 0.5 ? lava.h : lava.l);
    p.paintOver(x + 1, y, lava.m);
  }
  p.outline(0x2a1010);
  return p;
}

/** Charred scorch ring left by a meteor. 48 x 48 (normal blending). */
export function scorchPixels(): PixelCanvas {
  const n = 48;
  const p = new PixelCanvas(n, n);
  const rand = rng(777);
  const cols = [0x1a1010, 0x2a1a14, 0x3a2a20, 0x4a2a1a];
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const d = Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2) / (n / 2);
      if (d > 1) continue;
      const ring = 1 - Math.abs(d - 0.72) / 0.28;
      const k = Math.max(ring, d < 0.5 ? 0.45 : 0) + (rand() - 0.5) * 0.5;
      if (k < 0.3) continue;
      p.set(x, y, cols[Math.min(cols.length - 1, Math.floor(rand() * cols.length))]!);
      if (ring > 0.7 && rand() < 0.06) p.set(x, y, 0xff6a1a);
    }
  return p;
}

/** Radial ground cracks (earthquake). 48 x 48 (normal blending), glowing rune core in some pixels. */
export function crackPixels(variant: number): PixelCanvas {
  const n = 48;
  const p = new PixelCanvas(n, n);
  const rand = rng(99 + variant * 131);
  const arms = 5 + Math.floor(rand() * 3);
  for (let i = 0; i < arms; i++) {
    let a = (i / arms) * Math.PI * 2 + rand() * 0.6;
    let x = n / 2, y = n / 2;
    const len = 12 + rand() * 11;
    for (let s = 0; s < len; s++) {
      a += (rand() - 0.5) * 0.7;
      x += Math.cos(a);
      y += Math.sin(a);
      p.set(x, y, 0x1e140e);
      if (s < len * 0.6) p.set(x + 1, y, 0x2e2018);
      if (s < len * 0.45 && s % 2 === 0) p.set(x, y, s < 4 ? 0xffc060 : 0xff8a2a);
      if (rand() < 0.1) {
        // small branch
        const b = a + (rand() < 0.5 ? 0.9 : -0.9);
        for (let k = 1; k < 4; k++) p.set(x + Math.cos(b) * k, y + Math.sin(b) * k, 0x2e2018);
      }
    }
  }
  return p;
}

/** Blade Storm ring: three sword-arc crescents around a circle. 64 x 64 (additive). */
export function swordArcRingPixels(): PixelCanvas {
  const n = 64;
  const p = new PixelCanvas(n, n);
  for (let k = 0; k < 3; k++) {
    const a0 = (k / 3) * Math.PI * 2;
    for (let s = 0; s <= 80; s++) {
      const t = s / 80;
      const a = a0 + t * 1.3;
      const thick = 1 + t * 3.2;
      for (let w = 0; w < thick; w += 0.5) {
        const r = 30 - w;
        const c = w < 1 ? (t > 0.5 ? 0xffffff : 0xc8f0ff) : w < 2 ? 0x9fd8ff : 0x4a90d0;
        p.set(n / 2 + Math.cos(a) * r, n / 2 + Math.sin(a) * r, t < 0.2 ? scale(c, 0.5 + t * 2.5) : c);
      }
    }
  }
  return p;
}

/** Hero sword swoosh: a crescent sweeping over the front (facing right). 40 x 40 (additive). */
export function swooshPixels(): PixelCanvas {
  const n = 40;
  const p = new PixelCanvas(n, n);
  for (let s = 0; s <= 90; s++) {
    const t = s / 90;
    const a = -2.4 + t * 2.9;
    const thick = Math.sin(t * Math.PI) * 5 + 0.5;
    for (let w = 0; w < thick; w += 0.5) {
      const r = 18 - w;
      const c = w < 1.2 ? 0xffffff : w < 2.5 ? 0xc8f0ff : 0x70b0ff;
      p.set(n / 2 + Math.cos(a) * r, n / 2 + Math.sin(a) * r, t < 0.25 ? scale(c, 0.4 + t * 2.4) : c);
    }
  }
  return p;
}

/** Execute: a red diagonal slash. 28 x 28 (additive). */
export function slashPixels(): PixelCanvas {
  const n = 28;
  const p = new PixelCanvas(n, n);
  for (let s = 0; s <= 40; s++) {
    const t = s / 40;
    const x = 2 + t * (n - 4), y = n - 3 - t * (n - 4);
    const w = Math.sin(t * Math.PI) * 2.6;
    for (let k = -w; k <= w; k += 0.5) {
      const c = Math.abs(k) < 0.8 ? 0xffffff : Math.abs(k) < 1.8 ? 0xff5060 : 0xb01020;
      p.set(x + k * 0.7, y + k * 0.7, c);
    }
  }
  return p;
}

/** Stun stars circling (flat ring of 5 little stars). 32 x 32 (additive). */
export function starRingPixels(): PixelCanvas {
  const n = 32;
  const p = new PixelCanvas(n, n);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const x = Math.round(n / 2 + Math.cos(a) * 12), y = Math.round(n / 2 + Math.sin(a) * 12);
    p.set(x, y, 0xffffff);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) p.set(x + dx, y + dy, 0xffe040);
    for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]] as const) p.set(x + dx, y + dy, 0xc08a10);
  }
  return p;
}

/** Level-up pillar of light: bright core fading at the sides and top. 16 x 48 (additive). */
export function pillarPixels(): PixelCanvas {
  const w = 16, h = 48;
  const p = new PixelCanvas(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const u = Math.abs(x + 0.5 - w / 2) / (w / 2);
      const v = y / h; // 0 top .. 1 bottom
      let k = (1 - u * u) * (0.25 + 0.75 * v);
      if (u > 0.55 && (x + y) % 2 === 0) k *= 0.3;
      if (v < 0.35 && (x * 3 + y) % 3 === 0) k *= 0.4;
      if (k < 0.06) continue;
      const c = u < 0.18 ? 0xffffff : u < 0.4 ? 0xfff0a0 : 0xffc23d;
      p.set(x, y, scale(c, Math.min(1, k * 1.4)));
    }
  return p;
}

/** Translucent hex-shield bubble (additive; rim brighter). 32 x 32. */
export function hexBubblePixels(): PixelCanvas {
  const n = 32;
  const p = new PixelCanvas(n, n);
  const size = 3.6;
  const s3 = Math.sqrt(3);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const px = x + 0.5 - n / 2, py = y + 0.5 - n / 2;
      const d = Math.hypot(px, py) / (n / 2 - 0.5);
      if (d > 1) continue;
      // axial hex coordinates + cube rounding: large rounding error = near an edge
      const q = ((s3 / 3) * px - py / 3) / size, r = ((2 / 3) * py) / size, s = -q - r;
      let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
      const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
      if (dq > dr && dq > ds) rq = -rr - rs;
      else if (dr > ds) rr = -rq - rs;
      else rs = -rq - rr;
      const edge = Math.max(Math.abs(rq - q), Math.abs(rr - r), Math.abs(rs - s)) > 0.36;
      const fres = 0.25 + 0.75 * d * d;
      if (d > 0.9) p.set(x, y, scale(0xbff8ff, 0.9));
      else if (edge) p.set(x, y, scale(0x7fe8ff, fres));
      else if ((x + y) % 2 === 0) p.set(x, y, scale(0x2a90c0, 0.35 + d * 0.3));
    }
  p.set(10, 8, 0xffffff);
  p.set(9, 9, 0xffffff);
  return p;
}

/** "Engaged with the hero" icon: two crossed swords. 11 x 11 (alpha-tested). */
export function engagedIconPixels(): PixelCanvas {
  const p = new PixelCanvas(11, 11);
  const st = ramp(0xdfe6f0), g = ramp(C.gold);
  p.line(1, 1, 8, 8, st.l);
  p.line(9, 1, 2, 8, st.m);
  p.set(1, 1, 0xffffff);
  p.set(9, 1, 0xffffff);
  p.line(6, 9, 9, 6, g.m);
  p.line(1, 6, 4, 9, g.l);
  p.set(9, 9, ramp(0x8a5a30).m);
  p.set(1, 9, ramp(0x8a5a30).m);
  p.outline(0x201830);
  return p;
}
