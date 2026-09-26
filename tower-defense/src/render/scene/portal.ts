// The portal (the base): a themed frame (shrine stone ring / forge molten ring / ruins broken arch)
// around a swirling cyan vortex. Brightness follows lives/maxLives; cracks spread as lives drop;
// it flashes and wobbles on leaks, pulses on wave clear, flares on victory and nearly dies on defeat.
import * as THREE from 'three';
import type { GamePhase, TileCoord } from '../../core/types';
import type { EnvPalette } from '../../art/env/palette';
import { paintSoftDot, paintSpirit, paintStone, toTexture } from '../../art/env/textures';
import { tileWorld } from './util';
import { NOISE_GLSL } from './waterfall';

/** The spirit girl is a pixel billboard owned by Stream C (v2); keep the old glow silhouette off. */
export const PORTAL_SPIRIT_SILHOUETTE = false;

export type PortalFrame = 'ring' | 'forge' | 'arch';

const vortexVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const vortexFrag = /* glsl */ `
uniform float uTime;
uniform float uLevel;
uniform float uCrack;
uniform float uFlash;
uniform float uWobble;
uniform vec3 uA;
uniform vec3 uB;
uniform vec3 uCore;
uniform vec3 uRim;
uniform vec3 uCrackCol;
varying vec2 vUv;
${NOISE_GLSL}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  // leak wobble: a quick ripple through the surface
  p += uWobble * 0.07 * vec2(sin(p.y * 11.0 + uTime * 31.0), cos(p.x * 13.0 - uTime * 27.0));
  float r = length(p);
  if (r > 1.0) discard;
  float a = atan(p.y, p.x);
  float s1 = sin(a * 3.0 - r * 9.0 + uTime * 2.2);
  float s2 = sin(a * 5.0 + r * 14.0 - uTime * 3.1 + s1 * 0.6);
  float s3 = sin(a * 2.0 - r * 5.0 - uTime * 1.3);
  float swirl = 0.5 + 0.22 * s1 + 0.18 * s2 + 0.1 * s3;
  float core = exp(-r * r * 5.0);
  float rim = smoothstep(0.72, 0.95, r) * (1.0 - smoothstep(0.95, 1.0, r));
  vec3 col = mix(uB, uA, swirl) * (0.25 + 0.95 * swirl * (1.0 - r * 0.45));
  col += uRim * rim * 1.4 + uCore * core * 0.9;

  // cracks: jagged fissures growing inward from the rim as lives are lost
  if (uCrack > 0.001) {
    float crack = 0.0;
    float glow = 0.0;
    for (int k = 0; k < 2; k++) {
      float fk = float(k);
      float n = k == 0 ? 7.0 : 12.0;
      float sa = (a / 6.2831853 + 0.5) * n;
      float id = floor(sa);
      float h1 = hash21(vec2(id + 3.0, fk * 7.0 + 1.0));
      float h2 = hash21(vec2(id + 11.0, fk * 3.0 + 5.0));
      float center = 0.3 + 0.4 * h1 + (vnoise(vec2(r * 8.0, id * 3.7 + fk * 19.0)) - 0.5) * 0.5;
      float dArc = abs(fract(sa) - center) / n * 6.2831853 * max(r, 0.05);
      float appear = step(h2 * (k == 0 ? 0.85 : 1.4), uCrack);
      float reach = min(1.0, uCrack * (k == 0 ? 1.15 : 0.6) * (0.6 + 0.6 * h2));
      float inner = 1.0 - reach;
      float along = smoothstep(inner - 0.02, inner + 0.1, r);
      float w = 0.008 + 0.022 * clamp((r - inner) / max(reach, 0.05), 0.0, 1.0);
      crack = max(crack, (1.0 - smoothstep(w * 0.5, w, dArc)) * along * appear);
      glow = max(glow, (1.0 - smoothstep(w, w * 4.0, dArc)) * along * appear);
    }
    col *= 1.0 - crack * 0.92;
    col += uCrackCol * max(0.0, glow - crack) * (0.35 + 0.5 * uCrack);
  }
  // leak flash (warm-white with a hurt tint)
  col += vec3(1.0, 0.6, 0.65) * uFlash * (0.5 + 0.6 * (1.0 - r));
  float edge = smoothstep(1.0, 0.88, r);
  gl_FragColor = vec4(col * uLevel * edge, 1.0);
}`;

export interface Portal {
  readonly group: THREE.Group;
  update(dt: number, time: number, lifeFrac: number, phase: GamePhase): void;
  /** An enemy leaked: flash + wobble. */
  leak(): void;
  /** Wave cleared: bright pulse. */
  pulse(): void;
}

const RING_Y = 0.74;

interface FrameResult {
  studMat: THREE.MeshBasicMaterial;
  studColor: THREE.Color;
  /** Called per frame with the portal light level L (~0..1.7). */
  update?(L: number, time: number): void;
}

function ringFrame(group: THREE.Group, pal: EnvPalette, anisotropy: number): FrameResult {
  const stoneTex = toTexture(paintStone(256, 9, false), { anisotropy, repeat: true });
  const stoneMat = new THREE.MeshStandardMaterial({ color: pal.statue, map: stoneTex, roughness: 0.9, metalness: 0, emissive: new THREE.Color(pal.portal), emissiveIntensity: 0.04 });
  // dais + ring frame + small side blocks
  const dais = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.5, 0.1, 28), stoneMat);
  dais.position.y = 0.05;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.075, 10, 48), stoneMat);
  ring.position.y = RING_Y;
  const blockGeo = new THREE.BoxGeometry(0.2, 0.34, 0.22);
  const blocks = [-1, 1].map((s) => {
    const b = new THREE.Mesh(blockGeo, stoneMat);
    b.position.set(s * 0.33, 0.22, 0);
    b.rotation.z = s * 0.2;
    return b;
  });
  // rune studs on the ring
  const studGeo = new THREE.OctahedronGeometry(0.05, 0);
  const studColor = new THREE.Color(pal.portal);
  const studMat = new THREE.MeshBasicMaterial({ color: studColor.clone().multiplyScalar(1.6), fog: false });
  const studs: THREE.Mesh[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const s = new THREE.Mesh(studGeo, studMat);
    s.position.set(Math.cos(a) * 0.52, RING_Y + Math.sin(a) * 0.52, 0.07);
    studs.push(s);
  }
  for (const m of [dais, ring, ...blocks]) {
    m.castShadow = true;
    m.receiveShadow = true;
  }
  group.add(dais, ring, ...blocks, ...studs);
  return { studMat, studColor };
}

/** Forge heart: blackened iron dais, a molten torus with radiating iron spikes and hot rivets. */
function forgeFrame(group: THREE.Group, _pal: EnvPalette, anisotropy: number): FrameResult {
  const stoneTex = toTexture(paintStone(256, 9, false), { anisotropy, repeat: true });
  const iron = new THREE.MeshStandardMaterial({ color: 0x3a3a40, map: stoneTex, roughness: 0.5, metalness: 0.65 });
  const moltenColor = new THREE.Color(1.0, 0.42, 0.1);
  const molten = new THREE.MeshStandardMaterial({ color: 0x2a2020, map: stoneTex, roughness: 0.6, metalness: 0.3, emissive: moltenColor, emissiveIntensity: 1.5 });
  const hot = new THREE.MeshBasicMaterial({ color: moltenColor.clone().multiplyScalar(2.4) });
  const dais = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.56, 0.12, 8), iron);
  dais.position.y = 0.06;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.53, 0.085, 10, 48), molten);
  ring.position.y = RING_Y;
  const inner = new THREE.Mesh(new THREE.TorusGeometry(0.465, 0.018, 6, 48), hot);
  inner.position.set(0, RING_Y, 0.03);
  const spikeGeo = new THREE.ConeGeometry(0.05, 0.2, 5);
  const parts: THREE.Mesh[] = [dais, ring];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 10;
    if (Math.sin(a) < -0.6) continue; // leave the base open
    const s = new THREE.Mesh(spikeGeo, iron);
    s.position.set(Math.cos(a) * 0.68, RING_Y + Math.sin(a) * 0.68, 0);
    s.rotation.z = a - Math.PI / 2;
    parts.push(s);
  }
  const legGeo = new THREE.BoxGeometry(0.16, 0.36, 0.2);
  for (const s of [-1, 1]) {
    const b = new THREE.Mesh(legGeo, iron);
    b.position.set(s * 0.34, 0.23, 0);
    b.rotation.z = s * 0.25;
    parts.push(b);
  }
  const studGeo = new THREE.OctahedronGeometry(0.045, 0);
  const studColor = new THREE.Color(1.0, 0.55, 0.2);
  const studMat = new THREE.MeshBasicMaterial({ color: studColor.clone().multiplyScalar(1.6) });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const s = new THREE.Mesh(studGeo, studMat);
    s.position.set(Math.cos(a) * 0.53, RING_Y + Math.sin(a) * 0.53, 0.08);
    group.add(s);
  }
  for (const m of parts) {
    m.castShadow = true;
    m.receiveShadow = true;
  }
  group.add(...parts, inner);
  return {
    studMat,
    studColor,
    update(L, time) {
      molten.emissiveIntensity = (0.35 + 0.75 * Math.min(1.4, L)) * (0.9 + 0.1 * Math.sin(time * 2.3));
      hot.color.copy(moltenColor).multiplyScalar(0.4 + 1.1 * Math.min(1.4, L));
    },
  };
}

/** Ruined arch: two weathered pillars, an arch broken off on the right, a fallen keystone. */
function archFrame(group: THREE.Group, pal: EnvPalette, anisotropy: number): FrameResult {
  const stoneTex = toTexture(paintStone(256, 9, false), { anisotropy, repeat: true });
  const stoneMat = new THREE.MeshStandardMaterial({ color: pal.statue, map: stoneTex, roughness: 0.95, metalness: 0, emissive: new THREE.Color(pal.portal), emissiveIntensity: 0.05 });
  const parts: THREE.Mesh[] = [];
  const add = (geo: THREE.BufferGeometry, x: number, y: number, z: number, rz = 0, ry = 0) => {
    const m = new THREE.Mesh(geo, stoneMat);
    m.position.set(x, y, z);
    m.rotation.set(0, ry, rz);
    parts.push(m);
    return m;
  };
  add(new THREE.BoxGeometry(1.5, 0.1, 0.5), 0, 0.05, 0);
  add(new THREE.BoxGeometry(0.22, 0.74, 0.26), -0.61, 0.1 + 0.37, 0);
  add(new THREE.BoxGeometry(0.22, 0.6, 0.26), 0.61, 0.1 + 0.3, 0, 0.03);
  add(new THREE.BoxGeometry(0.28, 0.08, 0.3), -0.61, 0.86, 0);
  // arch from the left pillar over the top, snapped off on the right
  const arch = add(new THREE.TorusGeometry(0.61, 0.09, 8, 28, Math.PI * 0.7), 0, RING_Y + 0.1, 0);
  arch.rotation.z = Math.PI * 0.3;
  // fallen pieces
  add(new THREE.BoxGeometry(0.22, 0.16, 0.26), 0.78, 0.08, 0.3, 0.3, 0.7);
  add(new THREE.BoxGeometry(0.14, 0.12, 0.16), 0.55, 0.06, 0.45, 0.1, 1.9);
  for (const m of parts) {
    m.castShadow = true;
    m.receiveShadow = true;
  }
  group.add(...parts);
  // glowing runes carved into the pillars
  const studColor = new THREE.Color(pal.portal);
  const studMat = new THREE.MeshBasicMaterial({ color: studColor.clone().multiplyScalar(1.6), fog: false });
  const runeGeo = new THREE.BoxGeometry(0.06, 0.1, 0.01);
  for (const [x, y] of [[-0.61, 0.35], [-0.61, 0.6], [0.61, 0.3], [0.61, 0.52]] as const) {
    const s = new THREE.Mesh(runeGeo, studMat);
    s.position.set(x, y, 0.135);
    group.add(s);
  }
  return { studMat, studColor };
}

export function buildPortal(tile: TileCoord, pal: EnvPalette, frameKind: PortalFrame, anisotropy: number): Portal {
  const group = new THREE.Group();
  group.name = 'portal';
  const c = tileWorld(tile);
  group.position.copy(c);
  // wobble scales this inner group so the base stays planted
  const body = new THREE.Group();
  group.add(body);

  const frame = frameKind === 'forge' ? forgeFrame(body, pal, anisotropy) : frameKind === 'arch' ? archFrame(body, pal, anisotropy) : ringFrame(body, pal, anisotropy);

  // vortex disc
  const uniforms = {
    uTime: { value: 0 },
    uLevel: { value: 1 },
    uCrack: { value: 0 },
    uFlash: { value: 0 },
    uWobble: { value: 0 },
    uA: { value: new THREE.Color(pal.portal) },
    uB: { value: new THREE.Color(0x1d5f80) },
    uCore: { value: new THREE.Color(pal.portalCore) },
    uRim: { value: frameKind === 'forge' ? new THREE.Color(1.0, 0.5, 0.16).multiplyScalar(0.55) : new THREE.Color(pal.portal) },
    uCrackCol: { value: new THREE.Color(1.0, 0.42, 0.5) },
  };
  const vortexMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: vortexVert,
    fragmentShader: vortexFrag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.47, 48), vortexMat);
  disc.position.set(0, RING_Y, 0.0);
  disc.renderOrder = 2;
  body.add(disc);

  // (legacy) spirit silhouette
  let spirit: THREE.Mesh | null = null;
  let spiritMat: THREE.MeshBasicMaterial | null = null;
  if (PORTAL_SPIRIT_SILHOUETTE) {
    spiritMat = new THREE.MeshBasicMaterial({
      map: toTexture(paintSpirit(), { anisotropy }),
      color: new THREE.Color(0xeafcff).multiplyScalar(1.4),
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    spirit = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.57), spiritMat);
    spirit.position.set(0, RING_Y - 0.02, 0.03);
    spirit.renderOrder = 3;
    body.add(spirit);
  }

  // glow halo + ground pool of light
  const dotTex = toTexture(paintSoftDot(128), { anisotropy });
  const haloMat = new THREE.SpriteMaterial({ map: dotTex, color: new THREE.Color(pal.portal), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const halo = new THREE.Sprite(haloMat);
  halo.scale.set(2.6, 2.6, 1);
  halo.position.set(0, RING_Y, 0.05);
  halo.renderOrder = 1;
  group.add(halo);
  const floorMat = new THREE.MeshBasicMaterial({ map: dotTex, color: new THREE.Color(pal.portal), transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.4).rotateX(-Math.PI / 2), floorMat);
  floor.position.y = 0.02;
  floor.renderOrder = 1;
  group.add(floor);

  // orbiting sparks
  const SPARKS = 28;
  const sparkPos = new Float32Array(SPARKS * 3);
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparkMat = new THREE.PointsMaterial({ map: dotTex, color: new THREE.Color(pal.portalCore).multiplyScalar(2), size: 0.09, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.frustumCulled = false;
  body.add(sparks);
  const sparkSeed = Array.from({ length: SPARKS }, (_, i) => ({ a: (i / SPARKS) * Math.PI * 2, s: 0.4 + ((i * 37) % 11) / 11, r: 0.56 + ((i * 17) % 7) / 40, y: ((i * 13) % 9) / 9 }));

  const light = new THREE.PointLight(pal.portal, 10, 9, 1.6);
  light.position.set(0, RING_Y, 0.6);
  group.add(light);

  let level = 1;
  let dim = 1;
  let crack = 0;
  let flash = 0;
  let wobble = 0;
  let pulse = 0;
  const portalColor = new THREE.Color(pal.portal);
  const hurtColor = new THREE.Color(1, 0.55, 0.6);
  return {
    group,
    leak() {
      flash = Math.min(1.2, flash + 0.9);
      wobble = 1;
    },
    pulse() {
      pulse = 1;
    },
    update(dt, time, lifeFrac, phase) {
      let target: number;
      if (phase === 'title') target = 1.35 + 0.15 * Math.sin(time * 1.7);
      else if (phase === 'defeat') target = 0.05;
      else if (phase === 'victory') target = 1.7 + 0.25 * Math.sin(time * 3.1);
      else target = 0.18 + 0.82 * Math.max(0, Math.min(1, lifeFrac));
      level += (target - level) * Math.min(1, dt * 2.5);
      dim += ((phase === 'defeat' ? 0.12 : 1) - dim) * Math.min(1, dt * 1.5);
      const crackTarget = phase === 'title' ? 0 : 1 - Math.max(0, Math.min(1, lifeFrac));
      crack += (crackTarget - crack) * Math.min(1, dt * 3);
      flash *= Math.exp(-dt * 5.5);
      wobble = Math.max(0, wobble - dt * 2.4);
      pulse = Math.max(0, pulse - dt / 1.3);
      const pz = pulse * pulse * (3 - 2 * pulse); // smooth fall-off
      // weak portals flicker a little
      const flicker = level < 0.55 ? 1 - (0.55 - level) * 0.5 * (0.5 + 0.5 * Math.sin(time * 23.0) * Math.sin(time * 7.3)) : 1;
      const L = level * flicker * dim + pz * 0.9 + flash * 0.25;
      uniforms.uTime.value = time;
      uniforms.uLevel.value = (0.35 + level * flicker * 0.95) * dim + pz * 0.9;
      uniforms.uCrack.value = crack;
      uniforms.uFlash.value = flash;
      uniforms.uWobble.value = wobble;
      const w = 1 + Math.sin(time * 38) * 0.05 * wobble;
      body.scale.set(w, 2 - w, 1);
      if (spirit && spiritMat) {
        spiritMat.opacity = 0.18 + 0.42 * Math.min(1.2, L);
        spirit.position.y = RING_Y - 0.02 + Math.sin(time * 1.4) * 0.03;
      }
      haloMat.opacity = Math.min(1, 0.2 + 0.45 * L);
      halo.scale.setScalar(2.1 + 0.8 * L + pz * 1.6 + Math.sin(time * 2.0) * 0.08);
      haloMat.color.copy(portalColor).lerp(hurtColor, Math.min(1, flash * 0.6));
      floorMat.opacity = Math.min(1, 0.15 + 0.4 * L);
      frame.studMat.color.copy(frame.studColor).multiplyScalar(0.4 + 1.4 * L);
      frame.update?.(L, time);
      light.intensity = 2 + 12 * L;
      sparkMat.opacity = Math.min(1, 0.2 + 0.8 * L);
      for (let i = 0; i < SPARKS; i++) {
        const s = sparkSeed[i]!;
        const a = s.a + time * s.s * (i % 2 ? 1 : -0.7) * (1 + pz * 2);
        const rr = s.r + Math.sin(time * 1.3 + i) * 0.05 + pz * 0.25;
        const lift = ((time * 0.25 * s.s + s.y) % 1) * 0.25;
        sparkPos[i * 3] = Math.cos(a) * rr;
        sparkPos[i * 3 + 1] = RING_Y + Math.sin(a) * rr + lift;
        sparkPos[i * 3 + 2] = 0.05 + Math.sin(a * 2) * 0.08;
      }
      sparkGeo.attributes.position!.needsUpdate = true;
    },
  };
}
