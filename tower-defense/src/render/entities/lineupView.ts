// Title-screen party lineup: the six cast members in a V in front of the portal (title phase only).
// Left to right: archer, hammer knight, hero (front center, crouched), spirit girl (center back, in
// a glowing orb), dark swordsman, frost mage. All idle-animate in battle-ready poses.
import * as THREE from 'three';
import { tileCenter, toWorld } from '../../core/grid';
import type { GameSnapshot } from '../../core/types';
import { getMap } from '../../data';
import { getHeroSheet, HERO_FRAMES } from '../../art/sprites/hero';
import { getSpiritOrbSheet } from '../../art/sprites/spirit';
import { getLineupSheet } from '../../art/sprites/towers';
import type { SpriteSheet } from '../../art/sprites/pixelCanvas';
import { Billboard, sheetTexture, TEXEL, type BillboardFrame } from './billboard';
import { createGlow } from './glow';
import { createShadow } from './shadows';

interface Member {
  sheet: () => SpriteSheet;
  /** Frame indices of the 2-frame idle loop. */
  frames: [number, number];
  /** Offset from the portal tile center, in tiles (y toward the camera). */
  dx: number;
  dy: number;
  scale: number;
  flip: boolean;
  /** Float height (tiles). */
  lift: number;
  shadowW: number;
}

const MEMBERS: Member[] = [
  { sheet: () => getLineupSheet('arrow'), frames: [0, 1], dx: -3.0, dy: 2.1, scale: 1, flip: false, lift: 0, shadowW: 20 },
  { sheet: () => getLineupSheet('cannon'), frames: [0, 1], dx: -1.7, dy: 3.0, scale: 1.05, flip: false, lift: 0, shadowW: 20 },
  { sheet: () => getHeroSheet(), frames: [HERO_FRAMES.ready0, HERO_FRAMES.ready1], dx: 0, dy: 3.9, scale: 1.25, flip: false, lift: 0, shadowW: 26 },
  { sheet: () => getSpiritOrbSheet(), frames: [0, 1], dx: 0, dy: 1.3, scale: 1.05, flip: false, lift: 0.45, shadowW: 18 },
  { sheet: () => getLineupSheet('sniper'), frames: [0, 1], dx: 1.7, dy: 3.0, scale: 1.05, flip: true, lift: 0, shadowW: 20 },
  { sheet: () => getLineupSheet('frost'), frames: [0, 1], dx: 3.0, dy: 2.1, scale: 0.92, flip: true, lift: 0, shadowW: 18 },
];

const SPIRIT = 3;

export class LineupView {
  readonly root = new THREE.Group();
  private readonly boards: Billboard[] = [];
  private readonly shadows: THREE.Mesh[] = [];
  private readonly orbGlow = createGlow(0x70f0ff, 0.7, false);
  private readonly orbGround = createGlow(0x70f0ff, 0.45, true);
  private built = false;

  constructor() {
    this.root.visible = false;
    this.orbGlow.renderOrder = 4;
    this.root.add(this.orbGlow, this.orbGround);
  }

  private build(): void {
    this.built = true;
    MEMBERS.forEach((m) => {
      const b = new Billboard();
      b.setSheet(sheetTexture(m.sheet()));
      b.scale = m.scale;
      const sh = createShadow(0.5);
      this.boards.push(b);
      this.shadows.push(sh);
      this.root.add(sh, b.mesh);
    });
  }

  update(s: GameSnapshot, clock: number, f: BillboardFrame): void {
    let map;
    try {
      map = getMap(s.mapId);
    } catch {
      map = null;
    }
    this.root.visible = s.phase === 'title' && !!map;
    if (!this.root.visible || !map) return;
    if (!this.built) this.build();
    const portal = tileCenter(map.portal);
    MEMBERS.forEach((m, i) => {
      const b = this.boards[i]!;
      const w = toWorld({ x: portal.x + m.dx, y: portal.y + m.dy });
      const beat = Math.floor(clock * 1.5 + i * 0.37) % 2;
      b.setFrame(m.frames[beat]!, m.flip);
      const lift = m.lift + (i === SPIRIT ? Math.sin(clock * 2) * 0.07 : 0);
      b.place(w.x, lift, w.z, f);
      if (i === SPIRIT) b.setAdd(0.1, 0.16, 0.2);
      const sh = this.shadows[i]!;
      sh.position.set(w.x, 0.015, w.z + 0.02);
      sh.scale.set(m.shadowW * TEXEL * m.scale, 1, m.shadowW * 0.4 * TEXEL * m.scale);
      if (i === SPIRIT) {
        const pulse = 0.5 + 0.5 * Math.sin(clock * 2.4);
        const cy = lift + b.worldHeight(f) * 0.5;
        this.orbGlow.position.set(w.x - Math.sin(f.yaw) * 0.08, cy, w.z - Math.cos(f.yaw) * 0.08);
        this.orbGlow.rotation.set(0, f.yaw, 0);
        const gs = 2.4 + pulse * 0.3;
        this.orbGlow.scale.set(gs, gs, 1);
        this.orbGlow.material.opacity = 0.55 + pulse * 0.25;
        this.orbGround.position.set(w.x, 0.02, w.z);
        this.orbGround.scale.setScalar(1.8 + pulse * 0.2);
        this.orbGround.material.opacity = 0.35 + pulse * 0.15;
      }
    });
  }

  dispose(): void {
    for (const b of this.boards) b.dispose();
    this.orbGlow.material.dispose();
    this.orbGround.material.dispose();
  }
}
