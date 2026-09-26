// Beyond the grid: a curved cliff wall behind the portal and a dense forest (or dead forest / slag field)
// surrounding the clearing. Ruins add a painted night-sky card with the moon behind low, broken cliffs.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GRID_COLS, GRID_ROWS } from '../../core/grid';
import { fbm, rng } from '../../art/env/noise';
import { PAL, type EnvPalette } from '../../art/env/palette';
import { paintMoon, paintNightSky, paintSoftDot, toTexture } from '../../art/env/textures';
import { broadleafGeometry, coniferGeometry, deadTreeGeometry, slagSpireGeometry } from './foliage';
import { normalizeForMerge, paint, type WorldPart } from './util';

export const CLIFF_HEIGHT = 20;
/** Cliff face leans back this much in z per unit of height. */
export const CLIFF_LEAN = 0.28;
const WATERFALL_X = 0.5;
/** Ruins: the moon hangs just right of the portal, framed by a dip in the cliffs. */
const MOON_X = WATERFALL_X + 2.2;

/** Z of the cliff foot at world x (recessed notch at the waterfall, curving forward at the sides). */
export function cliffBaseZ(x: number): number {
  const notch = -1.1 * Math.exp(-((x - WATERFALL_X) ** 2) / 5);
  const side = Math.max(0, Math.abs(x) - 13);
  return -9.7 + notch + Math.min(7, side * 0.45);
}

export interface BackdropStyle {
  readonly pal: EnvPalette;
  /** Cliff height (world units). */
  readonly cliffHeight: number;
  /** 0 = even top; >0 = crumbling silhouette (fraction of height). */
  readonly ragged: number;
  /** Darkening of the rock beside the fall (wet stone). */
  readonly wet: number;
  /** Glow reflected on the rock around the fall (lava), or null. */
  readonly warm: THREE.Color | null;
  readonly forest: 'shrine' | 'forge' | 'ruins';
}

export const SHRINE_BACKDROP: BackdropStyle = { pal: PAL, cliffHeight: CLIFF_HEIGHT, ragged: 0, wet: 0.3, warm: null, forest: 'shrine' };

/** Cliff top height at world x for a style (matches the mesh silhouette). */
function cliffTop(style: BackdropStyle, x: number): number {
  if (style.ragged <= 0) return style.cliffHeight;
  return style.cliffHeight * ragFactor(style, x);
}
function ragFactor(style: BackdropStyle, x: number): number {
  const n = fbm(x * 0.18 + 11, 3.3, 3, 41);
  const notch = Math.exp(-((x - MOON_X) ** 2) / 14) * 0.62; // dip behind the portal (moon window)
  return Math.max(0.25, 1 - style.ragged * n * 1.4 - notch);
}

function buildCliffs(style: BackdropStyle): THREE.Mesh {
  const W = 84;
  const H = style.cliffHeight;
  const pal = style.pal;
  let geo: THREE.BufferGeometry = new THREE.PlaneGeometry(W, H + 1, 110, 30);
  const pos = geo.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const x0 = pos.getX(i);
    let y = pos.getY(i) + (H + 1) / 2 - 1; // -1 .. H
    if (style.ragged > 0 && y > 0) y *= ragFactor(style, x0);
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
  const cA = new THREE.Color(pal.cliff);
  const cD = new THREE.Color(pal.cliffDark);
  const cM = new THREE.Color(pal.cliffMoss);
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
    c.multiplyScalar(1 - wet * style.wet);
    c.multiplyScalar(0.72 + 0.28 * THREE.MathUtils.smoothstep(y, 0, 5));
    if (style.warm) {
      // molten glow reflected on the rock around the lava-fall and along the foot
      const glow = Math.exp(-((x - WATERFALL_X) ** 2) / 14) * Math.exp(-y / 7) + Math.exp(-y / 1.2) * 0.25;
      c.lerp(style.warm, Math.min(0.55, glow * 0.6));
    }
    for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (i + k) * 3);
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

function forestSpots(style: BackdropStyle): { conifers: TreeSpot[]; broadleaf: TreeSpot[] } {
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
    const top = cliffTop(style, x);
    const z = cliffBaseZ(x) - top * CLIFF_LEAN - 0.5 - r() * 3;
    if (style.ragged > 0 && Math.abs(x - MOON_X) < 4.2) continue; // keep the moon window clear
    conifers.push({ x: x + (r() - 0.5) * 0.8, y: top - 0.4, z, s: 1.1 + r() * 0.8, rot: r() * 6, shade: 0.8 + r() * 0.3 });
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

/** Crumbled wall stubs and column stumps silhouetted along the low ruins cliff top. */
function ruinsSkyline(style: BackdropStyle): THREE.BufferGeometry {
  const r = rng(808);
  const parts: THREE.BufferGeometry[] = [];
  const stone = new THREE.Color(style.pal.cliff).lerp(new THREE.Color(style.pal.statue), 0.4);
  for (let i = 0; i < 16; i++) {
    const x = -24 + i * 3.1 + (r() - 0.5) * 1.6;
    if (Math.abs(x - MOON_X) < 4.5) continue; // keep the moon window clear
    const top = cliffTop(style, x);
    const z = cliffBaseZ(x) - top * CLIFF_LEAN - 0.6 - r() * 1.5;
    if (r() < 0.5) {
      const h = 0.8 + r() * 2.2;
      const g = new THREE.BoxGeometry(1.2 + r() * 1.8, h, 0.45);
      g.translate(x, top + h / 2 - 0.2, z);
      g.rotateY(0);
      parts.push(normalizeForMerge(paint(g, stone)));
    } else {
      const h = 1.2 + r() * 2.6;
      const g = new THREE.CylinderGeometry(0.28, 0.32, h, 10);
      g.translate(x, top + h / 2 - 0.2, z);
      parts.push(normalizeForMerge(paint(g, stone)));
    }
  }
  const g = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return g;
}

export function buildBackdrop(foliageMat: THREE.Material, style: BackdropStyle = SHRINE_BACKDROP): THREE.Group {
  const group = new THREE.Group();
  group.name = 'backdrop';
  group.add(buildCliffs(style));
  const { conifers, broadleaf } = forestSpots(style);
  const pal = style.pal;
  let a: THREE.InstancedMesh;
  let b: THREE.InstancedMesh;
  if (style.forest === 'shrine') {
    a = instanced(coniferGeometry(pal), foliageMat, conifers, 'forestConifers');
    b = instanced(broadleafGeometry(77, 2.6, pal), foliageMat, broadleaf, 'forestBroadleaf');
  } else if (style.forest === 'forge') {
    // slag spires dominate, charred dead trees nearer the clearing
    a = instanced(slagSpireGeometry(41, 2.6, pal), foliageMat, conifers, 'forestSpires');
    b = instanced(deadTreeGeometry(77, 2.6, pal.trunk), foliageMat, broadleaf, 'forestDeadTrees');
  } else {
    a = instanced(coniferGeometry(pal), foliageMat, conifers, 'forestConifers');
    b = instanced(deadTreeGeometry(77, 2.8, new THREE.Color(pal.trunk).lerp(new THREE.Color(pal.statue), 0.3)), foliageMat, broadleaf, 'forestDeadTrees');
    const sky = new THREE.Mesh(ruinsSkyline(style), foliageMat);
    sky.name = 'ruinsSkyline';
    sky.castShadow = true;
    group.add(sky);
  }
  a.castShadow = b.castShadow = true;
  a.receiveShadow = b.receiveShadow = true;
  group.add(a, b);
  return group;
}

/**
 * Night sky for the ruins: a painted card that faces the gameplay camera behind the low cliffs,
 * a large moon disc and its halo. Unfogged so it reads as sky.
 */
export function buildNightSky(pal: EnvPalette, anisotropy: number): WorldPart {
  const group = new THREE.Group();
  group.name = 'nightSky';
  const skyTex = toTexture(paintNightSky(512, 512, '#0f1230', '#4a5190'), { anisotropy });
  // A stage-flat sky standing just behind the low cliffs, facing the elevated gameplay camera, so it
  // fills the band above the cliff tops (a real sky would be out of frame at this pitch).
  const card = new THREE.Mesh(new THREE.PlaneGeometry(110, 44), new THREE.MeshBasicMaterial({ map: skyTex, fog: false }));
  card.position.set(0.5, 6, -19.5);
  card.rotation.x = -0.45;
  card.name = 'skyCard';
  group.add(card);

  const dotTex = toTexture(paintSoftDot(128), { anisotropy });
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color: new THREE.Color(pal.sun).multiplyScalar(0.7), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  halo.scale.set(8, 8, 1);
  halo.position.set(MOON_X, 2.2, -15.6);
  halo.renderOrder = -9;
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: toTexture(paintMoon(256), { anisotropy }), color: new THREE.Color(1.3, 1.33, 1.45), transparent: true, depthWrite: false, fog: false }));
  moon.scale.set(2.5, 2.5, 1);
  moon.position.set(MOON_X, 2.2, -15.4);
  moon.renderOrder = -8;
  group.add(halo, moon);
  return {
    object: group,
    update(time) {
      (halo.material as THREE.SpriteMaterial).opacity = 0.85 + 0.15 * Math.sin(time * 0.4);
    },
  };
}
