// Lighting, fog, volumetric-looking light shafts, ambient particles (dust motes / embers / fireflies)
// and low haze (smoke / ground mist). Everything is driven by the theme's AtmosSpec.
import * as THREE from 'three';
import { rng } from '../../art/env/noise';
import type { EnvPalette } from '../../art/env/palette';
import { paintBeam, paintMistPuff, toTexture } from '../../art/env/textures';
import { pointScale, type WorldPart } from './util';

type V3 = readonly [number, number, number];

export interface AtmosSpec {
  readonly fogNear: number;
  readonly fogFar: number;
  readonly hemi: number;
  readonly ambient: number;
  readonly ambientColor: number;
  readonly sun: number;
  readonly sunPos: V3;
  readonly fill: number;
  readonly fillColor: number;
  readonly fillPos: V3;
  /** Extra non-shadow directional rim light (e.g. forge back-glow). */
  readonly rim: { readonly color: number; readonly intensity: number; readonly pos: V3 } | null;
  readonly shafts: { readonly color: number; readonly opacity: number } | null;
  readonly particles: { readonly kind: 'dust' | 'embers' | 'fireflies'; readonly count: number; readonly color: THREE.Color };
  /** Low drifting haze: smoke (forge) or ground mist (ruins). */
  readonly haze: { readonly kind: 'smoke' | 'mist'; readonly color: number; readonly opacity: number; readonly count: number } | null;
}

/** v1 shrine values. */
export const SHRINE_ATMOS: AtmosSpec = {
  fogNear: 22,
  fogFar: 75,
  hemi: 2.1,
  ambient: 0.45,
  ambientColor: 0x9fc4cc,
  sun: 3.0,
  sunPos: [-8, 16, -10],
  fill: 0.7,
  fillColor: 0xbfdbe3,
  fillPos: [4, 8, 14],
  rim: null,
  shafts: { color: 0xdff3f7, opacity: 0.2 },
  particles: { kind: 'dust', count: 460, color: new THREE.Color(0xd6f2ff).multiplyScalar(1.5) },
  haze: null,
};

const dustVert = /* glsl */ `
uniform float uTime;
uniform float uScale;
attribute vec4 aSeed;
varying float vAlpha;
varying float vHeat;
void main() {
  vec3 p = position;
  float h = 5.0;
  float rise = uTime * (0.06 + aSeed.x * 0.12);
  float y = mod(p.y + rise, h);
  p.y = 0.15 + y;
  p.x += sin(uTime * (0.2 + aSeed.y * 0.3) + aSeed.z * 6.28) * 0.7 + sin(uTime * 0.07 + aSeed.w * 9.0) * 0.4;
  p.z += cos(uTime * (0.15 + aSeed.w * 0.2) + aSeed.y * 6.28) * 0.5;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float size = 0.035 + aSeed.w * 0.07;
  gl_PointSize = max(1.5, size * uScale / -mv.z);
  float tw = 0.55 + 0.45 * sin(uTime * (1.0 + aSeed.x * 2.5) + aSeed.z * 20.0);
  vAlpha = tw * smoothstep(0.0, 0.6, y) * (1.0 - smoothstep(h - 1.2, h, y));
  vHeat = 1.0;
  gl_Position = projectionMatrix * mv;
}`;

// Embers: rise quickly with a wobble, flicker, cool from yellow-hot to red as they climb.
const emberVert = /* glsl */ `
uniform float uTime;
uniform float uScale;
attribute vec4 aSeed;
varying float vAlpha;
varying float vHeat;
void main() {
  vec3 p = position;
  float h = 4.0 + aSeed.w * 3.0;
  float y = mod(p.y + uTime * (0.45 + aSeed.x * 0.9), h);
  float k = y / h;
  p.y = 0.05 + y;
  p.x += sin(uTime * (0.9 + aSeed.y * 1.4) + aSeed.z * 6.28) * 0.25 * k + sin(uTime * 0.21 + aSeed.w * 9.0) * 0.6 * k;
  p.z += cos(uTime * (0.8 + aSeed.w * 1.1) + aSeed.y * 6.28) * 0.2 * k;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float size = 0.03 + aSeed.w * 0.035;
  gl_PointSize = max(1.2, size * uScale / -mv.z);
  float flick = 0.6 + 0.4 * sin(uTime * (8.0 + aSeed.x * 9.0) + aSeed.z * 30.0);
  vAlpha = flick * smoothstep(0.0, 0.08, k) * (1.0 - smoothstep(0.55, 1.0, k));
  vHeat = 1.0 - k * 0.7;
  gl_Position = projectionMatrix * mv;
}`;

// Fireflies: lazy wandering loops near the ground, slow smooth blink.
const fireflyVert = /* glsl */ `
uniform float uTime;
uniform float uScale;
attribute vec4 aSeed;
varying float vAlpha;
varying float vHeat;
void main() {
  vec3 p = position;
  float t = uTime;
  p.x += sin(t * (0.23 + aSeed.x * 0.3) + aSeed.y * 6.28) * 0.9 + sin(t * 0.9 + aSeed.z * 5.0) * 0.12;
  p.z += cos(t * (0.19 + aSeed.w * 0.3) + aSeed.z * 6.28) * 0.8;
  p.y += sin(t * (0.5 + aSeed.y * 0.6) + aSeed.w * 6.28) * 0.35;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float size = 0.06 + aSeed.w * 0.05;
  gl_PointSize = max(1.5, size * uScale / -mv.z);
  float b = sin(t * (0.7 + aSeed.x * 0.9) + aSeed.z * 40.0);
  vAlpha = pow(max(0.0, b), 3.0);
  vHeat = 1.0;
  gl_Position = projectionMatrix * mv;
}`;

const pointFrag = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uCool;
varying float vAlpha;
varying float vHeat;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  a *= a;
  gl_FragColor = vec4(mix(uCool, uColor, vHeat) * a * vAlpha, 1.0);
}`;

// Large soft haze puffs that drift sideways (wrapping) and optionally rise.
const hazeVert = /* glsl */ `
uniform float uTime;
uniform float uScale;
uniform float uRise;
attribute vec4 aSeed;
varying float vAlpha;
varying float vRot;
void main() {
  vec3 p = position;
  float span = 36.0;
  p.x = mod(p.x + uTime * (0.08 + aSeed.x * 0.12) + span * 0.5, span) - span * 0.5;
  float life = fract(uTime * 0.02 * (0.5 + aSeed.y) + aSeed.z);
  p.y += life * uRise;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float size = (3.0 + aSeed.w * 4.0);
  gl_PointSize = size * uScale / -mv.z;
  float edge = smoothstep(18.0, 14.0, abs(p.x));
  // thinner over the playfield so the path stays readable
  float inner = (abs(p.x) < 10.5 && p.z > -6.5 && p.z < 6.5) ? 0.45 : 1.0;
  vAlpha = edge * inner * (uRise > 0.0 ? smoothstep(0.0, 0.2, life) * (1.0 - smoothstep(0.6, 1.0, life)) : 1.0);
  vRot = aSeed.w * 6.28 + uTime * 0.03;
  gl_Position = projectionMatrix * mv;
}`;

const hazeFrag = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uColor;
uniform float uOpacity;
varying float vAlpha;
varying float vRot;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float s = sin(vRot), co = cos(vRot);
  c = mat2(co, -s, s, co) * c;
  vec4 t = texture2D(uMap, c + 0.5);
  gl_FragColor = vec4(uColor, t.a * vAlpha * uOpacity);
}`;

export function applyFog(scene: THREE.Scene, pal: EnvPalette, spec: AtmosSpec): void {
  scene.fog = new THREE.Fog(pal.fog, spec.fogNear, spec.fogFar);
  scene.background = new THREE.Color(pal.sky);
}

export interface Atmosphere extends WorldPart {
  readonly sun: THREE.DirectionalLight;
}

/**
 * @param emitters world points ember particles cluster around (lava tiles, the lava pool); optional.
 */
export function buildAtmosphere(pal: EnvPalette, spec: AtmosSpec, anisotropy: number, emitters: readonly THREE.Vector3[] = []): Atmosphere {
  const group = new THREE.Group();
  group.name = 'atmosphere';

  // --- lights: soft sky from above/behind, key light with shadows, cool fill, optional rim
  const hemi = new THREE.HemisphereLight(pal.hemiSky, pal.hemiGround, spec.hemi);
  const ambient = new THREE.AmbientLight(spec.ambientColor, spec.ambient);
  const sun = new THREE.DirectionalLight(pal.sun, spec.sun);
  sun.position.set(...spec.sunPos);
  sun.target.position.set(0, 0, 1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -17;
  sc.right = 17;
  sc.top = 14;
  sc.bottom = -14;
  sc.near = 2;
  sc.far = 50;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 4;
  sun.shadow.blurSamples = 12;
  // soft front fill (no shadows) so camera-facing surfaces aren't flat while backlit
  const fill = new THREE.DirectionalLight(spec.fillColor, spec.fill);
  fill.position.set(...spec.fillPos);
  group.add(hemi, ambient, sun, sun.target, fill);
  if (spec.rim) {
    const rim = new THREE.DirectionalLight(spec.rim.color, spec.rim.intensity);
    rim.position.set(...spec.rim.pos);
    group.add(rim);
  }

  const r = rng(55);

  // --- light shafts: additive gradient planes slanting down from the upper left/back
  const shafts: { mat: THREE.MeshBasicMaterial; phase: number; base: number }[] = [];
  if (spec.shafts) {
    const beamTex = toTexture(paintBeam(64, 256), { srgb: false, anisotropy });
    const spots = [
      [-8.5, -3.5, 2.6],
      [-6.2, -1.0, 1.8],
      [-4.4, -4.8, 2.2],
      [-1.8, -2.0, 1.4],
      [1.5, -5.2, 1.8],
      [4.2, -3.0, 1.2],
      [-10.5, 1.0, 2.0],
    ];
    const beamGeo = new THREE.PlaneGeometry(1, 1);
    for (const [x, z, w] of spots) {
      const mat = new THREE.MeshBasicMaterial({
        map: beamTex,
        color: new THREE.Color(spec.shafts.color),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(beamGeo, mat);
      const len = 13;
      mesh.scale.set(w!, len, 1);
      // top of beam up and back-left, bottom on the ground at (x, z)
      mesh.position.set(x! - 2.2, len * 0.45, z! - 2.0);
      mesh.rotation.set(-0.25, 0.15, -0.38);
      mesh.renderOrder = 5;
      group.add(mesh);
      shafts.push({ mat, phase: r() * 10, base: spec.shafts.opacity * (0.6 + r() * 0.6) * (x! < 0 ? 1.1 : 0.75) });
    }
  }

  // --- ambient particles
  const P = spec.particles;
  const N = P.count;
  const pos = new Float32Array(N * 3);
  const seed = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    if (P.kind === 'dust') {
      // more on the left (v1)
      pos[i * 3] = -13 + 25 * Math.pow(r(), 1.7);
      pos[i * 3 + 1] = r() * 5;
      pos[i * 3 + 2] = -7.5 + r() * 16;
    } else if (P.kind === 'embers') {
      const e = emitters.length && r() < 0.65 ? emitters[Math.floor(r() * emitters.length)]! : null;
      pos[i * 3] = e ? e.x + (r() - 0.5) * 1.4 : -14 + r() * 28;
      pos[i * 3 + 1] = r() * 6;
      pos[i * 3 + 2] = e ? e.z + (r() - 0.5) * 1.4 : -9 + r() * 17;
    } else {
      pos[i * 3] = -14 + r() * 28;
      pos[i * 3 + 1] = 0.35 + Math.pow(r(), 1.5) * 1.8;
      pos[i * 3 + 2] = -8 + r() * 15.5;
    }
    for (let k = 0; k < 4; k++) seed[i * 4 + k] = r();
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const dustUniforms = {
    uTime: { value: 0 },
    uScale: { value: 1000 },
    uColor: { value: P.color.clone() },
    uCool: { value: P.kind === 'embers' ? new THREE.Color(1.0, 0.18, 0.05).multiplyScalar(1.2) : P.color.clone() },
  };
  const vert = P.kind === 'dust' ? dustVert : P.kind === 'embers' ? emberVert : fireflyVert;
  const dust = new THREE.Points(
    dustGeo,
    new THREE.ShaderMaterial({ uniforms: dustUniforms, vertexShader: vert, fragmentShader: pointFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  dust.frustumCulled = false;
  dust.renderOrder = 6;
  dust.name = P.kind;
  group.add(dust);

  // --- haze (smoke banks / ground mist)
  let hazeUniforms: { uTime: { value: number }; uScale: { value: number } } | null = null;
  if (spec.haze) {
    const H = spec.haze;
    const hp = new Float32Array(H.count * 3);
    const hs = new Float32Array(H.count * 4);
    for (let i = 0; i < H.count; i++) {
      hp[i * 3] = -18 + r() * 36;
      if (H.kind === 'smoke') {
        hp[i * 3 + 1] = 1.5 + r() * 4;
        hp[i * 3 + 2] = -10 + r() * 6 + (r() < 0.3 ? r() * 14 : 0);
      } else {
        hp[i * 3 + 1] = 0.05 + r() * 0.35;
        hp[i * 3 + 2] = -9 + r() * 18;
      }
      for (let k = 0; k < 4; k++) hs[i * 4 + k] = r();
    }
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.BufferAttribute(hp, 3));
    hg.setAttribute('aSeed', new THREE.BufferAttribute(hs, 4));
    const u = {
      uTime: { value: 0 },
      uScale: { value: 1000 },
      uRise: { value: H.kind === 'smoke' ? 3.0 : 0.0 },
      uMap: { value: toTexture(paintMistPuff(128, 23), { srgb: false, anisotropy }) },
      uColor: { value: new THREE.Color(H.color) },
      uOpacity: { value: H.opacity },
    };
    hazeUniforms = u;
    const haze = new THREE.Points(hg, new THREE.ShaderMaterial({ uniforms: u, vertexShader: hazeVert, fragmentShader: hazeFrag, transparent: true, depthWrite: false }));
    haze.frustumCulled = false;
    haze.renderOrder = 7;
    haze.name = H.kind;
    group.add(haze);
  }

  return {
    object: group,
    sun,
    setViewport(h, fov) {
      const s = pointScale(h, fov);
      dustUniforms.uScale.value = s;
      if (hazeUniforms) hazeUniforms.uScale.value = s;
    },
    update(time) {
      dustUniforms.uTime.value = time;
      if (hazeUniforms) hazeUniforms.uTime.value = time;
      for (const s of shafts) {
        const pulse = 0.65 + 0.35 * Math.sin(time * 0.35 + s.phase) * Math.sin(time * 0.13 + s.phase * 2.0);
        s.mat.opacity = s.base * pulse;
      }
    },
  };
}
