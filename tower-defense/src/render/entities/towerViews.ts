// Tower billboards: class sprite on a level pedestal, idle breath + attack frames, L3 aura.
import * as THREE from 'three';
import { toWorld } from '../../core/grid';
import type { TowerKind, TowerLevel, TowerSnapshot } from '../../core/types';
import { getTowerSheet, TOWER_FRAMES } from '../../art/sprites/towers';
import { Billboard, sheetTexture, TEXEL, type BillboardFrame } from './billboard';
import { createGlow } from './glow';
import { createShadow } from './shadows';

const AURA_COLOR: Record<TowerKind, number> = {
  arrow: 0xffc0f0,
  cannon: 0xffb040,
  frost: 0x80e8ff,
  sniper: 0xc080ff,
  tesla: 0x80ffff,
};

export class TowerView {
  readonly root = new THREE.Group();
  readonly billboard = new Billboard();
  private readonly shadow = createShadow(0.45);
  private readonly aura = createGlow(0xffd060, 0.5, true);
  private readonly halo = createGlow(0x60e8ff, 0.5, false);
  private kind: TowerKind = 'arrow';
  private level: TowerLevel = 1;
  private flip = false;
  /** Sim time of the most recent towerFired event (in case lastFiredAt lags). */
  firedAt = -Infinity;
  private readonly phase = Math.random() * 10;

  constructor() {
    this.root.add(this.shadow, this.aura, this.halo, this.billboard.mesh);
  }

  bind(t: TowerSnapshot): void {
    this.kind = t.kind;
    this.level = t.level;
    this.firedAt = -Infinity;
    this.flip = false;
    this.billboard.setSheet(sheetTexture(getTowerSheet(t.kind, t.level)));
    this.aura.material.color.setHex(AURA_COLOR[t.kind]);
  }

  update(t: TowerSnapshot, time: number, clock: number, f: BillboardFrame): void {
    if (t.kind !== this.kind || t.level !== this.level) {
      this.kind = t.kind;
      this.level = t.level;
      this.billboard.setSheet(sheetTexture(getTowerSheet(t.kind, t.level)));
      this.aura.material.color.setHex(AURA_COLOR[t.kind]);
    }
    const w = toWorld(t.pos);
    this.root.position.set(w.x, 0, w.z);

    // facing: sprites are drawn facing right
    if (t.targetId !== null || time - t.lastFiredAt < 0.5) {
      const c = Math.cos(t.facing);
      if (c < -0.15) this.flip = true;
      else if (c > 0.15) this.flip = false;
    }
    const age = time - Math.max(t.lastFiredAt, this.firedAt);
    let frame: number;
    if (age >= 0 && age < 0.12) frame = TOWER_FRAMES.attack0;
    else if (age >= 0 && age < 0.32) frame = TOWER_FRAMES.attack1;
    else frame = Math.floor(clock * 1.7 + this.phase) % 2 === 0 ? TOWER_FRAMES.idle0 : TOWER_FRAMES.idle1;
    this.billboard.setFrame(frame, t.kind === 'tesla' ? false : this.flip);
    this.billboard.place(0, 0, 0, f);

    this.shadow.scale.set(26 * TEXEL, 1, 10 * TEXEL);
    this.shadow.position.set(0, 0.015, 0.02);

    const l3 = t.level === 3;
    this.aura.visible = l3;
    if (l3) {
      const pulse = 0.5 + 0.5 * Math.sin(clock * 2.6 + this.phase);
      this.aura.scale.setScalar(1.35 + pulse * 0.12);
      this.aura.material.opacity = 0.35 + pulse * 0.25;
      this.aura.position.set(0, 0.02, 0);
    }

    // Tesla: glowing orb halo. Other L3 towers: faint golden halo behind the character.
    const tesla = t.kind === 'tesla';
    this.halo.visible = tesla || l3;
    if (this.halo.visible) {
      const flash = age >= 0 && age < 0.3 ? 1 - age / 0.3 : 0;
      const pulse = 0.5 + 0.5 * Math.sin(clock * 3.1 + this.phase);
      this.halo.material.color.setHex(tesla ? 0x60e8ff : 0xffd070);
      const s = (tesla ? 1.15 : 1.0) + pulse * 0.08 + flash * 0.5;
      this.halo.scale.set(s, s, 1);
      this.halo.material.opacity = (tesla ? 0.4 : 0.18) + pulse * 0.1 + flash * 0.5;
      const hy = (tesla ? 23 : 22) * TEXEL * f.stretch;
      this.halo.position.set(0, hy, 0);
      this.halo.rotation.set(0, f.yaw, 0);
      // push the halo slightly behind the sprite
      this.halo.position.x -= Math.sin(f.yaw) * 0.08;
      this.halo.position.z -= Math.cos(f.yaw) * 0.08;
    }
  }

  dispose(): void {
    this.billboard.dispose();
    this.aura.material.dispose();
    this.halo.material.dispose();
  }
}
