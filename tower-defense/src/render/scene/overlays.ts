// Placement ghost (tile highlight + range ring + grid) and selection ring. Lives in layers.overlay.
import * as THREE from 'three';
import { GRID_COLS, GRID_ROWS } from '../../core/grid';
import type { PlacementGhost, Selection } from '../../core/interfaces';
import type { TileCoord } from '../../core/types';
import { paintGridOverlay, paintTileHighlight, toTexture } from '../../art/env/textures';
import { tileWorld } from './util';

const ringVert = /* glsl */ `
uniform float uExtent;
varying vec2 vP;
void main() { vP = position.xz * uExtent; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// Ring of constant world-space line width at radius uRange, faint fill inside, rotating dashes.
const ringFrag = /* glsl */ `
uniform float uRange;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uTime;
varying vec2 vP;
void main() {
  float d = length(vP);
  float w = 0.045;
  float aa = fwidth(d) * 1.2;
  float line = 1.0 - smoothstep(w - aa, w + aa, abs(d - uRange));
  float a = atan(vP.y, vP.x);
  float dash = step(0.5, fract(a / 6.2831 * floor(uRange * 7.0) + uTime * 0.25));
  float fill = (1.0 - smoothstep(uRange - aa, uRange, d)) * (0.06 + 0.06 * smoothstep(uRange * 0.4, uRange, d));
  float alpha = max(line * (0.6 + 0.4 * dash), fill);
  if (alpha < 0.003) discard;
  gl_FragColor = vec4(uColor, alpha * uOpacity);
}`;

class Ring {
  readonly mesh: THREE.Mesh;
  private readonly uniforms: { uRange: { value: number }; uExtent: { value: number }; uColor: { value: THREE.Color }; uOpacity: { value: number }; uTime: { value: number } };
  constructor(color: THREE.ColorRepresentation, geo: THREE.BufferGeometry) {
    this.uniforms = { uRange: { value: 1 }, uExtent: { value: 1.6 }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: 1 }, uTime: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: ringVert,
      fragmentShader: ringFrag,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.renderOrder = 1000;
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
  }
  set(pos: THREE.Vector3, range: number) {
    this.mesh.position.set(pos.x, 0.03, pos.z);
    // unit quad scaled to cover the ring; the shader works in world units via uExtent
    const extent = range + 0.3;
    this.mesh.scale.setScalar(extent);
    this.uniforms.uRange.value = range;
    this.uniforms.uExtent.value = extent;
  }
  get color() {
    return this.uniforms.uColor.value;
  }
  set opacity(v: number) {
    this.uniforms.uOpacity.value = v;
  }
  set time(v: number) {
    this.uniforms.uTime.value = v;
  }
}

export interface Overlays {
  readonly group: THREE.Group;
  setGhost(g: PlacementGhost | null): void;
  setSelection(s: Selection | null): void;
  update(dt: number, time: number): void;
}

export function buildOverlays(isBuildable: (t: TileCoord) => boolean, anisotropy: number): Overlays {
  const group = new THREE.Group();
  group.name = 'overlays';

  // grid (visible only while placing)
  const gridMat = new THREE.MeshBasicMaterial({
    map: toTexture(paintGridOverlay(isBuildable, 64), { anisotropy }),
    color: new THREE.Color(0xdff7ff),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    fog: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(GRID_COLS, GRID_ROWS).rotateX(-Math.PI / 2), gridMat);
  grid.position.y = 0.01;
  grid.renderOrder = 990;
  grid.visible = false;
  group.add(grid);

  // tile highlight
  const tileMat = new THREE.MeshBasicMaterial({
    map: toTexture(paintTileHighlight(128), { anisotropy }),
    transparent: true,
    depthTest: false,
    depthWrite: false,
    fog: false,
  });
  const tile = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), tileMat);
  tile.renderOrder = 995;
  tile.visible = false;
  group.add(tile);

  // unit quad (radius 1) for rings; the shader draws the ring at uRange (normalized)
  const quad = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const range = new Ring(0xeafcff, quad);
  const sel = new Ring(0xffd35a, quad);
  group.add(range.mesh, sel.mesh);

  const VALID = new THREE.Color(0x5dff9c);
  const INVALID = new THREE.Color(0xff4f5f);
  let ghostOn = false;
  let gridAlpha = 0;

  return {
    group,
    setGhost(g) {
      ghostOn = !!g;
      tile.visible = range.mesh.visible = !!g;
      if (!g) return;
      const w = tileWorld(g.tile, 0.02);
      tile.position.copy(w);
      tileMat.color.copy(g.valid ? VALID : INVALID);
      range.set(w, g.range);
      range.color.copy(g.valid ? new THREE.Color(0xeafcff) : INVALID);
    },
    setSelection(s) {
      sel.mesh.visible = !!s;
      if (!s) return;
      sel.set(tileWorld(s.tile), s.range);
    },
    update(dt, time) {
      gridAlpha += ((ghostOn ? 0.2 : 0) - gridAlpha) * Math.min(1, dt * 8);
      gridMat.opacity = gridAlpha;
      grid.visible = gridAlpha > 0.005;
      tileMat.opacity = 0.75 + 0.25 * Math.sin(time * 5);
      range.time = time;
      range.opacity = 0.85;
      sel.time = time;
      sel.opacity = 0.8 + 0.2 * Math.sin(time * 3);
    },
  };
}
