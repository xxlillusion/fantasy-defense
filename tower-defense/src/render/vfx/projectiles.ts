// In-flight projectiles from snapshot.projectiles, oriented along their flight, with trails.
import * as THREE from 'three';
import { dist, toWorld } from '../../core/grid';
import type { EntityId, GameSnapshot, ProjectileKind, ProjectileSnapshot } from '../../core/types';
import { FLYER_HEIGHT } from '../../data';
import { PROJECTILE_PIXELS } from '../../art/sprites/fx';
import { pixelTexture, TEXEL, type BillboardFrame } from '../entities/billboard';
import { createGlow } from '../entities/glow';
import type { ParticleSystem } from './particles';
import { rnd } from './particles';

interface KindStyle {
  /** Extra scale over native pixel size. */
  scale: number;
  additive: boolean;
  /** Camera-facing (orb) rather than flat along the flight path. */
  facing: boolean;
  trail: number[];
  glow: number;
  /** Arc height (world units) at mid-flight. */
  arc: number;
}

const STYLE: Record<ProjectileKind, KindStyle> = {
  arrow: { scale: 1, additive: false, facing: false, trail: [0xff5ab0, 0xffa0d8], glow: 0xff4aa8, arc: 0.15 },
  shockwave: { scale: 1.6, additive: false, facing: true, trail: [0xff8a2a, 0xffc040, 0xff5a1a], glow: 0xff8a2a, arc: 0.9 },
  frostbolt: { scale: 1.1, additive: false, facing: false, trail: [0xbff4ff, 0x7fdcff, 0xffffff], glow: 0x60d0ff, arc: 0.1 },
  crescent: { scale: 1.9, additive: true, facing: false, trail: [0xb060ff, 0xe0b0ff], glow: 0xa050ff, arc: 0 },
};

/** Height of launch point above a tower's tile (about the character's hands). */
const LAUNCH_H = 0.95;
const TARGET_H = 0.4;

interface ProjView {
  group: THREE.Group;
  sprite: THREE.Mesh;
  glow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  kind: ProjectileKind;
  targetH: number;
  last: THREE.Vector3;
}

const flatGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const upGeo = new THREE.PlaneGeometry(1, 1);

export class ProjectileLayer {
  private readonly views = new Map<EntityId, ProjView>();
  private readonly pool = new Map<ProjectileKind, ProjView[]>();
  private readonly materials = new Map<ProjectileKind, THREE.MeshBasicMaterial>();
  private readonly textures: THREE.Texture[] = [];
  private readonly sizes = new Map<ProjectileKind, [number, number]>();
  private readonly tmp = new THREE.Vector3();

  constructor(
    private readonly parent: THREE.Group,
    private readonly glowFx: ParticleSystem,
  ) {
    for (const kind of Object.keys(STYLE) as ProjectileKind[]) {
      const px = PROJECTILE_PIXELS[kind]();
      const tex = pixelTexture(px.toCanvas());
      this.textures.push(tex);
      this.sizes.set(kind, [px.w, px.h]);
      const st = STYLE[kind];
      this.materials.set(
        kind,
        new THREE.MeshBasicMaterial({
          map: tex,
          transparent: st.additive,
          alphaTest: st.additive ? 0 : 0.5,
          blending: st.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
          depthWrite: !st.additive,
          side: THREE.DoubleSide,
        }),
      );
    }
  }

  private acquire(kind: ProjectileKind): ProjView {
    const free = this.pool.get(kind)?.pop();
    if (free) {
      this.parent.add(free.group);
      return free;
    }
    const st = STYLE[kind];
    const [w, h] = this.sizes.get(kind)!;
    const sprite = new THREE.Mesh(st.facing ? upGeo : flatGeo, this.materials.get(kind)!);
    sprite.scale.set(w * TEXEL * st.scale, st.facing ? h * TEXEL * st.scale : 1, st.facing ? 1 : h * TEXEL * st.scale);
    sprite.frustumCulled = false;
    sprite.renderOrder = st.additive ? 13 : 0;
    const glow = createGlow(st.glow, 0.55, false);
    glow.scale.setScalar(st.facing ? 0.9 : 0.55);
    const group = new THREE.Group();
    group.add(glow, sprite);
    this.parent.add(group);
    return { group, sprite, glow, kind, targetH: TARGET_H, last: new THREE.Vector3() };
  }

  private release(v: ProjView): void {
    this.parent.remove(v.group);
    let arr = this.pool.get(v.kind);
    if (!arr) this.pool.set(v.kind, (arr = []));
    if (arr.length < 64) arr.push(v);
  }

  update(s: GameSnapshot, dGame: number, f: BillboardFrame): void {
    const seen = new Set<EntityId>();
    for (const p of s.projectiles) {
      seen.add(p.id);
      let v = this.views.get(p.id);
      if (!v || v.kind !== p.kind) {
        if (v) this.release(v);
        v = this.acquire(p.kind);
        v.targetH = targetHeight(s, p);
        const w = toWorld(p.from, LAUNCH_H);
        v.last.set(w.x, w.y, w.z);
        this.views.set(p.id, v);
      }
      this.place(v, p, dGame, f);
    }
    for (const [id, v] of this.views) {
      if (!seen.has(id)) {
        this.release(v);
        this.views.delete(id);
      }
    }
  }

  private place(v: ProjView, p: ProjectileSnapshot, dGame: number, f: BillboardFrame): void {
    const st = STYLE[p.kind];
    const done = dist(p.from, p.pos);
    const left = dist(p.pos, p.to);
    const t = done + left > 1e-4 ? done / (done + left) : 1;
    const h = LAUNCH_H + (v.targetH - LAUNCH_H) * t + Math.sin(Math.PI * t) * st.arc;
    const w = toWorld(p.pos, h);
    v.group.position.set(w.x, w.y, w.z);

    const dx = p.to.x - p.pos.x, dz = p.to.y - p.pos.y;
    const yaw = Math.atan2(-dz, dx);
    if (st.facing) {
      v.sprite.rotation.set(0, f.yaw, performance.now() * 0.01);
    } else {
      // flat along the path, slightly tilted toward the camera so it reads from above
      v.sprite.rotation.set(0, yaw, 0);
    }
    v.glow.rotation.set(0, f.yaw, 0);

    // trail
    if (dGame > 0) {
      const cur = this.tmp.set(w.x, w.y, w.z);
      const n = p.kind === 'crescent' ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const k = i / n;
        const x = v.last.x + (cur.x - v.last.x) * k;
        const y = v.last.y + (cur.y - v.last.y) * k;
        const z = v.last.z + (cur.z - v.last.z) * k;
        this.glowFx.spawn({
          x: x + rnd() * 0.03, y: y + rnd() * 0.03, z: z + rnd() * 0.03,
          vy: p.kind === 'shockwave' ? 0.3 : 0,
          life: p.kind === 'crescent' ? 0.22 : 0.18,
          color: st.trail[(Math.random() * st.trail.length) | 0]!,
          size: p.kind === 'shockwave' ? 0.09 : 0.06,
          sizeEnd: 0.02,
        });
      }
      v.last.copy(cur);
    }
  }

  clear(): void {
    for (const v of this.views.values()) this.release(v);
    this.views.clear();
  }

  dispose(): void {
    this.clear();
    for (const m of this.materials.values()) m.dispose();
    for (const t of this.textures) t.dispose();
    for (const arr of this.pool.values()) for (const v of arr) v.glow.material.dispose();
  }
}

function targetHeight(_s: GameSnapshot, p: ProjectileSnapshot): number {
  return p.targetFlying ? FLYER_HEIGHT + 0.35 : TARGET_H;
}
