// Path preview (layers.overlay): animated chevrons flowing along every lane toward the portal during
// the build phase (brighter on the lanes the next wave uses), plus a one-time "route reveal" sweep
// before wave 1. One ribbon mesh per lane with a shared-code shader; drawn on the ground with depth
// test so billboards standing on the path cover it.
import * as THREE from 'three';
import { toWorld } from '../../core/grid';
import type { Vec2 } from '../../core/types';
import type { MapDef } from '../../data';

const vert = /* glsl */ `
attribute float aDist;
varying float vDist;
varying float vAcross;
void main() {
  vDist = aDist;
  vAcross = uv.y * 2.0 - 1.0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const frag = /* glsl */ `
uniform float uTime;
uniform float uLen;
uniform float uAlpha;
uniform float uHead;
uniform float uTrail;
uniform vec3 uColor;
uniform vec3 uGlow;
varying float vDist;
varying float vAcross;
void main() {
  float rem = uLen - vDist;
  float ends = smoothstep(0.0, 0.9, vDist) * smoothstep(0.0, 0.7, rem);
  // chevrons: phase from the remaining distance so merged lanes line up; move toward the portal
  float x = fract(-(rem + uTime * 1.1) * 0.85);
  float across = abs(vAcross);
  float tip = 0.62 - across * 0.34;
  float d = abs(x - tip);
  float chev = (1.0 - smoothstep(0.045, 0.085, d)) * (1.0 - smoothstep(0.62, 0.78, across));
  float a = chev * uAlpha * ends;
  vec3 col = uColor;
  // route reveal: a bright head racing from spawn to portal with a fading trail
  if (uTrail > 0.0) {
    float behind = uHead - vDist;
    float trail = behind >= 0.0 ? exp(-behind * 0.22) : 0.0;
    float head = exp(-behind * behind * 2.5);
    float core = 1.0 - smoothstep(0.2, 1.0, across);
    float r = (trail * 0.55 + head) * core * uTrail * smoothstep(0.0, 0.6, vDist);
    col = mix(col, uGlow, clamp(r * 2.0, 0.0, 1.0));
    a = max(a, r);
  }
  if (a < 0.004) discard;
  gl_FragColor = vec4(col, a);
}`;

/** Round the lane's corners and resample it densely. Returns points and cumulative distance. */
function smoothLane(lane: readonly Vec2[], radius = 0.5, stopShort = 0.35): { pts: THREE.Vector2[]; dist: number[] } {
  const raw = lane.map((p) => {
    const w = toWorld(p);
    return new THREE.Vector2(w.x, w.z);
  });
  const pts: THREE.Vector2[] = [raw[0]!.clone()];
  for (let i = 1; i < raw.length - 1; i++) {
    const a = raw[i - 1]!;
    const b = raw[i]!;
    const c = raw[i + 1]!;
    const din = b.clone().sub(a);
    const dout = c.clone().sub(b);
    const r = Math.min(radius, din.length() / 2, dout.length() / 2);
    din.normalize();
    dout.normalize();
    if (Math.abs(din.dot(dout)) > 0.999) {
      pts.push(b.clone());
      continue;
    }
    const p0 = b.clone().addScaledVector(din, -r);
    const p2 = b.clone().addScaledVector(dout, r);
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      const u = 1 - t;
      pts.push(new THREE.Vector2(u * u * p0.x + 2 * u * t * b.x + t * t * p2.x, u * u * p0.y + 2 * u * t * b.y + t * t * p2.y));
    }
  }
  // stop a little short of the portal center
  const last = raw[raw.length - 1]!.clone();
  const prev = pts[pts.length - 1]!;
  const dir = last.clone().sub(prev);
  const L = dir.length();
  if (L > stopShort) pts.push(prev.clone().addScaledVector(dir.normalize(), L - stopShort));
  // resample to ~0.12 spacing (keeps the ribbon even)
  const out: THREE.Vector2[] = [pts[0]!.clone()];
  const dist = [0];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const seg = a.distanceTo(b);
    const n = Math.max(1, Math.ceil(seg / 0.12));
    for (let k = 1; k <= n; k++) {
      out.push(a.clone().lerp(b, k / n));
      acc += seg / n;
      dist.push(acc);
    }
  }
  return { pts: out, dist };
}

function ribbon(pts: THREE.Vector2[], dist: number[], width: number): THREE.BufferGeometry {
  const n = pts.length;
  const pos = new Float32Array(n * 2 * 3);
  const uv = new Float32Array(n * 2 * 2);
  const ad = new Float32Array(n * 2);
  const idx: number[] = [];
  const tan = new THREE.Vector2();
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)]!;
    const b = pts[Math.min(n - 1, i + 1)]!;
    tan.copy(b).sub(a).normalize();
    const nx = -tan.y;
    const nz = tan.x;
    const p = pts[i]!;
    const h = width / 2;
    pos.set([p.x + nx * h, 0, p.y + nz * h, p.x - nx * h, 0, p.y - nz * h], i * 6);
    uv.set([dist[i]!, 0, dist[i]!, 1], i * 4);
    ad[i * 2] = ad[i * 2 + 1] = dist[i]!;
    if (i < n - 1) {
      const k = i * 2;
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aDist', new THREE.BufferAttribute(ad, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

export interface PathPreview {
  readonly group: THREE.Group;
  /** show = build phase; bright = lane indices of the next wave; reveal = start the one-time sweep. */
  update(dt: number, time: number, show: boolean, bright: readonly number[]): void;
  /** Play the route-reveal sweep (once per call). */
  reveal(): void;
  readonly revealing: boolean;
}

const REVEAL_TIME = 2.2;

export function buildPathPreview(map: MapDef): PathPreview {
  const group = new THREE.Group();
  group.name = 'pathPreview';
  const lanes = map.paths.map((lane, i) => {
    const { pts, dist } = smoothLane(lane);
    const len = dist[dist.length - 1] ?? 1;
    const uniforms = {
      uTime: { value: 0 },
      uLen: { value: len },
      uAlpha: { value: 0 },
      uHead: { value: -10 },
      uTrail: { value: 0 },
      uColor: { value: new THREE.Color(1.0, 0.86, 0.55) },
      uGlow: { value: new THREE.Color(1.0, 0.92, 0.6).multiplyScalar(2.2) },
    };
    const mesh = new THREE.Mesh(
      ribbon(pts, dist, 0.42),
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: vert,
        fragmentShader: frag,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    mesh.position.y = 0.03;
    mesh.renderOrder = 2 + i;
    mesh.name = `lanePreview${i}`;
    mesh.visible = false;
    group.add(mesh);
    return { mesh, uniforms, len, alpha: 0 };
  });

  let revealT = -1;
  const maxLen = Math.max(...lanes.map((l) => l.len));

  return {
    group,
    get revealing() {
      return revealT >= 0;
    },
    reveal() {
      revealT = 0;
    },
    update(dt, time, show, bright) {
      if (revealT >= 0) revealT += dt;
      const sweep = revealT >= 0 ? revealT / REVEAL_TIME : -1;
      lanes.forEach((l, i) => {
        const isBright = bright.length === 0 || bright.includes(i);
        // chevrons fade in once the sweep has passed
        const target = show && (sweep < 0 || sweep > 0.85) ? (isBright ? 0.5 : 0.14) : 0;
        l.alpha += (target - l.alpha) * Math.min(1, dt * 4);
        l.uniforms.uAlpha.value = l.alpha;
        l.uniforms.uTime.value = time;
        if (sweep >= 0) {
          // every lane races at the same speed as the longest one's timing; fade out afterwards
          l.uniforms.uHead.value = sweep * maxLen * 1.05;
          l.uniforms.uTrail.value = show ? Math.max(0, Math.min(1, (1.35 - sweep) / 0.35)) : 0;
        } else l.uniforms.uTrail.value = 0;
        l.mesh.visible = l.alpha > 0.004 || l.uniforms.uTrail.value > 0;
      });
      if (sweep > 1.4) revealT = -1;
    },
  };
}
