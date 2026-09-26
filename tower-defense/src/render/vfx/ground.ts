// Persistent ground effects (burning ground from Cannon L3): flickering pixel fire patches + embers.
import * as THREE from 'three';
import { toWorld } from '../../core/grid';
import type { EntityId, GroundEffectSnapshot } from '../../core/types';
import { burnPatchPixels } from '../../art/sprites/fx';
import { pixelTexture } from '../entities/billboard';
import type { ParticleSystem } from './particles';
import { rnd } from './particles';

interface Patch {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  variant: number;
  swap: number;
  emit: number;
}

const EMBERS = [0xff5a1a, 0xff9a2a, 0xffd050, 0xfff0a0];

export class GroundLayer {
  private readonly patches = new Map<EntityId, Patch>();
  private readonly free: Patch['mesh'][] = [];
  private readonly textures = [0, 1, 2].map((v) => pixelTexture(burnPatchPixels(v).toCanvas()));
  private readonly geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

  constructor(
    private readonly parent: THREE.Group,
    private readonly glow: ParticleSystem,
  ) {}

  update(effects: readonly GroundEffectSnapshot[], dGame: number): void {
    const seen = new Set<EntityId>();
    for (const g of effects) {
      seen.add(g.id);
      let p = this.patches.get(g.id);
      if (!p) {
        const mesh =
          this.free.pop() ??
          new THREE.Mesh(
            this.geo,
            new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
          );
        mesh.frustumCulled = false;
        mesh.renderOrder = 1;
        this.parent.add(mesh);
        p = { mesh, variant: (Math.random() * 3) | 0, swap: 0, emit: 0 };
        this.patches.set(g.id, p);
      }
      const w = toWorld(g.pos, 0.025);
      p.mesh.position.set(w.x, w.y, w.z);
      p.mesh.scale.set(g.radius * 2, 1, g.radius * 2);
      p.swap -= dGame;
      if (p.swap <= 0) {
        p.swap = 0.09;
        p.variant = (p.variant + 1 + ((Math.random() * 2) | 0)) % 3;
        p.mesh.material.map = this.textures[p.variant]!;
        p.mesh.rotation.y = ((Math.random() * 4) | 0) * (Math.PI / 2);
        p.mesh.material.needsUpdate = true;
      }
      const fade = Math.min(1, g.remaining / 0.5);
      p.mesh.material.opacity = fade * (0.65 + Math.random() * 0.25);
      // embers
      p.emit += dGame * 22 * g.radius * fade;
      while (p.emit >= 1) {
        p.emit -= 1;
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * g.radius * 0.9;
        this.glow.spawn({
          x: w.x + Math.cos(a) * r, y: 0.05, z: w.z + Math.sin(a) * r,
          vx: rnd() * 0.1, vy: 0.5 + Math.random() * 0.6, vz: rnd() * 0.1,
          life: 0.4 + Math.random() * 0.4,
          color: EMBERS[(Math.random() * EMBERS.length) | 0]!,
          size: 0.05, sizeEnd: 0.02,
        });
      }
    }
    for (const [id, p] of this.patches) {
      if (!seen.has(id)) {
        this.parent.remove(p.mesh);
        this.free.push(p.mesh);
        this.patches.delete(id);
      }
    }
  }

  clear(): void {
    for (const p of this.patches.values()) {
      this.parent.remove(p.mesh);
      this.free.push(p.mesh);
    }
    this.patches.clear();
  }

  dispose(): void {
    this.clear();
    for (const m of this.free) m.material.dispose();
    for (const t of this.textures) t.dispose();
    this.geo.dispose();
  }
}
