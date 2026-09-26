// The shrine portal (the base): stone ring + swirling cyan vortex shader + faint spirit-girl silhouette.
// Brightness follows lives/maxLives and flares on the title screen.
import * as THREE from 'three';
import type { GamePhase, TileCoord } from '../../core/types';
import { PAL } from '../../art/env/palette';
import { paintSoftDot, paintSpirit, paintStone, toTexture } from '../../art/env/textures';
import { tileWorld } from './util';

const vortexVert = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const vortexFrag = /* glsl */ `
uniform float uTime;
uniform float uLevel;
uniform vec3 uA;
uniform vec3 uB;
uniform vec3 uCore;
varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
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
  col += uA * rim * 1.4 + uCore * core * 0.9;
  float edge = smoothstep(1.0, 0.88, r);
  gl_FragColor = vec4(col * uLevel * edge, 1.0);
}`;

export interface Portal {
  readonly group: THREE.Group;
  update(dt: number, time: number, lifeFrac: number, phase: GamePhase): void;
}

export function buildPortal(tile: TileCoord, anisotropy: number): Portal {
  const group = new THREE.Group();
  group.name = 'portal';
  const c = tileWorld(tile);
  group.position.copy(c);

  const stoneTex = toTexture(paintStone(256, 9, false), { anisotropy, repeat: true });
  const stoneMat = new THREE.MeshStandardMaterial({ color: PAL.statue, map: stoneTex, roughness: 0.9, metalness: 0, emissive: new THREE.Color(PAL.portal), emissiveIntensity: 0.04 });

  const ringY = 0.74;
  // dais + ring frame + small side blocks
  const dais = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.5, 0.1, 28), stoneMat);
  dais.position.y = 0.05;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.075, 10, 48), stoneMat);
  ring.position.y = ringY;
  const blockGeo = new THREE.BoxGeometry(0.2, 0.34, 0.22);
  const blocks = [-1, 1].map((s) => {
    const b = new THREE.Mesh(blockGeo, stoneMat);
    b.position.set(s * 0.33, 0.22, 0);
    b.rotation.z = s * 0.2;
    return b;
  });
  // rune studs on the ring
  const studGeo = new THREE.OctahedronGeometry(0.05, 0);
  const studMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PAL.portal).multiplyScalar(1.6), fog: false });
  const studs: THREE.Mesh[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const s = new THREE.Mesh(studGeo, studMat);
    s.position.set(Math.cos(a) * 0.52, ringY + Math.sin(a) * 0.52, 0.07);
    studs.push(s);
  }
  for (const m of [dais, ring, ...blocks]) {
    m.castShadow = true;
    m.receiveShadow = true;
  }
  group.add(dais, ring, ...blocks, ...studs);

  // vortex disc
  const uniforms = {
    uTime: { value: 0 },
    uLevel: { value: 1 },
    uA: { value: new THREE.Color(PAL.portal) },
    uB: { value: new THREE.Color(0x1d5f80) },
    uCore: { value: new THREE.Color(PAL.portalCore) },
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
  disc.position.set(0, ringY, 0.0);
  disc.renderOrder = 2;
  group.add(disc);

  // spirit silhouette
  const spiritMat = new THREE.MeshBasicMaterial({
    map: toTexture(paintSpirit(), { anisotropy }),
    color: new THREE.Color(0xeafcff).multiplyScalar(1.4),
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const spirit = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.57), spiritMat);
  spirit.position.set(0, ringY - 0.02, 0.03);
  spirit.renderOrder = 3;
  group.add(spirit);

  // glow halo + ground pool of light
  const dotTex = toTexture(paintSoftDot(128), { anisotropy });
  const haloMat = new THREE.SpriteMaterial({ map: dotTex, color: new THREE.Color(PAL.portal), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const halo = new THREE.Sprite(haloMat);
  halo.scale.set(2.6, 2.6, 1);
  halo.position.set(0, ringY, 0.05);
  halo.renderOrder = 1;
  group.add(halo);
  const floorMat = new THREE.MeshBasicMaterial({ map: dotTex, color: new THREE.Color(PAL.portal), transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.4).rotateX(-Math.PI / 2), floorMat);
  floor.position.y = 0.02;
  floor.renderOrder = 1;
  group.add(floor);

  // orbiting sparks
  const SPARKS = 28;
  const sparkPos = new Float32Array(SPARKS * 3);
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  const sparkMat = new THREE.PointsMaterial({ map: dotTex, color: new THREE.Color(PAL.portalCore).multiplyScalar(2), size: 0.09, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.frustumCulled = false;
  group.add(sparks);
  const sparkSeed = Array.from({ length: SPARKS }, (_, i) => ({ a: (i / SPARKS) * Math.PI * 2, s: 0.4 + ((i * 37) % 11) / 11, r: 0.56 + ((i * 17) % 7) / 40, y: ((i * 13) % 9) / 9 }));

  const light = new THREE.PointLight(PAL.portal, 10, 9, 1.6);
  light.position.set(0, ringY, 0.6);
  group.add(light);

  let level = 1;
  return {
    group,
    update(dt, time, lifeFrac, phase) {
      let target: number;
      if (phase === 'title') target = 1.35 + 0.15 * Math.sin(time * 1.7);
      else if (phase === 'defeat') target = 0.1;
      else if (phase === 'victory') target = 1.25;
      else target = 0.18 + 0.82 * Math.max(0, Math.min(1, lifeFrac));
      level += (target - level) * Math.min(1, dt * 2.5);
      // weak portals flicker a little
      const flicker = level < 0.55 ? 1 - (0.55 - level) * 0.5 * (0.5 + 0.5 * Math.sin(time * 23.0) * Math.sin(time * 7.3)) : 1;
      const L = level * flicker;
      uniforms.uTime.value = time;
      uniforms.uLevel.value = 0.35 + L * 0.95;
      spiritMat.opacity = 0.18 + 0.42 * Math.min(1.2, L);
      spirit.position.y = ringY - 0.02 + Math.sin(time * 1.4) * 0.03;
      haloMat.opacity = 0.2 + 0.45 * L;
      halo.scale.setScalar(2.1 + 0.8 * L + Math.sin(time * 2.0) * 0.08);
      floorMat.opacity = 0.15 + 0.4 * L;
      studMat.color.set(PAL.portal).multiplyScalar(0.4 + 1.4 * L);
      light.intensity = 2 + 12 * L;
      sparkMat.opacity = Math.min(1, 0.2 + 0.8 * L);
      for (let i = 0; i < SPARKS; i++) {
        const s = sparkSeed[i]!;
        const a = s.a + time * s.s * (i % 2 ? 1 : -0.7);
        const rr = s.r + Math.sin(time * 1.3 + i) * 0.05;
        const lift = ((time * 0.25 * s.s + s.y) % 1) * 0.25;
        sparkPos[i * 3] = Math.cos(a) * rr;
        sparkPos[i * 3 + 1] = ringY + Math.sin(a) * rr + lift;
        sparkPos[i * 3 + 2] = 0.05 + Math.sin(a * 2) * 0.08;
      }
      sparkGeo.attributes.position!.needsUpdate = true;
    },
  };
}
