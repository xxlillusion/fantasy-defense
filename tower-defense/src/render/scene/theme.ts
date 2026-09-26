// Theme system: one ThemeSpec per MapTheme. A spec holds the palettes, lighting/fog/particles,
// post-FX grade + bloom, ground painting styles, and the per-theme builders for backdrop, the fall
// behind the portal, statues, tile props and the portal frame. buildWorld() assembles a map from it.
import * as THREE from 'three';
import type { MapTheme } from '../../core/types';
import type { MapDef } from '../../data';
import { FORGE_PAL, PAL, RUINS_PAL, type EnvPalette } from '../../art/env/palette';
import { DEFAULT_GRASS, DEFAULT_GROUND, type GrassStyle, type GroundStyle } from '../../art/env/textures';
import { SHRINE_POST, type PostSpec } from '../postfx/composer';
import { buildAtmosphere, SHRINE_ATMOS, type AtmosSpec, type Atmosphere } from './atmosphere';
import { buildBackdrop, buildNightSky, CLIFF_HEIGHT, SHRINE_BACKDROP, type BackdropStyle } from './backdrop';
import { buildForeground, buildTileProps, sharedFoliageMaterial, type PropStyle } from './foliage';
import { buildGround, lavaEmitters } from './ground';
import { buildPortal, type Portal, type PortalFrame } from './portal';
import { buildBrazierStatues, buildColumnStatues, buildStatues } from './statues';
import { tileWorld, type WorldPart } from './util';
import { buildFall, type FallKind } from './waterfall';

export interface BuildContext {
  readonly map: MapDef;
  readonly theme: ThemeSpec;
  readonly anisotropy: number;
  readonly foliageMat: THREE.Material;
}

export interface ThemeSpec {
  readonly id: MapTheme;
  readonly pal: EnvPalette;
  readonly grass: GrassStyle;
  readonly ground: GroundStyle;
  readonly atmos: AtmosSpec;
  readonly post: PostSpec;
  readonly backdrop: BackdropStyle;
  readonly props: PropStyle;
  readonly fall: FallKind;
  readonly portal: PortalFrame;
  /** Per-theme builders (all return parts that are disposed with the world root). */
  readonly build: {
    readonly backdrop: (ctx: BuildContext) => WorldPart;
    readonly fall: (ctx: BuildContext) => WorldPart;
    readonly statues: (ctx: BuildContext) => WorldPart;
    readonly props: (ctx: BuildContext) => WorldPart;
    readonly portal: (ctx: BuildContext) => Portal;
  };
}

// ------------------------------------------------------------------ shared builders

const portalX = (ctx: BuildContext) => tileWorld(ctx.map.portal).x;

const commonBuild: ThemeSpec['build'] = {
  backdrop: (ctx) => {
    const g = buildBackdrop(ctx.foliageMat, ctx.theme.backdrop);
    return { object: g };
  },
  fall: (ctx) => buildFall({ kind: ctx.theme.fall, pal: ctx.theme.pal, centerX: portalX(ctx), anisotropy: ctx.anisotropy }),
  statues: (ctx) => ({ object: buildStatues(ctx.map.statues, ctx.map.portal, ctx.anisotropy) }),
  props: (ctx) => {
    const group = new THREE.Group();
    group.name = 'props';
    group.add(buildTileProps(ctx.map, ctx.foliageMat, ctx.theme.props));
    group.add(buildForeground(ctx.foliageMat, ctx.theme.pal, portalX(ctx)));
    return { object: group };
  },
  portal: (ctx) => buildPortal(ctx.map.portal, ctx.theme.pal, ctx.theme.portal, ctx.anisotropy),
};

// ------------------------------------------------------------------ shrine (v1 look)

export const SHRINE_THEME: ThemeSpec = {
  id: 'shrine',
  pal: PAL,
  grass: DEFAULT_GRASS,
  ground: DEFAULT_GROUND,
  atmos: SHRINE_ATMOS,
  post: SHRINE_POST,
  backdrop: SHRINE_BACKDROP,
  props: { pal: PAL, tree: 'broadleaf', rock: 'mossy' },
  fall: 'water',
  portal: 'ring',
  build: commonBuild,
};

// ------------------------------------------------------------------ Ember Forge

export const FORGE_THEME: ThemeSpec = {
  id: 'forge',
  pal: FORGE_PAL,
  grass: { dabs: 700, blades: 3200, bladeLen: 0.32, flowers: 26, flowerAlpha: 0.5, cracks: 18, crackColor: '#ff7a2a' },
  ground: { slabMoss: 0, slabCrack: 0.5, missing: 0, soot: 3, rivets: true, lavaGlow: '#ff6a1a', grid: 'rgba(8,8,10,0.22)' },
  atmos: {
    fogNear: 20,
    fogFar: 70,
    hemi: 1.9,
    ambient: 0.45,
    ambientColor: 0x8a93a6,
    sun: 1.9,
    sunPos: [-8, 16, -10],
    fill: 0.55,
    fillColor: 0xa9b8cc,
    fillPos: [4, 8, 14],
    rim: { color: 0xff7a30, intensity: 0.9, pos: [0.5, 5, -14] },
    shafts: null,
    particles: { kind: 'embers', count: 340, color: new THREE.Color(1.0, 0.62, 0.22).multiplyScalar(2.2) },
    haze: { kind: 'smoke', color: 0x30323a, opacity: 0.22, count: 40 },
  },
  post: {
    bloom: { threshold: 0.74, intensity: 1.15, radius: 0.72 },
    grade: { shadowTint: [0.004, 0.008, 0.02], highlightTint: [1.04, 0.99, 0.94], desaturate: 0.2, contrast: 1.08, glow: 0.03 },
    vignette: { offset: 0.3, darkness: 0.64 },
  },
  backdrop: { pal: FORGE_PAL, cliffHeight: CLIFF_HEIGHT, ragged: 0, wet: 0.15, warm: new THREE.Color(0.62, 0.24, 0.1), forest: 'forge' },
  props: { pal: FORGE_PAL, tree: 'forge', rock: 'basalt', glow: new THREE.Color(1.0, 0.45, 0.12).multiplyScalar(2.2) },
  fall: 'lava',
  portal: 'forge',
  build: {
    ...commonBuild,
    statues: (ctx) => buildBrazierStatues(ctx.map.statues, ctx.map.portal, ctx.theme.pal, ctx.anisotropy),
  },
};

// ------------------------------------------------------------------ Moonlit Ruins

export const RUINS_THEME: ThemeSpec = {
  id: 'ruins',
  pal: RUINS_PAL,
  grass: { dabs: 900, blades: 6000, bladeLen: 0.8, flowers: 34, flowerAlpha: 0.45, cracks: 0, crackColor: '#000000' },
  ground: { slabMoss: 0.85, slabCrack: 0.6, missing: 0.14, soot: 0, rivets: false, lavaGlow: null, grid: 'rgba(6,10,24,0.2)' },
  atmos: {
    fogNear: 20,
    fogFar: 78,
    hemi: 2.2,
    ambient: 0.5,
    ambientColor: 0x8a93d0,
    sun: 2.8,
    sunPos: [4, 15, -14],
    fill: 0.5,
    fillColor: 0x8c96d8,
    fillPos: [-4, 8, 14],
    rim: null,
    shafts: { color: 0x9fb0ff, opacity: 0.13 },
    particles: { kind: 'fireflies', count: 120, color: new THREE.Color(0.8, 1.0, 0.35).multiplyScalar(2.2) },
    haze: { kind: 'mist', color: 0x7784c0, opacity: 0.1, count: 46 },
  },
  post: {
    bloom: { threshold: 0.7, intensity: 1.15, radius: 0.75 },
    grade: { shadowTint: [0.004, 0.006, 0.03], highlightTint: [0.95, 0.97, 1.06], desaturate: 0.18, contrast: 1.06, glow: 0.04 },
    vignette: { offset: 0.3, darkness: 0.6 },
  },
  backdrop: { pal: RUINS_PAL, cliffHeight: 4.2, ragged: 0.3, wet: 0, warm: null, forest: 'ruins' },
  props: { pal: RUINS_PAL, tree: 'dead', rock: 'fallen' },
  fall: 'pond',
  portal: 'arch',
  build: {
    ...commonBuild,
    backdrop: (ctx) => {
      const group = new THREE.Group();
      group.name = 'ruinsBackdrop';
      group.add(buildBackdrop(ctx.foliageMat, ctx.theme.backdrop));
      const sky = buildNightSky(ctx.theme.pal, ctx.anisotropy);
      group.add(sky.object);
      return { object: group, update: sky.update };
    },
    statues: (ctx) => buildColumnStatues(ctx.map.statues, ctx.map.portal, ctx.theme.pal, ctx.anisotropy),
  },
};

export const THEMES: Readonly<Record<MapTheme, ThemeSpec>> = {
  shrine: SHRINE_THEME,
  forge: FORGE_THEME,
  ruins: RUINS_THEME,
};

// ------------------------------------------------------------------ world assembly

export interface World {
  readonly root: THREE.Group;
  readonly portal: Portal;
  readonly atmos: Atmosphere;
  readonly parts: readonly WorldPart[];
}

export function buildWorld(map: MapDef, theme: ThemeSpec, anisotropy: number): World {
  const root = new THREE.Group();
  root.name = `environmentRoot:${map.id}`;
  const foliageMat = sharedFoliageMaterial();
  const ctx: BuildContext = { map, theme, anisotropy, foliageMat };
  const parts: WorldPart[] = [];
  const add = (p: WorldPart) => {
    root.add(p.object);
    parts.push(p);
    return p;
  };
  add(buildGround(map, { pal: theme.pal, grass: theme.grass, ground: theme.ground, anisotropy }));
  add(theme.build.backdrop(ctx));
  add(theme.build.props(ctx));
  add(theme.build.statues(ctx));
  const portal = theme.build.portal(ctx);
  root.add(portal.group);
  add(theme.build.fall(ctx));
  const emitters = theme.atmos.particles.kind === 'embers' ? [...lavaEmitters(map), ...fallEmitters(portalX(ctx))] : [];
  const atmos = buildAtmosphere(theme.pal, theme.atmos, anisotropy, emitters);
  add(atmos);
  return { root, portal, atmos, parts };
}

function fallEmitters(x: number): THREE.Vector3[] {
  return [-1, -0.5, 0, 0.5, 1].map((k) => new THREE.Vector3(x + k * 1.6, 0, -8.1 + Math.abs(k) * 0.4));
}
