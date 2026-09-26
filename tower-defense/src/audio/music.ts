// Stream E: generated ambient fantasy loop, rendered offline into two sample-aligned stems.
//  - calm:   soft saw pads, Karplus-Strong harp arpeggios, sine bass, flute melody (second half)
//  - battle: taiko-style drums, shaker, staccato low-string ostinato (faded in during waves)
// 16 bars at 80 BPM in D minor (i - VI - III - VII | i - VI - iv - V). Tails wrap around the loop
// point so the loop is seamless. Rendering is split into small jobs so it never blocks a frame long.
import { type Layer, makeRng, midiToHz, normalize, renderLayer, renderPluck } from './synth';

export const MUSIC_SR = 22050;
const BPM = 80;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
const BARS = 16;
export const MUSIC_SECONDS = BAR * BARS;

interface Chord {
  pad: number[];
  bass: number;
  arp: number[];
}

const CHORDS: Record<string, Chord> = {
  Dm: { pad: [50, 57, 62, 65], bass: 38, arp: [62, 65, 69, 74] },
  Bb: { pad: [46, 53, 58, 62], bass: 34, arp: [58, 62, 65, 70] },
  F: { pad: [53, 57, 60, 65], bass: 41, arp: [60, 65, 69, 72] },
  C: { pad: [48, 55, 60, 64], bass: 36, arp: [60, 64, 67, 72] },
  Gm: { pad: [50, 55, 58, 62], bass: 43, arp: [55, 58, 62, 67] },
  A: { pad: [49, 52, 57, 61], bass: 33, arp: [57, 61, 64, 69] },
};
/** One chord per 2 bars. */
const PROGRESSION = ['Dm', 'Bb', 'F', 'C', 'Dm', 'Bb', 'Gm', 'A'];

/** [bar, beat, lengthBeats, midi] */
const MELODY: [number, number, number, number][] = [
  [8, 0, 2, 69], [8, 2, 1, 67], [8, 3, 1, 65],
  [9, 0, 4, 62],
  [10, 0, 2, 65], [10, 2, 2, 70],
  [11, 0, 4, 69],
  [12, 0, 2, 67], [12, 2, 1, 65], [12, 3, 1, 67],
  [13, 0, 4, 70],
  [14, 0, 2, 69], [14, 2, 2, 73],
  [15, 0, 4, 74],
];

export interface MusicStems {
  calm: Float32Array;
  battle: Float32Array;
  sampleRate: number;
}

export interface MusicJob {
  /** Do up to `budgetMs` of work; returns true when finished. */
  step(budgetMs: number): boolean;
  readonly result: MusicStems | null;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export function createMusicJob(sr = MUSIC_SR): MusicJob {
  const len = Math.round(MUSIC_SECONDS * sr);
  const calm = new Float32Array(len);
  const battle = new Float32Array(len);
  const rng = makeRng(20260926);
  const jobs: (() => void)[] = [];
  const at = (t: number) => Math.round(t * sr);
  const layer = (buf: Float32Array, l: Layer, t: number, gain = 1) => jobs.push(() => renderLayer(buf, sr, l, rng, at(t), true, gain));

  PROGRESSION.forEach((name, ci) => {
    const c = CHORDS[name];
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
      const freq = midiToHz(c.arp[idx]);
      jobs.push(() => renderPluck(calm, sr, freq, 1.8, vel, rng, at(t), true, 0.45));
    }
    // Battle: staccato low strings (8ths) on chord root.
    for (let e = 0; e < 16; e++) {
      const t = t0 + e * (BEAT / 2);
      const m = c.bass + 12 + (e % 4 === 2 ? 12 : 0);
      layer(battle, { wave: 'saw', freq: midiToHz(m), unison: [-5, 5], env: { a: 0.01, d: 0.08, s: 0.3, r: 0.12 }, lowpass: 1100, lowpassEnd: 500, steep: true, volume: e % 4 === 0 ? 0.35 : 0.22 }, t);
    }
  });

  // Flute melody in the second half.
  for (const [bar, beat, lenBeats, m] of MELODY) {
    const d = lenBeats * BEAT;
    layer(calm, { wave: 'sine', freq: midiToHz(m), vibrato: { depth: 0.006, rate: 5 }, env: { a: 0.12, d: 0.2, s: 0.8, h: Math.max(0, d - 0.45), r: 0.5 }, volume: 0.2 }, bar * BAR + beat * BEAT);
    layer(calm, { wave: 'noise', freq: 9000, env: { a: 0.1, h: Math.max(0, d - 0.3), r: 0.3 }, highpass: 3000, lowpass: 6000, volume: 0.015 }, bar * BAR + beat * BEAT);
  }

  // Battle percussion: taiko "BOOM . . BOOM-BOOM" + toms + shaker.
  for (let bar = 0; bar < BARS; bar++) {
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

  let i = 0;
  let result: MusicStems | null = null;
  return {
    get result() {
      return result;
    },
    step(budgetMs) {
      if (result) return true;
      const start = now();
      while (i < jobs.length) {
        jobs[i++]();
        if (now() - start > budgetMs) return false;
      }
      normalize(calm, 0.7);
      normalize(battle, 0.7);
      result = { calm, battle, sampleRate: sr };
      return true;
    },
  };
}
