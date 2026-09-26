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
uniform vec3 uTint;
uniform vec3 uAdd;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(map, vUv);
  if (c.a < 0.5) discard;
  gl_FragColor = vec4(c.rgb * uTint + uAdd, 1.0);
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
          uFlip: { value: 0 },
          uTint: { value: new THREE.Color(1, 1, 1) },
          uAdd: { value: new THREE.Color(0, 0, 0) },
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

  setSheet(st: SheetTexture): void {
    if (this.sheet === st) return;
    this.sheet = st;
    this.material.uniforms.map!.value = st.texture;
    this.frame = -1;
    this.setFrame(0, this.flip);
  }

  setFrame(index: number, flip: boolean): void {
    if (!this.sheet || (index === this.frame && flip === this.flip)) return;
    const n = this.sheet.sheet.frames;
    this.frame = index;
    this.flip = flip;
    (this.material.uniforms.uFrame!.value as THREE.Vector4).set(index / n, 0, 1 / n, 1);
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
    (this.material.uniforms.uTint!.value as THREE.Color).setRGB(r, g, b);
  }

  setAdd(r: number, g: number, b: number): void {
    (this.material.uniforms.uAdd!.value as THREE.Color).setRGB(r, g, b);
  }

  dispose(): void {
    this.material.dispose();
  }
}
