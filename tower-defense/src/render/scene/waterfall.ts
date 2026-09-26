// The fall behind the portal: a tall waterfall (shrine) or lava-fall (forge) using the same scrolling
// streak shader, with a plunge pool and a rising mist / smoke plume; or a still moonlit pond (ruins).
import * as THREE from 'three';
import { PAL, type EnvPalette } from '../../art/env/palette';
import { paintMistPuff, toTexture } from '../../art/env/textures';
import { cliffBaseZ, CLIFF_HEIGHT, CLIFF_LEAN } from './backdrop';
import { pointScale, type WorldPart } from './util';

export type FallKind = 'water' | 'lava' | 'pond';

export const NOISE_GLSL = /* glsl */ `
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0)), c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm2(vec2 p) { return vnoise(p) * 0.55 + vnoise(p * 2.03 + 7.1) * 0.3 + vnoise(p * 4.1 + 3.7) * 0.15; }
`;

const fallVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const fallFrag = /* glsl */ `
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uFoam;
uniform vec3 uFog;
uniform float uHaze;
uniform float uBright;
varying vec2 vUv;
${NOISE_GLSL}
void main() {
  float x = vUv.x;
  float y = vUv.y;
  float s1 = vnoise(vec2(x * 26.0, y * 5.0 + uTime * 2.4));
  float s2 = vnoise(vec2(x * 11.0 + 3.0, y * 2.6 + uTime * 1.5));
  float s3 = fbm2(vec2(x * 40.0, y * 9.0 + uTime * 3.4));
  float v = s1 * 0.45 + s2 * 0.35 + s3 * 0.2;
  vec3 col = mix(uDeep, uFoam, smoothstep(0.32, 0.78, v));
  // bright streak highlights
  col += uFoam * smoothstep(0.72, 0.95, s3) * 0.6;
  // foamy base and lip
  float base = 1.0 - smoothstep(0.0, 0.1, y);
  float lip = smoothstep(0.93, 1.0, y);
  col = mix(col, uFoam, max(base * 0.6, lip * 0.4));
  float edge = smoothstep(0.0, 0.14, x) * smoothstep(1.0, 0.86, x);
  float ragged = smoothstep(0.05, 0.5, edge + (vnoise(vec2(x * 8.0, y * 30.0 + uTime * 6.0)) - 0.5) * 0.12);
  col = mix(col * uBright, uFog, uHaze);
  gl_FragColor = vec4(col, ragged * 0.95);
}`;

const poolVert = /* glsl */ `
varying vec3 vWorld;
varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const poolFrag = /* glsl */ `
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uWater;
uniform vec3 uFoam;
uniform vec3 uFog;
uniform float uHaze;
uniform vec2 uFall;
uniform float uRipple;
uniform float uFoamAmt;
uniform float uStreak;
uniform float uStreakX;
varying vec3 vWorld;
varying vec2 vUv;
${NOISE_GLSL}
void main() {
  vec2 p = vWorld.xz;
  vec2 d = p - uFall;
  float r = length(d * vec2(0.8, 1.6));
  // radial ripples spreading from the fall
  float rip = sin(r * 7.0 - uTime * 3.0 + vnoise(p * 1.5) * 3.0) * 0.5 + 0.5;
  float n = fbm2(p * 1.2 + vec2(uTime * 0.15, -uTime * 0.2));
  vec3 col = mix(uDeep, uWater, n * 0.8 + 0.2);
  col += uFoam * smoothstep(0.75, 1.0, rip) * 0.18 * (1.0 - smoothstep(0.5, 3.0, r)) * uRipple;
  // caustic glints
  float g = smoothstep(0.78, 0.9, fbm2(p * 3.0 + vec2(uTime * 0.3, uTime * 0.21)));
  col += uFoam * g * 0.35;
  // moon reflection streak (still pond)
  col += uFoam * uStreak * exp(-pow((p.x - uStreakX) * 1.3, 2.0)) * (0.3 + 0.7 * vnoise(vec2(p.x * 5.0, p.y * 16.0 + uTime * 0.9)));
  // foam where the fall hits
  float foam = (1.0 - smoothstep(0.2, 1.4, r)) * (0.6 + 0.4 * vnoise(p * 6.0 + uTime * 2.0)) * uFoamAmt;
  col = mix(col, uFoam * 1.1, foam);
  // soft shoreline
  vec2 e = vUv * 2.0 - 1.0;
  float edge = 1.0 - smoothstep(0.82, 1.0, length(e));
  col = mix(col, uFog, uHaze);
  gl_FragColor = vec4(col, edge);
}`;

const mistVert = /* glsl */ `
uniform float uTime;
uniform float uScale;
uniform float uRise;
uniform float uSpread;
uniform float uSize;
attribute vec4 aSeed;
varying float vAlpha;
varying float vRot;
void main() {
  float life = fract(uTime * (0.07 + aSeed.x * 0.06) + aSeed.y);
  vec3 p = position;
  p.y += life * (2.4 + aSeed.z * 2.2) * uRise;
  p.x += (aSeed.w - 0.5) * life * 3.0 * uSpread;
  p.z += life * 1.2;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float size = mix(1.2, 4.2, life) * (0.7 + aSeed.z * 0.6) * uSize;
  gl_PointSize = size * uScale / -mv.z;
  vAlpha = smoothstep(0.0, 0.15, life) * (1.0 - smoothstep(0.45, 1.0, life));
  vRot = aSeed.w * 6.28 + uTime * 0.1;
  gl_Position = projectionMatrix * mv;
}`;

const mistFrag = /* glsl */ `
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

export interface FallOptions {
  kind: FallKind;
  pal: EnvPalette;
  centerX: number;
  anisotropy: number;
}

/** Build the fall + pool + plume for a theme. Shrine (`water`) is exactly the v1 waterfall. */
export function buildFall({ kind, pal, centerX, anisotropy }: FallOptions): WorldPart {
  const group = new THREE.Group();
  group.name = kind === 'pond' ? 'pond' : kind === 'lava' ? 'lavafall' : 'waterfall';
  const fog = new THREE.Color(pal.fog);
  const lava = kind === 'lava';

  // --- falling curtain: leans back with the cliff, bulges slightly forward at the bottom
  const width = lava ? 3.0 : 3.3;
  const height = CLIFF_HEIGHT + 0.6;
  const baseZ = cliffBaseZ(centerX) + 0.45;
  let fallUniforms: Record<string, THREE.IUniform> | null = null;
  const fallSpeed = lava ? 0.32 : 1;
  if (kind !== 'pond') {
    const fallGeo = new THREE.PlaneGeometry(width, height, 10, 24);
    const pos = fallGeo.attributes.position!;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i) + height / 2 - 0.3;
      const curve = -((x / (width / 2)) ** 2) * 0.35;
      const bulge = Math.exp(-y * 0.9) * 0.45;
      pos.setXYZ(i, x + centerX, y, baseZ - y * CLIFF_LEAN + curve + bulge);
    }
    fallGeo.computeVertexNormals();
    fallUniforms = {
      uTime: { value: 0 },
      uDeep: { value: lava ? new THREE.Color(0x5a1406) : new THREE.Color(0x4f93a6) },
      uFoam: { value: lava ? new THREE.Color(1.0, 0.55, 0.16).multiplyScalar(2.3) : new THREE.Color(PAL.foam) },
      uFog: { value: fog },
      uHaze: { value: lava ? 0.03 : 0.12 },
      uBright: { value: lava ? 1.0 : 0.95 },
    };
    const fall = new THREE.Mesh(
      fallGeo,
      new THREE.ShaderMaterial({ uniforms: fallUniforms, vertexShader: fallVert, fragmentShader: fallFrag, transparent: true, depthWrite: false }),
    );
    fall.renderOrder = -1;
    group.add(fall);
  }

  // --- plunge pool / still pond
  const poolCenter = new THREE.Vector2(centerX, -8.1);
  const poolSpeed = lava ? 0.35 : kind === 'pond' ? 0.5 : 1;
  const poolUniforms = {
    uTime: { value: 0 },
    uDeep: { value: new THREE.Color(pal.waterDeep) },
    uWater: { value: lava ? new THREE.Color(pal.water).multiplyScalar(1.25) : new THREE.Color(pal.water) },
    uFoam: { value: lava ? new THREE.Color(1.0, 0.7, 0.3).multiplyScalar(2.0) : new THREE.Color(pal.foam) },
    uFog: { value: fog },
    uHaze: { value: lava ? 0.03 : kind === 'pond' ? 0.06 : 0.08 },
    uFall: { value: new THREE.Vector2(centerX, baseZ + 0.3) },
    uRipple: { value: kind === 'pond' ? 0.25 : 1 },
    uFoamAmt: { value: kind === 'pond' ? 0 : 1 },
    uStreak: { value: kind === 'pond' ? 0.85 : 0 },
    uStreakX: { value: centerX + 2.2 }, // under the moon
  };
  const pool = new THREE.Mesh(
    new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2),
    new THREE.ShaderMaterial({ uniforms: poolUniforms, vertexShader: poolVert, fragmentShader: poolFrag, transparent: true, depthWrite: false }),
  );
  if (kind === 'pond') pool.scale.set(5.0, 1, 2.3);
  else pool.scale.set(4.3, 1, 2.1);
  pool.position.set(poolCenter.x, 0.015, poolCenter.y);
  pool.renderOrder = -2;
  group.add(pool);

  // --- plume: mist (water), smoke (lava), low drifting mist (pond)
  const N = kind === 'pond' ? 36 : 44;
  const mpos = new Float32Array(N * 3);
  const seeds = new Float32Array(N * 4);
  let s = 12345;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < N; i++) {
    if (kind === 'pond') {
      mpos[i * 3] = centerX + (rnd() - 0.5) * 11;
      mpos[i * 3 + 1] = rnd() * 0.2;
      mpos[i * 3 + 2] = -8.1 + (rnd() - 0.5) * 3.6;
    } else {
      mpos[i * 3] = centerX + (rnd() - 0.5) * width * 1.3;
      mpos[i * 3 + 1] = rnd() * 0.4;
      mpos[i * 3 + 2] = baseZ + 0.3 + rnd() * 1.2;
    }
    for (let k = 0; k < 4; k++) seeds[i * 4 + k] = rnd();
  }
  const mistGeo = new THREE.BufferGeometry();
  mistGeo.setAttribute('position', new THREE.BufferAttribute(mpos, 3));
  mistGeo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  const mistUniforms = {
    uTime: { value: 0 },
    uScale: { value: 1000 },
    uMap: { value: toTexture(paintMistPuff(128, 11), { srgb: false, anisotropy }) },
    uColor: { value: new THREE.Color(lava ? 0x3b3b43 : kind === 'pond' ? 0x8e9ad0 : 0xd6eef4) },
    uOpacity: { value: lava ? 0.4 : kind === 'pond' ? 0.2 : 0.28 },
    uRise: { value: lava ? 1.7 : kind === 'pond' ? 0.18 : 1 },
    uSpread: { value: kind === 'pond' ? 1.8 : 1 },
    uSize: { value: lava ? 1.5 : kind === 'pond' ? 1.3 : 1 },
  };
  const mist = new THREE.Points(
    mistGeo,
    new THREE.ShaderMaterial({ uniforms: mistUniforms, vertexShader: mistVert, fragmentShader: mistFrag, transparent: true, depthWrite: false }),
  );
  mist.frustumCulled = false;
  mist.renderOrder = 1;
  group.add(mist);

  // --- warm bounce light from the molten pool
  let light: THREE.PointLight | null = null;
  if (lava) {
    light = new THREE.PointLight(0xff6a20, 16, 14, 1.3);
    light.position.set(centerX, 1.4, -7.4);
    group.add(light);
  }

  return {
    object: group,
    setViewport(h, fov) {
      mistUniforms.uScale.value = pointScale(h, fov);
    },
    update(time) {
      if (fallUniforms) fallUniforms.uTime!.value = time * fallSpeed;
      poolUniforms.uTime.value = time * poolSpeed;
      mistUniforms.uTime.value = lava ? time * 0.6 : kind === 'pond' ? time * 0.5 : time;
      if (light) light.intensity = 14 + 3 * Math.sin(time * 1.7) * Math.sin(time * 0.63 + 1.0);
    },
  };
}
