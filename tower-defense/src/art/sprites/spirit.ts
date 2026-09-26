// The portal spirit girl: a small glowing white ghost girl, drawn facing the camera.
// Sheet frames: [idle0, idle1, flinch, cheer]. 22 x 30, the wispy tail at the bottom.
// The orb variant (title lineup) puts her inside a dithered cyan glow orb.

import { C, ramp } from './palette';
import { ditherEllipse, makeSheet, PixelCanvas, type SpriteSheet } from './pixelCanvas';

export const SPIRIT_FRAMES = { idle0: 0, idle1: 1, flinch: 2, cheer: 3 } as const;
export const SPIRIT_W = 22;
export const SPIRIT_H = 30;

type Frame = 0 | 1 | 2 | 3;

/** Soft cyan outline so she reads as glowing. */
const OUTLINE = 0x3a9ac8;

function girl(f: Frame): PixelCanvas {
  const p = new PixelCanvas(SPIRIT_W, SPIRIT_H);
  const cx = 11;
  const body = ramp(0xeaf8ff), hair = ramp(0xd8f6ff), sh = 0x9fe0f8;
  const dy = f === 1 ? 1 : f === 2 ? 1 : f === 3 ? -1 : 0;
  const hy = 9 + dy;
  const back = new PixelCanvas(SPIRIT_W, SPIRIT_H);
  // long hair flowing behind the gown
  back.poly([[cx - 6, hy - 1], [cx + 6, hy - 1], [cx + 7, hy + 12], [cx + 4, hy + 10], [cx, hy + 13], [cx - 4, hy + 10], [cx - 7, hy + 12]], (u) => (u < -0.3 ? hair.l : u < 0.4 ? hair.m : sh));
  back.outline(OUTLINE);
  const gown = new PixelCanvas(SPIRIT_W, SPIRIT_H);
  const sway = f === 1 ? 1 : f === 2 ? -1 : 0;
  gown.poly([
    [cx - 3, hy + 5], [cx + 3, hy + 5], [cx + 7, hy + 15], [cx + 4 + sway, hy + 17], [cx + 2 + sway, hy + 20],
    [cx + sway, hy + 19], [cx - 1 + sway * 2, SPIRIT_H - 1], [cx - 3 + sway, hy + 17], [cx - 7, hy + 15],
  ], (u, v) => (u < -0.35 ? body.h : u < 0.35 ? (v > 0.5 ? body.m : body.l) : sh));
  gown.line(cx - 4, hy + 14, cx + 4, hy + 14, 0xbfeeff);
  gown.set(cx, hy + 7, 0x7fe8ff); // little gem brooch
  gown.outline(OUTLINE);
  const head = new PixelCanvas(SPIRIT_W, SPIRIT_H);
  head.ellipse(cx, hy, 5.5, 5, body.h);
  // fringe + side locks
  head.ellipse(cx, hy - 1.5, 6.3, 5, (u) => (u < -0.3 ? 0xffffff : hair.l), (_x, y) => y < hy - 1 + (_x % 2));
  head.rect(cx - 6, hy - 1, 2, 7, hair.m);
  head.rect(cx + 5, hy - 1, 2, 7, sh);
  // face
  const ey = hy + 1;
  if (f === 2) {
    // flinch: squeezed >< eyes
    head.set(cx - 3, ey - 1, 0x3a8ab0); head.set(cx - 2, ey, 0x3a8ab0); head.set(cx - 3, ey + 1, 0x3a8ab0);
    head.set(cx + 3, ey - 1, 0x3a8ab0); head.set(cx + 2, ey, 0x3a8ab0); head.set(cx + 3, ey + 1, 0x3a8ab0);
    head.set(cx, ey + 3, 0x3a8ab0);
  } else if (f === 3) {
    // cheer: happy ^^ eyes, open smile
    for (const ex of [cx - 3, cx + 2]) {
      head.set(ex, ey, 0x3a8ab0); head.set(ex + 1, ey - 1, 0x3a8ab0); head.set(ex + 2, ey, 0x3a8ab0);
    }
    head.set(cx, ey + 2, 0xff90a8); head.set(cx + 1, ey + 2, 0xff90a8);
  } else {
    for (const ex of [cx - 3, cx + 2]) {
      head.set(ex, ey, 0x2080a0); head.set(ex + 1, ey, 0x2080a0);
      head.set(ex, ey + 1, 0x40c0e0); head.set(ex + 1, ey + 1, 0x80e8ff);
    }
    head.set(cx, ey + 3, 0x80b8d0);
  }
  head.set(cx - 4, ey + 2, C.blush);
  head.set(cx + 4, ey + 2, C.blush);
  head.outline(OUTLINE);
  const arms = new PixelCanvas(SPIRIT_W, SPIRIT_H);
  if (f === 2) {
    // arms up in front of the face
    arms.line(cx - 4, hy + 6, cx - 3, hy + 3, body.m, 2);
    arms.line(cx + 4, hy + 6, cx + 3, hy + 3, body.m, 2);
  } else if (f === 3) {
    // arms raised high
    arms.line(cx - 3, hy + 6, cx - 8, hy - 3, body.l, 2);
    arms.line(cx + 3, hy + 6, cx + 8, hy - 3, body.l, 2);
  } else {
    // hands clasped at the chest
    arms.line(cx - 3, hy + 6, cx - 1, hy + 9, body.m, 2);
    arms.line(cx + 3, hy + 6, cx + 1, hy + 9, body.m, 2);
  }
  arms.outline(OUTLINE);
  p.blit(back).blit(gown).blit(head).blit(arms);
  if (f === 3) {
    for (const [x, y] of [[2, 3], [19, 5], [3, 14], [18, 15]] as const) {
      p.set(x, y, 0xffffff); p.set(x - 1, y, 0x9ff0ff); p.set(x + 1, y, 0x9ff0ff); p.set(x, y - 1, 0x9ff0ff); p.set(x, y + 1, 0x9ff0ff);
    }
  }
  return p;
}

let sheet: SpriteSheet | null = null;
let orbSheet: SpriteSheet | null = null;

export function getSpiritSheet(): SpriteSheet {
  sheet ??= makeSheet(([0, 1, 2, 3] as const).map(girl));
  return sheet;
}

/** Title-lineup spirit: the girl inside a bright cyan orb. Frames [idle0, idle1]. 40 x 42. */
export function getSpiritOrbSheet(): SpriteSheet {
  if (!orbSheet) {
    const cy = ramp(C.cyan);
    const frames = ([0, 1] as const).map((f) => {
      const p = new PixelCanvas(40, 42);
      const ocx = 20, ocy = 21;
      ditherEllipse(p, ocx, ocy, 18, 18, 0x9ff0ff, f);
      ditherEllipse(p, ocx, ocy, 12, 12, 0xd8ffff, f + 1);
      p.blit(girl(f), 9, 6 - f);
      for (let a = 0; a < Math.PI * 2; a += 0.025) {
        const lit = Math.cos(a - 3.8);
        p.set(ocx + Math.cos(a) * 18.4 - 0.5, ocy + Math.sin(a) * 18.4 - 0.5, lit > 0.5 ? 0xffffff : lit > -0.3 ? cy.h : cy.l);
      }
      for (let a = 3.5; a < 4.5; a += 0.05) p.set(ocx + Math.cos(a) * 15 - 0.5, ocy + Math.sin(a) * 15 - 0.5, 0xffffff);
      return p;
    });
    orbSheet = makeSheet(frames);
  }
  return orbSheet;
}
