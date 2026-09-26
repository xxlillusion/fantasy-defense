// Expanding flat ground rings (shockwave splash, frost aura pulse, portal flash, upgrade ring).
import * as THREE from 'three';

export interface RingSpec {
  x: number;
  z: number;
  y?: number;
  /** Start and end radius (world units). */
  r0: number;
  r1: number;
  color: number;
  life: number;
  opacity?: number;
  /** Advance with game time (default) or real time. */
  gameTime?: boolean;
  /** Filled disc glow under the ring (0..1). */
  fill?: number;
  /** Hi-res thin ring texture (for very large rings such as Frost Nova). */
  thin?: boolean;
}

interface Ring {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  spec: RingSpec;
  t: number;
}

const MAX_RINGS = 64;

function ringTexture(n = 64, band = 0.9): THREE.CanvasTexture {
  // Pixelated ring: drawn at low resolution, NearestFilter so it keeps a pixel edge.
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(n, n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const d = Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2) / (n / 2);
      let a = 0;
      const b2 = band - (1 - band) * 0.6;
      if (d <= 1 && d > band) a = 1;
      else if (d <= band && d > b2) a = 0.55;
      else if (d <= b2) a = Math.pow(d / b2, 3) * 0.3;
      const i = (y * n + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(a * 255);
    }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class RingLayer {
  private readonly active: Ring[] = [];
  private readonly free: Ring['mesh'][] = [];
  private readonly geo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  private readonly tex = ringTexture();
  private readonly thinTex = ringTexture(256, 0.975);

  constructor(private readonly parent: THREE.Group) {}

  spawn(spec: RingSpec): void {
    if (this.active.length >= MAX_RINGS) {
      const old = this.active.shift()!;
      this.recycle(old.mesh);
    }
    const mesh =
      this.free.pop() ??
      new THREE.Mesh(
        this.geo,
        new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
    mesh.material.color.setHex(spec.color);
    mesh.material.map = spec.thin ? this.thinTex : this.tex;
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    mesh.position.set(spec.x, spec.y ?? 0.03, spec.z);
    mesh.scale.setScalar(Math.max(0.001, spec.r0));
    this.parent.add(mesh);
    this.active.push({ mesh, spec, t: 0 });
  }

  update(dGame: number, dtReal: number): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const r = this.active[i]!;
      r.t += r.spec.gameTime === false ? dtReal : dGame;
      const k = r.t / r.spec.life;
      if (k >= 1) {
        this.active.splice(i, 1);
        this.recycle(r.mesh);
        continue;
      }
      const e = 1 - Math.pow(1 - k, 3); // ease out
      r.mesh.scale.setScalar(Math.max(0.001, r.spec.r0 + (r.spec.r1 - r.spec.r0) * e));
      r.mesh.material.opacity = (r.spec.opacity ?? 1) * (1 - k * k);
    }
  }

  private recycle(mesh: Ring['mesh']): void {
    this.parent.remove(mesh);
    this.free.push(mesh);
  }

  clear(): void {
    for (const r of this.active) this.recycle(r.mesh);
    this.active.length = 0;
  }

  dispose(): void {
    this.clear();
    for (const m of this.free) m.material.dispose();
    this.geo.dispose();
    this.tex.dispose();
    this.thinTex.dispose();
  }
}
