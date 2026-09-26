// Painterly ground: a large tiling grass plane plus a hand-"painted" canvas for the playfield
// (stone-slab path, AO, faint grid). Both share world-aligned UVs and vertex tint so they blend seamlessly.
import * as THREE from 'three';
import { GRID_COLS, GRID_ROWS } from '../../core/grid';
import type { TileCoord } from '../../core/types';
import { tileType, type MapDef } from '../../data';
import { fbm } from '../../art/env/noise';
import { GRASS_TILE_WORLD, GROUND_PAD, paintGrassTile, paintGround, toTexture } from '../../art/env/textures';

const OUTER_W = 160;
const OUTER_H = 120;

/** Ground brightness tint in world space: soft variation, darker toward the forest edge. */
export function groundTint(x: number, z: number): number {
  const n = fbm(x * 0.08 + 40, z * 0.08 + 40, 3, 99);
  const hx = Math.max(0, Math.abs(x) - 10.5);
  const hz = Math.max(0, -z - 6.5) + Math.max(0, z - 9);
  const edge = Math.min(1, Math.hypot(hx, hz) / 5);
  return (0.88 + n * 0.24) * (1 - edge * 0.45);
}

function applyTint(geo: THREE.BufferGeometry, offX: number, offZ: number) {
  const pos = geo.attributes.position!;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = groundTint(pos.getX(i) + offX, pos.getZ(i) + offZ);
    col[i * 3] = t * 0.97;
    col[i * 3 + 1] = t;
    col[i * 3 + 2] = t * 1.02;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

export function buildGround(map: MapDef, anisotropy: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'ground';

  const grassCanvas = paintGrassTile(512, 7);

  // Outer ground (tiling). UV spans OUTER/GRASS_TILE_WORLD repeats; OUTER/2 is a multiple of the tile.
  const outerTex = toTexture(grassCanvas, { repeat: true, anisotropy });
  outerTex.repeat.set(OUTER_W / GRASS_TILE_WORLD, OUTER_H / GRASS_TILE_WORLD);
  const outerGeo = new THREE.PlaneGeometry(OUTER_W, OUTER_H, 80, 60).rotateX(-Math.PI / 2);
  applyTint(outerGeo, 0, 0);
  const outer = new THREE.Mesh(outerGeo, new THREE.MeshLambertMaterial({ map: outerTex, vertexColors: true }));
  outer.position.y = -0.03;
  outer.receiveShadow = true;
  outer.name = 'groundOuter';
  group.add(outer);

  // Inner painted playfield
  // TODO(B): paint lava properly; rock is a stand-in so the painter's tile union stays valid.
  const typeAt = (t: TileCoord) => { const ty = tileType(map, t); return ty === 'lava' ? 'rock' : ty; };
  const extraPath: { tile: TileCoord; alpha: number }[] = [];
  // spawn trail: extend path tiles on the grid border outward, fading
  for (let row = 0; row < GRID_ROWS; row++) {
    if (typeAt({ col: 0, row }) === 'path') for (let k = 1; k <= GROUND_PAD.left; k++) extraPath.push({ tile: { col: -k, row }, alpha: 1 - k / (GROUND_PAD.left + 0.6) });
    if (typeAt({ col: GRID_COLS - 1, row }) === 'path') for (let k = 0; k < GROUND_PAD.right; k++) extraPath.push({ tile: { col: GRID_COLS + k, row }, alpha: 1 - (k + 1) / (GROUND_PAD.right + 0.6) });
  }
  for (let col = 0; col < GRID_COLS; col++) {
    if (typeAt({ col, row: GRID_ROWS - 1 }) === 'path') for (let k = 0; k < GROUND_PAD.bottom; k++) extraPath.push({ tile: { col, row: GRID_ROWS + k }, alpha: 1 - (k + 1) / (GROUND_PAD.bottom + 0.6) });
  }
  const ppt = 80;
  const groundCanvas = paintGround({ typeAt, extraPath }, grassCanvas, ppt, 21);
  const innerTex = toTexture(groundCanvas, { anisotropy });
  const cols = GRID_COLS + GROUND_PAD.left + GROUND_PAD.right;
  const rows = GRID_ROWS + GROUND_PAD.top + GROUND_PAD.bottom;
  const cx = (GROUND_PAD.right - GROUND_PAD.left) / 2;
  const cz = (GROUND_PAD.bottom - GROUND_PAD.top) / 2;
  const innerGeo = new THREE.PlaneGeometry(cols, rows, cols * 2, rows * 2).rotateX(-Math.PI / 2);
  applyTint(innerGeo, cx, cz);
  const inner = new THREE.Mesh(innerGeo, new THREE.MeshLambertMaterial({ map: innerTex, vertexColors: true }));
  inner.position.set(cx, 0, cz);
  inner.receiveShadow = true;
  inner.name = 'groundInner';
  group.add(inner);

  return group;
}
