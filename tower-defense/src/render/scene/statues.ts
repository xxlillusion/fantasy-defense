// Two draconic guardian statues: spiral-carved plinth + seated dragon with horn and wing crests curling outward.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { TileCoord } from '../../core/types';
import { fbm } from '../../art/env/noise';
import { PAL } from '../../art/env/palette';
import { paintStone, toTexture } from '../../art/env/textures';
import { normalizeForMerge, tileWorld } from './util';

/** Tube along a curve whose radius tapers from r0 to r1. */
export function taperedTube(points: THREE.Vector3[], r0: number, r1: number, tubular = 24, radial = 6, flatten = 1): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points);
  const geo = new THREE.TubeGeometry(curve, tubular, 1, radial, false);
  const pos = geo.attributes.position!;
  const frames = curve.computeFrenetFrames(tubular, false);
  const v = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i <= tubular; i++) {
    curve.getPointAt(i / tubular, c);
    const r = r0 + (r1 - r0) * (i / tubular);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      v.fromBufferAttribute(pos, k).sub(c);
      // flatten along the binormal to make blade-like crests
      const b = frames.binormals[i]!;
      const along = v.dot(b);
      v.addScaledVector(b, along * (flatten - 1));
      v.multiplyScalar(r);
      pos.setXYZ(k, c.x + v.x, c.y + v.y, c.z + v.z);
    }
  }
  geo.computeVertexNormals();
  return geo;
}

function crescent(): THREE.Shape {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(0.05, 0.7, 0.45, 1.0);
  s.quadraticCurveTo(0.85, 1.15, 0.78, 0.78);
  s.quadraticCurveTo(0.66, 0.92, 0.46, 0.8);
  s.quadraticCurveTo(0.24, 0.6, 0.2, 0);
  s.closePath();
  return s;
}

function buildDragonGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, m: THREE.Matrix4) => {
    const n = normalizeForMerge(g, false);
    n.applyMatrix4(m);
    parts.push(n);
  };
  const M = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
    new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

  // haunches + body
  add(new THREE.IcosahedronGeometry(1, 1), M(0, 0.22, -0.28, 0, 0, 0, 0.34, 0.28, 0.42));
  add(new THREE.CylinderGeometry(0.16, 0.27, 0.78, 8, 2), M(0, 0.58, -0.08, 0.22));
  add(new THREE.IcosahedronGeometry(1, 1), M(0, 0.62, 0.02, 0.2, 0, 0, 0.2, 0.28, 0.2)); // chest
  // neck, head, snout, jaw
  add(new THREE.CylinderGeometry(0.1, 0.15, 0.42, 7), M(0, 1.02, 0.07, 0.38));
  add(new THREE.IcosahedronGeometry(1, 1), M(0, 1.22, 0.16, 0, 0, 0, 0.17, 0.14, 0.2));
  add(new THREE.ConeGeometry(0.1, 0.32, 6), M(0, 1.19, 0.42, Math.PI / 2 + 0.12, 0, 0, 1, 1, 0.8));
  add(new THREE.BoxGeometry(0.14, 0.05, 0.22), M(0, 1.1, 0.33, 0.25));
  // brow ridges
  for (const sx of [-1, 1]) add(new THREE.ConeGeometry(0.04, 0.16, 4), M(sx * 0.09, 1.31, 0.22, -1.1, 0, sx * 0.4));
  // front legs + paws
  for (const sx of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.06, 0.08, 0.46, 6), M(sx * 0.15, 0.24, 0.24, -0.1));
    add(new THREE.BoxGeometry(0.15, 0.07, 0.2), M(sx * 0.15, 0.035, 0.32));
  }
  // spine spikes
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    add(new THREE.ConeGeometry(0.045, 0.16 - t * 0.05, 4), M(0, 1.02 - t * 0.62, -0.1 - t * 0.28, -0.7 - t * 0.4));
  }
  // horns: tapered, sweep back then curl outward
  for (const sx of [-1, 1]) {
    const pts = [
      new THREE.Vector3(sx * 0.1, 1.3, 0.12),
      new THREE.Vector3(sx * 0.22, 1.48, 0.02),
      new THREE.Vector3(sx * 0.4, 1.56, -0.14),
      new THREE.Vector3(sx * 0.55, 1.46, -0.28),
      new THREE.Vector3(sx * 0.58, 1.3, -0.2),
      new THREE.Vector3(sx * 0.5, 1.26, -0.1),
    ];
    add(taperedTube(pts, 0.055, 0.008, 28, 6), new THREE.Matrix4());
    // secondary smaller horn
    const pts2 = [
      new THREE.Vector3(sx * 0.12, 1.22, 0.06),
      new THREE.Vector3(sx * 0.28, 1.28, -0.06),
      new THREE.Vector3(sx * 0.38, 1.2, -0.18),
      new THREE.Vector3(sx * 0.36, 1.1, -0.14),
    ];
    add(taperedTube(pts2, 0.035, 0.006, 20, 5), new THREE.Matrix4());
  }
  // layered wing crests (extruded crescents) fanning up and outward from the shoulders
  const shape = crescent();
  const ext = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 1, curveSegments: 10 });
  ext.translate(0, 0, -0.025);
  for (const sx of [-1, 1]) {
    const layers = [
      { s: 1.0, z: -0.3, ry: 0.35, rz: -0.12, y: 0.72 },
      { s: 0.82, z: -0.2, ry: 0.5, rz: 0.08, y: 0.68 },
      { s: 0.64, z: -0.1, ry: 0.65, rz: 0.28, y: 0.64 },
    ];
    for (const L of layers) {
      const m = new THREE.Matrix4()
        .makeTranslation(sx * 0.14, L.y, L.z)
        .multiply(new THREE.Matrix4().makeScale(sx, 1, 1))
        .multiply(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-0.15, L.ry, L.rz)))
        .multiply(new THREE.Matrix4().makeScale(L.s * 0.85, L.s, L.s));
      const g = ext.clone();
      if (sx < 0) {
        // mirrored: flip winding so faces stay outward
        const idx = g.index;
        if (idx) for (let i = 0; i < idx.count; i += 3) { const a = idx.getX(i + 1); idx.setX(i + 1, idx.getX(i + 2)); idx.setX(i + 2, a); }
        else {
          const p = g.attributes.position!;
          const tmp = new THREE.Vector3();
          const tmp2 = new THREE.Vector3();
          for (let i = 0; i < p.count; i += 3) {
            tmp.fromBufferAttribute(p, i + 1);
            tmp2.fromBufferAttribute(p, i + 2);
            p.setXYZ(i + 1, tmp2.x, tmp2.y, tmp2.z);
            p.setXYZ(i + 2, tmp.x, tmp.y, tmp.z);
          }
        }
      }
      add(g, m);
    }
  }
  ext.dispose();
  // tail curling around the base toward the front
  const tail: THREE.Vector3[] = [];
  for (let i = 0; i <= 8; i++) {
    const a = -Math.PI / 2 - (i / 8) * Math.PI * 1.25;
    const r = 0.36 - i * 0.012;
    tail.push(new THREE.Vector3(Math.cos(a) * r * 1.1, 0.07 + Math.max(0, 0.14 - i * 0.02), -0.2 + Math.sin(a) * -r));
  }
  add(taperedTube(tail, 0.1, 0.02, 32, 6), new THREE.Matrix4());

  const merged = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  merged.computeVertexNormals();
  // vertex colors: grey-blue stone with moss on up-facing surfaces
  const stone = new THREE.Color(PAL.statue);
  const moss = new THREE.Color(PAL.statueMoss);
  const n = merged.attributes.normal!;
  const pos = merged.attributes.position!;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const up = THREE.MathUtils.smoothstep(n.getY(i), 0.55, 0.95);
    const noise = fbm(pos.getX(i) * 6, pos.getZ(i) * 6 + pos.getY(i) * 4, 3, 5);
    const lowAo = THREE.MathUtils.clamp(0.75 + pos.getY(i) * 0.25, 0.75, 1.05);
    c.copy(stone).lerp(moss, up * THREE.MathUtils.smoothstep(noise, 0.35, 0.6) * 0.85).multiplyScalar(lowAo * (0.9 + noise * 0.2));
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  merged.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return merged;
}

export function buildStatues(statues: readonly TileCoord[], portal: TileCoord, anisotropy: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'statues';
  const stoneTex = toTexture(paintStone(256, 3, false), { anisotropy, repeat: true });
  const spiralTex = toTexture(paintStone(256, 4, true), { anisotropy, repeat: true });

  const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, map: stoneTex, roughness: 0.92, metalness: 0, flatShading: true });
  const plainMat = new THREE.MeshStandardMaterial({ color: PAL.statue, map: stoneTex, roughness: 0.95, metalness: 0 });
  const spiralMat = new THREE.MeshStandardMaterial({ color: PAL.statue, map: spiralTex, roughness: 0.95, metalness: 0 });

  const dragonGeo = buildDragonGeometry();
  const baseGeo = new THREE.BoxGeometry(0.98, 0.18, 1.94);
  const capGeo = new THREE.BoxGeometry(0.92, 0.1, 1.72);
  const plinthGeo = new THREE.BoxGeometry(0.82, 0.62, 1.6);
  // side faces (+x, -x) are long: two spirals across them
  const uv = plinthGeo.attributes.uv!;
  for (let i = 0; i < 8; i++) uv.setX(i, uv.getX(i) * 2);
  const plinthMats = [spiralMat, spiralMat, plainMat, plainMat, spiralMat, spiralMat];

  const portalX = tileWorld(portal).x;
  for (const s of statues) {
    // statue occupies (col, row) and (col, row + 1)
    const a = tileWorld(s);
    const b = tileWorld({ col: s.col, row: s.row + 1 });
    const g = new THREE.Group();
    g.position.set(a.x, 0, (a.z + b.z) / 2);
    const side = Math.sign(a.x - portalX) || 1; // +1 right of the portal
    const base = new THREE.Mesh(baseGeo, plainMat);
    base.position.y = 0.09;
    const plinth = new THREE.Mesh(plinthGeo, plinthMats);
    plinth.position.y = 0.18 + 0.31;
    const cap = new THREE.Mesh(capGeo, plainMat);
    cap.position.y = 0.85;
    const dragon = new THREE.Mesh(dragonGeo, bodyMat);
    dragon.position.set(0, 0.9, 0.05);
    dragon.scale.setScalar(1.05);
    // turn slightly inward toward the portal (and toward the camera)
    dragon.rotation.y = -side * 0.35;
    for (const m of [base, plinth, cap, dragon]) {
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    }
    group.add(g);
  }
  return group;
}
