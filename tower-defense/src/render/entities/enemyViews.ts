// Enemy billboards: 2-frame walk cycle, heading flip, status tints, HP bar (+ shield pips), blob shadow.
// v2 status visuals: hex shield bubble, stealth shimmer / reveal outline, vulnerable cracked ice,
// crossed-swords "engaged with the hero" icon.
import * as THREE from 'three';
import { toWorld } from '../../core/grid';
import type { EnemyKind, EnemySnapshot } from '../../core/types';
import { ENEMIES, FLYER_HEIGHT } from '../../data';
import { getEnemySheet } from '../../art/sprites/enemies';
import { engagedIconPixels, hexBubblePixels } from '../../art/sprites/fx';
import { makeSheet, type SpriteSheet } from '../../art/sprites/pixelCanvas';
import { Billboard, pixelTexture, sheetTexture, TEXEL, type BillboardFrame } from './billboard';
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
  shaman: 3.0,
  shieldbearer: 2.6,
  broodmother: 3.4,
  wraith: 2.0,
  dragon: 0,
};

/** Wing-flap frames per second for flyers. */
const FLAP_RATE: Partial<Record<EnemyKind, number>> = { flyer: 7, dragon: 3.2 };

const FLASH_TIME = 0.12;
const SHIELD_FLASH = 0.25;
const REVEAL_OUTLINE = 0xb070ff;

let bubbleTex: THREE.Texture | null = null;
let engagedSheet: SpriteSheet | null = null;
const upGeo = new THREE.PlaneGeometry(1, 1);

export function disposeEnemyStatusTextures(): void {
  bubbleTex?.dispose();
  bubbleTex = null;
}

export class EnemyView {
  readonly root = new THREE.Group();
  readonly billboard = new Billboard();
  readonly hp = new HpBar();
  private readonly shadow = createShadow(0.5);
  private readonly bubble: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly icon = new Billboard();
  private kind: EnemyKind = 'grunt';
  private variant = 0;
  private flip = false;
  private flashT = 0;
  private shieldFlashT = 0;
  private stunFrame = 0;
  private readonly seed = Math.random() * 100;

  constructor() {
    bubbleTex ??= pixelTexture(hexBubblePixels().toCanvas());
    engagedSheet ??= makeSheet([engagedIconPixels()]);
    this.bubble = new THREE.Mesh(
      upGeo,
      new THREE.MeshBasicMaterial({ map: bubbleTex, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.bubble.frustumCulled = false;
    this.bubble.renderOrder = 7;
    this.icon.setSheet(sheetTexture(engagedSheet));
    this.icon.mesh.renderOrder = 23;
    this.root.add(this.shadow, this.billboard.mesh, this.bubble, this.icon.mesh, this.hp.group);
  }

  bind(e: EnemySnapshot): void {
    this.kind = e.kind;
    this.flashT = 0;
    this.shieldFlashT = 0;
    this.flip = Math.cos(e.heading) < -0.2;
    this.variant = this.variantFor(e);
    this.billboard.setSheet(sheetTexture(getEnemySheet(e.kind, this.variant)));
    this.billboard.setAlpha(1);
    this.billboard.setOutline(0, 0);
    this.billboard.setWobble(0, 0);
    this.billboard.setCrack(0);
    const boss = ENEMIES[e.kind].boss;
    this.hp.setStyle(boss ? 'boss' : 'enemy', boss ? (e.kind === 'dragon' ? 40 : 36) : e.kind === 'swarmling' ? 12 : 18);
    setShadowOpacity(this.shadow, e.flying ? 0.28 : 0.5);
  }

  private variantFor(e: EnemySnapshot): number {
    return e.kind === 'shieldbearer' && e.shield <= 0 ? 1 : 0;
  }

  flash(): void {
    this.flashT = FLASH_TIME;
  }

  shieldFlash(): void {
    this.shieldFlashT = SHIELD_FLASH;
  }

  update(e: EnemySnapshot, time: number, dtReal: number, f: BillboardFrame, clock = time): void {
    const w = toWorld(e.pos);
    this.root.position.set(w.x, 0, w.z);
    this.flashT = Math.max(0, this.flashT - dtReal);
    this.shieldFlashT = Math.max(0, this.shieldFlashT - dtReal);

    const v = this.variantFor(e);
    if (v !== this.variant) {
      this.variant = v;
      this.billboard.setSheet(sheetTexture(getEnemySheet(e.kind, v)));
    }

    const c = Math.cos(e.heading);
    if (c < -0.2) this.flip = true;
    else if (c > 0.2) this.flip = false;

    let frame: number;
    if (e.stunned) frame = this.stunFrame;
    else if (e.flying) frame = Math.floor(time * (FLAP_RATE[this.kind] ?? 7) + this.seed) % 2;
    else if (e.blockedByHero) frame = Math.floor(time * 3 + this.seed) % 2; // scuffling with the hero
    else frame = Math.floor(e.progress * STEP_RATE[this.kind]) % 2;
    this.stunFrame = frame;
    this.billboard.setFrame(frame, this.flip);

    const def = ENEMIES[this.kind];
    let y = 0;
    if (e.flying) y = (this.kind === 'dragon' ? FLYER_HEIGHT - 0.35 : FLYER_HEIGHT) + Math.sin(time * 3 + this.seed) * (this.kind === 'dragon' ? 0.14 : 0.08);
    else if (this.kind === 'wraith') y = 0.08 + Math.sin(time * 2.4 + this.seed) * 0.05;
    this.billboard.place(0, y, 0, f);

    // stealth: faint shimmer while hidden, violet outline pulse while revealed
    const hidden = e.stealthed && !e.revealed;
    if (hidden) {
      this.billboard.setAlpha(0.25);
      this.billboard.setWobble(1.4, clock);
      this.billboard.setOutline(0, 0);
    } else if (e.stealthed) {
      this.billboard.setAlpha(0.85);
      this.billboard.setWobble(0, clock);
      this.billboard.setOutline(REVEAL_OUTLINE, 0.45 + 0.45 * Math.sin(clock * 7 + this.seed));
    } else {
      this.billboard.setAlpha(1);
    }
    this.billboard.setCrack(e.vulnerable ? 0.85 : 0);

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

    const sw = this.billboard.frameW * TEXEL * 0.75;
    const sh = this.kind === 'dragon' ? 0.55 : 1;
    this.shadow.visible = !hidden;
    this.shadow.scale.set(sw * (e.flying ? 0.7 * sh : 1), 1, Math.max(0.22, sw * 0.38) * (e.flying ? 0.7 * sh : 1));
    this.shadow.position.set(0, 0.015 + def.size * 0.001, 0);

    const spriteH = this.billboard.worldHeight(f);

    // shield bubble
    const shielded = e.shield > 0;
    this.bubble.visible = shielded;
    if (shielded) {
      const k = this.shieldFlashT / SHIELD_FLASH;
      const size = this.billboard.frameW * TEXEL * 1.25 * (1 + k * 0.12);
      this.bubble.scale.set(size, size * Math.min(1.15, f.stretch), 1);
      this.bubble.position.set(0, y + spriteH * 0.48, 0);
      this.bubble.rotation.set(0, f.yaw, 0);
      this.bubble.position.x += Math.sin(f.yaw) * 0.05;
      this.bubble.position.z += Math.cos(f.yaw) * 0.05;
      this.bubble.material.opacity = 0.32 + 0.08 * Math.sin(clock * 4 + this.seed) + k * 0.9;
    }

    const damaged = e.hp < e.maxHp;
    const showBar = !hidden && ((damaged && e.hp > 0) || def.boss || shielded);
    this.hp.group.visible = showBar;
    const top = y + spriteH + 0.1;
    if (showBar) {
      this.hp.setPips(e.shield);
      this.hp.update(e.hp / e.maxHp, 0, top, 0, f.camera);
    }

    // engaged with the hero
    this.icon.mesh.visible = e.blockedByHero && !hidden;
    if (this.icon.mesh.visible) {
      this.icon.place(0, top + (showBar ? 0.1 : 0) + (Math.floor(clock * 4 + this.seed) % 2) * TEXEL, 0, f);
    }
  }

  dispose(): void {
    this.billboard.dispose();
    this.icon.dispose();
    this.bubble.material.dispose();
    this.hp.dispose();
  }
}
