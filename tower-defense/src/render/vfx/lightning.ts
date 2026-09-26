// Jagged chain-lightning bolts drawn as camera-facing ribbons in one dynamic mesh.
import * as THREE from 'three';

interface Bolt {
  /** Control points (tower -> t0 -> t1 ...). */
  pts: THREE.Vector3[];
  /** Jittered polyline, regenerated periodically for flicker. */
  path: THREE.Vector3[];
  life: number;
  maxLife: number;
  rejitter: number;
}

const MAX_SEGMENTS = 600;
const MAX_BOLTS = 24;

const GLOW = new THREE.Color(0x40d8ff);
const CORE = new THREE.Color(0xf0ffff);

export class LightningLayer {
  readonly mesh: THREE.Mesh;
  private readonly bolts: Bolt[] = [];
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly geo: THREE.BufferGeometry;
  private readonly side = new THREE.Vector3();
  private readonly seg = new THREE.Vector3();
  private readonly toCam = new THREE.Vector3();

  constructor() {
    // each segment: 2 quads (glow + core) = 8 vertices, 12 indices
    this.pos = new Float32Array(MAX_SEGMENTS * 8 * 3);
    this.col = new Float32Array(MAX_SEGMENTS * 8 * 3);
    const idx = new Uint16Array(MAX_SEGMENTS * 12);
    for (let s = 0; s < MAX_SEGMENTS * 2; s++) {
      const v = s * 4, i = s * 6;
      idx[i] = v; idx[i + 1] = v + 1; idx[i + 2] = v + 2;
      idx[i + 3] = v + 2; idx[i + 4] = v + 1; idx[i + 5] = v + 3;
    }
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setIndex(new THREE.BufferAttribute(idx, 1));
    this.geo.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(
      this.geo,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 14;
  }

  spawn(points: THREE.Vector3[], life = 0.16): void {
    if (points.length < 2) return;
    if (this.bolts.length >= MAX_BOLTS) this.bolts.shift();
    const b: Bolt = { pts: points, path: [], life, maxLife: life, rejitter: 0 };
    jitter(b);
    this.bolts.push(b);
  }

  clear(): void {
    this.bolts.length = 0;
    this.geo.setDrawRange(0, 0);
  }

  update(dGame: number, camera: THREE.Camera): void {
    let segs = 0;
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i]!;
      b.life -= dGame;
      if (b.life <= 0) {
        this.bolts.splice(i, 1);
        continue;
      }
      b.rejitter -= dGame;
      if (b.rejitter <= 0) jitter(b);
    }
    for (const b of this.bolts) {
      const k = b.life / b.maxLife;
      // flicker: random brightness dips
      const bright = k * (Math.random() < 0.25 ? 0.4 : 1);
      for (let i = 0; i < b.path.length - 1 && segs < MAX_SEGMENTS; i++) {
        this.writeSegment(segs++, b.path[i]!, b.path[i + 1]!, bright, camera);
      }
    }
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.color as THREE.BufferAttribute).needsUpdate = true;
    this.geo.setDrawRange(0, segs * 12);
  }

  private writeSegment(s: number, a: THREE.Vector3, b: THREE.Vector3, bright: number, camera: THREE.Camera): void {
    this.seg.subVectors(b, a);
    this.toCam.subVectors(camera.position, a).normalize();
    this.side.crossVectors(this.seg, this.toCam).normalize();
    const quads: [number, THREE.Color, number][] = [
      [0.11, GLOW, 0.55 * bright],
      [0.035, CORE, 1.0 * bright],
    ];
    quads.forEach(([w, c, k], q) => {
      const v = (s * 2 + q) * 4;
      const sx = this.side.x * w, sy = this.side.y * w, sz = this.side.z * w;
      const set = (vi: number, p: THREE.Vector3, sign: number) => {
        this.pos[vi * 3] = p.x + sx * sign;
        this.pos[vi * 3 + 1] = p.y + sy * sign;
        this.pos[vi * 3 + 2] = p.z + sz * sign;
        this.col[vi * 3] = c.r * k;
        this.col[vi * 3 + 1] = c.g * k;
        this.col[vi * 3 + 2] = c.b * k;
      };
      set(v, a, 1);
      set(v + 1, a, -1);
      set(v + 2, b, 1);
      set(v + 3, b, -1);
    });
  }

  dispose(): void {
    this.geo.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

function jitter(b: Bolt): void {
  b.rejitter = 0.045;
  b.path = [];
  for (let i = 0; i < b.pts.length - 1; i++) {
    const a = b.pts[i]!, c = b.pts[i + 1]!;
    const len = a.distanceTo(c);
    const n = Math.max(3, Math.round(len * 6));
    const amp = Math.min(0.18, 0.05 + len * 0.05);
    for (let k = 0; k < n; k++) {
      const t = k / n;
      const p = new THREE.Vector3().lerpVectors(a, c, t);
      if (k > 0) {
        p.x += (Math.random() * 2 - 1) * amp;
        p.y += (Math.random() * 2 - 1) * amp;
        p.z += (Math.random() * 2 - 1) * amp;
      }
      b.path.push(p);
    }
  }
  b.path.push(b.pts[b.pts.length - 1]!.clone());
}
