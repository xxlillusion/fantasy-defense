// Shared helpers for the environment scene (Stream B).
import * as THREE from 'three';
import { toWorld } from '../../core/grid';
import type { TileCoord } from '../../core/types';

/** World-space center of a tile on the ground plane. */
export function tileWorld(t: TileCoord, y = 0): THREE.Vector3 {
  const w = toWorld({ x: t.col + 0.5, y: t.row + 0.5 }, y);
  return new THREE.Vector3(w.x, w.y, w.z);
}

/** Paint a flat vertex color over a geometry (adds/overwrites the `color` attribute). */
export function paint(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation): THREE.BufferGeometry {
  const c = new THREE.Color(color);
  const n = geo.attributes.position!.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** Keep only position/normal/uv/color and make non-indexed, so geometries can be merged. */
export function normalizeForMerge(geo: THREE.BufferGeometry, withColor = true): THREE.BufferGeometry {
  let g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv' && !(withColor && name === 'color')) g.deleteAttribute(name);
  }
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position!.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  g.clearGroups();
  g = g as THREE.BufferGeometry;
  return g;
}

/** Dispose every geometry, material and texture reachable from `root`. */
export function disposeTree(root: THREE.Object3D): void {
  const textures = new Set<THREE.Texture>();
  const materials = new Set<THREE.Material>();
  const geometries = new Set<THREE.BufferGeometry>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    // three's Sprite geometry is a shared module singleton: leave it alone
    if (m.geometry && !(o as THREE.Sprite).isSprite) geometries.add(m.geometry);
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (mat) for (const x of Array.isArray(mat) ? mat : [mat]) materials.add(x);
  });
  for (const mat of materials) {
    for (const v of Object.values(mat)) if (v instanceof THREE.Texture) textures.add(v);
    const uniforms = (mat as THREE.ShaderMaterial).uniforms;
    if (uniforms) for (const u of Object.values(uniforms)) if (u && u.value instanceof THREE.Texture) textures.add(u.value);
    mat.dispose();
  }
  for (const g of geometries) g.dispose();
  for (const t of textures) t.dispose();
}

/** Tube along a curve whose radius tapers from r0 to r1. */
export function taperedTube(points: THREE.Vector3[], r0: number, r1: number, tubular = 24, radial = 6, flatten = 1): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points);
  const geo = new THREE.TubeGeometry(curve, tubular, 1, radial, false);
  const pos = geo.attributes.position!;
  const frames = curve.computeFrenetFrames(tubular, false);
  const v = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i <= tubular; i++) {
    curve.getPointAt(i / tubular, c);
    const r = r0 + (r1 - r0) * (i / tubular);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, k).sub(c);
      // flatten along the binormal to make blade-like crests
      const b = frames.binormals[i]!;
      const along = v.dot(b);
      v.addScaledVector(b, along * (flatten - 1));
      v.multiplyScalar(r);
      pos.setXYZ(k, c.x + v.x, c.y + v.y, c.z + v.z);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

/** A built piece of the world with optional per-frame animation. */
export interface WorldPart {
  readonly object: THREE.Object3D;
  /** time = ambient seconds, dt = real seconds since last frame. */
  update?(time: number, dt: number): void;
  /** For screen-size-scaled points (drawing-buffer height in px, vertical fov in degrees). */
  setViewport?(heightPx: number, fovDeg: number): void;
}

/** Point-size scale for `gl_PointSize = size * uScale / -mv.z`. */
export function pointScale(heightPx: number, fovDeg: number): number {
  return heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg / 2)));
}

/** Dispose lights' shadow maps (disposeTree only handles meshes/materials/textures). */
export function disposeLights(root: THREE.Object3D): void {
  root.traverse((o) => {
    const l = o as THREE.Light;
    if (l.isLight) l.dispose();
  });
}
