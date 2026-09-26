// Lighting, fog, volumetric-looking light shafts and floating dust motes.
import * as THREE from 'three';
import { PAL } from '../../art/env/palette';
import { paintBeam, toTexture } from '../../art/env/textures';
import { rng } from '../../art/env/noise';

export const ATMOS = {
  fogNear: 22,
  fogFar: 75,
  hemi: 2.1,
  sun: 3.0,
  ambient: 0.45,
  dustCount: 460,
  shaftOpacity: 0.2,
  fill: 0.7,
} as const;

const dustVert = /* glsl */ `
uniform float uTime;
uniform float uScale;
attribute vec4 aSeed;
varying float vAlpha;
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
  gl_Position = projectionMatrix * mv;
}`;

const dustFrag = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  a *= a;
  gl_FragColor = vec4(uColor * a * vAlpha, 1.0);
}`;

export interface Atmosphere {
  readonly group: THREE.Group;
  readonly sun: THREE.DirectionalLight;
  setViewport(heightPx: number, fovDeg: number): void;
  update(time: number): void;
}

export function applyFog(scene: THREE.Scene): void {
  scene.fog = new THREE.Fog(PAL.fog, ATMOS.fogNear, ATMOS.fogFar);
  scene.background = new THREE.Color(PAL.sky);
}

export function buildAtmosphere(anisotropy: number): Atmosphere {
  const group = new THREE.Group();
  group.name = 'atmosphere';

  // --- lights: soft overcast from above/behind, cool fill
  const hemi = new THREE.HemisphereLight(PAL.hemiSky, PAL.hemiGround, ATMOS.hemi);
  const ambient = new THREE.AmbientLight(0x9fc4cc, ATMOS.ambient);
  const sun = new THREE.DirectionalLight(PAL.sun, ATMOS.sun);
  sun.position.set(-8, 16, -10);
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
  // soft cool front fill (no shadows) so camera-facing surfaces aren't flat while backlit
  const fill = new THREE.DirectionalLight(0xbfdbe3, ATMOS.fill);
  fill.position.set(4, 8, 14);
  group.add(hemi, ambient, sun, sun.target, fill);

  // --- light shafts: additive gradient planes slanting down from the upper left/back
  const beamTex = toTexture(paintBeam(64, 256), { srgb: false, anisotropy });
  const shafts: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; phase: number; base: number }[] = [];
  const r = rng(55);
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
      color: new THREE.Color(0xdff3f7),
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
    shafts.push({ mesh, mat, phase: r() * 10, base: ATMOS.shaftOpacity * (0.6 + r() * 0.6) * (x! < 0 ? 1.1 : 0.75) });
  }

  // --- dust motes (more on the left)
  const N = ATMOS.dustCount;
  const pos = new Float32Array(N * 3);
  const seed = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = -13 + 25 * Math.pow(r(), 1.7);
    pos[i * 3 + 1] = r() * 5;
    pos[i * 3 + 2] = -7.5 + r() * 16;
    for (let k = 0; k < 4; k++) seed[i * 4 + k] = r();
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const dustUniforms = {
    uTime: { value: 0 },
    uScale: { value: 1000 },
    uColor: { value: new THREE.Color(PAL.dust).multiplyScalar(1.5) },
  };
  const dust = new THREE.Points(
    dustGeo,
    new THREE.ShaderMaterial({ uniforms: dustUniforms, vertexShader: dustVert, fragmentShader: dustFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  dust.frustumCulled = false;
  dust.renderOrder = 6;
  group.add(dust);

  return {
    group,
    sun,
    setViewport(h, fov) {
      dustUniforms.uScale.value = h / (2 * Math.tan(THREE.MathUtils.degToRad(fov / 2)));
    },
    update(time) {
      dustUniforms.uTime.value = time;
      for (const s of shafts) {
        const pulse = 0.65 + 0.35 * Math.sin(time * 0.35 + s.phase) * Math.sin(time * 0.13 + s.phase * 2.0);
        s.mat.opacity = s.base * pulse;
      }
    },
  };
}
