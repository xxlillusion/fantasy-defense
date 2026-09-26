// Tower billboards: class sprite on a level pedestal, 6-frame animation
// (idle breath, windup anticipation, attack, recover), L3 aura, L4 branch aura + halo.
import * as THREE from 'three';
import { toWorld } from '../../core/grid';
import type { TowerBranch, TowerKind, TowerLevel, TowerSnapshot } from '../../core/types';
import { BRANCH_COLOR, getTowerSheet, TOWER_FRAMES } from '../../art/sprites/towers';
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

/** Seconds of each attack phase after a shot. */
const ATTACK0 = 0.1;
const ATTACK1 = 0.2;
const RECOVER = 0.32;
/** cooldownFraction above which a tower with a target shows its windup pose. */
const WINDUP_AT = 0.8;

export class TowerView {
  readonly root = new THREE.Group();
  readonly billboard = new Billboard();
  private readonly shadow = createShadow(0.45);
  private readonly aura = createGlow(0xffd060, 0.5, true);
  private readonly halo = createGlow(0x60e8ff, 0.5, false);
  private kind: TowerKind = 'arrow';
  private level: TowerLevel = 1;
  private branch: TowerBranch | null = null;
  private flip = false;
  /** Sim time of the most recent towerFired event (in case lastFiredAt lags). */
  firedAt = -Infinity;
  private readonly phase = Math.random() * 10;

  constructor() {
    this.root.add(this.shadow, this.aura, this.halo, this.billboard.mesh);
  }

  private setLook(t: TowerSnapshot): void {
    this.kind = t.kind;
    this.level = t.level;
    this.branch = t.level === 4 ? t.branch : null;
    this.billboard.setSheet(sheetTexture(getTowerSheet(t.kind, t.level, this.branch)));
    this.aura.material.color.setHex(this.level === 4 ? BRANCH_COLOR[t.kind][this.branch ?? 'a'] : AURA_COLOR[t.kind]);
  }

  bind(t: TowerSnapshot): void {
    this.firedAt = -Infinity;
    this.flip = false;
    this.setLook(t);
  }

  update(t: TowerSnapshot, time: number, clock: number, f: BillboardFrame): void {
    if (t.kind !== this.kind || t.level !== this.level || (t.level === 4 && t.branch !== this.branch)) this.setLook(t);
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
    if (age >= 0 && age < ATTACK0) frame = TOWER_FRAMES.attack0;
    else if (age >= 0 && age < ATTACK1) frame = TOWER_FRAMES.attack1;
    else if (age >= 0 && age < RECOVER) frame = TOWER_FRAMES.recover;
    else if (t.targetId !== null && t.cooldownFraction > WINDUP_AT) frame = TOWER_FRAMES.windup;
    else frame = Math.floor(clock * 1.7 + this.phase) % 2 === 0 ? TOWER_FRAMES.idle0 : TOWER_FRAMES.idle1;
    this.billboard.setFrame(frame, t.kind === 'tesla' ? false : this.flip);
    this.billboard.place(0, 0, 0, f);

    const l4 = t.level === 4;
    this.shadow.scale.set((l4 ? 30 : 26) * TEXEL, 1, (l4 ? 11 : 10) * TEXEL);
    this.shadow.position.set(0, 0.015, 0.02);

    const glowing = t.level >= 3;
    this.aura.visible = glowing;
    if (glowing) {
      const pulse = 0.5 + 0.5 * Math.sin(clock * (l4 ? 3.4 : 2.6) + this.phase);
      this.aura.scale.setScalar((l4 ? 1.7 : 1.35) + pulse * (l4 ? 0.2 : 0.12));
      this.aura.material.opacity = (l4 ? 0.5 : 0.35) + pulse * (l4 ? 0.3 : 0.25);
      this.aura.position.set(0, 0.02, 0);
    }

    // Tesla: glowing orb halo. Other L3+ towers: halo behind the character (branch-colored at L4).
    const tesla = t.kind === 'tesla';
    this.halo.visible = tesla || glowing;
    if (this.halo.visible) {
      const flash = age >= 0 && age < 0.3 ? 1 - age / 0.3 : 0;
      const windup = frame === TOWER_FRAMES.windup ? 0.25 : 0;
      const pulse = 0.5 + 0.5 * Math.sin(clock * 3.1 + this.phase);
      const branchCol = l4 ? BRANCH_COLOR[t.kind][this.branch ?? 'a'] : null;
      this.halo.material.color.setHex(tesla ? (branchCol ?? 0x60e8ff) : (branchCol ?? 0xffd070));
      const big = tesla && l4 && this.branch === 'a' ? 1.3 : 1;
      const s = ((tesla ? 1.15 : 1.0) + pulse * 0.08 + flash * 0.5 + windup) * big * (l4 && !tesla ? 1.15 : 1);
      this.halo.scale.set(s, s, 1);
      const overload = tesla && l4 && this.branch === 'b' ? 0.2 * Math.abs(Math.sin(clock * 9 + this.phase)) : 0;
      this.halo.material.opacity = (tesla ? 0.4 : l4 ? 0.3 : 0.18) + pulse * 0.1 + flash * 0.5 + windup + overload;
      const hy = (tesla ? (l4 && this.branch === 'a' ? 25 : 23) : 22) * TEXEL * f.stretch;
      this.halo.position.set(0, hy, 0);
      this.halo.rotation.set(0, f.yaw, 0);
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
