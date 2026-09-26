// Stream E: tiny sfxr-style offline synthesizer. Pure (no DOM) and deterministic (seeded RNG).
//
// A sound is a list of layers mixed together. Each layer is one oscillator with:
// pitch slide, vibrato, arpeggio, ADSR envelope, one/two-pole low-pass (with sweep) and high-pass.

export type Wave = 'square' | 'saw' | 'sine' | 'triangle' | 'noise';

export interface Envelope {
  /** Attack time (s). */
  a: number;
  /** Decay time (s) from peak to sustain level. */
  d?: number;
  /** Sustain level 0..1 (default 1). */
  s?: number;
  /** Sustain hold time (s). */
  h?: number;
  /** Release time (s). */
  r: number;
}

export interface Layer {
  wave: Wave;
  /** Start frequency (Hz). For noise it is the sample-and-hold rate (sfxr style). */
  freq: number;
  /** End frequency; slides exponentially across the whole layer. */
  freqEnd?: number;
  /** Square duty cycle 0..1 (default 0.5). */
  duty?: number;
  env: Envelope;
  volume?: number;
  /** Start offset (s). */
  delay?: number;
  vibrato?: { depth: number; rate: number };
  /** Frequency multipliers stepped every `step` seconds (e.g. [1, 1.25, 1.5]). */
  arp?: { ratios: number[]; step: number };
  /** Low-pass cutoff (Hz), optionally swept to lowpassEnd. Two-pole when `steep`. */
  lowpass?: number;
  lowpassEnd?: number;
  steep?: boolean;
  highpass?: number;
  /** Detuned copies (unison) in cents, e.g. [-8, 8]. */
  unison?: number[];
}

export interface SoundDef {
  layers: Layer[];
  seed?: number;
  /** Simple feedback echo. */
  echo?: { delay: number; feedback: number; mix: number };
  /** Normalize the peak to this value (default 0.85). */
  peak?: number;
  /** Preferred sample rate (long, dark sounds render cheaper at 22050). */
  sampleRate?: number;
}

/** mulberry32: small fast deterministic PRNG. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0 || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const envLength = (e: Envelope) => e.a + (e.d ?? 0) + (e.h ?? 0) + e.r;

export function envAt(e: Envelope, t: number): number {
  if (t < 0) return 0;
  if (t < e.a) return e.a > 0 ? t / e.a : 1;
  t -= e.a;
  const s = e.s ?? 1;
  const d = e.d ?? 0;
  if (t < d) return 1 - (1 - s) * (t / d);
  t -= d;
  const h = e.h ?? 0;
  if (t < h) return s;
  t -= h;
  if (t < e.r) {
    const x = 1 - t / e.r;
    return s * x * x; // curved release sounds more natural
  }
  return 0;
}

export const layerLength = (l: Layer) => (l.delay ?? 0) + envLength(l.env);

export function soundLength(def: SoundDef): number {
  let len = 0;
  for (const l of def.layers) len = Math.max(len, layerLength(l));
  if (def.echo) len += def.echo.delay * 4;
  return len;
}

const TAU = Math.PI * 2;

/**
 * Additively render one layer into `out` starting at sample `offset`.
 * Writes wrap modulo out.length when `wrap` is set (for seamless music loops).
 */
const WAVE_CODE: Record<Wave, number> = { square: 0, saw: 1, sine: 2, triangle: 3, noise: 4 };

export function renderLayer(out: Float32Array, sr: number, l: Layer, rng: () => number, offset = 0, wrap = false, gain = 1): void {
  const start = offset + Math.round((l.delay ?? 0) * sr);
  const e = l.env;
  const n = Math.ceil(envLength(e) * sr);
  if (n <= 0) return;
  // Envelope segment boundaries in samples.
  const aN = Math.max(1, e.a * sr);
  const dN = (e.d ?? 0) * sr;
  const hN = (e.h ?? 0) * sr;
  const rN = Math.max(1, e.r * sr);
  const sus = e.s ?? 1;
  const adN = aN + dN;
  const adhN = adN + hN;
  // Pitch: exponential slide as a per-sample multiplier.
  const f0 = l.freq;
  const f1 = l.freqEnd ?? l.freq;
  const slideMul = f1 !== f0 && f0 > 0 && f1 > 0 && n > 1 ? Math.exp(Math.log(f1 / f0) / (n - 1)) : 1;
  const vibD = l.vibrato ? l.vibrato.depth : 0;
  const vibK = l.vibrato ? (TAU * l.vibrato.rate) / sr : 0;
  const arpR = l.arp ? l.arp.ratios : null;
  const arpInv = l.arp ? 1 / (l.arp.step * sr) : 0;
  const vol = (l.volume ?? 1) * gain;
  const duty = l.duty ?? 0.5;
  const wave = WAVE_CODE[l.wave];
  const cents = l.unison && l.unison.length ? l.unison : [0];
  const nu = cents.length;
  const detunes = new Float64Array(cents.map((c) => Math.pow(2, c / 1200) / sr));
  const uGain = 1 / Math.sqrt(nu);
  const phases = new Float64Array(nu);
  const noiseVals = new Float64Array(nu);
  for (let u = 0; u < nu; u++) {
    phases[u] = rng();
    noiseVals[u] = rng() * 2 - 1;
  }
  // Filters: one-pole coefficients, linearly interpolated when sweeping.
  const coef = (fc: number) => 1 - Math.exp((-TAU * Math.min(fc, sr * 0.45)) / sr);
  const lpOn = (l.lowpass ?? 0) > 0;
  const lpA0 = lpOn ? coef(l.lowpass!) : 0;
  const lpA1 = lpOn ? coef(l.lowpassEnd ?? l.lowpass!) : 0;
  const lpDA = n > 1 ? (lpA1 - lpA0) / (n - 1) : 0;
  const steep = !!l.steep;
  const hpA = l.highpass ? coef(l.highpass) : 0;
  let lp1 = 0;
  let lp2 = 0;
  let hpState = 0;
  let fBase = f0;
  let lpA = lpA0;
  const len = out.length;
  for (let i = 0; i < n; i++) {
    let f = fBase;
    fBase *= slideMul;
    if (vibD) f *= 1 + vibD * Math.sin(vibK * i);
    if (arpR) f *= arpR[((i * arpInv) | 0) % arpR.length];
    let x = 0;
    for (let u = 0; u < nu; u++) {
      let ph = phases[u] + f * detunes[u];
      if (ph >= 1) {
        ph -= ph | 0;
        if (wave === 4) noiseVals[u] = rng() * 2 - 1;
      }
      phases[u] = ph;
      if (wave === 0) x += ph < duty ? 1 : -1;
      else if (wave === 1) x += 2 * ph - 1;
      else if (wave === 2) x += Math.sin(TAU * ph);
      else if (wave === 3) x += ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph;
      else x += noiseVals[u];
    }
    if (nu > 1) x *= uGain;
    if (lpOn) {
      lp1 += lpA * (x - lp1);
      if (steep) {
        lp2 += lpA * (lp1 - lp2);
        x = lp2;
      } else x = lp1;
      lpA += lpDA;
    }
    if (hpA) {
      hpState += hpA * (x - hpState);
      x -= hpState;
    }
    let env: number;
    if (i < aN) env = i / aN;
    else if (i < adN) env = 1 - ((1 - sus) * (i - aN)) / dN;
    else if (i < adhN) env = sus;
    else {
      const r = 1 - (i - adhN) / rN;
      env = r > 0 ? sus * r * r : 0;
    }
    let idx = start + i;
    if (idx >= len) {
      if (!wrap) break;
      idx %= len;
    }
    out[idx] += x * env * vol;
  }
}

function applyEcho(buf: Float32Array, sr: number, echo: NonNullable<SoundDef['echo']>): void {
  const d = Math.max(1, Math.round(echo.delay * sr));
  const wet = new Float32Array(buf.length);
  for (let i = d; i < buf.length; i++) wet[i] = (buf[i - d] + wet[i - d]) * echo.feedback;
  for (let i = 0; i < buf.length; i++) buf[i] += wet[i] * echo.mix;
}

/** Normalize peak to `peak`, with a tanh soft clip for safety. */
export function normalize(buf: Float32Array, peak: number): void {
  let m = 0;
  for (let i = 0; i < buf.length; i++) m = Math.max(m, Math.abs(buf[i]));
  if (m < 1e-6) return;
  const g = peak / m;
  const k = 1 / Math.tanh(1.1);
  for (let i = 0; i < buf.length; i++) {
    // Cheap soft clip: tanh only where it matters.
    const x = buf[i] * g * 1.1;
    const x2 = x * x;
    buf[i] = (x > 0.5 || x < -0.5 ? Math.tanh(x) : x * (1 - x2 / 3 + (2 * x2 * x2) / 15)) * k;
  }
}

/** Render a whole SoundDef to PCM. Deterministic for a given seed. */
export function renderSound(def: SoundDef, sr: number): Float32Array {
  const out = new Float32Array(Math.max(1, Math.ceil(soundLength(def) * sr)));
  const rng = makeRng(def.seed ?? 1);
  for (const l of def.layers) renderLayer(out, sr, l, rng);
  if (def.echo) applyEcho(out, sr, def.echo);
  // 3 ms fade in/out to avoid clicks.
  const fade = Math.min(out.length >> 1, Math.round(0.003 * sr));
  for (let i = 0; i < fade; i++) {
    out[i] *= i / fade;
    out[out.length - 1 - i] *= i / fade;
  }
  normalize(out, def.peak ?? 0.85);
  return out;
}

/** Karplus-Strong plucked string (harp) added into `out`. */
export function renderPluck(out: Float32Array, sr: number, freq: number, dur: number, vol: number, rng: () => number, offset: number, wrap = true, bright = 0.5): void {
  const period = Math.max(2, Math.round(sr / freq));
  const ring = new Float32Array(period);
  for (let i = 0; i < period; i++) ring[i] = rng() * 2 - 1;
  // Pre-soften the excitation for a mellow harp tone.
  for (let pass = 0; pass < 2; pass++) for (let i = 1; i < period; i++) ring[i] = ring[i] * bright + ring[i - 1] * (1 - bright);
  const n = Math.round(dur * sr);
  const len = out.length;
  const decay = 0.996;
  let idx = 0;
  for (let i = 0; i < n; i++) {
    const next = (idx + 1) % period;
    const y = ring[idx];
    ring[idx] = (ring[idx] + ring[next]) * 0.5 * decay;
    idx = next;
    const fadeOut = i > n - 400 ? (n - i) / 400 : 1;
    const o = offset + i;
    const v = y * vol * fadeOut;
    if (wrap) out[o % len] += v;
    else if (o < len) out[o] += v;
  }
}

/** Semitones from A4 -> Hz. */
export const midiToHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
