// Fixed 3/4 "miniature diorama" camera that fits the playfield on any aspect ratio.
import * as THREE from 'three';
import { GRID_COLS, GRID_ROWS } from '../../core/grid';

export const CAMERA = {
  fov: 30,
  /** Elevation angle above the horizon, degrees. */
  pitch: 35,
  near: 1,
  far: 220,
  /** NDC margin kept free around the fit points. */
  margin: 0.03,
} as const;

const HALF_W = GRID_COLS / 2;
const HALF_H = GRID_ROWS / 2;

/**
 * Points that must be on screen: the grid (with a hair of margin), a strip of foreground grass
 * below the front edge and the lower part of the waterfall / statues at the back.
 */
const FIT_POINTS = [
  new THREE.Vector3(-HALF_W - 0.25, 0, HALF_H + 0.2),
  new THREE.Vector3(HALF_W + 0.25, 0, HALF_H + 0.2),
  new THREE.Vector3(-HALF_W - 0.25, 0, -HALF_H),
  new THREE.Vector3(HALF_W + 0.25, 0, -HALF_H),
  // Foreground grass strip. Deep enough that the bottom HUD (tower bar) sits over blurred
  // foreground instead of the front path rows on small windows.
  new THREE.Vector3(0, 0, HALF_H + 2.8),
  new THREE.Vector3(0.5, 5.2, -10.2), // waterfall / cliff band above the portal
];

const tmp = new THREE.Vector3();

/** Position/aim the camera so FIT_POINTS fill the view for the given aspect. */
export function fitCamera(camera: THREE.PerspectiveCamera, aspect: number): void {
  camera.fov = CAMERA.fov;
  camera.near = CAMERA.near;
  camera.far = CAMERA.far;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();

  const pitch = THREE.MathUtils.degToRad(CAMERA.pitch);
  const dir = new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch));
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(CAMERA.fov / 2));
  const target = new THREE.Vector3(0, 0, 0.5);
  let dist = 30;
  const lim = 1 - CAMERA.margin;

  for (let iter = 0; iter < 40; iter++) {
    camera.position.copy(target).addScaledVector(dir, dist);
    camera.lookAt(target);
    camera.updateMatrixWorld(true);
    let ymin = Infinity;
    let ymax = -Infinity;
    let xmax = 0;
    for (const p of FIT_POINTS) {
      tmp.copy(p).project(camera);
      ymin = Math.min(ymin, tmp.y);
      ymax = Math.max(ymax, tmp.y);
      xmax = Math.max(xmax, Math.abs(tmp.x));
    }
    const scale = Math.max((ymax - ymin) / (2 * lim), xmax / lim);
    const centerY = (ymax + ymin) / 2;
    // shift the target along the ground so content is vertically centered
    target.z -= (centerY * dist * tanHalf) / Math.sin(pitch) * 0.8;
    dist *= 1 + (scale - 1) * 0.9;
    if (Math.abs(scale - 1) < 1e-4 && Math.abs(centerY) < 1e-4) break;
  }
  camera.position.copy(target).addScaledVector(dir, dist);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
}

/** View-space distance (along the camera axis) of a world point. */
export function viewDepth(camera: THREE.Camera, p: THREE.Vector3): number {
  return -tmp.copy(p).applyMatrix4(camera.matrixWorldInverse).z;
}

/** Screen UV (0..1, y up) of a world point. */
export function screenUv(camera: THREE.Camera, p: THREE.Vector3): THREE.Vector2 {
  tmp.copy(p).project(camera);
  return new THREE.Vector2(tmp.x * 0.5 + 0.5, tmp.y * 0.5 + 0.5);
}
