// Layered chibi humanoid builder (≈2.4 heads tall, big head + eyes), facing right.
// Each part is drawn on its own layer and outlined individually, so overlapping parts get
// colored interior outlines, then composited back to front.

import { PixelCanvas, cel, spike } from './pixelCanvas';
import { C, mix, outlineOf, ramp } from './palette';

export type HairStyle = 'twintails' | 'hood' | 'swept' | 'messy' | 'spiky';
export type LowerStyle = 'skirt' | 'longcoat' | 'robe' | 'pants';

export interface ChibiSpec {
  skin: number;
  hair: number;
  hairStyle: HairStyle;
  eye: number;
  top: number;
  topTrim?: number;
  sleeve: number;
  lower: number;
  lowerStyle: LowerStyle;
  legs: number;
  boots: number;
  belt: number;
  hood?: number;
  scarf?: number;
  /** Extra accent drawn as hem/trim pixels (level accents). */
  hem?: number;
  /** Small head ornament (L3 accent), drawn in the hair. */
  ornament?: number;
}

export interface ChibiPose {
  /** Breath / bob offset in pixels (applied to torso + head). */
  bob: number;
  /** Front hand position relative to (cx, footY). */
  front: [number, number];
  /** Back hand position relative to (cx, footY). */
  back: [number, number];
  /** Leg spread for stance (0 normal, 1 wide). */
  stance?: number;
  /** Eyes closed/squint (attack concentration). */
  squint?: boolean;
}

export interface ChibiLayers {
  /** Drawn behind everything (capes, tails, weapons carried behind). */
  behind?: (p: PixelCanvas) => void;
  /** Drawn between the body and the front arm (held weapons). */
  held?: (p: PixelCanvas) => void;
  /** Drawn on top of everything (effects, overlapping weapon parts). Not outlined. */
  top?: (p: PixelCanvas) => void;
}

/** Draw a chibi into `out`. cx = center column, footY = row just below the feet. */
export function drawChibi(out: PixelCanvas, s: ChibiSpec, cx: number, footY: number, pose: ChibiPose, layers: ChibiLayers = {}): void {
  const W = out.w, H = out.h;
  const b = pose.bob;
  const headCx = cx + 0.5;
  const headCy = footY - 25 + b;
  const torsoTop = footY - 18 + b;
  const waist = footY - 10 + b;

  // --- behind layer: twin tails, hood tip, capes, weapons behind
  const back = new PixelCanvas(W, H);
  const hr = ramp(s.hair);
  if (s.hairStyle === 'twintails') {
    back.ellipse(cx - 9, headCy + 4, 2.6, 7.5, cel(hr, { hi: 0.7 }));
    back.ellipse(cx + 10, headCy + 4, 2.6, 7.5, cel(hr, { hi: 0.7 }));
    back.ellipse(cx - 9.5, headCy + 10, 1.6, 2.5, hr.m);
    back.ellipse(cx + 10.5, headCy + 10, 1.6, 2.5, hr.m);
  }
  if (s.hairStyle === 'hood' && s.hood !== undefined) {
    const r = ramp(s.hood);
    back.poly([[cx - 6, headCy - 4], [cx - 12, headCy + 6], [cx - 4, headCy + 4]], cel(r));
  }
  if (s.hairStyle === 'messy') {
    back.poly([[cx - 6, headCy - 1], [cx - 11, headCy + 7], [cx - 3, headCy + 5]], cel(hr));
  }
  if (s.lowerStyle === 'longcoat') {
    const r = ramp(s.lower);
    back.poly([[cx - 4, waist], [cx - 9, footY - 1], [cx - 3, footY - 2], [cx, waist + 2]], cel(r));
  }
  layers.behind?.(back);
  back.outline();

  // --- back arm
  const armB = new PixelCanvas(W, H);
  drawArm(armB, s, cx - 4, torsoTop + 2, cx + pose.back[0], footY + pose.back[1] + b, true);
  armB.outline();

  // --- body
  const body = new PixelCanvas(W, H);
  const stance = pose.stance ?? 0;
  const lr = ramp(s.legs), br = ramp(s.boots);
  const legTop = footY - 7;
  for (const lx of [cx - 3 - stance, cx + 1 + stance]) {
    body.rect(lx, legTop, 2, 5, cel(lr));
    body.rect(lx, footY - 3, 3, 3, cel(br, { hi: 0.8 }));
  }
  const top = ramp(s.top);
  body.poly([[cx - 4.5, torsoTop], [cx + 5.5, torsoTop], [cx + 5, waist + 1], [cx - 4, waist + 1]], cel(top, { hi: 0.8 }));
  if (s.topTrim !== undefined) {
    const tr = ramp(s.topTrim);
    body.line(cx + 1, torsoTop, cx + 1, waist, tr.m);
    body.set(cx, torsoTop, tr.l);
    body.set(cx + 2, torsoTop, tr.l);
  }
  const low = ramp(s.lower);
  if (s.lowerStyle === 'skirt') {
    body.poly([[cx - 4.5, waist], [cx + 5.5, waist], [cx + 7, footY - 4 + Math.min(b, 0)], [cx - 6, footY - 4 + Math.min(b, 0)]], cel(low));
    for (let x = cx - 5; x <= cx + 6; x += 3) body.paintOver(x, footY - 5, low.d);
  } else if (s.lowerStyle === 'longcoat') {
    body.poly([[cx - 4.5, waist], [cx + 5.5, waist], [cx + 7, footY - 1], [cx + 2, footY - 2], [cx - 5, footY - 1]], cel(low));
    body.line(cx + 1, waist + 1, cx + 2, footY - 3, low.d);
  } else if (s.lowerStyle === 'robe') {
    body.poly([[cx - 4.5, waist - 1], [cx + 5.5, waist - 1], [cx + 7.5, footY - 2], [cx - 6.5, footY - 2]], cel(low));
    body.line(cx + 1, waist, cx + 2, footY - 3, low.l);
  } else {
    body.rect(cx - 4, waist, 10, 3, cel(low));
  }
  if (s.hem !== undefined) {
    const hy = s.lowerStyle === 'skirt' ? footY - 4 : footY - 2;
    for (let x = cx - 8; x <= cx + 9; x++) if (body.get(x, hy - 1) !== -1 && body.get(x, hy) === -1) body.set(x, hy - 1, s.hem);
  }
  // belt
  const bl = ramp(s.belt);
  for (let x = cx - 5; x <= cx + 6; x++) body.paintOver(x, waist, bl.m);
  body.paintOver(cx + 2, waist, bl.h);
  if (s.scarf !== undefined) {
    const sr = ramp(s.scarf);
    body.ellipse(cx + 0.5, torsoTop + 1, 5.5, 2, cel(sr, { hi: 0.8 }));
    body.rect(cx - 4, torsoTop + 2, 2, 5, cel(sr));
  }
  body.outline();

  // --- head
  const head = new PixelCanvas(W, H);
  const sk = ramp(s.skin);
  head.ellipse(headCx, headCy, 7.5, 7, (u, v) => (u < -0.55 && v > -0.2 ? sk.d : v > 0.55 && u < 0.2 ? sk.d : sk.m));
  // ear (back side)
  head.rect(cx - 5, headCy + 1, 2, 2, sk.d);
  drawFace(head, s, cx, headCy, pose.squint ?? false);
  drawHair(head, s, cx, headCy);
  head.outline();

  // --- held items
  const held = new PixelCanvas(W, H);
  layers.held?.(held);
  held.outline();

  // --- front arm
  const armF = new PixelCanvas(W, H);
  drawArm(armF, s, cx + 4, torsoTop + 2, cx + pose.front[0], footY + pose.front[1] + b, false);
  armF.outline();

  out.blit(back).blit(armB).blit(body).blit(head).blit(held).blit(armF);
  layers.top?.(out);
}

function drawArm(p: PixelCanvas, s: ChibiSpec, sx: number, sy: number, hx: number, hy: number, isBack: boolean): void {
  const r = ramp(s.sleeve);
  const col = isBack ? r.d : r.m;
  const dx = hx - sx, dy = hy - sy;
  const steps = Math.max(1, Math.round(Math.hypot(dx, dy)));
  for (let i = 0; i <= steps - 1; i++) {
    const t = i / steps;
    const x = sx + dx * t, y = sy + dy * t;
    p.set(x, y, col);
    p.set(x + 1, y, isBack ? r.d : r.l);
    p.set(x, y + 1, r.d);
  }
  const sk = ramp(s.skin);
  p.rect(hx - 1, hy - 1, 2, 2, isBack ? sk.d : sk.m);
  p.set(hx - 1, hy - 1, isBack ? sk.m : sk.l);
}

function drawFace(p: PixelCanvas, s: ChibiSpec, cx: number, cy: number, squint: boolean): void {
  const er = ramp(s.eye);
  const lash = outlineOf(s.hair === C.blackHair ? 0x302040 : mix(s.hair, 0x402030, 0.6));
  const ey = Math.round(cy + 0.5);
  for (const ex of [cx - 1, cx + 4]) {
    if (squint) {
      p.set(ex, ey + 1, lash);
      p.set(ex + 1, ey + 1, lash);
      continue;
    }
    p.set(ex, ey - 1, lash);
    p.set(ex + 1, ey - 1, lash);
    p.set(ex, ey, C.white);
    p.set(ex + 1, ey, er.m);
    p.set(ex, ey + 1, er.d);
    p.set(ex + 1, ey + 1, er.l);
  }
  p.set(cx - 2, ey - 1, lash); // outer lash flick
  p.set(cx + 6, ey - 1, lash);
  // blush + mouth
  p.set(cx - 2, ey + 2, mix(s.skin, C.blush, 0.55));
  p.set(cx + 6, ey + 2, mix(s.skin, C.blush, 0.55));
  p.set(cx + 3, ey + 3, outlineOf(s.skin));
}

function drawHair(p: PixelCanvas, s: ChibiSpec, cx: number, cy: number): void {
  const r = ramp(s.hair);
  const shade = cel(r, { hi: 0.72 });
  const jag = [0, 2, 1, 3, 1, 0, 2];
  const fringe = (x: number): number => {
    switch (s.hairStyle) {
      case 'swept':
        return cy - 4 + Math.max(0, Math.round((cx + 3 - x) * 0.6)) + (x % 2);
      case 'messy':
        return cy - 3 + (x > cx + 2 && x < cx + 7 ? 3 : 0) + jag[(x + 3) % jag.length]!;
      case 'spiky':
        return cy - 3 + jag[(x * 2) % jag.length]!;
      default:
        return cy - 3 + jag[(x + 7) % jag.length]!;
    }
  };
  // Cap + bangs + back of head.
  p.ellipse(cx, cy - 1.5, 8.4, 7, shade, (x, y) => y < fringe(x) || (x < cx - 3 && y < cy + 5) || (x < cx - 1 && y < cy - 1));
  // side lock in front of the ear
  if (s.hairStyle !== 'hood') {
    p.rect(cx - 3, cy - 1, 1, 4 + (s.hairStyle === 'swept' ? 2 : 0), r.m);
    p.rect(cx + 7, cy - 1, 1, 3, r.d);
  }
  if (s.hairStyle === 'twintails') {
    p.rect(cx - 8, cy - 4, 2, 2, C.gold);
    p.rect(cx + 8, cy - 4, 2, 2, C.gold);
    p.set(cx - 8, cy - 4, ramp(C.gold).h);
  }
  if (s.hairStyle === 'swept') {
    spike(p, cx + 1, cy - 8, -70, 4, 2, r.l); // ahoge
  }
  if (s.hairStyle === 'messy') {
    spike(p, cx - 4, cy - 6, -130, 5, 4, shade);
    spike(p, cx, cy - 8, -100, 4, 4, shade);
    spike(p, cx + 4, cy - 7, -60, 4, 3, shade);
    spike(p, cx - 7, cy - 1, 170, 4, 4, shade);
  }
  if (s.hairStyle === 'spiky') {
    spike(p, cx - 6, cy - 5, -150, 7, 5, shade);
    spike(p, cx - 3, cy - 7, -120, 8, 5, shade);
    spike(p, cx + 1, cy - 8, -90, 8, 5, shade);
    spike(p, cx + 5, cy - 7, -55, 7, 4, shade);
    spike(p, cx + 7, cy - 4, -20, 5, 3, shade);
    spike(p, cx - 7, cy, 175, 6, 4, shade);
  }
  if (s.hairStyle === 'hood' && s.hood !== undefined) {
    const hr = ramp(s.hood);
    const fx = cx + 2, fy = cy + 1.5;
    p.ellipse(cx - 0.5, cy - 1, 9, 8.2, cel(hr, { hi: 0.8 }), (x, y) => {
      const u = (x + 0.5 - fx) / 6.3, v = (y + 0.5 - fy) / 6.2;
      return u * u + v * v > 1;
    });
    // gold trim around the opening
    const gr = ramp(C.gold);
    for (let a = -2.6; a <= 1.2; a += 0.12) {
      const x = Math.round(fx + Math.cos(a) * 6.8 - 0.5), y = Math.round(fy + Math.sin(a) * 6.7 - 0.5);
      if (p.get(x, y) === hr.m || p.get(x, y) === hr.d || p.get(x, y) === hr.l || p.get(x, y) === hr.h) p.set(x, y, a < -1.2 ? gr.l : gr.m);
    }
  }
  if (s.ornament !== undefined) {
    const orr = ramp(s.ornament);
    p.set(cx - 5, cy - 5, orr.m);
    p.set(cx - 4, cy - 6, orr.h);
    p.set(cx - 4, cy - 5, orr.l);
    p.set(cx - 5, cy - 6, orr.l);
  }
}
