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
    if (m.geometry) geometries.add(m.geometry);
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
