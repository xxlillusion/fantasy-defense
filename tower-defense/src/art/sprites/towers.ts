// Tower sprites: class archetypes styled after the cast, standing on a level pedestal.
// Sheet frames: [idle0, idle1, attack0, attack1]. Frame 40 x 48 texels, bottom-center anchored.

import type { TowerKind, TowerLevel } from '../../core/types';
import { drawChibi, type ChibiSpec } from './chibi';
import { C, mix, ramp, type Ramp } from './palette';
import { bar, cel, ditherEllipse, makeSheet, PixelCanvas, spike, type SpriteSheet } from './pixelCanvas';

export const TOWER_FRAME_W = 40;
export const TOWER_FRAME_H = 48;
/** Row just below the character's feet (top surface of the pedestal). */
export const TOWER_FOOT_Y = 42;
export const TOWER_FRAMES = { idle0: 0, idle1: 1, attack0: 2, attack1: 3 } as const;

const CX = 20;
const FY = TOWER_FOOT_Y;

const LEVEL_GEM: Record<TowerKind, number> = {
  arrow: C.magenta,
  cannon: C.hammerRed,
  frost: C.frostGlow,
  sniper: 0xb04cff,
  tesla: C.cyan,
};

// ---------------------------------------------------------------- pedestals

function pedestal(p: PixelCanvas, level: TowerLevel, gem: number): void {
  const layer = new PixelCanvas(p.w, p.h);
  const cx = CX + 0.5;
  if (level === 1) {
    const w = ramp(C.wood);
    // side planks
    layer.rect(CX - 10, FY - 1, 21, 5, (u) => (u < -0.5 ? w.m : u < 0.4 ? w.d : ramp(w.d).d));
    for (let x = CX - 8; x <= CX + 9; x += 4) layer.line(x, FY, x, FY + 3, ramp(w.d).d);
    layer.ellipse(cx, FY + 3.5, 10.5, 1.8, ramp(w.d).d);
    // top face with growth rings
    layer.ellipse(cx, FY - 0.5, 10.5, 2.8, w.l);
    layer.ellipse(cx, FY - 0.5, 7, 1.8, w.m);
    layer.ellipse(cx, FY - 0.5, 3.5, 1, w.l);
    layer.set(CX - 6, FY - 2, w.h);
  } else {
    const st = ramp(level === 3 ? mix(C.stone, 0xfff0d0, 0.15) : C.stone);
    const gr = ramp(C.gold);
    const r = level === 3 ? 12 : 11.5;
    layer.rect(CX - Math.floor(r), FY - 1, Math.floor(r) * 2 + 1, 6, (u, v) => (u < -0.55 ? st.m : u < 0.45 ? (v > 0.5 ? st.d : st.m) : st.d));
    // brick joints
    for (let x = CX - 9; x <= CX + 10; x += 5) layer.line(x, FY + 1, x, FY + 2, st.d);
    for (let x = CX - 7; x <= CX + 10; x += 5) layer.line(x, FY + 3, x, FY + 4, st.d);
    layer.line(CX - Math.floor(r), FY + 2, CX + Math.floor(r), FY + 2, ramp(st.d).m);
    layer.ellipse(cx, FY + 4.5, r, 1.8, st.d);
    layer.ellipse(cx, FY - 0.5, r, 3, st.l);
    layer.ellipse(cx, FY - 0.5, r - 2.5, 2, st.m);
    layer.set(CX - 7, FY - 2, st.h);
    if (level === 3) {
      // gilded rim + base band + front gem
      layer.ellipse(cx, FY - 0.5, r, 3, gr.m, (x, y) => {
        const u = (x + 0.5 - cx) / (r - 1.5), v = (y + 0.5 - FY + 0.5) / 2;
        return u * u + v * v > 1;
      });
      for (let x = CX - 11; x <= CX + 12; x++) layer.paintOver(x, FY + 4, x < CX - 4 ? gr.l : gr.m);
      layer.set(CX - 8, FY - 2, gr.h);
      const g = ramp(gem);
      layer.rect(CX, FY + 1, 2, 2, g.m);
      layer.set(CX, FY + 1, g.h);
      layer.set(CX + 1, FY + 2, g.d);
    }
  }
  layer.outline();
  p.blit(layer);
}

// ---------------------------------------------------------------- per-class characters

function levelAccents(level: TowerLevel, base: ChibiSpec, trim: number): ChibiSpec {
  if (level === 1) return base;
  if (level === 2) return { ...base, hem: trim, belt: C.steel };
  return { ...base, hem: C.gold, belt: C.gold, ornament: C.gold };
}

type FrameIndex = 0 | 1 | 2 | 3;

function archer(p: PixelCanvas, level: TowerLevel, f: FrameIndex): void {
  const spec = levelAccents(level, {
    skin: C.skin, hair: C.blonde, hairStyle: 'twintails', eye: 0xa050ff,
    top: C.purple, topTrim: C.gold, sleeve: C.lavender, lower: C.lavender, lowerStyle: 'skirt',
    legs: 0xfff0f8, boots: C.purple, belt: C.leather,
  }, C.magenta);
  const bob = f === 1 ? 1 : 0;
  const drawn = f === 2;
  const mid = FY - 17 + bob;
  const bowX = CX + 10;
  const br = ramp(level === 3 ? mix(C.magenta, C.gold, 0.15) : C.magenta);
  drawChibi(p, spec, CX, FY, {
    bob,
    front: [10, -17],
    back: drawn ? [3, -17] : f === 3 ? [6, -16] : [-3, -10],
    squint: drawn,
  }, {
    held: (h) => {
      // Recurve bow: bulges forward, tips curl forward.
      const flex = drawn ? -1.5 : 0;
      let prev: [number, number] | null = null;
      for (let t = -1; t <= 1.001; t += 0.05) {
        const y = mid + t * 11;
        let x = bowX + (1 - t * t) * (3 + flex) - 1;
        if (Math.abs(t) > 0.8) x += (Math.abs(t) - 0.8) * 12;
        if (prev) h.line(prev[0], prev[1], x, y, t < -0.2 ? br.l : t > 0.5 ? br.d : br.m, 2);
        prev = [x, y];
      }
      const gr = ramp(C.gold);
      h.rect(bowX + 3, mid - 12, 2, 2, gr.l);
      h.rect(bowX + 3, mid + 10, 2, 2, gr.m);
      h.rect(bowX + 1, mid - 1, 2, 3, gr.m);
      // string
      const sc = 0xfff4d8;
      const sx = drawn ? CX + 3 : bowX - 1;
      h.line(bowX + 1, mid - 10, sx, mid, sc);
      h.line(sx, mid, bowX + 1, mid + 10, sc);
      if (drawn) {
        const ar = ramp(C.magenta);
        h.line(CX + 3, mid, CX + 15, mid, ramp(C.wood).l);
        h.rect(CX + 15, mid - 1, 2, 3, ar.l);
        h.set(CX + 17, mid, ar.h);
        h.rect(CX + 2, mid - 1, 2, 3, 0xff8ac8);
      }
    },
  });
}

function hammerKnight(p: PixelCanvas, level: TowerLevel, f: FrameIndex): void {
  const spec = levelAccents(level, {
    skin: C.skin, hair: C.redHair, hairStyle: 'hood', hood: C.hoodRed, eye: 0xffa020,
    top: C.hoodRed, topTrim: C.gold, sleeve: 0xf0a040, lower: 0xb81e30, lowerStyle: 'skirt',
    legs: 0x40283a, boots: 0x8a3020, belt: C.leather,
  }, C.gold);
  const bob = f === 1 ? 1 : 0;
  // Hammer geometry per frame: handle start (hand) -> end (head center); head axis perpendicular.
  let hand: [number, number], head: [number, number];
  if (f === 2) { hand = [CX + 2, FY - 16]; head = [CX - 7, FY - 32]; }
  else if (f === 3) { hand = [CX + 6, FY - 12]; head = [CX + 13, FY - 4]; }
  else { hand = [CX + 8, FY - 12 + bob]; head = [CX + 9, FY - 35 + bob]; }
  const handleEnd: [number, number] = [head[0] + (head[0] - hand[0]) * 0.02, head[1] + (head[1] - hand[1]) * 0.02];
  const drawHammer = (h: PixelCanvas) => {
    const wood = ramp(level === 3 ? C.gold : 0x9a5a2a);
    bar(h, hand[0], hand[1] + 4, handleEnd[0], handleEnd[1], 2, (_a, b) => (b < 0 ? wood.l : wood.d));
    const dx = head[0] - hand[0], dy = head[1] - hand[1];
    const len = Math.hypot(dx, dy);
    const nx = -dy / len, ny = dx / len;
    const hl = 9; // half length of hammer head
    const y = ramp(C.hammerYellow), r = ramp(C.hammerRed), g = ramp(C.gold);
    bar(h, head[0] - nx * hl, head[1] - ny * hl, head[0] + nx * hl, head[1] + ny * hl, 12, (a, b) => {
      const aa = Math.abs(a);
      const rr: Ramp = aa > 0.72 ? r : aa > 0.6 ? g : y;
      return b < -0.7 ? rr.m : b < -0.25 ? rr.l : b < 0 ? rr.h : b < 0.55 ? rr.m : rr.d;
    });
  };
  drawChibi(p, spec, CX, FY, {
    bob,
    front: [hand[0] - CX, hand[1] - FY - bob],
    back: [hand[0] - CX - 2, hand[1] - FY + 2 - bob],
    stance: f === 3 ? 1 : 0,
    squint: f === 3,
  }, {
    behind: f === 3 ? undefined : drawHammer,
    held: f === 3 ? drawHammer : undefined,
    top: f === 3 ? (o) => {
      // impact sparks
      const s = ramp(0xffb040);
      for (const [x, y] of [[CX + 3, FY - 2], [CX + 22, FY - 3], [CX + 5, FY - 6], [CX + 21, FY - 8]] as const) {
        o.set(x, y, s.h);
        o.set(x + 1, y - 1, s.l);
      }
    } : undefined,
  });
}

function frostMage(p: PixelCanvas, level: TowerLevel, f: FrameIndex): void {
  const spec = levelAccents(level, {
    skin: C.skin, hair: C.silverBlue, hairStyle: 'swept', eye: 0x30b8ff,
    top: C.robeBlue, topTrim: C.white, sleeve: C.white, lower: C.robeBlue, lowerStyle: 'robe',
    legs: 0x283a80, boots: 0x283a80, belt: C.white, scarf: C.teal,
  }, C.frostGlow);
  const bob = f === 1 ? 1 : 0;
  const casting = f >= 2;
  const bx = CX + 6, by = FY - 14 + bob - (casting ? 2 : 0);
  drawChibi(p, spec, CX, FY, {
    bob,
    front: casting ? [11, -26] : [9, -13],
    back: [3, -12],
    squint: f === 3,
  }, {
    held: (h) => {
      const cover = ramp(C.tome);
      const pages = ramp(0xfff6e0);
      // open tome, tilted toward the viewer
      h.poly([[bx - 4, by + 1], [bx + 1, by + 3], [bx + 6, by + 1], [bx + 6, by + 4], [bx + 1, by + 6], [bx - 4, by + 4]], cover.m);
      h.poly([[bx - 4, by], [bx + 1, by + 2], [bx + 1, by + 4.5], [bx - 4, by + 2.5]], pages.l);
      h.poly([[bx + 1, by + 2], [bx + 6, by], [bx + 6, by + 2.5], [bx + 1, by + 4.5]], pages.m);
      h.line(bx - 3, by + 1, bx - 1, by + 2, pages.d);
      h.line(bx + 3, by + 2, bx + 5, by + 1, pages.d);
      h.set(bx + 1, by + 5, ramp(C.gold).m);
    },
    top: (o) => {
      const g = ramp(C.frostGlow);
      if (level === 3 || casting) {
        o.set(bx + 1, by - 2, g.l);
      }
      if (casting) {
        // rune sparkle above raised hand + frost motes
        const sx = CX + 12, sy = FY - 31 + bob;
        const big = f === 2 ? 3 : 2;
        for (let i = -big; i <= big; i++) {
          o.set(sx + i, sy, i === 0 ? g.h : g.l);
          o.set(sx, sy + i, i === 0 ? g.h : g.l);
        }
        o.set(sx - 1, sy - 1, g.m); o.set(sx + 1, sy + 1, g.m);
        o.set(sx + 1, sy - 1, g.m); o.set(sx - 1, sy + 1, g.m);
        o.set(bx - 2, by - 3, g.h); o.set(bx + 4, by - 4, g.l); o.set(bx + 1, by - 6, g.m);
      }
    },
  });
}

function shadowBlade(p: PixelCanvas, level: TowerLevel, f: FrameIndex): void {
  const spec = levelAccents(level, {
    skin: 0xf6d0b0, hair: C.blackHair, hairStyle: 'messy', eye: 0xd03050,
    top: C.coatBlack, topTrim: C.coatPurple, sleeve: C.coatPurple, lower: C.coatPurple, lowerStyle: 'longcoat',
    legs: C.coatBlack, boots: 0x3a2a4a, belt: C.crimson,
  }, 0xb04cff);
  const bob = f === 1 ? 1 : 0;
  let hand: [number, number], tip: [number, number];
  if (f === 2) { hand = [CX + 4, FY - 17]; tip = [CX + 13, FY - 36]; }
  else if (f === 3) { hand = [CX + 8, FY - 13]; tip = [CX + 27, FY - 9]; }
  else { hand = [CX + 5, FY - 12 + bob]; tip = [CX + 19, FY - 2 + bob]; }
  drawChibi(p, spec, CX, FY, {
    bob,
    front: [hand[0] - CX, hand[1] - FY - bob],
    back: [hand[0] - CX - 2, hand[1] - FY + 1 - bob],
    squint: f === 3,
  }, {
    held: (h) => {
      const dx = tip[0] - hand[0], dy = tip[1] - hand[1];
      const len = Math.hypot(dx, dy);
      const ux = dx / len, uy = dy / len;
      const blade = ramp(C.katana);
      // hilt behind the hand
      bar(h, hand[0] - ux * 5, hand[1] - uy * 5, hand[0] + ux * 1, hand[1] + uy * 1, 2, (_a, b) => (b < 0 ? ramp(C.crimson).l : ramp(C.crimson).d));
      // guard
      const gr = ramp(level === 3 ? C.gold : 0xc0a060);
      bar(h, hand[0] + ux * 1 - uy * 2, hand[1] + uy * 1 + ux * 2, hand[0] + ux * 1 + uy * 2, hand[1] + uy * 1 - ux * 2, 1.6, gr.m);
      // slightly curved blade
      bar(h, hand[0] + ux * 2, hand[1] + uy * 2, tip[0], tip[1], 2, (a, b) => (b < 0 ? (a > 0.6 ? blade.h : blade.l) : blade.d));
    },
    top: f === 3 ? (o) => {
      // purple slash arc
      const s = ramp(0xc070ff);
      for (let a = -1.3; a <= 0.9; a += 0.06) {
        const x = CX + 10 + Math.cos(a) * 16, y = FY - 18 + Math.sin(a) * 13;
        o.set(x, y, a > 0.4 ? s.m : s.l);
        if (a > -0.9 && a < 0.5) o.set(x - 1, y, s.h);
      }
    } : undefined,
  });
}

function wisp(p: PixelCanvas, level: TowerLevel, f: FrameIndex): void {
  const bob = f === 1 ? -1 : 0;
  const flare = f >= 2;
  const ocx = CX + 0.5, ocy = FY - 17 + bob;
  const cy = ramp(C.cyan);
  const layer = new PixelCanvas(p.w, p.h);
  // orb interior: dithered for fake translucency
  ditherEllipse(layer, ocx, ocy, 10, 10, flare ? cy.l : mix(C.cyan, 0xffffff, 0.35), f);
  if (flare) ditherEllipse(layer, ocx, ocy, 7, 7, cy.h, f + 1);
  // ghost girl
  const wr = ramp(C.skinWisp);
  const hairR = ramp(0xd8f6ff);
  layer.poly([[ocx - 3, ocy + 1], [ocx + 4, ocy + 1], [ocx + 2, ocy + 6], [ocx - 3, ocy + 8], [ocx - 1, ocy + 5]], cel(wr));
  layer.ellipse(ocx + 0.5, ocy - 2.5, 4.6, 4.2, wr.l);
  layer.ellipse(ocx - 0.5, ocy - 4, 4.8, 3, cel(hairR, { hi: 0.7 }), (_x, y) => y < ocy - 3);
  layer.rect(Math.floor(ocx) - 5, Math.floor(ocy) - 4, 2, 6, hairR.m);
  layer.set(ocx - 0.5, ocy - 2, 0x2080a0);
  layer.set(ocx - 0.5, ocy - 1, 0x40c0e0);
  layer.set(ocx + 2.5, ocy - 2, 0x2080a0);
  layer.set(ocx + 2.5, ocy - 1, 0x40c0e0);
  layer.set(ocx + 1.5, ocy + 0.5, C.blush);
  // little arms
  layer.set(ocx - 3.5, ocy + 2, wr.m);
  layer.set(ocx + 4.5, ocy + 1, wr.m);
  // orb rim
  for (let a = 0; a < Math.PI * 2; a += 0.04) {
    const x = ocx + Math.cos(a) * 10.4, y = ocy + Math.sin(a) * 10.4;
    const lit = Math.cos(a - 3.8);
    layer.set(x - 0.5, y - 0.5, lit > 0.6 ? cy.h : lit > -0.3 ? cy.l : cy.m);
  }
  // highlight arc
  for (let a = 3.6; a < 4.4; a += 0.08) layer.set(ocx + Math.cos(a) * 8 - 0.5, ocy + Math.sin(a) * 8 - 0.5, 0xffffff);
  layer.outline(ramp(C.cyan).o);
  p.blit(layer);
  // sparks
  const sp = flare ? (f === 2 ? 5 : 3) : level === 3 ? 1 : 0;
  const angles = [0.3, 1.5, 2.6, 3.9, 5.2];
  for (let i = 0; i < sp; i++) {
    const a = angles[i]! + f;
    const r = 13 + (i % 2) * 2;
    const x = Math.round(ocx + Math.cos(a) * r), y = Math.round(ocy + Math.sin(a) * r);
    p.set(x, y, 0xffffff);
    p.set(x + 1, y, cy.l); p.set(x - 1, y, cy.l); p.set(x, y + 1, cy.l); p.set(x, y - 1, cy.l);
  }
  if (flare) spike(p, ocx + 11, ocy - 3, -30, 4, 2, cy.h);
}

const DRAW: Record<TowerKind, (p: PixelCanvas, level: TowerLevel, f: FrameIndex) => void> = {
  arrow: archer,
  cannon: hammerKnight,
  frost: frostMage,
  sniper: shadowBlade,
  tesla: wisp,
};

const cache = new Map<string, SpriteSheet>();

/** Sprite sheet for a tower kind/level (cached). */
export function getTowerSheet(kind: TowerKind, level: TowerLevel): SpriteSheet {
  const key = `${kind}:${level}`;
  let sheet = cache.get(key);
  if (!sheet) {
    const frames: PixelCanvas[] = [];
    for (const f of [0, 1, 2, 3] as const) {
      const p = new PixelCanvas(TOWER_FRAME_W, TOWER_FRAME_H);
      pedestal(p, level, LEVEL_GEM[kind]);
      DRAW[kind](p, level, f);
      frames.push(p);
    }
    sheet = makeSheet(frames);
    cache.set(key, sheet);
  }
  return sheet;
}

