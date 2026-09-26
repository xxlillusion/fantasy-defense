// Tower sprites: class archetypes styled after the cast, standing on a level pedestal.
// Sheet frames: [idle0, idle1, windup, attack0, attack1, recover]. Frame 48 x 56 texels,
// bottom-center anchored. L4 sheets are per branch (distinct weapons, auras, accents).

import type { TowerBranch, TowerKind, TowerLevel } from '../../core/types';
import { drawChibi, type ChibiSpec } from './chibi';
import { C, mix, ramp, type Ramp } from './palette';
import { bar, cel, ditherEllipse, makeSheet, PixelCanvas, rng, spike, type SpriteSheet } from './pixelCanvas';

export const TOWER_FRAME_W = 48;
export const TOWER_FRAME_H = 56;
/** Row just below the character's feet (top surface of the pedestal). */
export const TOWER_FOOT_Y = 50;
export const TOWER_FRAMES = { idle0: 0, idle1: 1, windup: 2, attack0: 3, attack1: 4, recover: 5 } as const;
export type TowerFrame = 0 | 1 | 2 | 3 | 4 | 5;

const CX = 24;
const FY = TOWER_FOOT_Y;

const LEVEL_GEM: Record<TowerKind, number> = {
  arrow: C.magenta,
  cannon: C.hammerRed,
  frost: C.frostGlow,
  sniper: 0xb04cff,
  tesla: C.cyan,
};

/** Signature color of each L4 specialization (pedestal gem, aura, halo). */
export const BRANCH_COLOR: Record<TowerKind, Record<TowerBranch, number>> = {
  arrow: { a: 0xffc23d, b: 0x6ff0c0 },
  cannon: { a: 0xff9a3a, b: 0xff4a1a },
  frost: { a: 0xc8f6ff, b: 0xd890ff },
  sniper: { a: 0xff3048, b: 0xb070ff },
  tesla: { a: 0x5fe6ff, b: 0xf4ffff },
};

interface TF {
  level: TowerLevel;
  branch: TowerBranch | null;
  f: TowerFrame;
  /** Breath offset in pixels (idle1 = 1). */
  bob: number;
}

const isA = (t: TF) => t.level === 4 && t.branch === 'a';
const isB = (t: TF) => t.level === 4 && t.branch === 'b';

// ---------------------------------------------------------------- pedestals

function pedestal(p: PixelCanvas, level: TowerLevel, gem: number): void {
  const layer = new PixelCanvas(p.w, p.h);
  const cx = CX + 0.5;
  if (level === 1) {
    const w = ramp(C.wood);
    layer.rect(CX - 10, FY - 1, 21, 5, (u) => (u < -0.5 ? w.m : u < 0.4 ? w.d : ramp(w.d).d));
    for (let x = CX - 8; x <= CX + 9; x += 4) layer.line(x, FY, x, FY + 3, ramp(w.d).d);
    layer.ellipse(cx, FY + 3.5, 10.5, 1.8, ramp(w.d).d);
    layer.ellipse(cx, FY - 0.5, 10.5, 2.8, w.l);
    layer.ellipse(cx, FY - 0.5, 7, 1.8, w.m);
    layer.ellipse(cx, FY - 0.5, 3.5, 1, w.l);
    layer.set(CX - 6, FY - 2, w.h);
  } else {
    const st = ramp(level === 4 ? mix(C.stone, 0xfff4e4, 0.3) : level === 3 ? mix(C.stone, 0xfff0d0, 0.15) : C.stone);
    const gr = ramp(C.gold);
    const r = level === 4 ? 13 : level === 3 ? 12 : 11.5;
    const ri = Math.floor(r);
    layer.rect(CX - ri, FY - 1, ri * 2 + 1, 6, (u, v) => (u < -0.55 ? st.m : u < 0.45 ? (v > 0.5 ? st.d : st.m) : st.d));
    for (let x = CX - 9; x <= CX + 10; x += 5) layer.line(x, FY + 1, x, FY + 2, st.d);
    for (let x = CX - 7; x <= CX + 10; x += 5) layer.line(x, FY + 3, x, FY + 4, st.d);
    layer.line(CX - ri, FY + 2, CX + ri, FY + 2, ramp(st.d).m);
    layer.ellipse(cx, FY + 4.5, r, 1.8, st.d);
    layer.ellipse(cx, FY - 0.5, r, 3, st.l);
    layer.ellipse(cx, FY - 0.5, r - 2.5, 2, st.m);
    layer.set(CX - 7, FY - 2, st.h);
    if (level >= 3) {
      layer.ellipse(cx, FY - 0.5, r, 3, gr.m, (x, y) => {
        const u = (x + 0.5 - cx) / (r - 1.5), v = (y + 0.5 - FY + 0.5) / 2;
        return u * u + v * v > 1;
      });
      for (let x = CX - ri; x <= CX + ri; x++) layer.paintOver(x, FY + 4, x < CX - 4 ? gr.l : gr.m);
      layer.set(CX - 8, FY - 2, gr.h);
    }
    if (level === 3) {
      const g = ramp(gem);
      layer.rect(CX, FY + 1, 2, 2, g.m);
      layer.set(CX, FY + 1, g.h);
      layer.set(CX + 1, FY + 2, g.d);
    }
    if (level === 4) {
      // gilded: double band, big faceted branch gem, side gems, little gold finials
      for (let x = CX - ri; x <= CX + ri; x++) layer.paintOver(x, FY + 2, x < CX - 4 ? gr.m : gr.d);
      const g = ramp(gem);
      layer.poly([[CX + 0.5, FY - 0.5], [CX + 3, FY + 2], [CX + 0.5, FY + 4.5], [CX - 2, FY + 2]], (u, v) => (u + v < -0.3 ? g.h : u + v < 0.4 ? g.l : g.m));
      layer.set(CX, FY + 1, 0xffffff);
      for (const sx of [CX - 8, CX + 8]) {
        layer.rect(sx, FY + 2, 2, 2, g.m);
        layer.set(sx, FY + 2, g.h);
      }
      for (const fx of [CX - 13, CX + 12]) {
        layer.rect(fx, FY - 4, 2, 6, (u) => (u < 0 ? gr.l : gr.d));
        layer.rect(fx, FY - 6, 2, 2, g.l);
        layer.set(fx, FY - 6, g.h);
      }
    }
  }
  layer.outline();
  p.blit(layer);
}

// ---------------------------------------------------------------- per-class characters

function accents(t: TF, base: ChibiSpec, trim: number, kind: TowerKind): ChibiSpec {
  if (t.level === 1) return base;
  if (t.level === 2) return { ...base, hem: trim, belt: C.steel };
  if (t.level === 3) return { ...base, hem: C.gold, belt: C.gold, ornament: C.gold };
  return { ...base, hem: C.gold, belt: C.gold, ornament: BRANCH_COLOR[kind][t.branch ?? 'a'] };
}

/** 4-point sparkle. */
function sparkle(o: PixelCanvas, x: number, y: number, size: number, r: Ramp): void {
  for (let i = -size; i <= size; i++) {
    o.set(x + i, y, i === 0 ? r.h : Math.abs(i) === size ? r.m : r.l);
    o.set(x, y + i, i === 0 ? r.h : Math.abs(i) === size ? r.m : r.l);
  }
  if (size >= 2) {
    o.set(x - 1, y - 1, r.m); o.set(x + 1, y + 1, r.m);
    o.set(x + 1, y - 1, r.m); o.set(x - 1, y + 1, r.m);
  }
}

// --- Archer girl --------------------------------------------------------------------------

function archer(p: PixelCanvas, t: TF): void {
  const A = isA(t), B = isB(t);
  let spec = accents(t, {
    skin: C.skin, hair: C.blonde, hairStyle: 'twintails', eye: 0xa050ff,
    top: C.purple, topTrim: C.gold, sleeve: C.lavender, lower: C.lavender, lowerStyle: 'skirt',
    legs: 0xfff0f8, boots: C.purple, belt: C.leather,
  }, C.magenta, 'arrow');
  if (B) spec = { ...spec, hairStyle: 'hood', hood: 0x2f8a5a, tails: true, cape: 0x236a48 };
  const { f, bob } = t;
  const drawn = f === 2;
  const released = f === 3;
  const mid = FY - 17 + bob;
  const half = B ? 15 : A ? 9 : 11;
  const bowX = CX + 10;
  const bowCol = A ? mix(C.magenta, C.gold, 0.6) : B ? 0x4fd8a8 : t.level >= 3 ? mix(C.magenta, C.gold, 0.15) : C.magenta;
  const br = ramp(bowCol);
  const back: [number, number] = drawn ? [3, -17] : released ? [5, -16] : f === 4 ? [-1, -18] : f === 5 ? [-4, -14] : [-3, -10];
  const arrowOffs = A ? [-2, 0, 2] : [0];
  const shaftEnd = B ? CX + 17 : CX + 15;
  drawChibi(p, spec, CX, FY, { bob, front: [10, -17], back, squint: drawn || released }, {
    behind: A ? (h) => {
      // twin quivers on the back
      const le = ramp(C.leather), gr = ramp(C.gold);
      for (const [x0, x1, top] of [[CX - 5, CX - 2, FY - 27], [CX - 8, CX - 6, FY - 25]] as const) {
        bar(h, x0, FY - 12 + bob, x1, top + bob, 3, (_a, b) => (b < 0 ? le.l : le.d));
        h.set(x1, top + 3 + bob, gr.l);
        h.set(x1 - 1, top + 4 + bob, gr.m);
        h.set(x1 - 1, top - 1 + bob, 0xff8ac8);
        h.set(x1 + 1, top - 2 + bob, 0xff5ab0);
        h.set(x1, top - 2 + bob, 0xffffff);
      }
    } : undefined,
    held: (h) => {
      const flex = drawn ? -1.5 : 0;
      let prev: [number, number] | null = null;
      for (let s = -1; s <= 1.001; s += 0.05) {
        const y = mid + s * half;
        let x = bowX + (1 - s * s) * (3 + flex) - 1;
        if (Math.abs(s) > 0.8) x += (Math.abs(s) - 0.8) * 12;
        if (prev) h.line(prev[0], prev[1], x, y, s < -0.2 ? br.l : s > 0.5 ? br.d : br.m, 2);
        prev = [x, y];
      }
      const gr = ramp(C.gold);
      h.rect(bowX + 3, mid - half - 1, 2, 2, gr.l);
      h.rect(bowX + 3, mid + half - 1, 2, 2, gr.m);
      h.rect(bowX + 1, mid - 1, 2, 3, gr.m);
      if (A) {
        // gold trim along the limbs
        h.set(bowX + 1, mid - 5, gr.h); h.set(bowX + 1, mid + 5, gr.l);
      }
      const sc = B ? 0xc8fff0 : 0xfff4d8;
      const sx = drawn ? CX + 3 : released ? bowX + 1 : bowX - 1;
      h.line(bowX + 1, mid - half + 1, sx, mid, sc);
      h.line(sx, mid, bowX + 1, mid + half - 1, sc);
      if (drawn) {
        const ar = ramp(B ? 0x9ff7d8 : C.magenta);
        for (const dy of arrowOffs) {
          h.line(CX + 3, mid, shaftEnd, mid + dy, B ? 0xe8fff4 : ramp(C.wood).l);
          h.rect(shaftEnd, mid + dy - 1, 2, 3, ar.l);
          h.set(shaftEnd + 2, mid + dy, ar.h);
        }
        h.rect(CX + 2, mid - 1, 2, 3, B ? 0x9ff7d8 : 0xff8ac8);
      }
    },
    top: (o) => {
      if (released || f === 4) {
        // release streaks flying off the bow
        const sr = ramp(B ? 0x9ff7d8 : C.magenta);
        const len = released ? 6 : 3;
        for (const dy of arrowOffs) {
          const y = mid + dy * 1.5;
          o.line(bowX + 7, y, bowX + 7 + len, y, released ? sr.h : sr.l);
        }
      }
      if (B) {
        // glowing longbow: bright motes along the limbs
        const g = ramp(0x9ff7d8);
        const ph = f % 2;
        o.set(bowX + 2, mid - 8 - ph, g.h);
        o.set(bowX + 2, mid + 7 + ph, g.h);
        o.set(bowX + 5, mid - half - 2, 0xffffff);
        o.set(bowX + 5, mid + half + 1, 0xffffff);
        if (drawn) sparkle(o, shaftEnd + 3, mid, 2, g);
      }
    },
  });
}

// --- Hammer knight girl -------------------------------------------------------------------

function hammerKnight(p: PixelCanvas, t: TF): void {
  const A = isA(t), B = isB(t);
  const spec = accents(t, {
    skin: C.skin, hair: C.redHair, hairStyle: 'hood', hood: C.hoodRed, eye: 0xffa020,
    top: C.hoodRed, topTrim: C.gold, sleeve: 0xf0a040, lower: 0xb81e30, lowerStyle: 'skirt',
    legs: 0x40283a, boots: 0x8a3020, belt: C.leather,
  }, C.gold, 'cannon');
  const { f, bob } = t;
  let hand: [number, number], head: [number, number];
  let behind = false;
  switch (f) {
    case 2: hand = [CX + 4, FY - 29]; head = [CX - 3, FY - 40]; behind = true; break;
    case 3: hand = [CX + 6, FY - 12]; head = [CX + 14, FY - 4]; break;
    case 4: hand = [CX + 6, FY - 11]; head = [CX + 14, FY - 3]; break;
    case 5: hand = [CX + 7, FY - 14]; head = [CX + 15, FY - 22]; break;
    default: hand = [CX + 8, FY - 12 + bob]; head = [CX + 9, FY - 35 + bob]; behind = true;
  }
  const hl = A ? 11 : 9;
  const thick = A ? 14 : 12;
  const dx = head[0] - hand[0], dy = head[1] - hand[1];
  const len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len;
  const nx = -uy, ny = ux;
  const drawHammer = (h: PixelCanvas) => {
    const wood = ramp(A ? 0x6a5a4a : B ? 0x4a3638 : t.level >= 3 ? C.gold : 0x9a5a2a);
    bar(h, hand[0] - ux * 4, hand[1] - uy * 4, head[0], head[1], 2, (_a, b) => (b < 0 ? wood.l : wood.d));
    let paint: (a: number, b: number) => number;
    if (A) {
      const st = ramp(0x9a948c), rune = ramp(0xff9a3a);
      paint = (a, b) => {
        const aa = Math.abs(a);
        if (aa < 0.8 && Math.abs(b * 0.9 - Math.sin(a * 7) * 0.45) < 0.13) return aa < 0.3 ? rune.h : rune.l;
        if (aa > 0.86) return b < 0 ? st.m : st.d;
        return b < -0.6 ? st.l : b < -0.1 ? st.m : b < 0.5 ? st.d : ramp(st.d).d;
      };
    } else if (B) {
      const ir = ramp(0x5a3a3e), lava = ramp(0xff6a1a);
      paint = (a, b) => {
        const aa = Math.abs(a);
        if (aa < 0.14 || (aa > 0.6 && aa < 0.7)) return b < 0 ? lava.h : lava.l;
        if (b < -0.7) return lava.m;
        return b < -0.2 ? ir.l : b < 0.5 ? ir.m : ir.d;
      };
    } else {
      const y = ramp(C.hammerYellow), r = ramp(C.hammerRed), g = ramp(C.gold);
      paint = (a, b) => {
        const aa = Math.abs(a);
        const rr: Ramp = aa > 0.72 ? r : aa > 0.6 ? g : y;
        return b < -0.7 ? rr.m : b < -0.25 ? rr.l : b < 0 ? rr.h : b < 0.55 ? rr.m : rr.d;
      };
    }
    bar(h, head[0] - nx * hl, head[1] - ny * hl, head[0] + nx * hl, head[1] + ny * hl, thick, paint);
    if (A) {
      // gold bands on the handle
      const gr = ramp(C.gold);
      for (const k of [0.25, 0.55]) h.set(hand[0] + dx * k, hand[1] + dy * k, gr.l);
    }
  };
  const slam = f === 3 || f === 4;
  drawChibi(p, spec, CX, FY, {
    bob,
    front: [hand[0] - CX, hand[1] - FY - bob],
    back: [hand[0] - CX - 2, hand[1] - FY + 2 - bob],
    stance: A ? 2 : slam || f === 2 ? 1 : 0,
    squint: slam,
  }, {
    behind: behind ? drawHammer : undefined,
    held: behind ? undefined : drawHammer,
    top: (o) => {
      if (f === 3) {
        const s = ramp(0xffb040);
        for (const [x, y] of [[CX + 3, FY - 2], [CX + 23, FY - 3], [CX + 5, FY - 6], [CX + 22, FY - 8]] as const) {
          o.set(x, y, s.h);
          o.set(x + 1, y - 1, s.l);
        }
      }
      if (f === 4) {
        // impact: dust puffs and a crack flash along the pedestal top
        const d = ramp(0xd8c8a8);
        for (let x = CX + 2; x <= CX + 26; x += 3) {
          o.set(x, FY - 1 - ((x * 7) % 3), d.l);
          o.set(x + 1, FY - 2 - ((x * 5) % 2), d.m);
        }
        const s = ramp(0xffd060);
        for (const [x, y] of [[CX + 1, FY - 9], [CX + 26, FY - 10], [CX + 9, FY - 12], [CX + 20, FY - 13]] as const) sparkle(o, x, y, 1, s);
      }
      if (A && slam) {
        const rune = ramp(0xff9a3a);
        o.line(CX + 14, FY - 1, CX + 6, FY + 1, rune.l);
        o.line(CX + 14, FY - 1, CX + 22, FY + 2, rune.l);
        o.set(CX + 14, FY - 1, rune.h);
      }
      if (B) {
        // flames wreathing the hammer head
        const fl = ramp(0xff6a1a), core = ramp(0xffd040);
        const rand = rng(17 + f * 31);
        for (let s = -1; s <= 1.001; s += 0.34) {
          const ax = head[0] + nx * hl * s, ay = head[1] + ny * hl * s;
          const c1: [number, number] = [ax + ux * thick * 0.5, ay + uy * thick * 0.5];
          const c2: [number, number] = [ax - ux * thick * 0.5, ay - uy * thick * 0.5];
          const [bx, by] = c1[1] < c2[1] ? c1 : c2;
          const l = 3 + Math.floor(rand() * 4);
          spike(o, bx, by, -90 + (rand() - 0.5) * 50, l, 3, (_u, v) => (v < -0.3 ? core.h : fl.l));
          o.set(bx, by - 1, core.l);
        }
        for (let i = 0; i < 4; i++) o.set(head[0] + (rand() - 0.5) * 22, head[1] - 8 - rand() * 8, i % 2 ? core.h : fl.l);
      }
    },
  });
}

// --- Frost mage boy -----------------------------------------------------------------------

function tome(h: PixelCanvas, bx: number, by: number, frozen: boolean): void {
  const cover = ramp(frozen ? 0x3a6ad0 : C.tome);
  const pages = ramp(0xfff6e0);
  h.poly([[bx - 4, by + 1], [bx + 1, by + 3], [bx + 6, by + 1], [bx + 6, by + 4], [bx + 1, by + 6], [bx - 4, by + 4]], cover.m);
  h.poly([[bx - 4, by], [bx + 1, by + 2], [bx + 1, by + 4.5], [bx - 4, by + 2.5]], pages.l);
  h.poly([[bx + 1, by + 2], [bx + 6, by], [bx + 6, by + 2.5], [bx + 1, by + 4.5]], pages.m);
  h.line(bx - 3, by + 1, bx - 1, by + 2, pages.d);
  h.line(bx + 3, by + 2, bx + 5, by + 1, pages.d);
  h.set(bx + 1, by + 5, ramp(C.gold).m);
}

function runeCircle(o: PixelCanvas, x: number, y: number, r: number, g: Ramp): void {
  for (let a = 0; a < Math.PI * 2; a += 0.12) o.set(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.8, a % 0.72 < 0.24 ? g.h : g.l);
  sparkle(o, Math.round(x), Math.round(y), 2, g);
}

function frostMage(p: PixelCanvas, t: TF): void {
  const A = isA(t), B = isB(t);
  const spec = accents(t, {
    skin: C.skin, hair: C.silverBlue, hairStyle: 'swept', eye: 0x30b8ff,
    top: C.robeBlue, topTrim: C.white, sleeve: C.white, lower: C.robeBlue, lowerStyle: 'robe',
    legs: 0x283a80, boots: 0x283a80, belt: C.white, scarf: B ? 0xb070e0 : C.teal,
  }, C.frostGlow, 'frost');
  const { f, bob } = t;
  const g = ramp(C.frostGlow);
  let front: [number, number], back: [number, number], book: [number, number];
  switch (f) {
    case 2: front = [10, -28]; back = [4, -16]; book = [CX + 8, FY - 34]; break;
    case 3: front = [13, -20]; back = [3, -13]; book = [CX + 11, FY - 24]; break;
    case 4: front = [12, -19]; back = [3, -13]; book = [CX + 10, FY - 23]; break;
    case 5: front = [10, -17]; back = [3, -12]; book = [CX + 7, FY - 19]; break;
    default: front = [9, -13]; back = [3, -12]; book = [CX + 6, FY - 14 + bob];
  }
  if (A) {
    // the tome floats on its own, frozen in a block of ice; hands open to channel
    front = f === 2 ? [10, -27] : f === 3 || f === 4 ? [12, -19] : [10, -17];
    book = f === 2 ? [CX + 10, FY - 38] : [CX + 12, FY - 28 - (f === 1 ? 1 : 0)];
  }
  const staffTop: [number, number] = [CX + front[0] + (f === 3 || f === 4 ? 8 : 1), FY + front[1] + bob * (f < 2 ? 1 : 0) - (f === 3 || f === 4 ? 14 : 18)];
  const staffBot: [number, number] = [CX + front[0] - (f === 3 || f === 4 ? 5 : 0), FY + front[1] + (f === 3 || f === 4 ? 8 : 12)];
  const shards = (o: PixelCanvas, front: boolean) => {
    const sr = ramp(0xe0c0ff);
    for (let i = 0; i < 3; i++) {
      const a = f * 0.9 + i * 2.094;
      if (Math.sin(a) >= 0 !== front) continue;
      const x = CX + 1 + Math.cos(a) * 14, y = FY - 21 + Math.sin(a) * 4 - (i - 1) * 3;
      o.poly([[x, y - 3], [x + 1.6, y], [x, y + 3], [x - 1.6, y]], (u) => (u < 0 ? sr.h : i === 1 ? 0x9ff0ff : sr.l));
    }
  };
  if (A) {
    // frosted rim on the pedestal (icy aura)
    const ice = ramp(0xd8f8ff);
    for (let a = 0; a < Math.PI * 2; a += 0.09) {
      const x = CX + 0.5 + Math.cos(a) * 11, y = FY - 0.5 + Math.sin(a) * 2.6;
      if (((a * 20) | 0) % 2 === 0) p.paintOver(x, y, ice.l);
    }
  }
  drawChibi(p, spec, CX, FY, { bob, front, back, squint: f === 3 || f === 4 }, {
    behind: (h) => {
      if (B) shards(h, false);
    },
    held: (h) => {
      if (B) {
        const wood = ramp(0xc8d8f0);
        bar(h, staffBot[0], staffBot[1], staffTop[0], staffTop[1], 2, (_a, b) => (b < 0 ? wood.l : wood.d));
        const [px, py] = staffTop;
        h.poly([[px, py - 5], [px + 3, py], [px, py + 4], [px - 3, py]], (u, v) => (u < -0.1 ? (v < 0 ? 0xffffff : 0x9ff0ff) : v < 0 ? 0xf0b0ff : 0xb070e0));
      } else if (A) {
        const [bx, by] = book;
        // chunk of ice around the floating tome (dithered, chipped corners)
        const ice = ramp(0xbff4ff);
        h.poly([[bx - 5, by - 3], [bx + 6, by - 4], [bx + 8, by + 1], [bx + 7, by + 8], [bx - 2, by + 9], [bx - 6, by + 4]], (_u, _v, x, y) => ((x + y) % 2 === 0 ? ice.l : ice.m));
        tome(h, bx, by, true);
        h.line(bx - 5, by - 3, bx + 6, by - 4, ice.h);
        h.line(bx - 5, by - 3, bx - 6, by + 3, ice.h);
        h.set(bx - 4, by - 2, 0xffffff);
        h.set(bx + 6, by + 6, 0xffffff);
      } else {
        tome(h, book[0], book[1], false);
      }
    },
    top: (o) => {
      const cast = f >= 2 && f <= 4;
      if (A) {
        // ice crown
        const ice = ramp(0xcff8ff);
        const hy = FY - 25 + bob - 8;
        for (let x = CX - 4; x <= CX + 6; x++) o.set(x, hy + 1, (x & 1) ? ice.l : ice.m);
        for (const [x, l] of [[CX - 3, 3], [CX, 4], [CX + 2, 5], [CX + 4, 4], [CX + 6, 3]] as const) {
          o.line(x, hy, x, hy - l + 1, ice.l);
          o.set(x, hy - l + 1, ice.h);
        }
        o.set(CX + 2, hy - 1, 0x60c0ff);
        // snow motes around (icy aura)
        const rand = rng(99 + f * 7);
        for (let i = 0; i < 5; i++) o.set(CX - 14 + rand() * 30, FY - 4 - rand() * 26, rand() < 0.5 ? 0xffffff : ice.l);
      }
      if (B) shards(o, true);
      if (f === 2) runeCircle(o, B ? staffTop[0] : book[0] + 1, (B ? staffTop[1] : book[1]) - 7, 4, B ? ramp(0xe8c0ff) : g);
      if (f === 3 || f === 4) {
        const sx = (B ? staffTop[0] : book[0]) + 8, sy = (B ? staffTop[1] : book[1]) - 1;
        sparkle(o, sx, sy, f === 3 ? 3 : 2, B ? ramp(0xf0c8ff) : g);
        o.set(sx - 5, sy - 4, g.h); o.set(sx + 2, sy - 6, g.l); o.set(sx - 3, sy + 4, g.m);
      }
      if (!cast && t.level >= 3 && !B) o.set(book[0] + 1, book[1] - 2, g.l);
    },
  });
}

// --- Dark swordsman -----------------------------------------------------------------------

function shadowBlade(p: PixelCanvas, t: TF): void {
  const A = isA(t), B = isB(t);
  let spec = accents(t, {
    skin: 0xf6d0b0, hair: C.blackHair, hairStyle: 'messy', eye: 0xd03050,
    top: C.coatBlack, topTrim: C.coatPurple, sleeve: C.coatPurple, lower: C.coatPurple, lowerStyle: 'longcoat',
    legs: C.coatBlack, boots: 0x3a2a4a, belt: C.crimson,
  }, 0xb04cff, 'sniper');
  if (A) spec = { ...spec, scarf: 0xe02034 };
  if (B) spec = { ...spec, eye: 0xc080ff };
  const { f } = t;
  const crouch = f === 2;
  const bob = t.bob + (crouch ? 2 : 0);
  let hand: [number, number], tip: [number, number];
  switch (f) {
    case 2: hand = [CX + 1, FY - 11]; tip = [CX - 16, FY - 19]; break;
    case 3: hand = [CX + 8, FY - 13]; tip = [CX + 22, FY - 8]; break;
    case 4: hand = [CX + 7, FY - 11]; tip = [CX + 19, FY - 1]; break;
    case 5: hand = [CX + 5, FY - 13]; tip = [CX + 17, FY - 6]; break;
    default: hand = [CX + 5, FY - 12 + bob]; tip = [CX + 19, FY - 2 + bob];
  }
  if (B) {
    // spear-glaive: held upright at rest, swung low behind in windup, thrust forward in attack
    switch (f) {
      case 2: hand = [CX + 1, FY - 12]; tip = [CX - 20, FY - 14]; break;
      case 3: hand = [CX + 3, FY - 16]; tip = [CX + 22, FY - 19]; break;
      case 4: hand = [CX + 3, FY - 15]; tip = [CX + 21, FY - 16]; break;
      case 5: hand = [CX + 6, FY - 15]; tip = [CX + 14, FY - 35]; break;
      default: hand = [CX + 7, FY - 14 + bob]; tip = [CX + 11, FY - 44 + bob];
    }
  }
  const headCy = FY - 25 + bob;
  const dx = tip[0] - hand[0], dy = tip[1] - hand[1];
  const len = Math.hypot(dx, dy);
  const ux = dx / len, uy = dy / len;
  const blade = ramp(C.katana);
  const drawKatana = (h: PixelCanvas) => {
    bar(h, hand[0] - ux * 5, hand[1] - uy * 5, hand[0] + ux * 1, hand[1] + uy * 1, 2, (_a, b) => (b < 0 ? ramp(C.crimson).l : ramp(C.crimson).d));
    const gr = ramp(t.level >= 3 ? C.gold : 0xc0a060);
    bar(h, hand[0] + ux * 1 - uy * 2, hand[1] + uy * 1 + ux * 2, hand[0] + ux * 1 + uy * 2, hand[1] + uy * 1 - ux * 2, 1.6, gr.m);
    bar(h, hand[0] + ux * 2, hand[1] + uy * 2, tip[0], tip[1], 2, (a, b) => (b < 0 ? (a > 0.6 ? blade.h : blade.l) : blade.d));
  };
  const drawDaggers = (h: PixelCanvas) => {
    const dg = ramp(0xe8eef8), hilt = ramp(C.crimson);
    // front dagger along the swing direction
    bar(h, hand[0] - ux * 2, hand[1] - uy * 2, hand[0] + ux * 1, hand[1] + uy * 1, 2, hilt.m);
    bar(h, hand[0] + ux * 1, hand[1] + uy * 1, hand[0] + ux * 8, hand[1] + uy * 8, 2, (_a, b) => (b < 0 ? dg.h : dg.m));
    // back-hand dagger in reverse grip
    const bx = hand[0] - 3, by = hand[1] + 1;
    h.line(bx, by - 1, bx, by + 1, hilt.d);
    bar(h, bx, by + 1, bx - 2, by + 7, 1.6, dg.l);
  };
  const drawGlaive = (h: PixelCanvas) => {
    const pole = ramp(0x3a2a50), gr = ramp(C.gold), vs = ramp(0xd8c8ff);
    bar(h, hand[0] - ux * 12, hand[1] - uy * 12, hand[0] + ux * (len - 8), hand[1] + uy * (len - 8), 2, (_a, b) => (b < 0 ? pole.l : pole.d));
    const bx = hand[0] + ux * (len - 8), by = hand[1] + uy * (len - 8);
    h.set(bx, by, gr.l); h.set(bx - uy, by + ux, gr.m);
    // curved blade: a long wedge with a hooked back edge
    const nx = -uy, ny = ux;
    h.poly([[bx + nx * 2, by + ny * 2], [tip[0] + nx * 1.5, tip[1] + ny * 1.5], [tip[0] + ux * 2, tip[1] + uy * 2], [bx - nx * 1, by - ny * 1]], (u, v) => (u + v < 0 ? vs.h : vs.l));
    h.set(tip[0] + ux * 2, tip[1] + uy * 2, 0xffffff);
    spike(h, bx - nx * 1, by - ny * 1, (Math.atan2(-ny, -nx) * 180) / Math.PI - 30, 3, 2, vs.m);
  };
  drawChibi(p, spec, CX, FY, {
    bob,
    front: [hand[0] - CX, hand[1] - FY - bob],
    back: [hand[0] - CX - 2, hand[1] - FY + 1 - bob],
    stance: crouch ? 1 : 0,
    squint: f === 3 || crouch,
  }, {
    behind: (h) => {
      if (A) {
        // sheathed katana across the back + streaming scarf tail
        const sh = ramp(C.coatBlack), hr = ramp(C.crimson);
        bar(h, CX - 8, FY - 8 + bob, CX + 3, FY - 30 + bob, 2.4, (_a, b) => (b < 0 ? sh.l : sh.m));
        bar(h, CX + 3, FY - 30 + bob, CX + 5, FY - 34 + bob, 2, hr.l);
        h.set(CX + 3, FY - 30 + bob, ramp(C.gold).l);
        const sc = ramp(0xe02034);
        const wave = f % 2;
        h.poly([[CX - 3, FY - 17 + bob], [CX - 12, FY - 15 + bob + wave], [CX - 15, FY - 12 + bob - wave], [CX - 11, FY - 13 + bob], [CX - 3, FY - 14 + bob]], cel(sc));
      }
      if (B) {
        // violet halo ring behind the head
        const hv = ramp(0xc890ff);
        for (let a = 0; a < Math.PI * 2; a += 0.04) {
          if (Math.sin(a) > 0.25 || ((a * 12) | 0) % 5 === 0) continue;
          h.set(CX - 1.5 + Math.cos(a) * 12, headCy - 3 + Math.sin(a) * 11, Math.sin(a) < -0.5 ? hv.h : hv.l);
        }
      }
      if (crouch) (B ? drawGlaive : A ? drawDaggers : drawKatana)(h);
    },
    held: (h) => {
      if (!crouch) (B ? drawGlaive : A ? drawDaggers : drawKatana)(h);
      if (A) {
        // cloth mask over the lower face
        const m = ramp(0x2a2036);
        const ey = Math.round(headCy + 0.5);
        h.ellipse(CX + 0.5, headCy, 7.5, 7, (u) => (u < -0.2 ? m.m : m.l), (x, y) => y >= ey + 2 && x >= CX - 2);
      }
    },
    top: (o) => {
      if (f === 3 || f === 4) {
        const s = ramp(A ? 0xff4058 : 0xc070ff);
        const sparse = f === 4;
        const arcs = A ? [0, 5] : [0];
        for (const off of arcs) {
          for (let a = -1.3; a <= 0.9; a += 0.06) {
            if (sparse && ((a * 50) | 0) % 3 === 0) continue;
            const x = CX + 8 + Math.cos(a) * (14 - off), y = FY - 18 + off + Math.sin(a) * (12 - off * 0.5);
            o.set(x, y, a > 0.4 ? s.m : s.l);
            if (!sparse && a > -0.9 && a < 0.5) o.set(x - 1, y, s.h);
          }
        }
      }
      if (B) {
        // glowing third eye on the forehead
        const e = ramp(0xd8a0ff);
        const x = CX + 2, y = headCy - 4;
        o.set(x, y - 1, e.l); o.set(x - 1, y, e.m); o.set(x + 1, y, e.m); o.set(x, y + 1, e.l);
        o.set(x, y, 0xffffff);
      }
    },
  });
}

// --- Spirit wisp --------------------------------------------------------------------------

function wisp(p: PixelCanvas, t: TF): void {
  const A = isA(t), B = isB(t);
  const { f } = t;
  const bobY = -t.bob;
  const flare = f >= 2 && f <= 4;
  let r = A ? 12 : 10;
  if (f === 2) r += 1.5;
  if (f === 5) r -= 0.5;
  const ocx = CX + 0.5, ocy = FY - (A ? 19 : 17) + bobY;
  const cy = ramp(C.cyan);
  const layer = new PixelCanvas(p.w, p.h);
  ditherEllipse(layer, ocx, ocy, r, r, flare ? cy.l : f === 5 ? mix(C.cyan, 0x4080c0, 0.2) : mix(C.cyan, 0xffffff, 0.35), f);
  if (flare) ditherEllipse(layer, ocx, ocy, r * 0.7, r * 0.7, cy.h, f + 1);
  if (B) {
    // unstable white-cyan core behind the ghost girl
    const k = f === 2 ? 6.5 : f === 3 ? 6 : 5;
    layer.ellipse(ocx, ocy + 1, k, k, (u, v) => (u * u + v * v < 0.35 ? 0xffffff : 0xd8ffff));
    const rand = rng(7 + f * 13);
    for (let i = 0; i < 6; i++) {
      const a = rand() * Math.PI * 2, l = r * (0.6 + rand() * 0.35);
      layer.line(ocx + Math.cos(a) * k, ocy + 1 + Math.sin(a) * k, ocx + Math.cos(a) * l, ocy + 1 + Math.sin(a) * l, i % 2 ? 0xffffff : cy.h);
    }
  }
  // ghost girl
  const wr = ramp(C.skinWisp);
  const hairR = ramp(0xd8f6ff);
  layer.poly([[ocx - 3, ocy + 1], [ocx + 4, ocy + 1], [ocx + 2, ocy + 6], [ocx - 3, ocy + 8], [ocx - 1, ocy + 5]], cel(wr));
  layer.ellipse(ocx + 0.5, ocy - 2.5, 4.6, 4.2, wr.l);
  layer.ellipse(ocx - 0.5, ocy - 4, 4.8, 3, cel(hairR, { hi: 0.7 }), (_x, y) => y < ocy - 3);
  layer.rect(Math.floor(ocx) - 5, Math.floor(ocy) - 4, 2, 6, hairR.m);
  const shut = f === 3;
  layer.set(ocx - 0.5, ocy - 2, shut ? 0x60a0c0 : 0x2080a0);
  layer.set(ocx - 0.5, ocy - 1, shut ? wr.l : 0x40c0e0);
  layer.set(ocx + 2.5, ocy - 2, shut ? 0x60a0c0 : 0x2080a0);
  layer.set(ocx + 2.5, ocy - 1, shut ? wr.l : 0x40c0e0);
  layer.set(ocx + 1.5, ocy + 0.5, C.blush);
  if (flare) {
    layer.set(ocx - 3.5, ocy + 0, wr.m);
    layer.set(ocx + 4.5, ocy - 1, wr.m);
  } else {
    layer.set(ocx - 3.5, ocy + 2, wr.m);
    layer.set(ocx + 4.5, ocy + 1, wr.m);
  }
  // orb rim (Overload: thick pulsing white rim)
  const rimR = B && f % 2 === 1 ? [r + 0.4, r - 0.6] : [r + 0.4];
  for (const rr of rimR)
    for (let a = 0; a < Math.PI * 2; a += 0.035) {
      const x = ocx + Math.cos(a) * rr, y = ocy + Math.sin(a) * rr;
      const lit = Math.cos(a - 3.8);
      layer.set(x - 0.5, y - 0.5, B ? (lit > 0 ? 0xffffff : cy.h) : lit > 0.6 ? cy.h : lit > -0.3 ? cy.l : cy.m);
    }
  for (let a = 3.6; a < 4.4; a += 0.08) layer.set(ocx + Math.cos(a) * (r - 2) - 0.5, ocy + Math.sin(a) * (r - 2) - 0.5, 0xffffff);
  layer.outline(ramp(B ? 0x40a0c0 : C.cyan).o);
  p.blit(layer);
  if (A) {
    // crackling arcs hugging the rim
    const rand = rng(3 + f * 11);
    for (let k = 0; k < 3; k++) {
      let a = rand() * Math.PI * 2;
      let px = ocx + Math.cos(a) * (r + 1), py = ocy + Math.sin(a) * (r + 1);
      for (let s = 0; s < 4; s++) {
        a += 0.22;
        const rr = r + 1 + (rand() - 0.3) * 3;
        const nx = ocx + Math.cos(a) * rr, ny = ocy + Math.sin(a) * rr;
        p.line(px, py, nx, ny, s % 2 ? 0xffffff : cy.h);
        px = nx; py = ny;
      }
    }
    // three orbiting sparks
    for (let i = 0; i < 3; i++) {
      const a = f * 1.05 + i * 2.094;
      const x = Math.round(ocx + Math.cos(a) * (r + 4)), y = Math.round(ocy + Math.sin(a) * (r + 3));
      p.set(x, y, 0xffffff);
      p.set(x + 1, y, cy.l); p.set(x - 1, y, cy.l); p.set(x, y + 1, cy.l); p.set(x, y - 1, cy.l);
    }
  }
  const sp = flare ? (f === 3 ? 5 : 3) : t.level >= 3 && !A ? 1 : 0;
  const angles = [0.3, 1.5, 2.6, 3.9, 5.2];
  for (let i = 0; i < sp; i++) {
    const a = angles[i]! + f;
    const rr = r + 3 + (i % 2) * 2;
    const x = Math.round(ocx + Math.cos(a) * rr), y = Math.round(ocy + Math.sin(a) * rr);
    p.set(x, y, 0xffffff);
    p.set(x + 1, y, cy.l); p.set(x - 1, y, cy.l); p.set(x, y + 1, cy.l); p.set(x, y - 1, cy.l);
  }
  if (f === 3) spike(p, ocx + r + 1, ocy - 3, -30, 4, 2, cy.h);
}

const DRAW: Record<TowerKind, (p: PixelCanvas, t: TF) => void> = {
  arrow: archer,
  cannon: hammerKnight,
  frost: frostMage,
  sniper: shadowBlade,
  tesla: wisp,
};

const cache = new Map<string, SpriteSheet>();

/** Sprite sheet for a tower kind/level/branch (cached). The branch only matters at L4. */
export function getTowerSheet(kind: TowerKind, level: TowerLevel, branch: TowerBranch | null = null): SpriteSheet {
  const br = level === 4 ? (branch ?? 'a') : null;
  const key = `${kind}:${level}:${br ?? '-'}`;
  let sheet = cache.get(key);
  if (!sheet) {
    const frames: PixelCanvas[] = [];
    const gem = br ? BRANCH_COLOR[kind][br] : LEVEL_GEM[kind];
    for (const f of [0, 1, 2, 3, 4, 5] as const) {
      const p = new PixelCanvas(TOWER_FRAME_W, TOWER_FRAME_H);
      pedestal(p, level, gem);
      DRAW[kind](p, { level, branch: br, f, bob: f === 1 ? 1 : 0 });
      frames.push(p);
    }
    sheet = makeSheet(frames);
    cache.set(key, sheet);
  }
  return sheet;
}

/**
 * Title-lineup pose of a cast member: the L3 look in its battle-ready (windup) pose, no pedestal.
 * Frames [breath0, breath1]; feet on the bottom row.
 */
export function getLineupSheet(kind: Exclude<TowerKind, 'tesla'>): SpriteSheet {
  const key = `lineup:${kind}`;
  let sheet = cache.get(key);
  if (!sheet) {
    const frames = [0, 1].map((bob) => {
      const p = new PixelCanvas(TOWER_FRAME_W, FY + 1);
      DRAW[kind](p, { level: 3, branch: null, f: 2, bob });
      return p;
    });
    sheet = makeSheet(frames);
    cache.set(key, sheet);
  }
  return sheet;
}
