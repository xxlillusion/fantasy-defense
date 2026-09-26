// Painterly ground: a large tiling ground plane plus a hand-"painted" canvas for the playfield
// (path flagstones, AO, faint grid, spawn trails for every lane). Both share world-aligned UVs and
// vertex tint so they blend seamlessly. Lava tiles get a separate animated emissive channel mesh.
import * as THREE from 'three';
import { GRID_COLS, GRID_ROWS, tileAt } from '../../core/grid';
import type { TileCoord } from '../../core/types';
import { tileType, type MapDef } from '../../data';
import { fbm } from '../../art/env/noise';
import type { EnvPalette } from '../../art/env/palette';
import { GRASS_TILE_WORLD, GROUND_PAD, paintGrassTile, paintGround, paintLavaMask, toTexture, type GrassStyle, type GroundStyle } from '../../art/env/textures';
import type { WorldPart } from './util';
import { NOISE_GLSL } from './waterfall';

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

const key = (t: TileCoord) => `${t.col},${t.row}`;
const inPad = (t: TileCoord) => t.col >= -GROUND_PAD.left && t.col < GRID_COLS + GROUND_PAD.right && t.row >= -GROUND_PAD.top && t.row < GRID_ROWS + GROUND_PAD.bottom;

/** Off-map spawn trails for every lane: continue each lane's first segment outward, fading. */
export function spawnTrails(map: MapDef): { tile: TileCoord; alpha: number }[] {
  const out = new Map<string, { tile: TileCoord; alpha: number }>();
  for (const lane of map.paths) {
    if (lane.length < 2) continue;
    const a = lane[0]!;
    const b = lane[1]!;
    const dx = Math.sign(Math.round(a.x - b.x));
    const dy = Math.sign(Math.round(a.y - b.y));
    if (dx === 0 && dy === 0) continue;
    const start = tileAt(a);
    const pad = dx < 0 ? GROUND_PAD.left : dx > 0 ? GROUND_PAD.right : dy < 0 ? GROUND_PAD.top : GROUND_PAD.bottom;
    for (let k = 1; k <= pad; k++) {
      const tile = { col: start.col + dx * (k - 1), row: start.row + dy * (k - 1) };
      if (!inPad(tile) || tileType(map, tile)) continue;
      const alpha = 1 - k / (pad + 0.6);
      const prev = out.get(key(tile));
      if (!prev || prev.alpha < alpha) out.set(key(tile), { tile, alpha });
    }
  }
  return [...out.values()];
}

/** Lava tiles plus short continuations of border channels into the padding (so they run off-map). */
export function lavaTiles(map: MapDef): { inside: TileCoord[]; extra: TileCoord[] } {
  const inside: TileCoord[] = [];
  const extra = new Map<string, TileCoord>();
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      if (tileType(map, { col, row }) !== 'lava') continue;
      inside.push({ col, row });
      const dirs: [number, number, number][] = [];
      if (col === 0) dirs.push([-1, 0, GROUND_PAD.left - 1]);
      if (col === GRID_COLS - 1) dirs.push([1, 0, GROUND_PAD.right - 1]);
      if (row === GRID_ROWS - 1) dirs.push([0, 1, GROUND_PAD.bottom - 1]);
      for (const [dx, dy, n] of dirs) {
        for (let k = 1; k <= n; k++) {
          const t = { col: col + dx * k, row: row + dy * k };
          extra.set(key(t), t);
        }
      }
    }
  }
  // corners: fill the diagonal pad cells next to two extended neighbours
  for (const t of [...extra.values()]) {
    for (const [dx, dy] of [[-1, 1], [1, 1]] as const) {
      const d = { col: t.col + dx, row: t.row + dy };
      if (inPad(d) && extra.has(key({ col: d.col, row: t.row })) && extra.has(key({ col: t.col, row: d.row }))) extra.set(key(d), d);
    }
  }
  return { inside, extra: [...extra.values()] };
}

const lavaVert = /* glsl */ `
varying vec2 vUv;
varying vec2 vW;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const lavaFrag = /* glsl */ `
uniform float uTime;
uniform sampler2D uMask;
uniform vec3 uHot;
uniform vec3 uMid;
uniform vec3 uCrust;
varying vec2 vUv;
varying vec2 vW;
${NOISE_GLSL}
void main() {
  float m = texture2D(uMask, vUv).r;
  if (m < 0.12) discard;
  vec2 p = vW;
  float t = uTime;
  // heat shimmer: a gentle wobble of the lookup
  p += 0.06 * vec2(sin(p.y * 5.0 + t * 2.1), cos(p.x * 4.0 - t * 1.7));
  float n1 = fbm2(p * 1.1 + vec2(t * 0.09, t * 0.05));
  float n2 = fbm2(p * 2.7 - vec2(t * 0.21, t * 0.08) + n1 * 1.5);
  float heat = smoothstep(0.45, 0.82, n1 * 0.55 + n2 * 0.45);
  float core = smoothstep(0.45, 0.95, m);
  vec3 col = mix(uMid, uHot, heat * heat) * (0.4 + 0.7 * core);
  // drifting crust plates and a cooled rim along the banks
  float plates = smoothstep(0.5, 0.6, fbm2(p * 2.0 + vec2(t * 0.06, -t * 0.03) + 9.0));
  float bank = 1.0 - smoothstep(0.3, 0.66, m);
  float crust = max(plates * (1.0 - core * 0.35), bank);
  // cracks of light through the crust
  float seam = smoothstep(0.08, 0.0, abs(fbm2(p * 4.0 + 3.0) - 0.5)) * 0.6;
  col = mix(col, uCrust + uMid * seam * 0.35, crust * 0.9);
  float a = smoothstep(0.12, 0.32, m);
  gl_FragColor = vec4(col, a);
}`;

export interface GroundOptions {
  readonly pal: EnvPalette;
  readonly grass: GrassStyle;
  readonly ground: GroundStyle;
  readonly anisotropy: number;
}

export function buildGround(map: MapDef, o: GroundOptions): WorldPart {
  const group = new THREE.Group();
  group.name = 'ground';

  const grassCanvas = paintGrassTile(512, 7, o.pal, o.grass);

  // Outer ground (tiling). UV spans OUTER/GRASS_TILE_WORLD repeats; OUTER/2 is a multiple of the tile.
  const outerTex = toTexture(grassCanvas, { repeat: true, anisotropy: o.anisotropy });
  outerTex.repeat.set(OUTER_W / GRASS_TILE_WORLD, OUTER_H / GRASS_TILE_WORLD);
  const outerGeo = new THREE.PlaneGeometry(OUTER_W, OUTER_H, 80, 60).rotateX(-Math.PI / 2);
  applyTint(outerGeo, 0, 0);
  const outer = new THREE.Mesh(outerGeo, new THREE.MeshLambertMaterial({ map: outerTex, vertexColors: true }));
  outer.position.y = -0.03;
  outer.receiveShadow = true;
  outer.name = 'groundOuter';
  group.add(outer);

  // Inner painted playfield
  const typeAt = (t: TileCoord) => tileType(map, t);
  const lava = lavaTiles(map);
  const ppt = 80;
  const groundCanvas = paintGround({ typeAt, extraPath: spawnTrails(map), extraLava: lava.extra }, grassCanvas, ppt, 21, o.pal, o.ground);
  const innerTex = toTexture(groundCanvas, { anisotropy: o.anisotropy });
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

  // Molten channels: one transparent plane over the padded area, masked by a blurred tile mask.
  let lavaUniforms: { uTime: { value: number } } | null = null;
  if (lava.inside.length) {
    const maskTex = toTexture(paintLavaMask([...lava.inside, ...lava.extra], 16), { srgb: false, anisotropy: o.anisotropy });
    const u = {
      uTime: { value: 0 },
      uMask: { value: maskTex },
      uHot: { value: new THREE.Color(1.0, 0.55, 0.16).multiplyScalar(2.1) },
      uMid: { value: new THREE.Color(0.8, 0.16, 0.03).multiplyScalar(1.1) },
      uCrust: { value: new THREE.Color(0.07, 0.045, 0.04) },
    };
    lavaUniforms = u;
    const lavaMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(cols, rows).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({ uniforms: u, vertexShader: lavaVert, fragmentShader: lavaFrag, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    );
    lavaMesh.position.set(cx, 0.012, cz);
    lavaMesh.renderOrder = -1;
    lavaMesh.name = 'lava';
    group.add(lavaMesh);
  }

  return {
    object: group,
    update(time) {
      if (lavaUniforms) lavaUniforms.uTime.value = time;
    },
  };
}

/** World-space centers of lava tiles (ember emitters). */
export function lavaEmitters(map: MapDef): THREE.Vector3[] {
  const { inside } = lavaTiles(map);
  return inside.map((t) => new THREE.Vector3(t.col + 0.5 - GRID_COLS / 2, 0, t.row + 0.5 - GRID_ROWS / 2));
}
