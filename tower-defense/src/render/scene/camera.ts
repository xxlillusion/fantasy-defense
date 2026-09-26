// Fixed 3/4 "miniature diorama" camera that fits the playfield on any aspect ratio, plus a closer,
// lower "party lineup" title pose in front of the portal. Poses are computed with a scratch camera
// and blended by the environment.
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

/** Title pose: low, close, looking at the back rows with the portal and the fall in the upper third. */
export const TITLE_CAMERA = {
  pitch: 29,
  /** Half-width (tiles) of the lineup area either side of the portal (fits the view width). */
  halfWidth: 6.2,
  /** Front edge of the framed area, in rows from the back (row 0). */
  frontRow: 5.4,
  /** NDC y where the front edge sits (bottom of the screen = -1). */
  frontNdc: -0.95,
  margin: 0.02,
  blendSeconds: 1.2,
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

export interface CameraPose {
  readonly position: THREE.Vector3;
  readonly target: THREE.Vector3;
}

function configure(camera: THREE.PerspectiveCamera, aspect: number): void {
  camera.fov = CAMERA.fov;
  camera.near = CAMERA.near;
  camera.far = CAMERA.far;
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
}

/**
 * Iteratively place the camera (fixed pitch, looking at `target`) so `points` fill the view.
 * `shift` = how the target moves to center content: along the ground (gameplay) or the view-up axis.
 */
function fit(camera: THREE.PerspectiveCamera, points: readonly THREE.Vector3[], pitchDeg: number, target: THREE.Vector3, dist: number, margin: number, shift: 'ground' | 'up', bottomNdc?: number): CameraPose {
  const pitch = THREE.MathUtils.degToRad(pitchDeg);
  const dir = new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch));
  const up = new THREE.Vector3(0, Math.cos(pitch), -Math.sin(pitch));
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const lim = 1 - margin;
  for (let iter = 0; iter < 60; iter++) {
    camera.position.copy(target).addScaledVector(dir, dist);
    camera.lookAt(target);
    camera.updateMatrixWorld(true);
    let ymin = Infinity;
    let ymax = -Infinity;
    let xmax = 0;
    for (const p of points) {
      tmp.copy(p).project(camera);
      ymin = Math.min(ymin, tmp.y);
      ymax = Math.max(ymax, tmp.y);
      xmax = Math.max(xmax, Math.abs(tmp.x - 0));
    }
    // anchored mode: fit the width only and pin the lowest point at bottomNdc
    const scale = bottomNdc === undefined ? Math.max((ymax - ymin) / (2 * lim), xmax / lim) : xmax / lim;
    const centerY = bottomNdc === undefined ? (ymax + ymin) / 2 : ymin - bottomNdc;
    if (shift === 'ground') target.z -= ((centerY * dist * tanHalf) / Math.sin(pitch)) * 0.8;
    else target.addScaledVector(up, centerY * dist * tanHalf * 0.8);
    dist *= 1 + (scale - 1) * 0.9;
    if (Math.abs(scale - 1) < 1e-4 && Math.abs(centerY) < 1e-4) break;
  }
  camera.position.copy(target).addScaledVector(dir, dist);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  return { position: camera.position.clone(), target: target.clone() };
}

/** Position/aim the camera in the gameplay pose so FIT_POINTS fill the view for the given aspect. */
export function fitCamera(camera: THREE.PerspectiveCamera, aspect: number): CameraPose {
  configure(camera, aspect);
  return fit(camera, FIT_POINTS, CAMERA.pitch, new THREE.Vector3(0, 0, 0.5), 30, CAMERA.margin, 'ground');
}

const scratch = new THREE.PerspectiveCamera();

/** Gameplay pose for an aspect, without touching the live camera. */
export function gameplayPose(aspect: number): CameraPose {
  configure(scratch, aspect);
  return fit(scratch, FIT_POINTS, CAMERA.pitch, new THREE.Vector3(0, 0, 0.5), 30, CAMERA.margin, 'ground');
}

/** Title "party lineup" pose centered on the portal column (world x). */
export function titlePose(aspect: number, portalX: number, portalZ: number): CameraPose {
  configure(scratch, aspect);
  const T = TITLE_CAMERA;
  const back = portalZ - 0.5; // back edge of row 0
  const front = back + T.frontRow;
  const pts = [new THREE.Vector3(portalX - T.halfWidth, 0, front), new THREE.Vector3(portalX + T.halfWidth, 0, front)];
  return fit(scratch, pts, T.pitch, new THREE.Vector3(portalX, 0.8, back + 2), 16, T.margin, 'up', T.frontNdc);
}

/** Apply a blend of two poses (t = 0 gameplay .. 1 title) to the live camera. */
export function applyPose(camera: THREE.PerspectiveCamera, a: CameraPose, b: CameraPose, t: number): void {
  camera.position.lerpVectors(a.position, b.position, t);
  tmp.lerpVectors(a.target, b.target, t);
  camera.up.set(0, 1, 0);
  camera.lookAt(tmp);
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
