// Color helpers + the warm, saturated palettes used by the pixel sprites.
// Colors are plain 0xRRGGBB numbers (sRGB).

export interface Ramp {
  /** Outline: a dark, saturated version of the local color (never pure black). */
  o: number;
  /** Shadow tone. */
  d: number;
  /** Mid (base) tone. */
  m: number;
  /** Lit tone. */
  l: number;
  /** Specular highlight pixel. */
  h: number;
}

export function rgb(c: number): [number, number, number] {
  return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
}

export function pack(r: number, g: number, b: number): number {
  const cl = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return (cl(r) << 16) | (cl(g) << 8) | cl(b);
}

export function mix(a: number, b: number, t: number): number {
  const [ar, ag, ab] = rgb(a);
  const [br, bg, bb] = rgb(b);
  return pack(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

export function toHsl(c: number): [number, number, number] {
  const [r8, g8, b8] = rgb(c);
  const r = r8 / 255, g = g8 / 255, b = b8 / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

export function fromHsl(h: number, s: number, l: number): number {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return pack((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

/** Hue shift toward a target hue (degrees) by `amount` degrees along the shortest arc. */
function hueToward(h: number, target: number, amount: number): number {
  let d = ((target - h + 540) % 360) - 180;
  if (Math.abs(d) < amount) return target;
  return h + Math.sign(d) * amount;
}

/**
 * Pixel-art style ramp: shadows shift toward purple/blue and gain saturation,
 * lights shift toward yellow. Outline is a dark version of the local color.
 */
export function ramp(base: number): Ramp {
  const [h, s, l] = toHsl(base);
  const dark = (dl: number, dh: number, ds: number) => fromHsl(hueToward(h, 265, dh), s + ds, l * dl);
  const light = (dl: number, dh: number, ds: number) => fromHsl(hueToward(h, 55, dh), s + ds, l + (1 - l) * dl);
  return {
    o: outlineOf(base),
    d: dark(0.72, 12, 0.08),
    m: base,
    l: light(0.28, 8, 0),
    h: light(0.62, 14, -0.1),
  };
}

export function outlineOf(c: number): number {
  const [h, s, l] = toHsl(c);
  return fromHsl(hueToward(h, 270, 18), Math.min(1, s * 0.9 + 0.15), Math.max(0.06, l * 0.3));
}

// ---------------------------------------------------------------- named colors

export const C = {
  skin: 0xffd6b0,
  skinWisp: 0xf4fbff,
  blush: 0xff8fa0,
  white: 0xf6f3ff,
  gold: 0xffc23d,
  wood: 0xa8683a,
  stone: 0x9d9aab,
  steel: 0xb4bccb,

  // Archer
  blonde: 0xffd54a,
  purple: 0x8f4fd8,
  lavender: 0xc6a2ff,
  magenta: 0xff2e97,
  // Hammer knight
  redHair: 0xff6a2b,
  hoodRed: 0xd8283a,
  hammerYellow: 0xffcf2e,
  hammerRed: 0xe0303a,
  // Frost mage
  silverBlue: 0xbcd6ff,
  robeBlue: 0x2f62f0,
  teal: 0x18c9b0,
  tome: 0x7a2fb0,
  frostGlow: 0x7ff3ff,
  // Shadow blade
  blackHair: 0x2e2640,
  coatPurple: 0x5d2a90,
  coatBlack: 0x2a2036,
  katana: 0xdfe8f4,
  crimson: 0xd02848,
  // Wisp
  cyan: 0x5fe6ff,
  // Hero
  heroCoat: 0xd42a2a,

  // Enemies
  goblin: 0x86c23c,
  leather: 0x8a5424,
  capRed: 0xd8343a,
  wolf: 0x9a7a66,
  wolfDark: 0x6a5048,
  troll: 0x9aa050,
  armor: 0x8f9ab8,
  trim: 0xc0303a,
  imp: 0xe23a5c,
  wyvern: 0x8a3ab8,
  belly: 0xffa640,
  golem: 0x958d80,
  moss: 0x6aa84a,
  rune: 0xff8a2a,
} as const;
