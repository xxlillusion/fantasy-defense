// Stream E: generated music, rendered offline into two sample-aligned stems per map theme.
//  calm   = the always-on bed; battle = the extra layer faded in during waves.
//
//  shrine: 16 bars @ 80 BPM, D minor (i-VI-III-VII | i-VI-iv-V). Saw pads, Karplus-Strong harp,
//          sine bass, flute melody | battle: taiko, toms, shaker, staccato low strings.
//  forge:  16 bars @ 84 BPM, E phrygian (i-bII-i-bvii | i-bII-bIII-bII). Distorted low E pedal drone,
//          dark pads, soft low drums, anvil clang on every downbeat, low horn motif | battle: driving taiko
//          with rolls, rim clicks, phrygian power-chord ostinato, extra anvil on beat 3.
//  ruins:  16 bars @ 72 BPM, A aeolian (i-VI-III-VII | i-VI-iv-v). Airy pads + air noise, sparse celesta /
//          music-box arpeggio with echo, distant choir-ish "oo" tones, glassy melody | battle: soft toms,
//          pizzicato, shaker.
//
// Tails wrap around the loop point so loops are seamless. Rendering is split into many small jobs
// (including the final peak scan / normalize) so it never blocks a frame for long.
import type { MapTheme } from '../core/types';
import { applyGainSoftClip, type Layer, makeLayerRenderer, makeRng, midiToHz, peakAbs, renderPluck } from './synth';

/** Samples per render job slice (well under 1 ms of work for a unison pad). */
const SLICE = 4096;

export const MUSIC_SR = 22050;

export interface MusicStems {
  calm: Float32Array;
  battle: Float32Array;
  sampleRate: number;
}

export interface RenderJob<T> {
  /** Do up to `budgetMs` of work (one job may overrun slightly); returns true when finished. */
  step(budgetMs: number): boolean;
  readonly result: T | null;
}
export type MusicJob = RenderJob<MusicStems>;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Composition context: schedules render jobs into loop buffers. */
export interface LoopCtx {
  sr: number;
  rng: () => number;
  /** Seconds -> sample index. */
  at(t: number): number;
  layer(buf: Float32Array, l: Layer, t: number, gain?: number): void;
  pluck(buf: Float32Array, freq: number, dur: number, vel: number, t: number, bright?: number): void;
  /** Arbitrary custom job. */
  job(fn: () => void): void;
}

/**
 * Generic time-sliced loop renderer: `compose` schedules jobs into `stems` buffers of `seconds` length,
 * then each stem is peak-normalized to `peak` in chunks.
 */
export function createLoopJob(seconds: number, sr: number, stemCount: number, seed: number, peak: number, compose: (ctx: LoopCtx, stems: Float32Array[]) => void): RenderJob<Float32Array[]> {
  const len = Math.max(1, Math.round(seconds * sr));
  const stems = Array.from({ length: stemCount }, () => new Float32Array(len));
  const rng = makeRng(seed);
  /** A job returning false is not finished and will be called again (resumable slices). */
  const jobs: (() => boolean | void)[] = [];
  const at = (t: number) => Math.round(t * sr);
  const ctx: LoopCtx = {
    sr,
    rng,
    at,
    layer: (buf, l, t, gain = 1) => {
      let run: ((max: number) => boolean) | null = null;
      jobs.push(() => (run ??= makeLayerRenderer(buf, sr, l, rng, at(t), true, gain))(SLICE));
    },
    pluck: (buf, freq, dur, vel, t, bright = 0.45) => jobs.push(() => renderPluck(buf, sr, freq, dur, vel, rng, at(t), true, bright)),
    job: (fn) => jobs.push(fn),
  };
  compose(ctx, stems);
  // Chunked normalize: peak scan, then gain + soft clip.
  const CHUNK = 16384;
  for (const buf of stems) {
    let m = 0;
    for (let s = 0; s < len; s += CHUNK) jobs.push(() => void (m = Math.max(m, peakAbs(buf, s, Math.min(len, s + CHUNK)))));
    for (let s = 0; s < len; s += CHUNK) jobs.push(() => void (m >= 1e-6 && applyGainSoftClip(buf, peak / m, s, Math.min(len, s + CHUNK))));
  }
  let i = 0;
  let result: Float32Array[] | null = null;
  return {
    get result() {
      return result;
    },
    step(budgetMs) {
      if (result) return true;
      const start = now();
      while (i < jobs.length) {
        if (jobs[i]() !== false) i++;
        if (now() - start > budgetMs) return false;
      }
      result = stems;
      return true;
    },
  };
}

interface ThemeSpec {
  bpm: number;
  bars: number;
  seed: number;
  compose(ctx: LoopCtx, calm: Float32Array, battle: Float32Array, beat: number, bar: number): void;
}

// ------------------------------------------------------------------ shrine (v1 loop, unchanged)

interface Chord {
  pad: number[];
  bass: number;
  arp: number[];
}

const SHRINE_CHORDS: Record<string, Chord> = {
  Dm: { pad: [50, 57, 62, 65], bass: 38, arp: [62, 65, 69, 74] },
  Bb: { pad: [46, 53, 58, 62], bass: 34, arp: [58, 62, 65, 70] },
  F: { pad: [53, 57, 60, 65], bass: 41, arp: [60, 65, 69, 72] },
  C: { pad: [48, 55, 60, 64], bass: 36, arp: [60, 64, 67, 72] },
  Gm: { pad: [50, 55, 58, 62], bass: 43, arp: [55, 58, 62, 67] },
  A: { pad: [49, 52, 57, 61], bass: 33, arp: [57, 61, 64, 69] },
};
/** One chord per 2 bars. */
const SHRINE_PROGRESSION = ['Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'Gm', 'A'];

/** [bar, beat, lengthBeats, midi] */
type Note = [number, number, number, number];
const SHRINE_MELODY: Note[] = [
  [8, 0, 2, 69], [8, 2, 1, 67], [8, 3, 1, 65],
  [9, 0, 4, 62],
  [10, 0, 2, 65], [10, 2, 2, 70],
  [11, 0, 4, 69],
  [12, 0, 2, 67], [12, 2, 1, 65], [12, 3, 1, 67],
  [13, 0, 4, 70],
  [14, 0, 2, 69], [14, 2, 2, 73],
  [15, 0, 4, 74],
];

const SHRINE: ThemeSpec = {
  bpm: 80,
  bars: 16,
  seed: 20260926,
  compose({ rng, layer, pluck }, calm, battle, BEAT, BAR) {
    SHRINE_PROGRESSION.forEach((name, ci) => {
      const c = SHRINE_CHORDS[name];
      const t0 = ci * 2 * BAR;
      // Pads: slow swell, detuned saws through a soft low-pass.
      for (const m of c.pad) {
        layer(calm, { wave: 'saw', freq: midiToHz(m), unison: [-7, 7], env: { a: 1.4, h: 2 * BAR - 1.4, r: 1.6 }, lowpass: 750, steep: true, vibrato: { depth: 0.002, rate: 0.3 }, volume: 0.16 }, t0);
      }
      // Bass: one note per bar.
      for (let b = 0; b < 2; b++) {
        layer(calm, { wave: 'sine', freq: midiToHz(c.bass), env: { a: 0.08, d: 0.6, s: 0.6, h: BAR - 0.9, r: 0.8 }, volume: 0.35 }, t0 + b * BAR);
        layer(calm, { wave: 'triangle', freq: midiToHz(c.bass + 12), env: { a: 0.05, r: 1.2 }, lowpass: 600, volume: 0.1 }, t0 + b * BAR);
      }
      // Harp: eighth-note arpeggio, deterministic variations.
      const pattern = [0, 1, 2, 3, 2, 1, 2, 1];
      for (let e = 0; e < 16; e++) {
        const t = t0 + e * (BEAT / 2);
        let idx = pattern[e % 8];
        if (rng() < 0.2) idx = (idx + 1) % c.arp.length;
        if (e % 8 === 7 && rng() < 0.4) continue; // breathe
        const vel = e % 4 === 0 ? 0.32 : 0.2;
        pluck(calm, midiToHz(c.arp[idx]), 1.8, vel, t, 0.45);
      }
      // Battle: staccato low strings (8ths) on chord root.
      for (let e = 0; e < 16; e++) {
        const t = t0 + e * (BEAT / 2);
        const m = c.bass + 12 + (e % 4 === 2 ? 12 : 0);
        layer(battle, { wave: 'saw', freq: midiToHz(m), unison: [-5, 5], env: { a: 0.01, d: 0.08, s: 0.3, r: 0.12 }, lowpass: 1100, lowpassEnd: 500, steep: true, volume: e % 4 === 0 ? 0.35 : 0.22 }, t);
      }
    });

    // Flute melody in the second half.
    for (const [bar, beat, lenBeats, m] of SHRINE_MELODY) {
      const d = lenBeats * BEAT;
      layer(calm, { wave: 'sine', freq: midiToHz(m), vibrato: { depth: 0.006, rate: 5 }, env: { a: 0.12, d: 0.2, s: 0.8, h: Math.max(0, d - 0.45), r: 0.5 }, volume: 0.2 }, bar * BAR + beat * BEAT);
      layer(calm, { wave: 'noise', freq: 9000, env: { a: 0.1, h: Math.max(0, d - 0.3), r: 0.3 }, highpass: 3000, lowpass: 6000, volume: 0.015 }, bar * BAR + beat * BEAT);
    }

    // Battle percussion: taiko "BOOM . . BOOM-BOOM" + toms + shaker.
    for (let bar = 0; bar < 16; bar++) {
      const t0 = bar * BAR;
      for (const beat of [0, 2.5, 3]) {
        const accent = beat === 0 ? 1 : 0.75;
        layer(battle, { wave: 'sine', freq: 110, freqEnd: 42, env: { a: 0.002, d: 0.1, s: 0.4, r: 0.35 }, volume: 0.9 * accent }, t0 + beat * BEAT);
        layer(battle, { wave: 'noise', freq: 2000, env: { a: 0.001, r: 0.12 }, lowpass: 900, lowpassEnd: 150, steep: true, volume: 0.45 * accent }, t0 + beat * BEAT);
      }
      for (const beat of [1, 3.5]) {
        layer(battle, { wave: 'sine', freq: 190, freqEnd: 120, env: { a: 0.002, r: 0.22 }, volume: 0.4 }, t0 + beat * BEAT);
      }
      for (let e = 0; e < 8; e++) {
        layer(battle, { wave: 'noise', freq: 16000, env: { a: 0.005, r: 0.06 }, highpass: 6000, volume: e % 2 ? 0.08 : 0.13 }, t0 + e * (BEAT / 2));
      }
    }
  },
};

// ------------------------------------------------------------------ forge (E phrygian, heavy)

const FORGE_CHORDS: Record<string, { pad: number[]; bass: number }> = {
  Em: { pad: [52, 59, 64, 67], bass: 40 },
  F: { pad: [53, 60, 65, 69], bass: 41 },
  Dm: { pad: [50, 57, 62, 65], bass: 38 },
  G: { pad: [50, 55, 59, 62], bass: 43 },
};
const FORGE_PROGRESSION = ['Em', 'F', 'Em', 'Dm', 'Em', 'F', 'G', 'F'];
const FORGE_HORN: Note[] = [
  [8, 0, 2, 52], [8, 2, 2, 53],
  [9, 0, 4, 52],
  [10, 0, 2, 55], [10, 2, 1, 53], [10, 3, 1, 52],
  [11, 0, 4, 50],
  [12, 0, 2, 52], [12, 2, 2, 53],
  [13, 0, 2, 55], [13, 2, 2, 57],
  [14, 0, 2, 55], [14, 2, 2, 53],
  [15, 0, 4, 52],
];

/** Anvil: inharmonic metallic partials + a hammer click. */
function anvil(ctx: LoopCtx, buf: Float32Array, t: number, f: number, gain: number): void {
  const partials: [number, number, number][] = [
    [1, 0.9, 0.5],
    [2.76, 0.5, 0.3],
    [5.4, 0.25, 0.18],
    [8.93, 0.12, 0.1],
  ];
  for (const [ratio, rel, vol] of partials) {
    const fr = f * ratio;
    if (fr > ctx.sr * 0.45) continue;
    ctx.layer(buf, { wave: 'sine', freq: fr, env: { a: 0.001, r: rel }, volume: vol * gain }, t);
  }
  ctx.layer(buf, { wave: 'noise', freq: 9000, env: { a: 0.001, r: 0.03 }, highpass: 2000, volume: 0.35 * gain }, t);
}

const FORGE: ThemeSpec = {
  bpm: 84,
  bars: 16,
  seed: 1455,
  compose(ctx, calm, battle, BEAT, BAR) {
    const { layer } = ctx;
    FORGE_PROGRESSION.forEach((name, ci) => {
      const c = FORGE_CHORDS[name];
      const t0 = ci * 2 * BAR;
      const seg = 2 * BAR;
      // Distorted low E pedal drone (overlapping segments so it never gaps), plus the fifth.
      layer(calm, { wave: 'saw', freq: midiToHz(28), unison: [-14, 0, 14], env: { a: 1.0, h: seg - 1.0, r: 1.4 }, lowpass: 380, steep: true, volume: 0.26 }, t0);
      layer(calm, { wave: 'square', duty: 0.3, freq: midiToHz(40), unison: [-9, 9], env: { a: 1.0, h: seg - 1.0, r: 1.4 }, lowpass: 520, steep: true, volume: 0.1 }, t0);
      layer(calm, { wave: 'saw', freq: midiToHz(35), env: { a: 1.2, h: seg - 1.2, r: 1.4 }, lowpass: 320, steep: true, volume: 0.1 }, t0);
      // Dark pads.
      for (const m of c.pad) {
        layer(calm, { wave: 'saw', freq: midiToHz(m), unison: [-6, 6], env: { a: 1.6, h: seg - 1.6, r: 1.6 }, lowpass: 520, steep: true, vibrato: { depth: 0.002, rate: 0.25 }, volume: 0.1 }, t0);
      }
      // Bass.
      for (let b = 0; b < 2; b++) {
        layer(calm, { wave: 'sine', freq: midiToHz(c.bass), env: { a: 0.05, d: 0.5, s: 0.6, h: BAR - 0.8, r: 0.7 }, volume: 0.32 }, t0 + b * BAR);
      }
      // Battle: phrygian power-chord ostinato in 8ths (root + fifth), a b2 flick at the end of each bar.
      for (let e = 0; e < 16; e++) {
        const t = t0 + e * (BEAT / 2);
        const flick = e % 8 === 6 ? 1 : 0;
        const root = c.bass + 12 + flick;
        const acc = e % 4 === 0 ? 1 : 0.65;
        layer(battle, { wave: 'saw', freq: midiToHz(root), unison: [-8, 8], env: { a: 0.005, d: 0.07, s: 0.35, r: 0.1 }, lowpass: 950, lowpassEnd: 380, steep: true, volume: 0.26 * acc }, t);
        layer(battle, { wave: 'square', duty: 0.35, freq: midiToHz(root + 7), env: { a: 0.005, d: 0.07, s: 0.3, r: 0.1 }, lowpass: 800, steep: true, volume: 0.12 * acc }, t);
      }
    });

    // Low horn motif in the second half.
    for (const [bar, beat, lenBeats, m] of FORGE_HORN) {
      const d = lenBeats * BEAT;
      layer(calm, { wave: 'saw', freq: midiToHz(m), unison: [-5, 5], vibrato: { depth: 0.005, rate: 4.5 }, env: { a: 0.15, d: 0.2, s: 0.8, h: Math.max(0, d - 0.5), r: 0.5 }, lowpass: 1000, steep: true, volume: 0.2 }, bar * BAR + beat * BEAT);
    }

    for (let bar = 0; bar < 16; bar++) {
      const t0 = bar * BAR;
      // Calm: anvil on every downbeat (two hammers alternate), soft low drums.
      anvil(ctx, calm, t0, bar % 2 ? 880 : 988, bar % 4 === 0 ? 0.3 : 0.22);
      for (const beat of [0, 2.5]) {
        layer(calm, { wave: 'sine', freq: 88, freqEnd: 42, env: { a: 0.002, d: 0.08, s: 0.4, r: 0.35 }, volume: beat === 0 ? 0.45 : 0.3 }, t0 + beat * BEAT);
      }
      // Battle: driving taiko.
      for (const [beat, accent] of [[0, 1], [1, 0.6], [1.5, 0.75], [2, 0.9], [3, 0.7], [3.5, 0.8]] as const) {
        layer(battle, { wave: 'sine', freq: 105, freqEnd: 38, env: { a: 0.002, d: 0.1, s: 0.45, r: 0.38 }, volume: 0.95 * accent }, t0 + beat * BEAT);
        layer(battle, { wave: 'noise', freq: 1800, env: { a: 0.001, r: 0.14 }, lowpass: 850, lowpassEnd: 130, steep: true, volume: 0.5 * accent }, t0 + beat * BEAT);
      }
      // Rim clicks on the off-8ths.
      for (let e = 1; e < 8; e += 2) {
        layer(battle, { wave: 'noise', freq: 9000, env: { a: 0.001, r: 0.03 }, highpass: 2200, volume: 0.12 }, t0 + e * (BEAT / 2));
      }
      // Extra anvil on beat 3.
      anvil(ctx, battle, t0 + 2 * BEAT, 988, 0.16);
      // 16th-note roll leading into every 4th bar.
      if (bar % 4 === 3) {
        for (let s = 0; s < 4; s++) {
          layer(battle, { wave: 'sine', freq: 150, freqEnd: 70, env: { a: 0.002, r: 0.18 }, volume: 0.35 + s * 0.12 }, t0 + 3 * BEAT + s * (BEAT / 4));
        }
      }
    }
  },
};

// ------------------------------------------------------------------ ruins (A aeolian, sparse, nocturnal)

const RUINS_CHORDS: Record<string, Chord> = {
  Am: { pad: [57, 60, 64, 69], bass: 45, arp: [69, 72, 76, 81] },
  F: { pad: [53, 57, 60, 65], bass: 41, arp: [69, 72, 77, 81] },
  C: { pad: [55, 60, 64, 67], bass: 48, arp: [67, 72, 76, 79] },
  G: { pad: [55, 59, 62, 67], bass: 43, arp: [67, 71, 74, 79] },
  Dm: { pad: [53, 57, 62, 65], bass: 50, arp: [69, 74, 77, 81] },
  Em: { pad: [55, 59, 64, 67], bass: 40, arp: [67, 71, 76, 79] },
};
const RUINS_PROGRESSION = ['Am', 'F', 'C', 'G', 'Am', 'F', 'Dm', 'Em'];
const RUINS_MELODY: Note[] = [
  [8, 0, 3, 76], [8, 3, 1, 74],
  [9, 0, 4, 72],
  [10, 0, 3, 72], [10, 3, 1, 71],
  [11, 0, 4, 67],
  [12, 0, 3, 76], [12, 3, 1, 77],
  [13, 0, 4, 76],
  [14, 0, 2, 74], [14, 2, 2, 72],
  [15, 0, 4, 71],
];

const RUINS: ThemeSpec = {
  bpm: 72,
  bars: 16,
  seed: 7713,
  compose(ctx, calm, battle, BEAT, BAR) {
    const { layer, rng, pluck } = ctx;
    const celesta = (m: number, t: number, vel: number) => {
      const f = midiToHz(m);
      layer(calm, { wave: 'sine', freq: f, env: { a: 0.002, r: 1.4 }, volume: vel }, t);
      layer(calm, { wave: 'sine', freq: f * 4, env: { a: 0.001, r: 0.25 }, volume: vel * 0.18 }, t);
      layer(calm, { wave: 'triangle', freq: f * 2, env: { a: 0.001, r: 0.5 }, volume: vel * 0.12 }, t);
    };
    RUINS_PROGRESSION.forEach((name, ci) => {
      const c = RUINS_CHORDS[name];
      const t0 = ci * 2 * BAR;
      const seg = 2 * BAR;
      // Airy pads (soft triangles) + a breath of filtered air.
      for (const m of c.pad) {
        layer(calm, { wave: 'triangle', freq: midiToHz(m), unison: [-6, 6], env: { a: 2.0, h: seg - 2.0, r: 2.4 }, lowpass: 1400, vibrato: { depth: 0.002, rate: 0.2 }, volume: 0.09 }, t0);
      }
      layer(calm, { wave: 'noise', freq: 11000, env: { a: 2.5, h: seg - 2.5, r: 2.5 }, highpass: 900, lowpass: 2600, volume: 0.025 }, t0);
      // Distant choir-ish "oo": dark detuned saws, slow swell, with a quieter delayed echo.
      for (const m of [c.pad[1] + 12, c.pad[3]]) {
        const l: Layer = { wave: 'saw', freq: midiToHz(m), unison: [-10, 0, 10], vibrato: { depth: 0.004, rate: 4.5 }, env: { a: 1.8, h: seg - 1.8, r: 2.0 }, lowpass: 850, steep: true, volume: 0.05 };
        layer(calm, l, t0);
        layer(calm, { ...l, unison: undefined, lowpass: 600 }, t0 + 0.35, 0.35);
      }
      // Soft bass, one note per chord.
      layer(calm, { wave: 'sine', freq: midiToHz(c.bass - 12), env: { a: 0.4, h: seg - 1.2, r: 1.4 }, volume: 0.22 }, t0);
      // Celesta / music-box arpeggio: sparse 8ths with an echo a dotted-8th later.
      const pattern = [0, 2, 1, 3, 2, 1, 3, 2];
      for (let e = 0; e < 16; e++) {
        const strong = e % 4 === 0;
        if (!strong && rng() < 0.45) continue;
        const t = t0 + e * (BEAT / 2);
        const m = c.arp[pattern[e % 8]] + (rng() < 0.12 ? 12 : 0);
        const vel = strong ? 0.18 : 0.12;
        celesta(m, t, vel);
        layer(calm, { wave: 'sine', freq: midiToHz(m), env: { a: 0.002, r: 1.0 }, volume: vel * 0.3 }, t + 0.75 * BEAT);
      }
      // Battle: pizzicato on chord tones in 8ths.
      const thirdNote = c.pad.find((m) => [3, 4].includes((((m - c.bass) % 12) + 12) % 12)) ?? c.bass + 3;
      const third = ((((thirdNote - c.bass) % 12) + 12) % 12) + 12;
      const pizz = [0, 7, 12, 7, 0, 7, third, 12];
      for (let e = 0; e < 16; e++) {
        const t = t0 + e * (BEAT / 2);
        pluck(battle, midiToHz(c.bass + 12 + pizz[e % 8]), 0.4, e % 4 === 0 ? 0.42 : 0.28, t, 0.7);
      }
    });

    // Glassy melody in the second half (sine + a faint octave).
    for (const [bar, beat, lenBeats, m] of RUINS_MELODY) {
      const d = lenBeats * BEAT;
      const t = bar * BAR + beat * BEAT;
      layer(calm, { wave: 'sine', freq: midiToHz(m), vibrato: { depth: 0.005, rate: 4.8 }, env: { a: 0.25, d: 0.3, s: 0.7, h: Math.max(0, d - 0.8), r: 0.9 }, volume: 0.13 }, t);
      layer(calm, { wave: 'sine', freq: midiToHz(m + 12), env: { a: 0.3, h: Math.max(0, d - 0.6), r: 0.6 }, volume: 0.025 }, t);
    }

    // Battle percussion: soft toms + shaker.
    for (let bar = 0; bar < 16; bar++) {
      const t0 = bar * BAR;
      for (const beat of [0, 2]) {
        layer(battle, { wave: 'sine', freq: 115, freqEnd: 62, env: { a: 0.003, d: 0.08, s: 0.4, r: 0.35 }, volume: 0.6 }, t0 + beat * BEAT);
      }
      for (const beat of [1.5, 3, 3.5]) {
        layer(battle, { wave: 'sine', freq: 175, freqEnd: 105, env: { a: 0.003, r: 0.25 }, volume: 0.35 }, t0 + beat * BEAT);
        layer(battle, { wave: 'noise', freq: 1500, env: { a: 0.002, r: 0.06 }, lowpass: 700, volume: 0.12 }, t0 + beat * BEAT);
      }
      for (let e = 0; e < 8; e++) {
        layer(battle, { wave: 'noise', freq: 14000, env: { a: 0.008, r: 0.05 }, highpass: 5000, volume: e % 2 ? 0.05 : 0.08 }, t0 + e * (BEAT / 2));
      }
    }
  },
};

export const MUSIC_THEMES: Record<MapTheme, ThemeSpec> = { shrine: SHRINE, forge: FORGE, ruins: RUINS };

/** Loop length in seconds for a theme. */
export const musicSeconds = (theme: MapTheme): number => {
  const t = MUSIC_THEMES[theme];
  return (60 / t.bpm) * 4 * t.bars;
};
/** v1 constant (shrine loop length). */
export const MUSIC_SECONDS = musicSeconds('shrine');

export function createMusicJob(sr = MUSIC_SR, theme: MapTheme = 'shrine'): MusicJob {
  const spec = MUSIC_THEMES[theme] ?? SHRINE;
  const beat = 60 / spec.bpm;
  const inner = createLoopJob(musicSeconds(theme), sr, 2, spec.seed, 0.7, (ctx, [calm, battle]) => spec.compose(ctx, calm, battle, beat, beat * 4));
  let result: MusicStems | null = null;
  return {
    get result() {
      return result;
    },
    step(budgetMs) {
      if (result) return true;
      if (!inner.step(budgetMs)) return false;
      const [calm, battle] = inner.result!;
      result = { calm, battle, sampleRate: sr };
      return true;
    },
  };
}
