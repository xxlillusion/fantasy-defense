// Enemy sprites, facing right. Sheet frames: [walk0, walk1]. Bottom-center anchored
// (feet on the bottom row; flyers hover and are anchored at the bottom of the body).
// Native frame sizes already reflect ENEMIES[kind].size at the shared texel scale.

import type { EnemyKind } from '../../core/types';
import { C, mix, ramp } from './palette';
import { bar, cel, makeSheet, PixelCanvas, spike, type SpriteSheet } from './pixelCanvas';

export const ENEMY_FRAME_SIZE: Record<EnemyKind, { w: number; h: number }> = {
  grunt: { w: 24, h: 26 },
  runner: { w: 34, h: 30 },
  brute: { w: 34, h: 36 },
  swarmling: { w: 18, h: 18 },
  flyer: { w: 32, h: 26 },
  boss: { w: 50, h: 50 },
};

/** Dominant colors, used for death puffs. */
export const ENEMY_COLORS: Record<EnemyKind, readonly number[]> = {
  grunt: [C.goblin, C.leather, C.capRed],
  runner: [C.wolf, C.goblin, C.capRed],
  brute: [C.troll, C.armor, C.trim],
  swarmling: [C.imp, 0x8a2a8a, C.gold],
  flyer: [C.wyvern, C.belly, 0xd070ff],
  boss: [C.golem, C.rune, C.moss],
};

type Frame = 0 | 1;

function eye(p: PixelCanvas, x: number, y: number, iris: number): void {
  p.set(x, y, 0xffffff);
  p.set(x + 1, y, iris);
  p.set(x + 1, y + 1, 0x301020);
  p.set(x, y + 1, iris);
}

function goblin(f: Frame): PixelCanvas {
  const { w, h } = ENEMY_FRAME_SIZE.grunt;
  const out = new PixelCanvas(w, h);
  const cx = 12, fy = h - 1;
  const g = ramp(C.goblin), le = ramp(C.leather), cap = ramp(C.capRed);
  const bob = f;
  const legs = new PixelCanvas(w, h);
  const s = f === 0 ? 1 : -1;
  legs.rect(cx - 3 - s, fy - 4, 2, 4, cel(le));
  legs.rect(cx + 1 + s, fy - 4, 2, 4, cel(le));
  legs.rect(cx - 3 - s, fy - 1, 3, 1, le.d);
  legs.rect(cx + 1 + s, fy - 1, 3, 1, le.d);
  legs.outline();
  const body = new PixelCanvas(w, h);
  body.ellipse(cx + 0.5, fy - 7 + bob, 4.5, 4, cel(le, { hi: 0.8 }));
  body.rect(cx - 3, fy - 5 + bob, 8, 1, le.d);
  body.outline();
  const head = new PixelCanvas(w, h);
  const hy = fy - 15 + bob;
  spike(head, cx - 4, hy, 195, 6, 3, cel(g));
  spike(head, cx + 6, hy - 1, -20, 5, 3, cel(g));
  head.ellipse(cx + 1, hy, 6, 5.5, cel(g, { hi: 0.8 }));
  head.ellipse(cx, hy - 3, 5.5, 3.2, cel(cap, { hi: 0.7 }), (_x, y) => y < hy - 2);
  spike(head, cx - 4, hy - 4, 200, 4, 3, cap.m);
  eye(head, cx + 1, hy, 0xffd020);
  eye(head, cx + 4, hy, 0xffd020);
  head.line(cx + 2, hy + 3, cx + 5, hy + 3, g.o);
  head.set(cx + 4, hy + 3, 0xffffff);
  head.outline();
  const club = new PixelCanvas(w, h);
  const wood = ramp(0xb07038);
  bar(club, cx + 5, fy - 6 + bob, cx + 9, fy - 14 + bob - f, 2, (_a, b) => (b < 0 ? wood.l : wood.d));
  club.ellipse(cx + 9.5, fy - 15 + bob - f, 2.2, 2.2, cel(wood));
  club.set(cx + 11, fy - 17 + bob - f, 0xd0d8e0);
  club.outline();
  const arm = new PixelCanvas(w, h);
  arm.rect(cx + 4, fy - 7 + bob, 2, 2, g.m);
  arm.outline();
  return out.blit(legs).blit(body).blit(head).blit(club).blit(arm);
}

function wolfRider(f: Frame): PixelCanvas {
  const { w, h } = ENEMY_FRAME_SIZE.runner;
  const out = new PixelCanvas(w, h);
  const cx = 17, fy = h - 1;
  const wr = ramp(C.wolf), wd = ramp(C.wolfDark);
  const bob = f;
  const legs = new PixelCanvas(w, h);
  const off = f === 0 ? [2, -1, -2, 1] : [-1, 2, 1, -2];
  [cx - 8, cx - 5, cx + 4, cx + 7].forEach((x, i) => {
    const dx = off[i]!;
    bar(legs, x, fy - 7, x + dx, fy - 1, 2, i % 2 ? wr.m : wd.m);
    legs.rect(x + dx - 1, fy - 1, 3, 1, wd.d);
  });
  legs.outline();
  const body = new PixelCanvas(w, h);
  spike(body, cx - 8, fy - 11 + bob, 200 - f * 10, 8, 5, cel(wr));
  body.ellipse(cx - 1, fy - 10 + bob, 9.5, 4.8, cel(wr, { hi: 0.85 }));
  body.ellipse(cx, fy - 7.5 + bob, 7, 2, mix(C.wolf, 0xfff0d8, 0.4));
  // saddle
  body.rect(cx - 5, fy - 15 + bob, 7, 2, cel(ramp(C.capRed)));
  body.outline();
  const head = new PixelCanvas(w, h);
  const hx = cx + 10, hy = fy - 13 + bob;
  spike(head, hx - 1, hy - 3, -110, 4, 3, cel(wd));
  spike(head, hx + 2, hy - 3, -80, 4, 3, cel(wd));
  head.ellipse(hx, hy, 4.2, 3.6, cel(wr, { hi: 0.8 }));
  head.poly([[hx + 2, hy - 1], [hx + 7, hy], [hx + 7, hy + 2], [hx + 2, hy + 3]], cel(wr));
  head.set(hx + 7, hy, 0x201018);
  head.set(hx + 1, hy - 1, 0xffe040);
  head.set(hx + 2, hy - 1, 0xd02020);
  head.set(hx + 4, hy + 3, 0xffffff);
  head.set(hx + 6, hy + 3, 0xffffff);
  head.outline();
  // goblin rider
  const rider = new PixelCanvas(w, h);
  const g = ramp(C.goblin), band = ramp(C.capRed);
  const rx = cx - 2, ry = fy - 17 + bob;
  const spear = ramp(0xb07038);
  bar(rider, rx + 1, ry + 3, rx + 13, ry - 9 - f, 1.6, (_a, b) => (b < 0 ? spear.l : spear.d));
  spike(rider, rx + 13, ry - 9 - f, -45, 4, 3, cel(ramp(C.steel)));
  rider.ellipse(rx, ry, 3.2, 3.2, cel(ramp(C.leather)));
  spike(rider, rx - 3, ry - 6, 195, 4, 2, g.m);
  rider.ellipse(rx + 1, ry - 6, 4, 3.8, cel(g, { hi: 0.8 }));
  rider.rect(rx - 3, ry - 9, 8, 2, cel(band));
  spike(rider, rx - 3, ry - 8, 180 + f * 15, 4, 2, band.m);
  eye(rider, rx + 2, ry - 6, 0xffd020);
  rider.set(rx + 3, ry - 3, g.o);
  rider.rect(rx + 3, ry, 2, 2, g.m);
  rider.outline();
  return out.blit(legs).blit(body).blit(head).blit(rider);
}

function troll(f: Frame): PixelCanvas {
  const { w, h } = ENEMY_FRAME_SIZE.brute;
  const out = new PixelCanvas(w, h);
  const cx = 16, fy = h - 1;
  const sk = ramp(C.troll), ar = ramp(C.armor), tr = ramp(C.trim);
  const bob = f;
  const legs = new PixelCanvas(w, h);
  const s = f === 0 ? 2 : -2;
  legs.rect(cx - 6 - s, fy - 7, 5, 6, cel(sk));
  legs.rect(cx + 2 + s, fy - 7, 5, 6, cel(sk));
  legs.rect(cx - 7 - s, fy - 2, 6, 2, cel(ar));
  legs.rect(cx + 2 + s, fy - 2, 6, 2, cel(ar));
  legs.outline();
  const back = new PixelCanvas(w, h);
  back.ellipse(cx - 9, fy - 15 + bob, 3.5, 6, cel(sk));
  back.outline();
  const body = new PixelCanvas(w, h);
  body.ellipse(cx, fy - 14 + bob, 10, 9, cel(sk, { hi: 0.85 }));
  // chest plate
  body.poly([[cx - 6, fy - 20 + bob], [cx + 8, fy - 20 + bob], [cx + 7, fy - 8 + bob], [cx - 5, fy - 8 + bob]], cel(ar, { hi: 0.7 }));
  for (let x = cx - 5; x <= cx + 7; x++) body.paintOver(x, fy - 9 + bob, tr.m);
  body.line(cx + 1, fy - 19 + bob, cx + 1, fy - 10 + bob, ar.d);
  body.set(cx - 3, fy - 17 + bob, ar.h);
  // pauldrons
  body.ellipse(cx - 7, fy - 20 + bob, 4, 3, cel(ar, { hi: 0.6 }));
  body.ellipse(cx + 8, fy - 20 + bob, 4, 3, cel(ar, { hi: 0.6 }));
  body.outline();
  const head = new PixelCanvas(w, h);
  const hx = cx + 4, hy = fy - 25 + bob;
  head.ellipse(hx, hy, 5, 4.5, cel(sk));
  head.ellipse(hx - 0.5, hy - 2, 5.5, 3.2, cel(ar, { hi: 0.6 }), (_x, y) => y < hy - 0.5);
  spike(head, hx - 4, hy - 3, -140, 5, 3, cel(ramp(0xf0e0c0)));
  spike(head, hx + 4, hy - 3, -40, 5, 3, cel(ramp(0xf0e0c0)));
  head.rect(Math.floor(hx) - 4, Math.floor(hy) - 1, 10, 1, tr.m);
  head.set(hx + 1, hy + 1, 0xff3030);
  head.set(hx + 3, hy + 1, 0xff3030);
  head.set(hx + 1, hy + 3, 0xfff0d0);
  head.set(hx + 4, hy + 3, 0xfff0d0);
  head.outline();
  const club = new PixelCanvas(w, h);
  const wood = ramp(0x8a5a30);
  bar(club, cx + 9, fy - 10 + bob, cx + 14, fy - 26 + bob + f, 3, (_a, b) => (b < 0 ? wood.l : wood.d));
  club.ellipse(cx + 14, fy - 27 + bob + f, 3.5, 4, cel(wood, { hi: 0.8 }));
  club.set(cx + 11, fy - 28 + bob + f, ar.l);
  club.set(cx + 17, fy - 26 + bob + f, ar.l);
  club.set(cx + 14, fy - 31 + bob + f, ar.l);
  club.outline();
  const arm = new PixelCanvas(w, h);
  arm.ellipse(cx + 9, fy - 13 + bob, 3, 5, cel(sk));
  arm.rect(cx + 8, fy - 10 + bob, 3, 3, sk.m);
  arm.outline();
  return out.blit(back).blit(legs).blit(body).blit(head).blit(club).blit(arm);
}

function imp(f: Frame): PixelCanvas {
  const { w, h } = ENEMY_FRAME_SIZE.swarmling;
  const out = new PixelCanvas(w, h);
  const cx = 8, fy = h - 1;
  const r = ramp(C.imp), wing = ramp(0x8a2a8a);
  const bob = f;
  const wings = new PixelCanvas(w, h);
  if (f === 0) wings.poly([[cx - 1, fy - 7], [cx - 7, fy - 13], [cx - 6, fy - 8], [cx - 8, fy - 6]], cel(wing));
  else wings.poly([[cx - 1, fy - 6], [cx - 8, fy - 9], [cx - 6, fy - 5], [cx - 7, fy - 2]], cel(wing));
  bar(wings, cx - 3, fy - 3, cx - 7, fy - 1 + f, 1, r.d);
  wings.outline();
  const body = new PixelCanvas(w, h);
  body.rect(cx - 2 + f, fy - 2, 1, 2, r.d);
  body.rect(cx + 1 - f, fy - 2, 1, 2, r.d);
  body.ellipse(cx, fy - 4.5 + bob * 0.5, 3, 2.8, cel(r));
  const hy = fy - 9 + bob * 0.5;
  body.ellipse(cx + 1, hy, 4.5, 4, cel(r, { hi: 0.8 }));
  spike(body, cx - 2, hy - 3, -120, 3, 2, ramp(C.gold).l);
  spike(body, cx + 3, hy - 3, -70, 3, 2, ramp(C.gold).l);
  eye(body, cx + 1, hy, 0xffe020);
  eye(body, cx + 3, hy, 0xffe020);
  body.set(cx + 3, hy + 2, r.o);
  body.outline();
  return out.blit(wings).blit(body);
}

function wyvern(f: Frame): PixelCanvas {
  const { w, h } = ENEMY_FRAME_SIZE.flyer;
  const out = new PixelCanvas(w, h);
  const cx = 15, cy = 14;
  const r = ramp(C.wyvern), be = ramp(C.belly), mem = ramp(0xd070ff);
  const farWing = new PixelCanvas(w, h);
  if (f === 0) farWing.poly([[cx + 1, cy - 3], [cx + 5, cy - 13], [cx + 8, cy - 4]], cel(ramp(0xa050d8)));
  else farWing.poly([[cx + 1, cy - 1], [cx + 7, cy + 8], [cx + 8, cy - 1]], cel(ramp(0xa050d8)));
  farWing.outline();
  const body = new PixelCanvas(w, h);
  body.poly([[cx - 4, cy - 1], [cx - 14, cy + 1 + f], [cx - 12, cy + 3 + f], [cx - 4, cy + 3]], cel(r));
  spike(body, cx - 13, cy + 2 + f, 160, 3, 4, r.d);
  body.ellipse(cx, cy, 7, 4.5, cel(r, { hi: 0.85 }));
  body.ellipse(cx + 1, cy + 2, 5, 2, cel(be));
  body.rect(cx - 2, cy + 4, 1, 2, r.d);
  body.rect(cx + 3, cy + 4, 1, 2, r.d);
  // neck + head
  bar(body, cx + 4, cy - 1, cx + 9, cy - 5, 3, cel(r));
  const hx = cx + 10, hy = cy - 6;
  body.ellipse(hx, hy, 3.8, 3, cel(r, { hi: 0.8 }));
  body.poly([[hx + 1, hy - 1], [hx + 6, hy + 1], [hx + 1, hy + 2]], cel(r));
  spike(body, hx - 2, hy - 2, -150, 4, 2, ramp(C.belly).l);
  body.set(hx + 1, hy - 1, 0xffe040);
  body.set(hx + 5, hy + 1, 0x301020);
  body.outline();
  const nearWing = new PixelCanvas(w, h);
  if (f === 0) {
    nearWing.poly([[cx - 3, cy - 2], [cx - 10, cy - 13], [cx - 1, cy - 11], [cx + 3, cy - 2]], cel(mem, { hi: 0.7 }));
    nearWing.line(cx - 2, cy - 2, cx - 10, cy - 13, r.d);
    nearWing.line(cx - 10, cy - 13, cx - 1, cy - 11, r.m);
  } else {
    nearWing.poly([[cx - 3, cy], [cx - 11, cy + 8], [cx - 2, cy + 9], [cx + 3, cy + 1]], cel(mem, { hi: 0.7 }));
    nearWing.line(cx - 2, cy, cx - 11, cy + 8, r.d);
  }
  nearWing.outline();
  return out.blit(farWing).blit(body).blit(nearWing);
}

function golem(f: Frame): PixelCanvas {
  const { w, h } = ENEMY_FRAME_SIZE.boss;
  const out = new PixelCanvas(w, h);
  const cx = 24, fy = h - 1;
  const st = ramp(C.golem), dk = ramp(mix(C.golem, 0x403850, 0.35)), moss = ramp(C.moss), rune = ramp(C.rune);
  const bob = f;
  const s = f === 0 ? 2 : -2;
  const back = new PixelCanvas(w, h);
  back.ellipse(cx - 14, fy - 21 + bob - s * 0.5, 5, 9, cel(dk));
  back.ellipse(cx - 15, fy - 12 + bob - s * 0.5, 5, 4, cel(dk));
  back.outline();
  const legs = new PixelCanvas(w, h);
  legs.rect(cx - 10 - s, fy - 10, 8, 10, cel(dk));
  legs.rect(cx + 3 + s, fy - 10, 8, 10, cel(st));
  legs.line(cx - 10 - s, fy - 4, cx - 3 - s, fy - 4, dk.d);
  legs.line(cx + 3 + s, fy - 4, cx + 10 + s, fy - 4, st.d);
  legs.outline();
  const body = new PixelCanvas(w, h);
  body.poly([[cx - 13, fy - 31 + bob], [cx + 12, fy - 34 + bob], [cx + 14, fy - 14 + bob], [cx + 6, fy - 9 + bob], [cx - 8, fy - 9 + bob], [cx - 14, fy - 16 + bob]], cel(st, { hi: 0.8 }));
  // block cracks
  body.line(cx - 12, fy - 21 + bob, cx - 2, fy - 22 + bob, st.d);
  body.line(cx - 2, fy - 22 + bob, cx + 1, fy - 32 + bob, st.d);
  body.line(cx + 4, fy - 20 + bob, cx + 13, fy - 21 + bob, st.d);
  body.line(cx - 4, fy - 15 + bob, cx - 6, fy - 10 + bob, st.d);
  // moss
  for (const [x, y] of [[-11, -31], [-10, -31], [-9, -32], [-12, -30], [8, -34], [9, -34], [10, -33], [11, -34], [7, -33]] as const) body.paintOver(cx + x, fy + y + bob, moss.m);
  body.paintOver(cx - 10, fy - 30 + bob, moss.d);
  body.outline();
  // glowing chest rune (painted after outline so it stays bright)
  const rx = cx + 2, ry = fy - 25 + bob;
  for (const [x, y] of [[0, -3], [-1, -2], [1, -2], [-2, -1], [2, -1], [-3, 0], [3, 0], [-2, 1], [2, 1], [-1, 2], [1, 2], [0, 3]] as const) body.set(rx + x, ry + y, rune.l);
  body.set(rx, ry, rune.h);
  body.line(rx - 6, ry + 5, rx - 9, ry + 8, rune.m);
  body.line(rx + 5, ry + 6, rx + 8, ry + 9, rune.m);
  const head = new PixelCanvas(w, h);
  const hx = cx + 4, hy = fy - 38 + bob;
  head.poly([[hx - 5, hy - 3], [hx + 5, hy - 4], [hx + 6, hy + 4], [hx - 5, hy + 4]], cel(st, { hi: 0.7 }));
  head.line(hx - 4, hy - 1, hx + 5, hy - 2, dk.d);
  head.outline();
  head.set(hx, hy + 1, rune.h);
  head.set(hx + 1, hy + 1, rune.l);
  head.set(hx + 3, hy + 1, rune.h);
  head.set(hx + 4, hy + 1, rune.l);
  const arm = new PixelCanvas(w, h);
  arm.ellipse(cx + 15, fy - 23 + bob + s * 0.5, 5.5, 8, cel(st, { hi: 0.8 }));
  arm.ellipse(cx + 16, fy - 12 + bob + s * 0.5, 6, 5, cel(st, { hi: 0.8 }));
  arm.line(cx + 12, fy - 13 + bob + s * 0.5, cx + 19, fy - 13 + bob + s * 0.5, st.d);
  arm.paintOver(cx + 13, fy - 30 + bob, moss.m);
  arm.paintOver(cx + 14, fy - 31 + bob, moss.m);
  arm.outline();
  arm.set(cx + 16, fy - 20 + bob + s * 0.5, rune.l);
  arm.set(cx + 16, fy - 19 + bob + s * 0.5, rune.m);
  return out.blit(back).blit(legs).blit(body).blit(head).blit(arm);
}

const DRAW: Record<EnemyKind, (f: Frame) => PixelCanvas> = {
  grunt: goblin,
  runner: wolfRider,
  brute: troll,
  swarmling: imp,
  flyer: wyvern,
  boss: golem,
};

const cache = new Map<EnemyKind, SpriteSheet>();

export function getEnemySheet(kind: EnemyKind): SpriteSheet {
  let sheet = cache.get(kind);
  if (!sheet) {
    sheet = makeSheet([DRAW[kind](0), DRAW[kind](1)]);
    cache.set(kind, sheet);
  }
  return sheet;
}
