// Enemy sprites, facing right. Sheet frames: [walk0, walk1]. Bottom-center anchored
// (feet on the bottom row; flyers hover and are anchored at the bottom of the body).
// Native frame sizes already reflect ENEMIES[kind].size at the shared texel scale.

import type { EnemyKind } from '../../core/types';
import { C, mix, ramp } from './palette';
import { bar, cel, ditherEllipse, makeSheet, PixelCanvas, spike, type SpriteSheet } from './pixelCanvas';

export const ENEMY_FRAME_SIZE: Record<EnemyKind, { w: number; h: number }> = {
  grunt: { w: 24, h: 26 },
  runner: { w: 34, h: 30 },
  brute: { w: 34, h: 36 },
  swarmling: { w: 18, h: 18 },
  flyer: { w: 32, h: 26 },
  boss: { w: 50, h: 50 },
  shaman: { w: 26, h: 30 },
  shieldbearer: { w: 32, h: 32 },
  broodmother: { w: 36, h: 30 },
  wraith: { w: 26, h: 32 },
  dragon: { w: 64, h: 52 },
};

// v2 enemy colors
const ORC = 0x7aa050;
const BROOD = 0xa04a9a;
const WRAITH = 0x3a2a6a;
const DRAGON = 0xc8282e;
const DRAGON_GOLD = 0xffb830;


/** Dominant colors, used for death puffs. */
export const ENEMY_COLORS: Record<EnemyKind, readonly number[]> = {
  grunt: [C.goblin, C.leather, C.capRed],
  runner: [C.wolf, C.goblin, C.capRed],
  brute: [C.troll, C.armor, C.trim],
  swarmling: [C.imp, 0x8a2a8a, C.gold],
  flyer: [C.wyvern, C.belly, 0xd070ff],
  boss: [C.golem, C.rune, C.moss],
  shaman: [C.goblin, 0x4a6a3a, 0x7aff6a],
  shieldbearer: [0x7aa050, 0x8a92a8, C.trim],
  broodmother: [0xa04a9a, 0x4a2a5a, 0xff80e0],
  wraith: [0x3a2a6a, 0xb8a8ff, 0x9ff0ff],
  dragon: [0xc8282e, 0xffb830, 0x8a1a2a],
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


// ---------------------------------------------------------------- v2 enemies

function shaman(f: Frame): PixelCanvas {
  const { w, h } = ENEMY_FRAME_SIZE.shaman;
  const out = new PixelCanvas(w, h);
  const cx = 11, fy = h - 1;
  const g = ramp(C.goblin), robe = ramp(0x4a6a3a), bone = ramp(0xf0e8d0), glow = ramp(0x7aff6a);
  const wood = ramp(0x8a5a30);
  const bob = f;
  // totem strapped to the back, with glowing green eyes
  const totem = new PixelCanvas(w, h);
  const tx = cx - 8, ty = fy - 21 + bob;
  totem.rect(tx, ty, 4, 12, cel(wood));
  totem.line(tx, ty + 4, tx + 3, ty + 4, wood.d);
  totem.line(tx, ty + 8, tx + 3, ty + 8, wood.d);
  spike(totem, tx + 1, ty, -120, 4, 2, ramp(0x40a0ff).l);
  spike(totem, tx + 3, ty, -70, 4, 2, ramp(C.capRed).l);
  totem.outline();
  totem.set(tx + 1, ty + 2, glow.h);
  totem.set(tx + 2, ty + 2, glow.h);
  totem.set(tx + 1, ty + 6, glow.l);
  totem.set(tx + 2, ty + 6, glow.l);
  const legs = new PixelCanvas(w, h);
  const s = f === 0 ? 1 : -1;
  legs.rect(cx - 3 - s, fy - 4, 2, 4, cel(g));
  legs.rect(cx + 1 + s, fy - 4, 2, 4, cel(g));
  legs.rect(cx - 3 - s, fy - 1, 3, 1, g.d);
  legs.rect(cx + 1 + s, fy - 1, 3, 1, g.d);
  legs.outline();
  const body = new PixelCanvas(w, h);
  body.poly([[cx - 4, fy - 11 + bob], [cx + 5, fy - 11 + bob], [cx + 6, fy - 3], [cx - 5, fy - 3]], cel(robe, { hi: 0.8 }));
  for (let x = cx - 4; x <= cx + 5; x += 2) body.paintOver(x, fy - 4, robe.d);
  for (let x = cx - 3; x <= cx + 4; x += 2) body.paintOver(x, fy - 10 + bob, bone.l);
  body.outline();
  const head = new PixelCanvas(w, h);
  const hy = fy - 16 + bob;
  spike(head, cx - 4, hy, 195, 6, 3, cel(g));
  spike(head, cx + 6, hy - 1, -20, 5, 3, cel(g));
  head.ellipse(cx + 1, hy, 6, 5.5, cel(g, { hi: 0.8 }));
  // skull headdress with feathers
  head.ellipse(cx + 0.5, hy - 4, 4, 2.8, cel(bone, { hi: 0.6 }), (_x, y) => y < hy - 2);
  head.set(cx - 1, hy - 4, 0x302020);
  head.set(cx + 2, hy - 4, 0x302020);
  spike(head, cx - 2, hy - 6, -120, 5, 2, ramp(0x40a0ff).m);
  spike(head, cx + 1, hy - 7, -95, 5, 2, ramp(C.capRed).m);
  eye(head, cx + 1, hy, 0x7aff6a);
  eye(head, cx + 4, hy, 0x7aff6a);
  head.line(cx + 2, hy + 3, cx + 5, hy + 3, g.o);
  head.set(cx + 2, hy + 1, 0x5aa0ff); // war paint
  head.outline();
  // skull staff
  const staff = new PixelCanvas(w, h);
  const sx = cx + 8, top = fy - 25 + bob;
  bar(staff, cx + 6, fy - 1, sx, top + 2, 2, (_a, b) => (b < 0 ? wood.l : wood.d));
  staff.ellipse(sx + 0.5, top, 3, 2.6, cel(bone, { hi: 0.6 }));
  staff.rect(sx - 1, top + 2, 3, 1, bone.d);
  staff.outline();
  staff.set(sx - 1, top, glow.h);
  staff.set(sx + 1, top, glow.h);
  staff.set(sx, top + 1, 0x302020);
  const arm = new PixelCanvas(w, h);
  arm.rect(cx + 4, fy - 9 + bob, 3, 2, g.m);
  arm.outline();
  out.blit(totem).blit(legs).blit(body).blit(head).blit(staff).blit(arm);
  const motes = f === 0 ? [[-3, -2], [3, -3], [0, -5]] : [[-3, -4], [3, -1], [1, -6]];
  for (const [dx, dy] of motes) out.set(sx + dx!, top + dy!, glow.l);
  return out;
}

function shieldOrc(f: Frame, shield: boolean): PixelCanvas {
  const { w, h } = ENEMY_FRAME_SIZE.shieldbearer;
  const out = new PixelCanvas(w, h);
  const cx = 13, fy = h - 1;
  const sk = ramp(ORC), le = ramp(C.leather), ir = ramp(0x8a92a8), tr = ramp(C.trim), gd = ramp(C.gold);
  const bob = f;
  const s = f === 0 ? 2 : -2;
  const legs = new PixelCanvas(w, h);
  legs.rect(cx - 5 - s, fy - 6, 4, 5, cel(le));
  legs.rect(cx + 2 + s, fy - 6, 4, 5, cel(le));
  legs.rect(cx - 6 - s, fy - 2, 5, 2, cel(ir));
  legs.rect(cx + 2 + s, fy - 2, 5, 2, cel(ir));
  legs.outline();
  const back = new PixelCanvas(w, h);
  back.ellipse(cx - 7, fy - 14 + bob, 3, 5, cel(sk));
  if (!shield) {
    // axe raised in the back hand
    const wood = ramp(0x8a5a30);
    bar(back, cx - 7, fy - 11 + bob, cx - 4, fy - 27 + bob, 2, (_a, b) => (b < 0 ? wood.l : wood.d));
    back.poly([[cx - 5, fy - 29 + bob], [cx - 11, fy - 31 + bob], [cx - 11, fy - 23 + bob], [cx - 5, fy - 24 + bob]], cel(ir, { hi: 0.7 }));
  }
  back.outline();
  const body = new PixelCanvas(w, h);
  body.ellipse(cx, fy - 12 + bob, 8, 7, cel(sk, { hi: 0.85 }));
  body.poly([[cx - 5, fy - 17 + bob], [cx + 6, fy - 17 + bob], [cx + 6, fy - 7 + bob], [cx - 5, fy - 7 + bob]], cel(le, { hi: 0.7 }));
  body.line(cx - 5, fy - 17 + bob, cx + 5, fy - 8 + bob, le.d);
  for (let x = cx - 5; x <= cx + 6; x++) body.paintOver(x, fy - 7 + bob, ir.m);
  body.ellipse(cx - 5, fy - 17 + bob, 3.5, 2.5, cel(ir, { hi: 0.6 }));
  body.ellipse(cx + 6, fy - 17 + bob, 3.5, 2.5, cel(ir, { hi: 0.6 }));
  body.outline();
  const head = new PixelCanvas(w, h);
  const hx = cx + 3, hy = fy - 21 + bob;
  head.ellipse(hx, hy, 5, 4.5, cel(sk));
  head.ellipse(hx - 0.5, hy - 2, 5.5, 3, cel(ir, { hi: 0.6 }), (_x, y) => y < hy - 0.5);
  head.rect(hx + 1, hy - 1, 1, 3, ir.d); // nose guard
  head.set(hx + 3, hy + 1, 0xff3030);
  head.set(hx - 1, hy + 1, 0xff3030);
  head.set(hx + 2, hy + 3, 0xfff0d0);
  head.set(hx + 4, hy + 2, 0xfff0d0);
  head.line(hx + 1, hy + 3, hx + 4, hy + 3, sk.o);
  head.outline();
  const front = new PixelCanvas(w, h);
  if (shield) {
    // big tower shield carried in front
    const sx = cx + 5, sy = fy - 25 + bob;
    front.poly([[sx, sy + 1], [sx + 11, sy], [sx + 11, sy + 20], [sx + 5.5, sy + 23], [sx, sy + 20]], (u, v) => (u < -0.6 ? ir.l : u < 0.5 ? (v < -0.7 ? ir.h : ir.m) : ir.d));
    for (let y = sy + 1; y < sy + 21; y++) {
      front.paintOver(sx, y, ir.l);
      front.paintOver(sx + 1, y, gd.m);
      front.paintOver(sx + 10, y, gd.d);
    }
    front.ellipse(sx + 5.5, sy + 10, 3, 3.2, cel(tr, { hi: 0.6 }));
    front.set(sx + 5, sy + 9, 0xfff0d0);
    for (const [x, y] of [[2, 3], [9, 3], [2, 17], [9, 17]] as const) front.set(sx + x, sy + y, gd.h);
  } else {
    // shield broken: bare fist + a dangling strap
    front.rect(cx + 7, fy - 12 + bob, 3, 3, sk.m);
    front.line(cx + 8, fy - 9 + bob, cx + 10, fy - 5 + bob, le.m);
    front.rect(cx + 9, fy - 5 + bob, 3, 2, ir.d);
  }
  front.outline();
  return out.blit(back).blit(legs).blit(body).blit(head).blit(front);
}

function broodmother(f: Frame): PixelCanvas {
  const { w, h } = ENEMY_FRAME_SIZE.broodmother;
  const out = new PixelCanvas(w, h);
  const cx = 17, fy = h - 1;
  const sac = ramp(BROOD), chit = ramp(0x4a2a5a), imp = ramp(C.imp), egg = ramp(0xff80e0);
  const bob = f;
  const legsFar = new PixelCanvas(w, h);
  const legsNear = new PixelCanvas(w, h);
  // splayed spider legs: hip -> high knee -> foot planted outward
  for (let i = 0; i < 4; i++) {
    const spread = i - 1.5;
    const hx = cx - 7 + i * 5;
    for (const [layer, far] of [[legsFar, true], [legsNear, false]] as const) {
      const up = (i + f + (far ? 1 : 0)) % 2 === 0 ? 0 : 2;
      const o = far ? -2 : 0;
      const kx = hx + spread * 4 + o, ky = fy - 17 + bob - up + (far ? 1 : 0);
      const fx = hx + spread * 8 + o, fyy = fy - up;
      layer.line(hx, fy - 10 + bob, kx, ky, far ? chit.d : chit.m, 2);
      layer.line(kx, ky, fx, fyy, far ? chit.d : chit.l, 1);
    }
  }
  legsFar.outline();
  legsNear.outline();
  const body = new PixelCanvas(w, h);
  body.ellipse(cx - 4, fy - 12 + bob, 11, 8.5, cel(sac, { hi: 0.8 }));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5 - (cx - 4)) / 11, v = (y + 0.5 - (fy - 12 + bob)) / 8.5;
      if (u * u + v * v > 0.7) continue;
      if ((x * 3 + y * 5) % 11 === 0) body.paintOver(x, y, egg.l);
      if ((x * 3 + y * 5) % 11 === 1) body.paintOver(x, y, egg.d);
    }
  body.line(cx - 12, fy - 13 + bob, cx - 2, fy - 18 + bob, sac.d);
  body.ellipse(cx + 5, fy - 11 + bob, 4, 3.5, cel(chit, { hi: 0.7 }));
  body.outline();
  for (const [x, y] of [[-8, -15], [-3, -17], [-6, -10], [0, -13]] as const) {
    body.set(cx + x, fy + y + bob, egg.h);
    body.set(cx + x + 1, fy + y + bob, egg.l);
  }
  // imp torso + head riding at the front
  const top = new PixelCanvas(w, h);
  const tx = cx + 8, ty = fy - 15 + bob;
  top.ellipse(tx, ty + 1, 3, 3.5, cel(imp));
  top.ellipse(tx + 1, ty - 4, 3.8, 3.4, cel(imp, { hi: 0.8 }));
  spike(top, tx - 1, ty - 7, -120, 3, 2, ramp(C.gold).l);
  spike(top, tx + 3, ty - 7, -60, 3, 2, ramp(C.gold).l);
  eye(top, tx + 1, ty - 5, 0xffe020);
  eye(top, tx + 3, ty - 5, 0xffe020);
  top.set(tx + 3, ty - 2, imp.o);
  top.rect(tx + 3, ty + 1, 3, 1, imp.d);
  top.set(tx + 6, ty + 1 - f, imp.l);
  top.outline();
  return out.blit(legsFar).blit(body).blit(legsNear).blit(top);
}

function wraith(f: Frame): PixelCanvas {
  const { w, h } = ENEMY_FRAME_SIZE.wraith;
  const out = new PixelCanvas(w, h);
  const cx = 12, fy = h - 1;
  const cl = ramp(WRAITH), pale = ramp(0xb8a8ff), eyeC = 0xc8f8ff;
  const bob = f === 0 ? 0 : -1;
  const trail = new PixelCanvas(w, h);
  ditherEllipse(trail, cx - 6, fy - 8 + bob, 5, 6, pale.d, f);
  ditherEllipse(trail, cx - 9, fy - 4, 3, 3, pale.m, f + 1);
  const cloak = new PixelCanvas(w, h);
  const hem = f === 0 ? [0, 2, 0, 3, 1, 2] : [2, 0, 3, 0, 2, 1];
  const pts: [number, number][] = [[cx - 1, fy - 29 + bob], [cx + 5, fy - 27 + bob], [cx + 8, fy - 20 + bob], [cx + 7, fy - 10 + bob]];
  for (let i = 0; i < hem.length; i++) pts.push([cx + 7 - i * 2.6, fy - 3 - hem[i]! + (i % 2) * 2]);
  pts.push([cx - 7, fy - 12 + bob], [cx - 6, fy - 22 + bob]);
  cloak.poly(pts, cel(cl, { hi: 0.75 }));
  cloak.line(cx + 1, fy - 18 + bob, cx, fy - 5, cl.d);
  cloak.line(cx - 3, fy - 16 + bob, cx - 4, fy - 6, cl.d);
  cloak.outline();
  // hood opening: deep shadow with glowing eyes
  const hx = cx + 3, hy = fy - 22 + bob;
  cloak.ellipse(hx, hy, 3.2, 3.6, 0x140a24);
  cloak.set(hx - 1, hy, eyeC);
  cloak.set(hx + 2, hy, eyeC);
  cloak.set(hx - 1, hy + 1, 0x70c8ff);
  cloak.set(hx + 2, hy + 1, 0x70c8ff);
  const claw = new PixelCanvas(w, h);
  const ay = fy - 14 + bob + f;
  claw.line(cx + 6, ay, cx + 10, ay - 1, cl.m, 2);
  claw.line(cx + 11, ay - 2, cx + 13, ay - 3, pale.l);
  claw.line(cx + 11, ay, cx + 14, ay, pale.l);
  claw.line(cx + 11, ay + 1, cx + 13, ay + 2, pale.m);
  claw.outline();
  return out.blit(trail).blit(cloak).blit(claw);
}

function elderWyvern(f: Frame): PixelCanvas {
  const { w, h } = ENEMY_FRAME_SIZE.dragon;
  const out = new PixelCanvas(w, h);
  const cx = 29, cy = 29;
  const r = ramp(DRAGON), be = ramp(DRAGON_GOLD), mem = ramp(0xe04a3a), memD = ramp(0x8a1a2a), horn = ramp(0xf0e0c0);
  const up = f === 0;
  const farWing = new PixelCanvas(w, h);
  if (up) farWing.poly([[cx + 2, cy - 6], [cx + 10, cy - 28], [cx + 19, cy - 21], [cx + 13, cy - 5]], cel(memD));
  else farWing.poly([[cx + 2, cy - 2], [cx + 11, cy + 15], [cx + 19, cy + 9], [cx + 13, cy - 2]], cel(memD));
  farWing.outline();
  const body = new PixelCanvas(w, h);
  const ty = up ? 0 : 2;
  bar(body, cx - 10, cy + 1, cx - 20, cy + 4 + ty, 5, cel(r));
  bar(body, cx - 20, cy + 4 + ty, cx - 27, cy + 2 + ty * 2, 3, cel(r));
  body.poly([[cx - 26, cy + ty * 2 - 1], [cx - 31, cy + 2 + ty * 2], [cx - 26, cy + 5 + ty * 2], [cx - 25, cy + 2 + ty * 2]], cel(be));
  body.ellipse(cx, cy, 14, 8, cel(r, { hi: 0.85 }));
  body.ellipse(cx + 2, cy + 4, 10, 3.5, cel(be, { hi: 0.8 }));
  for (let x = cx - 6; x <= cx + 10; x += 3) body.paintOver(x, cy + 4, be.d);
  for (const lx of [cx - 5, cx + 6]) {
    body.rect(lx, cy + 6, 3, 5, cel(r));
    body.set(lx, cy + 11, horn.l);
    body.set(lx + 2, cy + 11, horn.l);
  }
  bar(body, cx + 9, cy - 2, cx + 20, cy - 12, 6, cel(r));
  const hx = cx + 23, hy = cy - 14;
  body.ellipse(hx, hy, 6, 4.5, cel(r, { hi: 0.8 }));
  body.poly([[hx + 2, hy - 3], [hx + 11, hy + 1], [hx + 10, hy + 3], [hx + 2, hy + 3]], cel(r));
  body.poly([[hx + 1, hy + 2], [hx + 9, hy + 3], [hx + 2, hy + 6]], cel(be));
  spike(body, hx - 3, hy - 3, -165, 9, 3, cel(horn));
  spike(body, hx - 1, hy - 4, -140, 7, 3, cel(horn));
  for (let i = 0; i < 5; i++) spike(body, cx - 8 + i * 4, cy - 7 + Math.abs(i - 2) * 0.5, -100, 3, 3, be.l);
  body.outline();
  body.set(hx + 1, hy - 1, 0xffe040);
  body.set(hx + 2, hy - 1, 0xff2020);
  body.set(hx + 10, hy + 1, 0x301020);
  body.set(hx + 5, hy + 3, 0xffffff);
  body.set(hx + 7, hy + 3, 0xffffff);
  const nearWing = new PixelCanvas(w, h);
  if (up) {
    nearWing.poly([[cx - 4, cy - 6], [cx - 20, cy - 29], [cx - 4, cy - 26], [cx + 8, cy - 5]], cel(mem, { hi: 0.7 }));
    nearWing.line(cx - 3, cy - 6, cx - 20, cy - 29, r.d);
    nearWing.line(cx - 20, cy - 29, cx - 4, cy - 26, r.m);
    nearWing.line(cx - 12, cy - 17, cx - 8, cy - 26, r.d);
    nearWing.line(cx - 6, cy - 10, cx - 1, cy - 25, r.d);
  } else {
    nearWing.poly([[cx - 4, cy - 2], [cx - 23, cy + 16], [cx - 6, cy + 20], [cx + 8, cy - 1]], cel(mem, { hi: 0.7 }));
    nearWing.line(cx - 3, cy - 2, cx - 23, cy + 16, r.d);
    nearWing.line(cx - 14, cy + 7, cx - 12, cy + 18, r.d);
    nearWing.line(cx - 6, cy + 2, cx - 3, cy + 17, r.d);
  }
  nearWing.set(up ? cx - 20 : cx - 23, up ? cy - 29 : cy + 16, be.h);
  nearWing.outline();
  return out.blit(farWing).blit(body).blit(nearWing);
}

const DRAW: Record<EnemyKind, (f: Frame) => PixelCanvas> = {
  grunt: goblin,
  runner: wolfRider,
  brute: troll,
  swarmling: imp,
  flyer: wyvern,
  boss: golem,
  shaman,
  shieldbearer: (f) => shieldOrc(f, true),
  broodmother,
  wraith,
  dragon: elderWyvern,
};

/** Alternate frame sets: shieldbearer variant 1 = shield broken. */
const VARIANTS: Partial<Record<EnemyKind, readonly ((f: Frame) => PixelCanvas)[]>> = {
  shieldbearer: [(f) => shieldOrc(f, true), (f) => shieldOrc(f, false)],
};

const cache = new Map<string, SpriteSheet>();

/** Walk sheet [walk0, walk1]. `variant` selects an alternate frame set (shieldbearer 1 = no shield). */
export function getEnemySheet(kind: EnemyKind, variant = 0): SpriteSheet {
  const alt = VARIANTS[kind]?.[variant];
  const key = `${kind}:${alt ? variant : 0}`;
  let sheet = cache.get(key);
  if (!sheet) {
    const draw = alt ?? DRAW[kind];
    sheet = makeSheet([draw(0), draw(1)]);
    cache.set(key, sheet);
  }
  return sheet;
}
