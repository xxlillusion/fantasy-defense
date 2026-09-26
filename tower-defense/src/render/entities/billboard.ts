// Camera-facing pixel billboards: shared texture/material/geometry helpers.
import * as THREE from 'three';
import type { SpriteSheet } from '../../art/sprites/pixelCanvas';

/** World units per sprite texel. 1 tile = 24 texels. Shared by every sprite so pixels match. */
export const TEXEL = 1 / 24;

/** Per-frame camera info shared by all billboards. */
export interface BillboardFrame {
  /** Yaw so planes stay parallel to the camera's image plane (no per-sprite convergence). */
  yaw: number;
  /** Vertical stretch compensating the camera pitch so texels look square on screen. */
  stretch: number;
  camera: THREE.Camera;
}

export function computeBillboardFrame(camera: THREE.Camera, out: BillboardFrame): BillboardFrame {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  out.yaw = Math.atan2(-dir.x, -dir.z);
  const pitch = Math.asin(Math.max(-1, Math.min(1, -dir.y)));
  out.stretch = Math.min(1.35, 1 / Math.max(0.2, Math.cos(pitch)));
  out.camera = camera;
  return out;
}

export function pixelTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.needsUpdate = true;
  return t;
}

export interface SheetTexture {
  readonly sheet: SpriteSheet;
  readonly texture: THREE.Texture;
}

const sheetTextures = new Map<SpriteSheet, SheetTexture>();

/** One GPU texture per sprite sheet, shared by every instance. */
export function sheetTexture(sheet: SpriteSheet): SheetTexture {
  let st = sheetTextures.get(sheet);
  if (!st) {
    st = { sheet, texture: pixelTexture(sheet.canvas) };
    sheetTextures.set(sheet, st);
  }
  return st;
}

export function disposeSheetTextures(): void {
  for (const st of sheetTextures.values()) st.texture.dispose();
  sheetTextures.clear();
}

/** Unit plane with its bottom edge at y = 0. */
export const BILLBOARD_GEOMETRY = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);

const VERT = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
uniform vec4 uFrame;
uniform float uFlip;
varying vec2 vUv;
void main() {
  vec2 uv0 = uv;
  if (uFlip > 0.5) uv0.x = 1.0 - uv0.x;
  vUv = uFrame.xy + uv0 * uFrame.zw;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform sampler2D map;
uniform vec4 uFrame;
uniform vec2 uSheet;
uniform vec3 uTint;
uniform vec3 uAdd;
uniform float uAlpha;
uniform float uWobble;
uniform float uTime;
uniform vec4 uOutline;
uniform float uCrack;
uniform float uSat;
varying vec2 vUv;

vec2 frameClamp(vec2 uv) {
  vec2 lo = uFrame.xy + 0.5 / uSheet;
  vec2 hi = uFrame.xy + uFrame.zw - 0.5 / uSheet;
  return clamp(uv, lo, hi);
}

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

// Distance to the nearest Voronoi edge (pixel-aligned cracked-ice pattern).
float crackEdge(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++)
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = hash2(i + g);
      float d = length(g + o - f);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
  return d2 - d1;
}

void main() {
  vec2 uv = vUv;
  if (uWobble > 0.0) {
    float ty = floor(uv.y * uSheet.y);
    uv.x += floor(sin(ty * 0.7 + uTime * 11.0) * uWobble + 0.5) / uSheet.x;
  }
  uv = frameClamp(uv);
  vec4 c = texture2D(map, uv);
  if (c.a < 0.5) {
    if (uOutline.a <= 0.0) discard;
    vec2 d = 1.0 / uSheet;
    float n = texture2D(map, frameClamp(uv + vec2(d.x, 0.0))).a
            + texture2D(map, frameClamp(uv - vec2(d.x, 0.0))).a
            + texture2D(map, frameClamp(uv + vec2(0.0, d.y))).a
            + texture2D(map, frameClamp(uv - vec2(0.0, d.y))).a;
    if (n < 0.5) discard;
    gl_FragColor = vec4(uOutline.rgb, uOutline.a);
  } else {
    vec3 col = c.rgb;
    if (uSat < 1.0) col = mix(vec3(dot(col, vec3(0.3, 0.59, 0.11))), col, uSat);
    col = col * uTint + uAdd;
    if (uCrack > 0.0) {
      vec2 tp = floor((uv - uFrame.xy) * uSheet);
      float e = crackEdge(tp / 5.0);
      vec3 ice = col * vec3(0.72, 0.9, 1.15) + vec3(0.06, 0.12, 0.2);
      col = mix(col, e < 0.16 ? vec3(0.85, 0.97, 1.0) : ice, uCrack);
    }
    gl_FragColor = vec4(col, uAlpha);
  }
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

let baseMaterial: THREE.ShaderMaterial | null = null;

function getBaseMaterial(): THREE.ShaderMaterial {
  if (!baseMaterial) {
    baseMaterial = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          map: { value: null },
          uFrame: { value: new THREE.Vector4(0, 0, 1, 1) },
          uSheet: { value: new THREE.Vector2(1, 1) },
          uFlip: { value: 0 },
          uTint: { value: new THREE.Color(1, 1, 1) },
          uAdd: { value: new THREE.Color(0, 0, 0) },
          uAlpha: { value: 1 },
          uWobble: { value: 0 },
          uTime: { value: 0 },
          uOutline: { value: new THREE.Vector4(0, 0, 0, 0) },
          uCrack: { value: 0 },
          uSat: { value: 1 },
        },
      ]),
      vertexShader: VERT,
      fragmentShader: FRAG,
      side: THREE.DoubleSide,
      fog: true,
    });
  }
  return baseMaterial;
}

/** A pixel sprite billboard standing on the ground. Pool and reuse these. */
export class Billboard {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  private sheet: SheetTexture | null = null;
  private frame = -1;
  private flip = false;
  /** Extra uniform scale (1 = native pixel size). */
  scale = 1;

  constructor() {
    this.material = getBaseMaterial().clone();
    this.mesh = new THREE.Mesh(BILLBOARD_GEOMETRY, this.material);
    this.mesh.frustumCulled = false;
  }

  private u<T>(name: string): T {
    return this.material.uniforms[name]!.value as T;
  }

  setSheet(st: SheetTexture): void {
    if (this.sheet === st) return;
    this.sheet = st;
    this.material.uniforms.map!.value = st.texture;
    this.u<THREE.Vector2>('uSheet').set(st.sheet.frameW * st.sheet.frames, st.sheet.frameH);
    this.frame = -1;
    this.setFrame(0, this.flip);
  }

  setFrame(index: number, flip: boolean): void {
    if (!this.sheet || (index === this.frame && flip === this.flip)) return;
    const n = this.sheet.sheet.frames;
    index = Math.max(0, Math.min(n - 1, index));
    this.frame = index;
    this.flip = flip;
    this.u<THREE.Vector4>('uFrame').set(index / n, 0, 1 / n, 1);
    this.material.uniforms.uFlip!.value = flip ? 1 : 0;
  }

  get frameW(): number {
    return this.sheet?.sheet.frameW ?? 0;
  }

  get frameH(): number {
    return this.sheet?.sheet.frameH ?? 0;
  }

  /** World height of the sprite as displayed. */
  worldHeight(f: BillboardFrame): number {
    return this.frameH * TEXEL * this.scale * f.stretch;
  }

  place(x: number, y: number, z: number, f: BillboardFrame): void {
    this.mesh.position.set(x, y, z);
    this.mesh.rotation.set(0, f.yaw, 0);
    this.mesh.scale.set(this.frameW * TEXEL * this.scale, this.frameH * TEXEL * this.scale * f.stretch, 1);
  }

  setTint(r: number, g: number, b: number): void {
    this.u<THREE.Color>('uTint').setRGB(r, g, b);
  }

  setAdd(r: number, g: number, b: number): void {
    this.u<THREE.Color>('uAdd').setRGB(r, g, b);
  }

  /** 0..1 opacity. Below 1 the sprite is blended (no depth write). */
  setAlpha(a: number): void {
    this.material.uniforms.uAlpha!.value = a;
    this.alpha = a;
    this.updateBlend();
    this.mesh.visible = a > 0.005;
  }

  private alpha = 1;
  private outlineA = 0;

  private updateBlend(): void {
    const blended = this.alpha < 0.999 || this.outlineA > 0;
    if (this.material.transparent !== blended) this.material.transparent = blended;
    this.material.depthWrite = this.alpha >= 0.999;
    this.mesh.renderOrder = blended ? 6 : 0;
  }

  /** Heat-shimmer: per-row horizontal offset amplitude in texels (0 = off). */
  setWobble(texels: number, time: number): void {
    this.material.uniforms.uWobble!.value = texels;
    this.material.uniforms.uTime!.value = time;
  }

  /** 1-texel silhouette outline (alpha 0 = off). */
  setOutline(color: number, alpha: number): void {
    const c = this.u<THREE.Vector4>('uOutline');
    c.set(((color >> 16) & 255) / 255, ((color >> 8) & 255) / 255, (color & 255) / 255, alpha);
    this.outlineA = alpha;
    this.updateBlend();
  }

  /** Cracked-ice overlay strength 0..1 (vulnerable). */
  setCrack(k: number): void {
    this.material.uniforms.uCrack!.value = k;
  }

  /** Saturation 1 = normal, 0 = grayscale. */
  setSaturation(s: number): void {
    this.material.uniforms.uSat!.value = s;
  }

  dispose(): void {
    this.material.dispose();
  }
}
