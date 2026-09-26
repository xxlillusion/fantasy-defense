// The hero (Aldric): walk / idle / 3-frame attack / Blade Storm spin / knocked down / victory,
// flipped by facing, HP bar + level badge, rally banner while walking, respawn fade-in.
import * as THREE from 'three';
import { dist, toWorld } from '../../core/grid';
import type { GamePhase, HeroSnapshot } from '../../core/types';
import { HERO } from '../../data';
import { getHeroBadgeSheet, getHeroSheet, getRallyFlagSheet, HERO_FRAMES } from '../../art/sprites/hero';
import { Billboard, sheetTexture, TEXEL, type BillboardFrame } from './billboard';
import { HpBar } from './hpBars';
import { createShadow } from './shadows';

/** Height of the hero's head top above his feet, in texels (the frame is taller than the body). */
const BODY_TEXELS = 38;
const SLASH = 0.1;
const FOLLOW = 0.26;
const RESPAWN_FADE = 0.8;
const HURT_FLASH = 0.16;

export class HeroView {
  readonly root = new THREE.Group();
  /** Rally banner; lives outside `root` because it stands at the rally point. */
  readonly flagRoot = new THREE.Group();
  private readonly billboard = new Billboard();
  private readonly badge = new Billboard();
  private readonly flag = new Billboard();
  private readonly shadow = createShadow(0.5);
  private readonly flagShadow = createShadow(0.35);
  private readonly hp = new HpBar();
  private flip = false;
  private walk = 0;
  private prev: { x: number; y: number } | null = null;
  /** Sim time of the last heroAttacked event (lastAttackAt may lag a frame). */
  attackAt = -Infinity;
  private hurtT = 0;
  private fade = 1;

  constructor() {
    this.billboard.setSheet(sheetTexture(getHeroSheet()));
    this.badge.setSheet(sheetTexture(getHeroBadgeSheet()));
    this.flag.setSheet(sheetTexture(getRallyFlagSheet()));
    this.badge.mesh.renderOrder = 23;
    this.hp.setStyle('hero', 22);
    this.root.add(this.shadow, this.billboard.mesh, this.badge.mesh, this.hp.group);
    this.flagRoot.add(this.flagShadow, this.flag.mesh);
    this.root.visible = false;
    this.flagRoot.visible = false;
  }

  hurt(): void {
    this.hurtT = HURT_FLASH;
  }

  respawn(): void {
    this.fade = 0;
    this.attackAt = -Infinity;
  }

  reset(): void {
    this.fade = 1;
    this.attackAt = -Infinity;
    this.prev = null;
  }

  update(h: HeroSnapshot | null, phase: GamePhase, time: number, dtReal: number, clock: number, f: BillboardFrame): void {
    this.root.visible = !!h;
    this.flagRoot.visible = false;
    if (!h) {
      this.prev = null;
      return;
    }
    const w = toWorld(h.pos);
    this.root.position.set(w.x, 0, w.z);
    if (this.prev) this.walk += dist(this.prev, h.pos);
    this.prev = { x: h.pos.x, y: h.pos.y };
    this.hurtT = Math.max(0, this.hurtT - dtReal);
    this.fade = Math.min(1, this.fade + dtReal / RESPAWN_FADE);

    const c = Math.cos(h.facing);
    if (h.state !== 'down') {
      if (c < -0.15) this.flip = true;
      else if (c > 0.15) this.flip = false;
    }

    const age = time - Math.max(h.lastAttackAt, this.attackAt);
    const period = 1 / HERO.attackRate;
    let frame: number;
    if (phase === 'victory') frame = HERO_FRAMES.victory;
    else if (h.state === 'down') frame = HERO_FRAMES.down;
    else if (h.state === 'storming') frame = Math.floor(clock * 14) % 2 === 0 ? HERO_FRAMES.storm0 : HERO_FRAMES.storm1;
    else if (age >= 0 && age < SLASH) frame = HERO_FRAMES.slash;
    else if (age >= 0 && age < FOLLOW) frame = HERO_FRAMES.follow;
    else if (h.state === 'fighting' && age > period * 0.72 && age < period * 1.6) frame = HERO_FRAMES.windup;
    else if (h.state === 'moving') frame = Math.floor(this.walk * 3.2) % 2 === 0 ? HERO_FRAMES.walk0 : HERO_FRAMES.walk1;
    else frame = Math.floor(clock * 1.6) % 2 === 0 ? HERO_FRAMES.idle0 : HERO_FRAMES.idle1;
    this.billboard.setFrame(frame, this.flip);
    this.billboard.place(0, 0, 0, f);

    const down = h.state === 'down';
    this.billboard.setSaturation(down ? 0.5 : 1);
    this.billboard.setAlpha(this.fade);
    const hurt = this.hurtT / HURT_FLASH;
    const spawn = 1 - this.fade;
    this.billboard.setTint(down ? 0.8 : 1, down ? 0.8 : 1, down ? 0.9 : 1);
    this.billboard.setAdd(hurt * 0.8 + spawn * 0.5, spawn * 0.6, spawn * 0.7);

    this.shadow.scale.set(22 * TEXEL, 1, 9 * TEXEL);
    this.shadow.position.set(0, 0.016, 0.02);

    // HP bar + level badge
    const showUi = !down && this.fade > 0.5;
    this.hp.group.visible = showUi;
    this.badge.mesh.visible = showUi;
    if (showUi) {
      const top = BODY_TEXELS * TEXEL * f.stretch + 0.12;
      this.hp.update(h.hp / h.maxHp, 0, top, 0, f.camera);
      this.badge.setFrame(Math.max(0, Math.min(4, h.level - 1)), false);
      const off = -(11 + 7) * TEXEL;
      this.badge.place(Math.cos(f.yaw) * off, top - 5 * TEXEL * f.stretch, -Math.sin(f.yaw) * off, f);
    }

    // rally banner while walking there
    if (h.state === 'moving' && dist(h.pos, h.rally) > 0.3) {
      this.flagRoot.visible = true;
      const r = toWorld(h.rally);
      this.flagRoot.position.set(r.x, 0, r.z);
      this.flag.setFrame(Math.floor(clock * 4) % 2, false);
      this.flag.place(0, 0, 0, f);
      this.flagShadow.scale.set(8 * TEXEL, 1, 4 * TEXEL);
      this.flagShadow.position.set(0, 0.015, 0);
    }
  }

  dispose(): void {
    this.billboard.dispose();
    this.badge.dispose();
    this.flag.dispose();
    this.hp.dispose();
  }
}
