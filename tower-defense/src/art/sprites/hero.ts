// Hero: Aldric the Greatsword (spiky golden-blond hair, red coat, massive silver greatsword).
// Sheet frames (72 x 64 texels, bottom-center anchored, facing right) — see HERO_FRAMES.
// Frames are wider than the 48px body so full sword swings fit.

import { drawChibi, type ChibiSpec } from './chibi';
import { C, mix, pack, ramp, rgb } from './palette';
import { bar, makeSheet, PixelCanvas, type SpriteSheet } from './pixelCanvas';

export const HERO_W = 72;
export const HERO_H = 64;
export const HERO_FRAMES = {
  walk0: 0,
  walk1: 1,
  idle0: 2,
  idle1: 3,
  windup: 4,
  slash: 5,
  follow: 6,
  storm0: 7,
  storm1: 8,
  down: 9,
  victory: 10,
  ready0: 11,
  ready1: 12,
} as const;
export type HeroFrame = (typeof HERO_FRAMES)[keyof typeof HERO_FRAMES];

const CX = 34;
const FY = 63;

const SPEC: ChibiSpec = {
  skin: C.skin, hair: 0xffd23c, hairStyle: 'spiky', eye: 0x3a7cff,
  top: 0x2a2436, topTrim: C.gold, sleeve: C.heroCoat, lower: C.heroCoat, lowerStyle: 'longcoat',
  legs: 0x2a2436, boots: 0x5a3020, belt: C.leather, scarf: C.heroCoat,
};

type Pt = readonly [number, number];

interface SwordPose {
  hand: Pt;
  /** Blade direction in degrees (0 = right, -90 = up). */
  angle: number;
  len: number;
  behind?: boolean;
}

interface HeroPose {
  bob: number;
  sword: SwordPose;
  /** Back hand (absolute); defaults next to the sword hand. */
  back?: Pt;
  legs?: readonly [number, number, number, number];
  stance?: number;
  squint?: boolean;
  top?: (o: PixelCanvas) => void;
  behind?: (o: PixelCanvas) => void;
}

function drawSword(b: PixelCanvas, s: SwordPose): void {
  const a = (s.angle * Math.PI) / 180;
  const ux = Math.cos(a), uy = Math.sin(a);
  const [hx, hy] = s.hand;
  const tip: Pt = [hx + ux * s.len, hy + uy * s.len];
  const st = ramp(0xd8e0ec);
  bar(b, hx + ux * 4, hy + uy * 4, tip[0], tip[1], 6, (t, bb) => (bb < -0.4 ? st.h : bb < 0.1 ? st.l : t > 0.85 ? st.l : bb < 0.6 ? st.m : st.d));
  bar(b, hx + ux * 6, hy + uy * 6, tip[0] - ux * 3, tip[1] - uy * 3, 1, st.d);
  const g = ramp(C.gold);
  bar(b, hx + ux * 3 - uy * 5, hy + uy * 3 + ux * 5, hx + ux * 3 + uy * 5, hy + uy * 3 - ux * 5, 2, g.m);
  bar(b, hx - ux * 3, hy - uy * 3, hx + ux * 3, hy + uy * 3, 2, ramp(0x5a3020).m);
  b.set(hx - ux * 4, hy - uy * 4, g.l);
}

/** Arc of smear pixels (sword swing trail). a0 -> a1 in radians; later angles are brighter. */
function smear(o: PixelCanvas, cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, sparse = false): void {
  const c1 = 0xffffff, c2 = 0xc8f0ff, c3 = 0x80c8ff;
  const n = Math.ceil(Math.abs(a1 - a0) * Math.max(rx, ry) * 1.5);
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    if (sparse && i % 3 === 0) continue;
    const a = a0 + (a1 - a0) * k;
    const x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
    o.set(x, y, k > 0.6 ? c1 : c2);
    if (k > 0.3) o.set(x - Math.cos(a), y - Math.sin(a), k > 0.7 ? c2 : c3);
    if (k > 0.75 && !sparse) o.set(x - Math.cos(a) * 2, y - Math.sin(a) * 2, c3);
  }
}

function poseFor(frame: HeroFrame): HeroPose {
  switch (frame) {
    case HERO_FRAMES.walk0:
      return { bob: 0, legs: [-2, 0, 2, 0], sword: { hand: [CX + 5, FY - 16], angle: -148, len: 28, behind: true }, back: [CX - 1, FY - 10] };
    case HERO_FRAMES.walk1:
      return { bob: 1, legs: [1, 1, -1, 0], sword: { hand: [CX + 5, FY - 15], angle: -146, len: 28, behind: true }, back: [CX + 2, FY - 10] };
    case HERO_FRAMES.idle0:
    case HERO_FRAMES.idle1: {
      const bob = frame === HERO_FRAMES.idle1 ? 1 : 0;
      return { bob, stance: 1, sword: { hand: [CX + 6, FY - 13 + bob], angle: -68, len: 33 } };
    }
    case HERO_FRAMES.windup:
      return { bob: 1, stance: 1, sword: { hand: [CX - 1, FY - 29], angle: -162, len: 30, behind: true }, back: [CX - 3, FY - 27] };
    case HERO_FRAMES.slash:
      return {
        bob: 1, stance: 1, squint: true, sword: { hand: [CX + 9, FY - 18], angle: -12, len: 28 },
        top: (o) => smear(o, CX + 6, FY - 18, 27, 24, -2.7, -0.35),
      };
    case HERO_FRAMES.follow:
      return {
        bob: 2, stance: 1, squint: true, sword: { hand: [CX + 8, FY - 11], angle: 28, len: 28 },
        top: (o) => smear(o, CX + 6, FY - 16, 26, 16, -0.9, 0.55, true),
      };
    case HERO_FRAMES.storm0:
      return {
        bob: 1, stance: 1, squint: true, sword: { hand: [CX + 7, FY - 16], angle: 0, len: 27 },
        behind: (o) => smear(o, CX + 1, FY - 15, 33, 8, Math.PI * 1.05, Math.PI * 1.95, true),
        top: (o) => smear(o, CX + 1, FY - 15, 33, 8, 0.1, Math.PI * 0.9),
      };
    case HERO_FRAMES.storm1:
      return {
        bob: 0, stance: 1, squint: true, sword: { hand: [CX - 6, FY - 16], angle: 180, len: 26, behind: true },
        behind: (o) => smear(o, CX + 1, FY - 15, 33, 8, Math.PI * 0.05 + Math.PI, Math.PI * 0.95 + Math.PI, true),
        top: (o) => smear(o, CX + 1, FY - 15, 33, 8, Math.PI * 1.1 - Math.PI, Math.PI * 1.9 - Math.PI),
      };
    case HERO_FRAMES.down:
      return { bob: 5, legs: [-2, 0, 3, 2], squint: true, sword: { hand: [CX + 9, FY - 21], angle: 90, len: 26 }, back: [CX + 6, FY - 19] };
    case HERO_FRAMES.victory:
      return {
        bob: 0, stance: 1, squint: true, sword: { hand: [CX + 4, FY - 33], angle: -87, len: 26 }, back: [CX - 6, FY - 26],
        top: (o) => {
          const g = ramp(0xfff0a0);
          for (const [x, y] of [[CX - 2, FY - 58], [CX + 12, FY - 55], [CX - 7, FY - 44]] as const) {
            o.set(x, y, 0xffffff); o.set(x - 1, y, g.l); o.set(x + 1, y, g.l); o.set(x, y - 1, g.l); o.set(x, y + 1, g.l);
          }
        },
      };
    case HERO_FRAMES.ready0:
    case HERO_FRAMES.ready1: {
      const b = frame === HERO_FRAMES.ready1 ? 1 : 0;
      return { bob: 2 + b, stance: 2, sword: { hand: [CX + 8, FY - 15 + b], angle: -38, len: 31 }, back: [CX + 5, FY - 13 + b] };
    }
  }
  return poseFor(HERO_FRAMES.idle0);
}

function desaturate(p: PixelCanvas, amount: number, dim: number): void {
  for (let i = 0; i < p.px.length; i++) {
    const c = p.px[i]!;
    if (c < 0) continue;
    const [r, g, b] = rgb(c);
    const l = r * 0.3 + g * 0.59 + b * 0.11;
    p.px[i] = pack((r + (l - r) * amount) * dim, (g + (l - g) * amount) * dim, (b + (l - b) * amount + 12) * dim);
  }
}

function heroFrame(frame: HeroFrame): PixelCanvas {
  const p = new PixelCanvas(HERO_W, HERO_H);
  const pose = poseFor(frame);
  const { hand } = pose.sword;
  const back = pose.back ?? [hand[0] - 2, hand[1] + 1];
  const b = pose.bob;
  drawChibi(p, SPEC, CX, FY, {
    bob: b,
    front: [hand[0] - CX, hand[1] - FY - b],
    back: [back[0] - CX, back[1] - FY - b],
    stance: pose.stance ?? 0,
    legs: pose.legs,
    squint: pose.squint,
  }, {
    behind: (o) => {
      pose.behind?.(o);
      if (pose.sword.behind) drawSword(o, pose.sword);
    },
    held: pose.sword.behind ? undefined : (o) => drawSword(o, pose.sword),
    top: pose.top,
  });
  if (frame === HERO_FRAMES.down) desaturate(p, 0.65, 0.85);
  return p;
}

let heroSheet: SpriteSheet | null = null;

/** The hero's full sheet (all HERO_FRAMES). */
export function getHeroSheet(): SpriteSheet {
  if (!heroSheet) {
    const frames: PixelCanvas[] = [];
    for (let i = 0; i <= HERO_FRAMES.ready1; i++) frames.push(heroFrame(i as HeroFrame));
    heroSheet = makeSheet(frames);
  }
  return heroSheet;
}

/** Build the hero pixel canvas (frame 0 = idle, 1 = breath). */
export function createHeroPixels(frame: 0 | 1 = 0): PixelCanvas {
  return heroFrame(frame === 0 ? HERO_FRAMES.idle0 : HERO_FRAMES.idle1);
}

/** Hero as an HTML canvas, nearest-neighbor upscaled by an integer `scale`. */
export function createHeroCanvas(scale = 4, frame: 0 | 1 = 0): HTMLCanvasElement {
  return createHeroPixels(frame).toCanvas(Math.max(1, Math.round(scale)));
}

// ---------------------------------------------------------------- badge + rally flag

const DIGITS: Record<number, readonly string[]> = {
  1: ['.#.', '##.', '.#.', '.#.', '###'],
  2: ['##.', '..#', '.#.', '#..', '###'],
  3: ['##.', '..#', '.#.', '..#', '##.'],
  4: ['#.#', '#.#', '###', '..#', '..#'],
  5: ['###', '#..', '##.', '..#', '##.'],
};

let badgeSheet: SpriteSheet | null = null;

/** Level badges 1..5 (frame = level - 1): a small gold shield with a pixel number. 11 x 12. */
export function getHeroBadgeSheet(): SpriteSheet {
  if (!badgeSheet) {
    const g = ramp(C.gold);
    const frames = [1, 2, 3, 4, 5].map((lvl) => {
      const p = new PixelCanvas(11, 12);
      p.poly([[0.5, 0.5], [10.5, 0.5], [10.5, 6.5], [5.5, 11.5], [0.5, 6.5]], (u, v) => (u + v < -0.6 ? g.h : u < 0.3 ? g.l : g.m));
      p.poly([[2, 2], [9, 2], [9, 6.2], [5.5, 9.6], [2, 6.2]], mix(C.heroCoat, 0x401020, 0.35));
      p.rows(DIGITS[lvl]!, { '#': 0xfff6d8 }, 4, 3);
      p.outline(g.o);
      return p;
    });
    badgeSheet = makeSheet(frames);
  }
  return badgeSheet;
}

let flagSheet: SpriteSheet | null = null;

/** Rally-point banner, 2 waving frames. 14 x 22, pole bottom-center. */
export function getRallyFlagSheet(): SpriteSheet {
  if (!flagSheet) {
    const pole = ramp(0x8a5a30), red = ramp(C.heroCoat), g = ramp(C.gold);
    const frames = [0, 1].map((f) => {
      const p = new PixelCanvas(14, 22);
      p.rect(6, 2, 2, 20, (u) => (u < 0 ? pole.l : pole.d));
      p.rect(6, 0, 2, 2, g.l);
      const wave = (x: number) => (f === 0 ? Math.round(Math.sin(x * 0.9) * 1) : Math.round(Math.sin(x * 0.9 + 2) * 1));
      for (let x = 8; x < 14; x++) {
        const o = wave(x);
        for (let y = 2 + o; y < 10 + o - (x > 11 ? 1 : 0); y++) p.set(x, y, y === 2 + o ? g.m : x === 13 ? red.d : (x + y) % 5 === 0 ? red.l : red.m);
      }
      p.set(10, 5 + wave(10), 0xfff6d8);
      p.set(10, 6 + wave(10), 0xfff6d8);
      p.set(11, 6 + wave(11), 0xfff6d8);
      p.outline();
      return p;
    });
    flagSheet = makeSheet(frames);
  }
  return flagSheet;
}
