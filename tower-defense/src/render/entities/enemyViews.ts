// Enemy billboards: 2-frame walk cycle, heading flip, status tints, HP bar, blob shadow.
import * as THREE from 'three';
import { toWorld } from '../../core/grid';
import type { EnemyKind, EnemySnapshot } from '../../core/types';
import { ENEMIES, FLYER_HEIGHT } from '../../data';
import { getEnemySheet } from '../../art/sprites/enemies';
import { Billboard, sheetTexture, TEXEL, type BillboardFrame } from './billboard';
import { HpBar } from './hpBars';
import { createShadow, setShadowOpacity } from './shadows';

/** Walk frames per tile travelled (cadence). */
const STEP_RATE: Record<EnemyKind, number> = {
  grunt: 3.2,
  runner: 2.2,
  brute: 2.4,
  swarmling: 5,
  flyer: 0,
  boss: 1.6,
};

const FLASH_TIME = 0.12;

export class EnemyView {
  readonly root = new THREE.Group();
  readonly billboard = new Billboard();
  readonly hp = new HpBar();
  private readonly shadow = createShadow(0.5);
  private kind: EnemyKind = 'grunt';
  private flip = false;
  private flashT = 0;
  private stunFrame = 0;
  private readonly seed = Math.random() * 100;

  constructor() {
    this.root.add(this.shadow, this.billboard.mesh, this.hp.group);
  }

  bind(e: EnemySnapshot): void {
    this.kind = e.kind;
    this.flashT = 0;
    this.flip = Math.cos(e.heading) < -0.2;
    this.billboard.setSheet(sheetTexture(getEnemySheet(e.kind)));
    const boss = e.kind === 'boss';
    this.hp.setStyle(boss, boss ? 36 : e.kind === 'swarmling' ? 12 : 18);
    setShadowOpacity(this.shadow, e.flying ? 0.28 : 0.5);
  }

  flash(): void {
    this.flashT = FLASH_TIME;
  }

  update(e: EnemySnapshot, time: number, dtReal: number, f: BillboardFrame): void {
    const w = toWorld(e.pos);
    this.root.position.set(w.x, 0, w.z);
    this.flashT = Math.max(0, this.flashT - dtReal);

    const c = Math.cos(e.heading);
    if (c < -0.2) this.flip = true;
    else if (c > 0.2) this.flip = false;

    let frame: number;
    if (e.stunned) frame = this.stunFrame;
    else if (e.flying) frame = Math.floor(time * 7 + this.seed) % 2;
    else frame = Math.floor(e.progress * STEP_RATE[this.kind]) % 2;
    this.stunFrame = frame;
    this.billboard.setFrame(frame, this.flip);

    const y = e.flying ? FLYER_HEIGHT + Math.sin(time * 3 + this.seed) * 0.08 : 0;
    this.billboard.place(0, y, 0, f);

    // tints
    let tr = 1, tg = 1, tb = 1, ar = 0, ag = 0, ab = 0;
    if (e.slow > 0) {
      const s = Math.min(1, 0.35 + e.slow * 1.3);
      tr -= 0.45 * s; tg -= 0.25 * s; tb += 0.1 * s;
      ab += 0.08 * s; ag += 0.02 * s;
    }
    if (e.stunned) {
      tr = 0.7; tg = 0.9; tb = 1.15;
      ar += 0.22; ag += 0.4; ab += 0.55;
    }
    if (e.burning) {
      const flick = 0.5 + 0.5 * Math.sin(time * 31 + this.seed) * Math.sin(time * 17.3);
      ar += 0.35 * flick + 0.08; ag += 0.12 * flick;
    }
    if (this.flashT > 0) {
      const k = this.flashT / FLASH_TIME;
      ar += k; ag += k; ab += k;
    }
    this.billboard.setTint(tr, tg, tb);
    this.billboard.setAdd(ar, ag, ab);

    const size = ENEMIES[this.kind].size;
    const sw = this.billboard.frameW * TEXEL * 0.75;
    this.shadow.scale.set(sw * (e.flying ? 0.7 : 1), 1, Math.max(0.22, sw * 0.38) * (e.flying ? 0.7 : 1));
    this.shadow.position.set(0, 0.015 + size * 0.001, 0);

    const damaged = e.hp < e.maxHp;
    const showBar = (damaged && e.hp > 0) || this.kind === 'boss';
    this.hp.group.visible = showBar;
    if (showBar) {
      const top = y + this.billboard.worldHeight(f) + 0.1;
      this.hp.update(e.hp / e.maxHp, 0, top, 0, f.camera);
    }
  }

  dispose(): void {
    this.billboard.dispose();
    this.hp.dispose();
  }
}
