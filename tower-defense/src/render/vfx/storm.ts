// Blade Storm: two counter-rotating sword-arc rings around the hero plus wind streaks,
// shown while the hero is storming.
import * as THREE from 'three';
import { swordArcRingPixels } from '../../art/sprites/fx';
import { ABILITY_FX } from '../../data';
import { pixelTexture } from '../entities/billboard';
import { rnd, type ParticleSystem } from './particles';

const flatGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const WIND = [0xffffff, 0xd8f4ff, 0x9fd8ff];

export class BladeStormLayer {
  private readonly tex = pixelTexture(swordArcRingPixels().toCanvas());
  private readonly outer: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly inner: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly group = new THREE.Group();
  private k = 0;
  private angle = 0;
  private emit = 0;

  constructor(parent: THREE.Group, private readonly glow: ParticleSystem) {
    const mk = () => {
      const m = new THREE.Mesh(flatGeo, new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.frustumCulled = false;
      m.renderOrder = 12;
      return m;
    };
    this.outer = mk();
    this.inner = mk();
    this.group.add(this.outer, this.inner);
    this.group.visible = false;
    parent.add(this.group);
  }

  /** at = hero world position (or null), active = storming. */
  update(at: THREE.Vector3 | null, active: boolean, dGame: number, dtReal: number): void {
    this.k += ((active && at ? 1 : 0) - this.k) * Math.min(1, dtReal * (active ? 12 : 6));
    this.group.visible = this.k > 0.02 && !!at;
    if (!this.group.visible || !at) return;
    this.angle += dGame * 13;
    const R = ABILITY_FX.bladeStorm.radius;
    this.group.position.copy(at);
    this.outer.position.y = 0.35;
    this.outer.rotation.y = this.angle;
    this.outer.scale.set(R * 2.1, 1, R * 2.1);
    this.outer.material.opacity = 0.95 * this.k;
    this.inner.position.y = 0.7;
    this.inner.rotation.y = -this.angle * 1.3 + 1;
    this.inner.scale.set(R * 1.2, 1, R * 1.2);
    this.inner.material.opacity = 0.7 * this.k;
    if (!active || dGame <= 0) return;
    this.emit += dGame * 70;
    while (this.emit >= 1) {
      this.emit -= 1;
      const a = Math.random() * Math.PI * 2, r = 0.4 + Math.random() * R;
      const sp = 5 + Math.random() * 3;
      this.glow.spawn({
        x: at.x + Math.cos(a) * r, y: 0.12 + Math.random() * 0.8, z: at.z + Math.sin(a) * r,
        vx: -Math.sin(a) * sp, vz: Math.cos(a) * sp, vy: rnd() * 0.2,
        drag: 4, life: 0.16 + Math.random() * 0.08,
        color: WIND[(Math.random() * WIND.length) | 0]!, size: 0.05, sizeEnd: 0.015,
      });
    }
  }

  clear(): void {
    this.k = 0;
    this.group.visible = false;
  }

  dispose(): void {
    this.outer.material.dispose();
    this.inner.material.dispose();
    this.tex.dispose();
  }
}
