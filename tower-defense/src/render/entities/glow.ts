// Soft additive glow quads (aura discs on the ground, halos around sprites).
import * as THREE from 'three';

let tex: THREE.CanvasTexture | null = null;

export function glowTexture(): THREE.CanvasTexture {
  if (tex) return tex;
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const flatGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const upGeo = new THREE.PlaneGeometry(1, 1);

/** Additive glow quad. `flat` lies on the ground; otherwise it should be yawed toward the camera. */
export function createGlow(color: number, opacity: number, flat: boolean): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const mat = new THREE.MeshBasicMaterial({
    map: glowTexture(),
    color,
    opacity,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const m = new THREE.Mesh(flat ? flatGeo : upGeo, mat);
  m.frustumCulled = false;
  m.renderOrder = flat ? 0 : 5;
  return m;
}

export function disposeGlow(): void {
  tex?.dispose();
  tex = null;
}
