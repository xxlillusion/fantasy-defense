// Pooled square pixel particles rendered as GL points (crisp squares, no texture).
import * as THREE from 'three';

export interface ParticleSpec {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  /** Downward acceleration (world units/s²). */
  gravity?: number;
  /** Velocity damping per second (0 = none). */
  drag?: number;
  life: number;
  color: number;
  /** World-space size of the square (start). */
  size: number;
  /** Size at end of life (defaults to size). */
  sizeEnd?: number;
  /** Twinkle (random alpha flicker) — for sparkles. */
  twinkle?: boolean;
  /** Advance with game time (true) or real time (false, cosmetic). */
  gameTime?: boolean;
}

const VERT = /* glsl */ `
attribute float aSize;
attribute vec4 aColor;
uniform float uScale;
varying vec4 vColor;
void main() {
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = max(1.0, floor(aSize * uScale / -mv.z + 0.5));
}`;

const FRAG = /* glsl */ `
varying vec4 vColor;
void main() {
  if (vColor.a <= 0.01) discard;
  gl_FragColor = vColor;
  #include <colorspace_fragment>
}`;

const tmpColor = new THREE.Color();

export class ParticleSystem {
  readonly points: THREE.Points;
  private readonly cap: number;
  private count = 0;
  // struct of arrays
  private readonly p: Float32Array; // x y z
  private readonly v: Float32Array; // vx vy vz
  private readonly g: Float32Array; // gravity, drag
  private readonly life: Float32Array; // life, maxLife
  private readonly col: Float32Array; // r g b (linear)
  private readonly sz: Float32Array; // size0, size1
  private readonly flags: Uint8Array; // bit0 twinkle, bit1 gameTime
  private readonly posAttr: THREE.BufferAttribute;
  private readonly colAttr: THREE.BufferAttribute;
  private readonly sizeAttr: THREE.BufferAttribute;
  private readonly material: THREE.ShaderMaterial;

  constructor(capacity: number, additive: boolean) {
    this.cap = capacity;
    this.p = new Float32Array(capacity * 3);
    this.v = new Float32Array(capacity * 3);
    this.g = new Float32Array(capacity * 2);
    this.life = new Float32Array(capacity * 2);
    this.col = new Float32Array(capacity * 3);
    this.sz = new Float32Array(capacity * 2);
    this.flags = new Uint8Array(capacity);
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr = new THREE.BufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('aColor', this.colAttr);
    geo.setAttribute('aSize', this.sizeAttr);
    geo.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 500 } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 12 : 11;
  }

  get active(): number {
    return this.count;
  }

  spawn(s: ParticleSpec): void {
    if (this.count >= this.cap) return;
    const i = this.count++;
    this.p[i * 3] = s.x; this.p[i * 3 + 1] = s.y; this.p[i * 3 + 2] = s.z;
    this.v[i * 3] = s.vx ?? 0; this.v[i * 3 + 1] = s.vy ?? 0; this.v[i * 3 + 2] = s.vz ?? 0;
    this.g[i * 2] = s.gravity ?? 0; this.g[i * 2 + 1] = s.drag ?? 0;
    this.life[i * 2] = s.life; this.life[i * 2 + 1] = s.life;
    tmpColor.setHex(s.color);
    this.col[i * 3] = tmpColor.r; this.col[i * 3 + 1] = tmpColor.g; this.col[i * 3 + 2] = tmpColor.b;
    this.sz[i * 2] = s.size; this.sz[i * 2 + 1] = s.sizeEnd ?? s.size;
    this.flags[i] = (s.twinkle ? 1 : 0) | (s.gameTime !== false ? 2 : 0);
  }

  clear(): void {
    this.count = 0;
    this.points.geometry.setDrawRange(0, 0);
  }

  /** pixelScale = drawing-buffer height / (2 tan(fov/2)). */
  update(dGame: number, dtReal: number, pixelScale: number): void {
    this.material.uniforms.uScale!.value = pixelScale;
    const pos = this.posAttr.array as Float32Array;
    const col = this.colAttr.array as Float32Array;
    const siz = this.sizeAttr.array as Float32Array;
    let i = 0;
    while (i < this.count) {
      const dt = this.flags[i]! & 2 ? dGame : dtReal;
      const l = (this.life[i * 2] = this.life[i * 2]! - dt);
      if (l <= 0) {
        this.kill(i);
        continue;
      }
      if (dt > 0) {
        const drag = Math.max(0, 1 - this.g[i * 2 + 1]! * dt);
        this.v[i * 3] = this.v[i * 3]! * drag;
        this.v[i * 3 + 1] = (this.v[i * 3 + 1]! - this.g[i * 2]! * dt) * drag;
        this.v[i * 3 + 2] = this.v[i * 3 + 2]! * drag;
        this.p[i * 3] = this.p[i * 3]! + this.v[i * 3]! * dt;
        this.p[i * 3 + 1] = Math.max(0.02, this.p[i * 3 + 1]! + this.v[i * 3 + 1]! * dt);
        this.p[i * 3 + 2] = this.p[i * 3 + 2]! + this.v[i * 3 + 2]! * dt;
      }
      const t = 1 - l / this.life[i * 2 + 1]!; // 0 -> 1
      let a = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      if (this.flags[i]! & 1) a *= Math.random() < 0.3 ? 0.25 : 1;
      pos[i * 3] = this.p[i * 3]!; pos[i * 3 + 1] = this.p[i * 3 + 1]!; pos[i * 3 + 2] = this.p[i * 3 + 2]!;
      col[i * 4] = this.col[i * 3]!; col[i * 4 + 1] = this.col[i * 3 + 1]!; col[i * 4 + 2] = this.col[i * 3 + 2]!;
      col[i * 4 + 3] = a;
      siz[i] = this.sz[i * 2]! + (this.sz[i * 2 + 1]! - this.sz[i * 2]!) * t;
      i++;
    }
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.sizeAttr.needsUpdate = true;
    this.points.geometry.setDrawRange(0, this.count);
  }

  private kill(i: number): void {
    const last = --this.count;
    if (i === last) return;
    const copy = (arr: Float32Array | Uint8Array, n: number) => {
      for (let k = 0; k < n; k++) arr[i * n + k] = arr[last * n + k]!;
    };
    copy(this.p, 3); copy(this.v, 3); copy(this.g, 2); copy(this.life, 2); copy(this.col, 3); copy(this.sz, 2); copy(this.flags, 1);
  }

  dispose(): void {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}

/** Convenience: random in [-1, 1]. */
export const rnd = (): number => Math.random() * 2 - 1;
