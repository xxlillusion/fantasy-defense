// Small pixel-art textures for projectiles and ground effects. All point along +X (right).

import type { ProjectileKind } from '../../core/types';
import { C, ramp } from './palette';
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

