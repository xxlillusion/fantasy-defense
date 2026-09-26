// Environment palettes (sRGB hex), one per map theme. Characters (Stream C) are warm and saturated;
// keep the environment cool/desaturated so they pop. Canvas colors are CSS strings, mesh colors numbers.
import type { MapTheme } from '../../core/types';

export interface EnvPalette {
  // ground (painted on canvas)
  readonly grassBase: string;
  readonly grassDark: string;
  readonly grassDeep: string;
  readonly grassMid: string;
  readonly grassLight: string;
  readonly grassTip: string;
  readonly moss: string;
  readonly flowerA: string;
  readonly flowerB: string;
  // path stone
  readonly stoneLight: string;
  readonly stone: string;
  readonly stoneDark: string;
  readonly seam: string;
  // world meshes
  readonly statue: number;
  readonly statueMoss: number;
  readonly cliff: number;
  readonly cliffDark: number;
  readonly cliffMoss: number;
  readonly forestA: number;
  readonly forestB: number;
  readonly forestC: number;
  readonly trunk: number;
  readonly leafA: number;
  readonly leafB: number;
  readonly leafC: number;
  readonly rock: number;
  readonly rockDark: number;
  // atmosphere / fx
  readonly fog: number;
  readonly sky: number;
  readonly hemiSky: number;
  readonly hemiGround: number;
  readonly sun: number;
  /** Water mid tone (forge: lava mid). */
  readonly water: number;
  /** Water deep tone (forge: lava crust). */
  readonly waterDeep: number;
  /** Foam / highlights (forge: hot lava). */
  readonly foam: number;
  readonly portal: number;
  readonly portalCore: number;
  /** Ambient particle tint (dust / embers / fireflies). */
  readonly dust: number;
}

/** Waterfall Shrine (v1): misty teal forest. */
export const PAL: EnvPalette = {
  grassBase: '#58796a',
  grassDark: '#3e5a50',
  grassDeep: '#324a44',
  grassMid: '#66876f',
  grassLight: '#7e9e88',
  grassTip: '#8eab98',
  moss: '#5b7a5c',
  flowerA: '#c9dde6',
  flowerB: '#9fb9d6',
  stoneLight: '#a3aeb2',
  stone: '#8a9599',
  stoneDark: '#67737a',
  seam: '#2b3836',
  statue: 0x93a2b0,
  statueMoss: 0x55705f,
  cliff: 0x7d8c93,
  cliffDark: 0x56656c,
  cliffMoss: 0x4a6552,
  forestA: 0x2f5049,
  forestB: 0x3b5d55,
  forestC: 0x26433e,
  trunk: 0x3d3a38,
  leafA: 0x3f6456,
  leafB: 0x4f7563,
  leafC: 0x365548,
  rock: 0x6f7a80,
  rockDark: 0x4d575d,
  fog: 0x8aa9b0,
  sky: 0x9db8bf,
  hemiSky: 0xcfe3ea,
  hemiGround: 0x2b3d38,
  sun: 0xe8f1f2,
  water: 0x2c6570,
  waterDeep: 0x173c45,
  foam: 0xdaf4ff,
  portal: 0x5fe6ff,
  portalCore: 0xc8fbff,
  dust: 0xd6f2ff,
};

/** Ember Forge: charcoal basalt and cool smoke, hot orange accents only where things burn. */
export const FORGE_PAL: EnvPalette = {
  grassBase: '#46454a',
  grassDark: '#343338',
  grassDeep: '#2a292e',
  grassMid: '#545257',
  grassLight: '#646164',
  grassTip: '#6c6664',
  moss: '#4b3f3a',
  flowerA: '#ff9a4a',
  flowerB: '#ffcf6a',
  stoneLight: '#959ba0',
  stone: '#767c82',
  stoneDark: '#585d63',
  seam: '#19191c',
  statue: 0x55585f,
  statueMoss: 0x6b4a3a,
  cliff: 0x45464e,
  cliffDark: 0x24242a,
  cliffMoss: 0x5c3d30,
  forestA: 0x2f2b2b,
  forestB: 0x3b3635,
  forestC: 0x232021,
  trunk: 0x2b2523,
  leafA: 0x4a4646,
  leafB: 0x575251,
  leafC: 0x3a3637,
  rock: 0x4d4e55,
  rockDark: 0x2e2f35,
  fog: 0x3f4452,
  sky: 0x30343f,
  hemiSky: 0x8f9aae,
  hemiGround: 0x2c1c16,
  sun: 0xc9d5e6,
  water: 0xff6a12,
  waterDeep: 0x4a0f06,
  foam: 0xffc45a,
  portal: 0x5fe6ff,
  portalCore: 0xc8fbff,
  dust: 0xff9440,
};

/** Moonlit Ruins: deep blue-violet night, dark moss, pale moonlight, green-yellow fireflies. */
export const RUINS_PAL: EnvPalette = {
  grassBase: '#304a52',
  grassDark: '#263a44',
  grassDeep: '#1e2c37',
  grassMid: '#3a5a64',
  grassLight: '#4a6c76',
  grassTip: '#54767c',
  moss: '#2f5249',
  flowerA: '#c2d0ff',
  flowerB: '#95a6e6',
  stoneLight: '#9ea2be',
  stone: '#7c809c',
  stoneDark: '#565a73',
  seam: '#151927',
  statue: 0x8a90ac,
  statueMoss: 0x3f5f5b,
  cliff: 0x50557a,
  cliffDark: 0x2c2f4a,
  cliffMoss: 0x2f4b50,
  forestA: 0x1d2639,
  forestB: 0x26324b,
  forestC: 0x171d2e,
  trunk: 0x3a3848,
  leafA: 0x2b3c4d,
  leafB: 0x36495d,
  leafC: 0x233140,
  rock: 0x606580,
  rockDark: 0x3c4058,
  fog: 0x2b3158,
  sky: 0x1d2144,
  hemiSky: 0x8c95dc,
  hemiGround: 0x161a30,
  sun: 0xc4d0ff,
  water: 0x22305c,
  waterDeep: 0x0d1434,
  foam: 0xd0dcff,
  portal: 0x5fe6ff,
  portalCore: 0xc8fbff,
  dust: 0xd9ff7a,
};

export const PALETTES: Readonly<Record<MapTheme, EnvPalette>> = {
  shrine: PAL,
  forge: FORGE_PAL,
  ruins: RUINS_PAL,
};
