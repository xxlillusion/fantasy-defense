// Cursor ghosts (tower tile + range ring + grid; rally flag + ring + hero line; ability targeting
// circle / meteor rune circle), the selection ring and meteor warning runes. Lives in layers.overlay.
import * as THREE from 'three';
import { GRID_COLS, GRID_ROWS, toWorld } from '../../core/grid';
import type { PlacementGhost, Selection } from '../../core/interfaces';
import type { GroundEffectSnapshot, TileCoord, Vec2 } from '../../core/types';
import { paintGridOverlay, paintTileHighlight, toTexture } from '../../art/env/textures';
import { tileWorld } from './util';

const ringVert = /* glsl */ `
uniform float uExtent;
varying vec2 vP;
void main() { vP = position.xz * uExtent; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// Ring of constant world-space line width at radius uRange, faint fill inside, rotating dashes.
const ringFrag = /* glsl */ `
uniform float uRange;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uTime;
varying vec2 vP;
void main() {
  float d = length(vP);
  float w = 0.045;
  float aa = fwidth(d) * 1.2;
  float line = 1.0 - smoothstep(w - aa, w + aa, abs(d - uRange));
  float a = atan(vP.y, vP.x);
  float dash = step(0.5, fract(a / 6.2831 * floor(uRange * 7.0) + uTime * 0.25));
  float fill = (1.0 - smoothstep(uRange - aa, uRange, d)) * (0.06 + 0.06 * smoothstep(uRange * 0.4, uRange, d));
  float alpha = max(line * (0.6 + 0.4 * dash), fill);
  if (alpha < 0.003) discard;
  gl_FragColor = vec4(uColor, alpha * uOpacity);
}`;

// Rune circle: outer + inner ring, a band of glyph marks and a slowly turning hexagram.
const runeFrag = /* glsl */ `
uniform float uRange;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uTime;
uniform float uPulse;
varying vec2 vP;
float lineAt(float d, float r, float w, float aa) { return 1.0 - smoothstep(w - aa, w + aa, abs(d - r)); }
float triEdge(vec2 p, float Rc, float rot, float w, float aa) {
  float a = atan(p.y, p.x) + rot;
  float seg = 6.2831853 / 3.0;
  float la = mod(a, seg) - seg * 0.5;
  float apo = Rc * 0.5;
  return 1.0 - smoothstep(w - aa, w + aa, abs(length(p) * cos(la) - apo));
}
void main() {
  float R = uRange;
  float d = length(vP);
  if (d > R + 0.12) discard;
  float aa = fwidth(d) * 1.2;
  float a = atan(vP.y, vP.x);
  float outer = lineAt(d, R, 0.05, aa);
  float inner = lineAt(d, R * 0.8, 0.02, aa);
  float N = max(8.0, floor(R * 9.0));
  float s = a / 6.2831853 * N + uTime * 0.05;
  float id = floor(s);
  float ca = fract(s);
  float h = fract(sin(id * 91.7 + 3.1) * 43758.5);
  float band = smoothstep(R * 0.83, R * 0.85, d) * (1.0 - smoothstep(R * 0.95, R * 0.97, d));
  float glyph = band * step(0.2, ca) * step(ca, 0.8) * step(0.2, h) * step(0.5, fract(ca * (2.0 + floor(h * 3.0))));
  float hex = max(triEdge(vP, R * 0.78, uTime * 0.25, 0.018, aa), triEdge(vP, R * 0.78, uTime * 0.25 + 1.0471976, 0.018, aa));
  hex *= 1.0 - smoothstep(R * 0.79, R * 0.8, d);
  float fill = (1.0 - smoothstep(R - aa, R, d)) * (0.07 + 0.16 * smoothstep(R * 0.3, R, d));
  float alpha = max(max(outer, inner * 0.8), max(glyph * 0.75, hex * 0.65));
  alpha = max(alpha, fill * (1.0 + uPulse));
  alpha *= uOpacity;
  if (alpha < 0.003) discard;
  gl_FragColor = vec4(uColor * (1.0 + uPulse * 0.9), alpha);
}`;

type RingUniforms = { uRange: { value: number }; uExtent: { value: number }; uColor: { value: THREE.Color }; uOpacity: { value: number }; uTime: { value: number }; uPulse: { value: number } };

class Ring {
  readonly mesh: THREE.Mesh;
  private readonly uniforms: RingUniforms;
  constructor(color: THREE.ColorRepresentation, geo: THREE.BufferGeometry, rune = false) {
    this.uniforms = { uRange: { value: 1 }, uExtent: { value: 1.6 }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: 1 }, uTime: { value: 0 }, uPulse: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: ringVert,
      fragmentShader: rune ? runeFrag : ringFrag,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.renderOrder = 1000;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
  }
  set(pos: THREE.Vector3, range: number) {
    this.mesh.position.set(pos.x, 0.03, pos.z);
    // unit quad scaled to cover the ring; the shader works in world units via uExtent
    const extent = range + 0.3;
    this.mesh.scale.setScalar(extent);
    this.uniforms.uRange.value = range;
    this.uniforms.uExtent.value = extent;
  }
  get color() {
    return this.uniforms.uColor.value;
  }
  set opacity(v: number) {
    this.uniforms.uOpacity.value = v;
  }
  set time(v: number) {
    this.uniforms.uTime.value = v;
  }
  set pulse(v: number) {
    this.uniforms.uPulse.value = v;
  }
}

// Faint dashed ground line (hero -> rally point).
const dashVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const dashFrag = /* glsl */ `
uniform float uLen;
uniform float uTime;
uniform float uOpacity;
uniform vec3 uColor;
varying vec2 vUv;
void main() {
  float x = vUv.x * uLen;
  float dash = smoothstep(0.35, 0.5, fract(x * 2.2 - uTime * 1.4)) * (1.0 - smoothstep(0.85, 1.0, fract(x * 2.2 - uTime * 1.4)));
  float across = 1.0 - abs(vUv.y * 2.0 - 1.0);
  float a = dash * smoothstep(0.0, 0.7, across) * smoothstep(0.0, 0.35, x) * smoothstep(0.0, 0.5, uLen - x) * uOpacity;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor, a);
}`;

export interface Overlays {
  readonly group: THREE.Group;
  setGhost(g: PlacementGhost | null): void;
  setSelection(s: Selection | null): void;
  /** Hero position for the rally line (null = no hero). */
  setHero(pos: Vec2 | null): void;
  /** Meteor warnings from the snapshot's ground effects. */
  setWarnings(effects: readonly GroundEffectSnapshot[]): void;
  update(dt: number, time: number): void;
}

const MAX_WARNINGS = 6;

export function buildOverlays(isBuildable: (t: TileCoord) => boolean, anisotropy: number): Overlays {
  const group = new THREE.Group();
  group.name = 'overlays';

  // grid (visible only while placing a tower)
  const gridMat = new THREE.MeshBasicMaterial({
    map: toTexture(paintGridOverlay(isBuildable, 64), { anisotropy }),
    color: new THREE.Color(0xdff7ff),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(GRID_COLS, GRID_ROWS).rotateX(-Math.PI / 2), gridMat);
  grid.position.y = 0.01;
  grid.renderOrder = 990;
  grid.visible = false;
  group.add(grid);

  // tile highlight
  const tileMat = new THREE.MeshBasicMaterial({
    map: toTexture(paintTileHighlight(128), { anisotropy }),
    transparent: true,
    depthTest: false,
    depthWrite: false,
    fog: false,
  });
  const tile = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), tileMat);
  tile.renderOrder = 995;
  tile.visible = false;
  group.add(tile);

  // unit quad (radius 1) for rings; the shader draws the ring at uRange (normalized)
  const quad = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const range = new Ring(0xeafcff, quad);
  const sel = new Ring(0xffd35a, quad);
  const target = new Ring(0xeafcff, quad); // ability / rally ring
  const rune = new Ring(0xff7a26, quad, true); // meteor aim
  group.add(range.mesh, sel.mesh, target.mesh, rune.mesh);

  // rally flag: pole + waving pennant
  const flag = new THREE.Group();
  const flagMat = new THREE.MeshBasicMaterial({ color: 0x5dff9c, fog: false, side: THREE.DoubleSide });
  const poleMat = new THREE.MeshBasicMaterial({ color: 0xe8edf0, fog: false });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.62, 6), poleMat);
  pole.position.y = 0.31;
  const pennantGeo = new THREE.BufferGeometry();
  pennantGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0.6, 0, 0.3, 0.52, 0, 0, 0.42, 0]), 3));
  pennantGeo.computeVertexNormals();
  const pennant = new THREE.Mesh(pennantGeo, flagMat);
  flag.add(pole, pennant);
  flag.visible = false;
  flag.renderOrder = 1001;
  group.add(flag);

  // hero -> rally dashed line
  const lineUniforms = { uLen: { value: 1 }, uTime: { value: 0 }, uOpacity: { value: 0.75 }, uColor: { value: new THREE.Color(0xeafcff) } };
  const lineGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0.5, 0, 0);
  const line = new THREE.Mesh(lineGeo, new THREE.ShaderMaterial({ uniforms: lineUniforms, vertexShader: dashVert, fragmentShader: dashFrag, transparent: true, depthTest: false, depthWrite: false }));
  line.renderOrder = 998;
  line.visible = false;
  line.frustumCulled = false;
  group.add(line);

  // meteor warnings (pooled)
  const warnings = Array.from({ length: MAX_WARNINGS }, () => {
    const r = new Ring(new THREE.Color(1.0, 0.16, 0.1), quad, true);
    group.add(r.mesh);
    return { ring: r, remaining: 0 };
  });

  const VALID = new THREE.Color(0x5dff9c);
  const INVALID = new THREE.Color(0xff4f5f);
  const TARGET = new THREE.Color(0xbff4ff);
  const METEOR = new THREE.Color(1.0, 0.48, 0.14);
  const METEOR_BAD = new THREE.Color(1.0, 0.18, 0.22);
  let gridOn = false;
  let gridAlpha = 0;
  let rallyPoint: THREE.Vector3 | null = null;
  let heroPos: Vec2 | null = null;

  function updateLine() {
    if (!rallyPoint || !heroPos) {
      line.visible = false;
      return;
    }
    const h = toWorld(heroPos);
    const dx = rallyPoint.x - h.x;
    const dz = rallyPoint.z - h.z;
    const len = Math.hypot(dx, dz);
    line.visible = len > 0.35;
    line.position.set(h.x, 0.035, h.z);
    line.rotation.y = -Math.atan2(dz, dx);
    line.scale.set(len, 1, 0.13);
    lineUniforms.uLen.value = len;
  }

  return {
    group,
    setGhost(g) {
      gridOn = g?.type === 'tower';
      tile.visible = range.mesh.visible = g?.type === 'tower';
      target.mesh.visible = flag.visible = rune.mesh.visible = false;
      rallyPoint = null;
      line.visible = false;
      if (!g) return;
      if (g.type === 'tower') {
        const w = tileWorld(g.tile, 0.02);
        tile.position.copy(w);
        tileMat.color.copy(g.valid ? VALID : INVALID);
        range.set(w, g.range);
        range.color.copy(g.valid ? new THREE.Color(0xeafcff) : INVALID);
        return;
      }
      const p = toWorld(g.point);
      const w = new THREE.Vector3(p.x, 0, p.z);
      if (g.type === 'rally') {
        target.mesh.visible = flag.visible = true;
        target.set(w, 0.42);
        target.color.copy(g.valid ? VALID : INVALID);
        flagMat.color.copy(g.valid ? VALID : INVALID);
        flag.position.set(w.x, 0, w.z);
        lineUniforms.uColor.value.copy(g.valid ? VALID : INVALID);
        rallyPoint = w;
        updateLine();
        return;
      }
      // ability targeting
      if (g.id === 'meteor') {
        rune.mesh.visible = true;
        rune.set(w, g.radius);
        rune.color.copy(g.valid ? METEOR : METEOR_BAD);
      } else {
        target.mesh.visible = true;
        target.set(w, g.radius);
        target.color.copy(g.valid ? TARGET : INVALID);
      }
    },
    setSelection(s) {
      sel.mesh.visible = !!s;
      if (!s) return;
      sel.set(tileWorld(s.tile), s.range);
    },
    setHero(pos) {
      heroPos = pos;
      if (rallyPoint) updateLine();
    },
    setWarnings(effects) {
      let n = 0;
      for (const e of effects) {
        if (e.kind !== 'meteorWarning' || n >= MAX_WARNINGS) continue;
        const slot = warnings[n++]!;
        const p = toWorld(e.pos);
        slot.ring.set(new THREE.Vector3(p.x, 0, p.z), e.radius);
        slot.ring.mesh.visible = true;
        slot.remaining = e.remaining;
      }
      for (let i = n; i < MAX_WARNINGS; i++) warnings[i]!.ring.mesh.visible = false;
    },
    update(dt, time) {
      gridAlpha += ((gridOn ? 0.2 : 0) - gridAlpha) * Math.min(1, dt * 8);
      gridMat.opacity = gridAlpha;
      grid.visible = gridAlpha > 0.005;
      tileMat.opacity = 0.75 + 0.25 * Math.sin(time * 5);
      range.time = time;
      range.opacity = 0.85;
      sel.time = time;
      sel.opacity = 0.8 + 0.2 * Math.sin(time * 3);
      target.time = time;
      target.opacity = 0.8 + 0.2 * Math.sin(time * 4);
      rune.time = time;
      rune.opacity = 0.95;
      rune.pulse = 0.25 + 0.25 * Math.sin(time * 5);
      lineUniforms.uTime.value = time;
      if (flag.visible) pennant.scale.x = 0.85 + 0.15 * Math.sin(time * 6);
      for (const w of warnings) {
        if (!w.ring.mesh.visible) continue;
        // pulses faster as impact nears
        const urgency = 1 - Math.min(1, w.remaining / 0.8);
        const rate = 6 + urgency * 18;
        w.ring.time = time * 2;
        w.ring.pulse = (0.5 + 0.5 * Math.sin(time * rate)) * (0.5 + urgency);
        w.ring.opacity = 0.7 + 0.3 * urgency;
      }
    },
  };
}
