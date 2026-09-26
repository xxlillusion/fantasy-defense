// Pooled textured effect quads: ground decals (scorch, cracks, spinning rings) and
// camera-facing flashes (sword swoosh, execute slash, level-up pillar).
import * as THREE from 'three';
import {
  crackPixels,
  pillarPixels,
  scorchPixels,
  slashPixels,
  starRingPixels,
  swooshPixels,
  swordArcRingPixels,
} from '../../art/sprites/fx';
import type { PixelCanvas } from '../../art/sprites/pixelCanvas';
import { pixelTexture, type BillboardFrame } from '../entities/billboard';

export type FxTex = 'scorch' | 'crack0' | 'crack1' | 'crack2' | 'arcRing' | 'swoosh' | 'slash' | 'stars' | 'pillar';

const SOURCES: Record<FxTex, { px: () => PixelCanvas; additive: boolean }> = {
  scorch: { px: scorchPixels, additive: false },
  crack0: { px: () => crackPixels(0), additive: false },
  crack1: { px: () => crackPixels(1), additive: false },
  crack2: { px: () => crackPixels(2), additive: false },
  arcRing: { px: swordArcRingPixels, additive: true },
  swoosh: { px: swooshPixels, additive: true },
  slash: { px: slashPixels, additive: true },
  stars: { px: starRingPixels, additive: true },
  pillar: { px: pillarPixels, additive: true },
};

export interface FxSpriteSpec {
  tex: FxTex;
  x: number;
  y: number;
  z: number;
  /** World width (and height for camera sprites; ground decals are square unless h is given). */
  w: number;
  h?: number;
  mode: 'ground' | 'camera';
  life: number;
  opacity?: number;
  color?: number;
  /** Initial rotation and spin (rad/s): around Y for ground decals, around the view axis for camera sprites. */
  rot?: number;
  spin?: number;
  /** Scale multiplier reached at end of life. */
  grow?: number;
  /** Fraction of life spent fading in. */
  fadeIn?: number;
  /** Fraction of life (from the end) spent fading out (default 0.4). */
  fadeOut?: number;
  flip?: boolean;
  gameTime?: boolean;
}

interface Live {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  spec: FxSpriteSpec;
  t: number;
  rot: number;
}

const MAX = 72;
const flatGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const upGeo = new THREE.PlaneGeometry(1, 1);

export class FxSpriteLayer {
  private readonly live: Live[] = [];
  private readonly free: Live['mesh'][] = [];
  private readonly textures = new Map<FxTex, THREE.Texture>();

  constructor(private readonly parent: THREE.Group) {}

  private texture(t: FxTex): THREE.Texture {
    let tex = this.textures.get(t);
    if (!tex) {
      tex = pixelTexture(SOURCES[t].px().toCanvas());
      this.textures.set(t, tex);
    }
    return tex;
  }

  spawn(spec: FxSpriteSpec): void {
    if (this.live.length >= MAX) this.recycle(this.live.shift()!);
    const mesh = this.free.pop() ?? new THREE.Mesh(flatGeo, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    mesh.geometry = spec.mode === 'ground' ? flatGeo : upGeo;
    const m = mesh.material;
    m.map = this.texture(spec.tex);
    const additive = SOURCES[spec.tex].additive;
    if (m.blending !== (additive ? THREE.AdditiveBlending : THREE.NormalBlending)) {
      m.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
      m.needsUpdate = true;
    }
    m.color.setHex(spec.color ?? 0xffffff);
    mesh.frustumCulled = false;
    mesh.renderOrder = spec.mode === 'ground' ? (additive ? 2 : 1) : 13;
    this.parent.add(mesh);
    this.live.push({ mesh, spec, t: 0, rot: spec.rot ?? 0 });
  }

  update(dGame: number, dtReal: number, f: BillboardFrame): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const l = this.live[i]!;
      const s = l.spec;
      const dt = s.gameTime === false ? dtReal : dGame;
      l.t += dt;
      const k = l.t / s.life;
      if (k >= 1) {
        this.live.splice(i, 1);
        this.recycle(l);
        continue;
      }
      l.rot += (s.spin ?? 0) * dt;
      const g = 1 + ((s.grow ?? 1) - 1) * (1 - Math.pow(1 - k, 2));
      const fi = s.fadeIn ?? 0, fo = s.fadeOut ?? 0.4;
      let a = 1;
      if (fi > 0 && k < fi) a = k / fi;
      if (k > 1 - fo) a = Math.min(a, (1 - k) / fo);
      l.mesh.material.opacity = (s.opacity ?? 1) * a;
      l.mesh.position.set(s.x, s.y, s.z);
      const w = s.w * g, h = (s.h ?? s.w) * g;
      if (s.mode === 'ground') {
        l.mesh.rotation.set(0, l.rot, 0);
        l.mesh.scale.set(w, 1, h);
      } else {
        l.mesh.rotation.set(0, f.yaw, l.rot);
        l.mesh.scale.set(s.flip ? -w : w, h * f.stretch, 1);
      }
    }
  }

  private recycle(l: Live): void {
    this.parent.remove(l.mesh);
    this.free.push(l.mesh);
  }

  clear(): void {
    for (const l of this.live) this.recycle(l);
    this.live.length = 0;
  }

  dispose(): void {
    this.clear();
    for (const m of this.free) m.material.dispose();
    for (const t of this.textures.values()) t.dispose();
    this.textures.clear();
  }
}
