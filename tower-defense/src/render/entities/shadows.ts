// Soft dark blob contact shadows lying on the ground plane.
import * as THREE from 'three';

let texture: THREE.CanvasTexture | null = null;
let geometry: THREE.PlaneGeometry | null = null;
const materials = new Map<number, THREE.MeshBasicMaterial>();

function blobTexture(): THREE.CanvasTexture {
  if (texture) return texture;
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(10,8,20,1)');
  g.addColorStop(0.45, 'rgba(10,8,20,0.75)');
  g.addColorStop(1, 'rgba(10,8,20,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function shadowMaterial(opacity: number): THREE.MeshBasicMaterial {
  const key = Math.round(opacity * 100);
  let m = materials.get(key);
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      map: blobTexture(),
      transparent: true,
      opacity,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    materials.set(key, m);
  }
  return m;
}

/** A blob shadow mesh (1x1 world units before scaling; scale x/z to set its footprint). */
export function createShadow(opacity = 0.5): THREE.Mesh {
  geometry ??= new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geometry, shadowMaterial(opacity));
  m.renderOrder = -1;
  m.frustumCulled = false;
  return m;
}

export function setShadowOpacity(mesh: THREE.Mesh, opacity: number): void {
  mesh.material = shadowMaterial(opacity);
}

export function disposeShadows(): void {
  texture?.dispose();
  texture = null;
  geometry?.dispose();
  geometry = null;
  for (const m of materials.values()) m.dispose();
  materials.clear();
}
