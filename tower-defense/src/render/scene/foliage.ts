// Stylized low-poly foliage and rocks (cool, desaturated greens/greys). Static props are merged.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GRID_COLS, GRID_ROWS } from '../../core/grid';
import { tileType, type MapDef } from '../../data';
import { fbm, rng } from '../../art/env/noise';
import { PAL } from '../../art/env/palette';
import { normalizeForMerge, paint, tileWorld } from './util';

type Part = THREE.BufferGeometry;

function place(g: Part, color: THREE.ColorRepresentation, m: THREE.Matrix4): Part {
  const n = normalizeForMerge(paint(g, color));
  n.applyMatrix4(m);
  return n;
}
const TRS = (x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, ry = 0) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(sx, sy, sz));

/** Jitter vertices of a (non-indexed after merge) geometry for an organic low-poly look. */
function jitter(g: Part, amount: number, seed: number): Part {
  const p = g.attributes.position!;
  // indexed geometries share vertices, so jittering before toNonIndexed keeps faces closed
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const n = fbm(x * 2.1 + seed, y * 2.3 + z * 1.7, 2, seed) - 0.5;
    const s = 1 + n * amount;
    p.setXYZ(i, x * s, y * (1 + n * amount * 0.5), z * s);
  }
  return g;
}

/** Layered conifer, ~3 units tall at scale 1. Base at y=0. */
export function coniferGeometry(): Part {
  const parts: Part[] = [];
  parts.push(place(new THREE.CylinderGeometry(0.07, 0.11, 0.7, 5), PAL.trunk, TRS(0, 0.35, 0)));
  const tiers = [
    { r: 0.95, h: 1.3, y: 1.05, c: PAL.forestC },
    { r: 0.75, h: 1.15, y: 1.65, c: PAL.forestA },
    { r: 0.52, h: 1.0, y: 2.25, c: PAL.forestB },
  ];
  tiers.forEach((t, i) => parts.push(place(jitter(new THREE.ConeGeometry(t.r, t.h, 7, 1), 0.25, i * 3 + 1), t.c, TRS(0, t.y, 0, 1, 1, 1, i * 0.7))));
  const g = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return g;
}

/** Round broadleaf tree. `h` ~ total height. Base at y=0. */
export function broadleafGeometry(seed: number, h = 2.2): Part {
  const r = rng(seed);
  const parts: Part[] = [];
  const k = h / 2.2;
  parts.push(place(new THREE.CylinderGeometry(0.07 * k, 0.13 * k, 1.0 * k, 6), PAL.trunk, TRS(0, 0.5 * k, 0)));
  const blobs = [
    { x: 0, y: 1.35, z: 0, s: 0.72 },
    { x: -0.32, y: 1.1, z: 0.12, s: 0.5 },
    { x: 0.3, y: 1.15, z: -0.1, s: 0.52 },
    { x: 0.05, y: 1.75, z: 0.05, s: 0.5 },
  ];
  const cols = [PAL.leafC, PAL.leafA, PAL.leafA, PAL.leafB];
  blobs.forEach((b, i) => {
    const geo = jitter(new THREE.IcosahedronGeometry(1, 1), 0.35, seed * 7 + i);
    const s = b.s * (0.9 + r() * 0.2) * k;
    parts.push(place(geo, cols[i]!, TRS(b.x * k, b.y * k, b.z * k, s, s * 0.85, s, r() * 3)));
  });
  const g = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return g;
}

/** Cluster of 2-3 mossy boulders. Base at y=0. */
export function rockGeometry(seed: number, size = 1): Part {
  const r = rng(seed);
  const parts: Part[] = [];
  const n = 2 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) {
    const geo = jitter(new THREE.IcosahedronGeometry(1, 0), 0.45, seed * 5 + i);
    const s = (i === 0 ? 0.36 : 0.18 + r() * 0.12) * size;
    const ang = r() * Math.PI * 2;
    const d = i === 0 ? 0 : 0.3 * size;
    parts.push(place(geo, i === 0 ? PAL.rock : PAL.rockDark, TRS(Math.cos(ang) * d, s * 0.55, Math.sin(ang) * d, s * 1.1, s * 0.85, s, r() * 3)));
  }
  const g = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  g.computeVertexNormals();
  // moss on top faces
  const nrm = g.attributes.normal!;
  const col = g.attributes.color!;
  const moss = new THREE.Color(PAL.moss);
  const c = new THREE.Color();
  for (let i = 0; i < col.count; i++) {
    const up = THREE.MathUtils.smoothstep(nrm.getY(i), 0.5, 0.9);
    c.setRGB(col.getX(i), col.getY(i), col.getZ(i)).lerp(moss, up * 0.7);
    col.setXYZ(i, c.r, c.g, c.b);
  }
  return g;
}

/** Low bush / fern clump, ~0.5 tall. */
export function bushGeometry(seed: number): Part {
  const r = rng(seed);
  const parts: Part[] = [];
  for (let i = 0; i < 3; i++) {
    const geo = jitter(new THREE.IcosahedronGeometry(1, 1), 0.4, seed * 3 + i);
    const s = 0.22 + r() * 0.16;
    parts.push(place(geo, [PAL.leafC, PAL.leafA, PAL.grassMid][i]!, TRS((r() - 0.5) * 0.5, s * 0.5, (r() - 0.5) * 0.4, s * 1.3, s, s * 1.1)));
  }
  const g = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return g;
}

export function sharedFoliageMaterial(): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
}

/** Trees on T tiles and rocks on R tiles, merged into one mesh. */
export function buildTileProps(map: MapDef, mat: THREE.Material): THREE.Mesh {
  const parts: Part[] = [];
  let seed = 1;
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const t = tileType(map, { col, row });
      if (t !== 'tree' && t !== 'rock') continue;
      const w = tileWorld({ col, row });
      const r = rng(seed++ * 31);
      let g: Part;
      if (t === 'tree') {
        // front rows get smaller trees so they don't hide the path behind them
        const h = row >= 7 ? 1.35 + r() * 0.2 : 2.3 + r() * 0.5;
        g = broadleafGeometry(seed * 13, h);
      } else {
        g = rockGeometry(seed * 17, 1.0 + r() * 0.2);
      }
      g.applyMatrix4(TRS(w.x + (r() - 0.5) * 0.1, 0, w.z + (r() - 0.5) * 0.1, 1, 1, 1, r() * Math.PI * 2));
      parts.push(g);
    }
  }
  const merged = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  const mesh = new THREE.Mesh(merged, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'tileProps';
  return mesh;
}

/** Low bushes and rocks in the foreground grass strip (blurred by the DoF) and around the clearing edge. */
export function buildForeground(mat: THREE.Material): THREE.Mesh {
  const parts: Part[] = [];
  const r = rng(404);
  const halfW = GRID_COLS / 2;
  const front = GRID_ROWS / 2;
  for (let i = 0; i < 46; i++) {
    const x = (r() - 0.5) * 34;
    const z = front + 1.4 + r() * 3.5;
    const g = r() < 0.8 ? bushGeometry(i + 1) : rockGeometry(i + 900, 0.8);
    const s = 0.9 + r() * 0.9;
    g.applyMatrix4(TRS(x, 0, z, s, s * (0.7 + r() * 0.4), s, r() * 6));
    parts.push(g);
  }
  // clearing edge (left/right beyond the grid, and behind row 0 around the pool)
  for (let i = 0; i < 26; i++) {
    const side = i % 2 ? 1 : -1;
    const x = side * (halfW + 0.7 + r() * 1.6);
    const z = -front + r() * (GRID_ROWS + 1);
    const g = r() < 0.6 ? bushGeometry(i + 60) : rockGeometry(i + 700, 0.7 + r() * 0.5);
    g.applyMatrix4(TRS(x, 0, z, 1, 1, 1, r() * 6));
    parts.push(g);
  }
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const x = 0.5 + Math.cos(a) * 4.5;
    const z = -8.1 + Math.sin(a) * 2.3;
    if (z > -6.3 || z < -9.2) continue; // keep off the playfield and out of the cliff
    const g = rockGeometry(i + 500, 0.6 + r() * 0.5);
    g.applyMatrix4(TRS(x, 0, z, 1, 0.8, 1, r() * 6));
    parts.push(g);
  }
  const merged = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  const mesh = new THREE.Mesh(merged, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = 'foreground';
  return mesh;
}
