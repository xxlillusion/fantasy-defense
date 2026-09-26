// Hero sprite (spiky golden-blond hair, red coat, massive silver greatsword).
// Reusable for a future title screen; not wired into the game yet.

import { drawChibi } from './chibi';
import { C, ramp } from './palette';
import { bar, PixelCanvas } from './pixelCanvas';

export const HERO_W = 48;
export const HERO_H = 48;

/** Build the hero pixel canvas (frame 0 = idle, 1 = breath). */
export function createHeroPixels(frame: 0 | 1 = 0): PixelCanvas {
  const p = new PixelCanvas(HERO_W, HERO_H);
  const cx = 22, fy = 47;
  const bob = frame;
  const hand: [number, number] = [cx + 6, fy - 13 + bob];
  const tip: [number, number] = [cx + 19, fy - 45];
  drawChibi(p, {
    skin: C.skin, hair: 0xffd23c, hairStyle: 'spiky', eye: 0x3a7cff,
    top: 0x2a2436, topTrim: C.gold, sleeve: C.heroCoat, lower: C.heroCoat, lowerStyle: 'longcoat',
    legs: 0x2a2436, boots: 0x5a3020, belt: C.leather, scarf: C.heroCoat,
  }, cx, fy, { bob, front: [hand[0] - cx, hand[1] - fy - bob], back: [hand[0] - cx - 2, hand[1] - fy + 1 - bob], stance: 1 }, {
    held: (b) => {
      const s = ramp(0xd8e0ec);
      const dx = tip[0] - hand[0], dy = tip[1] - hand[1];
      const len = Math.hypot(dx, dy);
      const ux = dx / len, uy = dy / len;
      bar(b, hand[0] + ux * 4, hand[1] + uy * 4, tip[0], tip[1], 7, (a, bb) => (bb < -0.4 ? s.h : bb < 0.1 ? s.l : a > 0.85 ? s.l : bb < 0.6 ? s.m : s.d));
      bar(b, hand[0] + ux * 6, hand[1] + uy * 6, tip[0] - ux * 3, tip[1] - uy * 3, 1, s.d); // fuller
      const g = ramp(C.gold);
      bar(b, hand[0] + ux * 3 - uy * 5, hand[1] + uy * 3 + ux * 5, hand[0] + ux * 3 + uy * 5, hand[1] + uy * 3 - ux * 5, 2, g.m);
      bar(b, hand[0] - ux * 3, hand[1] - uy * 3, hand[0] + ux * 3, hand[1] + uy * 3, 2, ramp(0x5a3020).m);
    },
  });
  return p;
}

/** Hero as an HTML canvas, nearest-neighbor upscaled by an integer `scale`. */
export function createHeroCanvas(scale = 4, frame: 0 | 1 = 0): HTMLCanvasElement {
  return createHeroPixels(frame).toCanvas(Math.max(1, Math.round(scale)));
}
