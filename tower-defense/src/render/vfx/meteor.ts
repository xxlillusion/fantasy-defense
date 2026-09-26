// Meteor ability: a flaming rock falling from high above onto the target, with a fire + smoke
// trail. Synced to the sim's meteorWarning ground effect when present; removed on meteorImpact.
import * as THREE from 'three';
import { toWorld } from '../../core/grid';
import type { GroundEffectSnapshot, Vec2 } from '../../core/types';
import { meteorRockPixels } from '../../art/sprites/fx';
import { pixelTexture, TEXEL, type BillboardFrame } from '../entities/billboard';
import { createGlow } from '../entities/glow';
import { rnd, type ParticleSystem } from './particles';

interface Rock {
  target: Vec2;
  to: THREE.Vector3;
  from: THREE.Vector3;
  t: number;
  dur: number;
  group: THREE.Group;
  sprite: THREE.Mesh;
  glow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  last: THREE.Vector3;
}

const FIRE = [0xff5a1a, 0xff9a2a, 0xffd050, 0xfff0a0];
const SMOKE = [0x3a3036, 0x4a3e40, 0x5a4a48];
const MAX_ROCKS = 6;
const upGeo = new THREE.PlaneGeometry(1, 1);

export class MeteorLayer {
  private readonly rocks: Rock[] = [];
  private readonly tex: THREE.Texture;
  private readonly mat: THREE.MeshBasicMaterial;
  private readonly size: number;

  constructor(
    private readonly parent: THREE.Group,
    private readonly glowFx: ParticleSystem,
    private readonly solidFx: ParticleSystem,
  ) {
    const px = meteorRockPixels();
    this.size = px.w * TEXEL * 2.2;
    this.tex = pixelTexture(px.toCanvas());
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, alphaTest: 0.5, side: THREE.DoubleSide });
  }

  spawn(target: Vec2, dur: number): void {
    if (this.rocks.length >= MAX_ROCKS) this.remove(0);
    const w = toWorld(target, 0.2);
    const to = new THREE.Vector3(w.x, w.y, w.z);
    const from = to.clone().add(new THREE.Vector3(-2.6, 10, -3.2));
    const sprite = new THREE.Mesh(upGeo, this.mat);
    sprite.scale.set(this.size, this.size, 1);
    sprite.frustumCulled = false;
    const glow = createGlow(0xff7a2a, 0.85, false);
    glow.scale.setScalar(this.size * 3.2);
    const group = new THREE.Group();
    group.add(glow, sprite);
    group.position.copy(from);
    this.parent.add(group);
    this.rocks.push({ target: { ...target }, to, from, t: 0, dur: Math.max(0.2, dur), group, sprite, glow, last: from.clone() });
  }

  /** Remove the rock nearest to `pos` (it has landed). */
  impact(pos: Vec2): void {
    let best = -1, bd = 2.5;
    this.rocks.forEach((r, i) => {
      const d = Math.hypot(r.target.x - pos.x, r.target.y - pos.y);
      if (d < bd) { bd = d; best = i; }
    });
    if (best >= 0) this.remove(best);
  }

  update(warnings: readonly GroundEffectSnapshot[], dGame: number, f: BillboardFrame): void {
    for (let i = this.rocks.length - 1; i >= 0; i--) {
      const r = this.rocks[i]!;
      r.t += dGame;
      for (const g of warnings) {
        if (g.kind !== 'meteorWarning') continue;
        if (Math.hypot(g.pos.x - r.target.x, g.pos.y - r.target.y) < 0.6) r.t = Math.max(r.t, r.dur - g.remaining);
      }
      if (r.t > r.dur + 0.35) {
        this.remove(i);
        continue;
      }
      const k = Math.min(1, r.t / r.dur);
      const e = Math.pow(k, 1.5);
      r.group.position.lerpVectors(r.from, r.to, e);
      r.sprite.rotation.set(0, f.yaw, -r.t * 9);
      r.glow.rotation.set(0, f.yaw, 0);
      r.glow.material.opacity = 0.6 + Math.random() * 0.3;
      if (dGame > 0) {
        const cur = r.group.position;
        for (let n = 0; n < 5; n++) {
          const q = n / 5;
          const x = r.last.x + (cur.x - r.last.x) * q, y = r.last.y + (cur.y - r.last.y) * q, z = r.last.z + (cur.z - r.last.z) * q;
          this.glowFx.spawn({ x: x + rnd() * 0.1, y: y + rnd() * 0.1, z: z + rnd() * 0.1, vy: 0.4, drag: 2, life: 0.3 + Math.random() * 0.2, color: FIRE[(Math.random() * FIRE.length) | 0]!, size: 0.14, sizeEnd: 0.03 });
          if (n % 2 === 0) this.solidFx.spawn({ x: x + rnd() * 0.12, y: y + rnd() * 0.12, z: z + rnd() * 0.12, vy: 0.5, drag: 1.5, life: 0.7, color: SMOKE[(Math.random() * SMOKE.length) | 0]!, size: 0.12, sizeEnd: 0.24 });
        }
        r.last.copy(cur);
      }
    }
  }

  private remove(i: number): void {
    const r = this.rocks[i]!;
    this.parent.remove(r.group);
    r.glow.material.dispose();
    this.rocks.splice(i, 1);
  }

  clear(): void {
    while (this.rocks.length) this.remove(this.rocks.length - 1);
  }

  dispose(): void {
    this.clear();
    this.mat.dispose();
    this.tex.dispose();
  }
}
