// Beyond the grid: a curved cliff wall behind the shrine and a dense dark forest surrounding the clearing.
import * as THREE from 'three';
import { GRID_COLS, GRID_ROWS } from '../../core/grid';
import { fbm, rng } from '../../art/env/noise';
import { PAL } from '../../art/env/palette';
import { broadleafGeometry, coniferGeometry } from './foliage';

export const CLIFF_HEIGHT = 20;
/** Cliff face leans back this much in z per unit of height. */
export const CLIFF_LEAN = 0.28;
const WATERFALL_X = 0.5;

/** Z of the cliff foot at world x (recessed notch at the waterfall, curving forward at the sides). */
export function cliffBaseZ(x: number): number {
  const notch = -1.1 * Math.exp(-((x - WATERFALL_X) ** 2) / 5);
  const side = Math.max(0, Math.abs(x) - 13);
  return -9.7 + notch + Math.min(7, side * 0.45);
}

function buildCliffs(): THREE.Mesh {
  const W = 84;
  const H = CLIFF_HEIGHT;
  let geo: THREE.BufferGeometry = new THREE.PlaneGeometry(W, H + 1, 110, 30);
  const pos = geo.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const x0 = pos.getX(i);
    const y = pos.getY(i) + (H + 1) / 2 - 1; // -1 .. H
    const big = fbm(x0 * 0.12 + 5, y * 0.12, 4, 31) - 0.5;
    const small = fbm(x0 * 0.5, y * 0.55, 3, 32) - 0.5;
    const strata = Math.sin(y * 1.3 + big * 4) * 0.18;
    const nearFall = Math.exp(-((x0 - WATERFALL_X) ** 2) / 6);
    const x = x0 + small * 0.6;
    const z = cliffBaseZ(x0) - Math.max(0, y) * CLIFF_LEAN + big * 2.6 * (1 - nearFall * 0.6) + small * 0.9 + strata - (y < 0.6 ? 0 : 0.1);
    pos.setXYZ(i, x, y, z);
  }
  geo = geo.toNonIndexed();
  geo.computeVertexNormals();
  const p = geo.attributes.position!;
  const n = geo.attributes.normal!;
  const col = new Float32Array(p.count * 3);
  const cA = new THREE.Color(PAL.cliff);
  const cD = new THREE.Color(PAL.cliffDark);
  const cM = new THREE.Color(PAL.cliffMoss);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i += 3) {
    // per face color (flat, painterly facets)
    const x = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
    const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    const ny = n.getY(i);
    const v = fbm(x * 0.3, y * 0.3, 3, 77);
    c.copy(cD).lerp(cA, THREE.MathUtils.clamp(v * 1.4 - 0.1, 0, 1));
    const mossy = THREE.MathUtils.smoothstep(ny, 0.15, 0.6) * THREE.MathUtils.smoothstep(fbm(x * 0.7, y * 0.7, 2, 78), 0.35, 0.6);
    c.lerp(cM, mossy * 0.85);
    // wet, darker rock beside the waterfall; darker foot
    const wet = Math.exp(-((x - WATERFALL_X) ** 2) / 8);
    c.multiplyScalar(1 - wet * 0.3);
    c.multiplyScalar(0.72 + 0.28 * THREE.MathUtils.smoothstep(y, 0, 5));
    for (let k = 0; k < 3; k++) {
      col[(i + k) * 3] = c.r;
      col[(i + k) * 3 + 1] = c.g;
      col[(i + k) * 3 + 2] = c.b;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.name = 'cliffs';
  mesh.receiveShadow = true;
  return mesh;
}

interface TreeSpot {
  x: number;
  y: number;
  z: number;
  s: number;
  rot: number;
  shade: number;
}

function forestSpots(): { conifers: TreeSpot[]; broadleaf: TreeSpot[] } {
  const r = rng(2024);
  const conifers: TreeSpot[] = [];
  const broadleaf: TreeSpot[] = [];
  const halfW = GRID_COLS / 2;
  const halfH = GRID_ROWS / 2;
  const step = 1.25;
  for (let gz = -14; gz <= 16; gz += step) {
    for (let gx = -40; gx <= 40; gx += step) {
      const x = gx + (r() - 0.5) * step * 0.9;
      const z = gz + (r() - 0.5) * step * 0.9;
      // keep the clearing, the foreground strip and the pool open
      const ax = Math.abs(x);
      if (ax < halfW + 2.2 && z > -halfH - 3.2) continue;
      if (Math.abs(x - 0.5) < 7 && z > -halfH - 6) continue; // pool / waterfall basin
      if (ax < 15 && z > halfH + 0.5) continue;
      if (z < cliffBaseZ(x) + 0.4) continue; // behind the cliff face
      const out = Math.max(ax - halfW - 2, -halfH - 3 - z, 0);
      const s = 0.95 + r() * 0.6 + Math.min(0.9, out * 0.06);
      const shade = 0.75 + r() * 0.35;
      const spot = { x, y: 0, z, s, rot: r() * Math.PI * 2, shade };
      if (out < 3 && r() < 0.3) broadleaf.push(spot);
      else conifers.push(spot);
    }
  }
  // along the cliff top
  for (let x = -40; x <= 40; x += 1.1) {
    const z = cliffBaseZ(x) - CLIFF_HEIGHT * CLIFF_LEAN - 0.5 - r() * 3;
    conifers.push({ x: x + (r() - 0.5) * 0.8, y: CLIFF_HEIGHT - 0.4, z, s: 1.1 + r() * 0.8, rot: r() * 6, shade: 0.8 + r() * 0.3 });
  }
  return { conifers, broadleaf };
}

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, spots: TreeSpot[], name: string): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const c = new THREE.Color();
  spots.forEach((s, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.rot);
    m.compose(new THREE.Vector3(s.x, s.y, s.z), q, new THREE.Vector3(s.s, s.s * (0.9 + (s.shade - 0.75) * 0.6), s.s));
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, c.setScalar(s.shade));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.name = name;
  return mesh;
}

export function buildBackdrop(foliageMat: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  group.name = 'backdrop';
  group.add(buildCliffs());
  const { conifers, broadleaf } = forestSpots();
  const con = instanced(coniferGeometry(), foliageMat, conifers, 'forestConifers');
  const bl = instanced(broadleafGeometry(77, 2.6), foliageMat, broadleaf, 'forestBroadleaf');
  con.castShadow = bl.castShadow = true;
  con.receiveShadow = bl.receiveShadow = true;
  group.add(con, bl);
  return group;
}
