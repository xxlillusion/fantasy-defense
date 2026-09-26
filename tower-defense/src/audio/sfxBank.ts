// Stream E: sound effect definitions (all synthesized) plus per-sound playback rules.
import type { SoundDef } from './synth';

export type SfxId =
  | 'fire_arrow'
  | 'fire_cannon'
  | 'fire_frost'
  | 'fire_frost_aura'
  | 'fire_sniper'
  | 'fire_tesla'
  | 'hit'
  | 'hit_boom'
  | 'kill_pop'
  | 'coin'
  | 'boss_death'
  | 'boss_roar'
  | 'leak'
  | 'build'
  | 'upgrade'
  | 'sell'
  | 'horn'
  | 'jingle'
  | 'sting_victory'
  | 'sting_defeat'
  | 'ui_click'
  | 'ui_hover'
  | 'ui_error'
  | 'ui_buy'
  | 'ui_open'
  | 'ui_close';

export interface PlayRule {
  /** Base volume 0..1 (before sfx/master). */
  volume: number;
  /** Max simultaneous voices of this sound. */
  maxVoices: number;
  /** Minimum ms between triggers of this sound. */
  minInterval: number;
  /** Random pitch variation (fraction, 0.05 = ±5%). */
  pitchVar: number;
  /** 'music' sounds follow the music volume instead of sfx (stings). */
  group?: 'sfx' | 'music';
  /** Excluded from ducking counts (UI, stings). */
  noDuck?: boolean;
}

const R = (volume: number, maxVoices: number, minInterval: number, pitchVar = 0.05, extra: Partial<PlayRule> = {}): PlayRule => ({
  volume,
  maxVoices,
  minInterval,
  pitchVar,
  ...extra,
});

export const PLAY_RULES: Record<SfxId, PlayRule> = {
  fire_arrow: R(0.35, 4, 45),
  fire_cannon: R(0.55, 3, 90),
  fire_frost: R(0.35, 3, 70),
  fire_frost_aura: R(0.4, 2, 150),
  fire_sniper: R(0.5, 2, 90),
  fire_tesla: R(0.4, 3, 80),
  hit: R(0.3, 4, 40),
  hit_boom: R(0.5, 3, 80),
  kill_pop: R(0.35, 4, 40),
  coin: R(0.22, 2, 70),
  boss_death: R(0.9, 1, 500, 0.02),
  boss_roar: R(0.7, 1, 1500, 0.02),
  leak: R(0.6, 1, 250, 0.02),
  build: R(0.6, 2, 60),
  upgrade: R(0.6, 1, 120, 0),
  sell: R(0.55, 1, 120, 0.02),
  horn: R(0.7, 1, 1000, 0),
  jingle: R(0.6, 1, 1000, 0),
  sting_victory: R(0.9, 1, 1000, 0, { group: 'music', noDuck: true }),
  sting_defeat: R(0.9, 1, 1000, 0, { group: 'music', noDuck: true }),
  ui_click: R(0.45, 2, 40, 0.03, { noDuck: true }),
  ui_hover: R(0.12, 1, 60, 0.03, { noDuck: true }),
  ui_error: R(0.45, 1, 150, 0, { noDuck: true }),
  ui_buy: R(0.5, 2, 60, 0.02, { noDuck: true }),
  ui_open: R(0.4, 1, 60, 0.02, { noDuck: true }),
  ui_close: R(0.4, 1, 60, 0.02, { noDuck: true }),
};

// Musical helpers (D minor / D dorian palette).
const N = (semi: number) => 293.66 * Math.pow(2, semi / 12); // relative to D4

export const SFX_DEFS: Record<SfxId, SoundDef> = {
  // Bow twang: short plucked square that drops, plus an airy whoosh.
  fire_arrow: {
    seed: 11,
    layers: [
      { wave: 'square', duty: 0.3, freq: 620, freqEnd: 300, env: { a: 0.002, d: 0.03, s: 0.3, r: 0.06 }, lowpass: 3000, volume: 0.6 },
      { wave: 'noise', freq: 9000, env: { a: 0.02, r: 0.12 }, lowpass: 5000, lowpassEnd: 1500, highpass: 800, volume: 0.5 },
    ],
  },
  // Hammer slam: deep sine thud with pitch drop + crunchy low noise.
  fire_cannon: {
    seed: 12,
    layers: [
      { wave: 'sine', freq: 140, freqEnd: 42, env: { a: 0.002, d: 0.08, s: 0.5, r: 0.25 }, volume: 1 },
      { wave: 'noise', freq: 2500, env: { a: 0.001, r: 0.18 }, lowpass: 1600, lowpassEnd: 200, steep: true, volume: 0.8 },
      { wave: 'square', freq: 90, freqEnd: 50, env: { a: 0.001, r: 0.06 }, lowpass: 600, volume: 0.3 },
    ],
  },
  // Icy chime: bright bell partials + crystalline shimmer.
  fire_frost: {
    seed: 13,
    layers: [
      { wave: 'sine', freq: 1760, env: { a: 0.002, r: 0.35 }, volume: 0.5 },
      { wave: 'sine', freq: 2637, env: { a: 0.002, r: 0.22 }, volume: 0.3 },
      { wave: 'triangle', freq: 3520, freqEnd: 4200, env: { a: 0.002, r: 0.12 }, volume: 0.2 },
      { wave: 'noise', freq: 16000, env: { a: 0.001, r: 0.08 }, highpass: 5000, volume: 0.25 },
    ],
  },
  // Frost L3 pulse: a softer, wider chime sweep.
  fire_frost_aura: {
    seed: 14,
    layers: [
      { wave: 'sine', freq: 1318, arp: { ratios: [1, 1.5, 2], step: 0.04 }, env: { a: 0.01, r: 0.4 }, volume: 0.5 },
      { wave: 'noise', freq: 12000, env: { a: 0.05, r: 0.3 }, highpass: 3000, lowpass: 9000, volume: 0.35 },
    ],
  },
  // Crescent slash "shing": metallic high saw ring + fast noise swipe.
  fire_sniper: {
    seed: 15,
    layers: [
      { wave: 'noise', freq: 14000, env: { a: 0.005, r: 0.1 }, highpass: 2500, lowpass: 12000, lowpassEnd: 4000, volume: 0.7 },
      { wave: 'saw', freq: 2400, freqEnd: 2600, vibrato: { depth: 0.01, rate: 40 }, env: { a: 0.004, d: 0.03, s: 0.4, r: 0.3 }, lowpass: 7000, highpass: 1500, volume: 0.4, delay: 0.02 },
      { wave: 'sine', freq: 3700, env: { a: 0.004, r: 0.25 }, volume: 0.25, delay: 0.02 },
    ],
  },
  // Electric zap: buzzy square with fast random-ish vibrato + crackle noise.
  fire_tesla: {
    seed: 16,
    layers: [
      { wave: 'square', duty: 0.2, freq: 900, freqEnd: 300, vibrato: { depth: 0.35, rate: 70 }, env: { a: 0.001, d: 0.05, s: 0.4, r: 0.12 }, lowpass: 5000, volume: 0.5 },
      { wave: 'noise', freq: 3000, env: { a: 0.001, h: 0.05, r: 0.1 }, highpass: 1500, volume: 0.6 },
      { wave: 'saw', freq: 60, env: { a: 0.001, h: 0.08, r: 0.08 }, lowpass: 1200, volume: 0.25 },
    ],
  },
  // Light thwack.
  hit: {
    seed: 21,
    layers: [
      { wave: 'noise', freq: 5000, env: { a: 0.001, r: 0.06 }, lowpass: 3000, lowpassEnd: 800, volume: 0.8 },
      { wave: 'sine', freq: 260, freqEnd: 120, env: { a: 0.001, r: 0.05 }, volume: 0.5 },
    ],
  },
  // Splash boom.
  hit_boom: {
    seed: 22,
    layers: [
      { wave: 'noise', freq: 1800, env: { a: 0.002, d: 0.05, s: 0.5, r: 0.35 }, lowpass: 2000, lowpassEnd: 150, steep: true, volume: 1 },
      { wave: 'sine', freq: 90, freqEnd: 35, env: { a: 0.002, r: 0.3 }, volume: 0.8 },
    ],
  },
  // Poof: bubbly upward pop + soft air.
  kill_pop: {
    seed: 23,
    layers: [
      { wave: 'sine', freq: 300, freqEnd: 900, env: { a: 0.001, r: 0.07 }, volume: 0.7 },
      { wave: 'noise', freq: 6000, env: { a: 0.005, r: 0.15 }, lowpass: 2500, lowpassEnd: 600, volume: 0.5 },
    ],
  },
  // Coin ding (B6 -> E7, classic).
  coin: {
    seed: 24,
    layers: [{ wave: 'square', duty: 0.5, freq: 1976, arp: { ratios: [1, 1.335], step: 0.06 }, env: { a: 0.001, h: 0.05, r: 0.2 }, lowpass: 6000, volume: 0.5 }],
  },
  // Stone golem crumble: long rumbling noise, falling low tone, rock clacks.
  boss_death: {
    sampleRate: 22050,
    seed: 25,
    layers: [
      { wave: 'noise', freq: 900, env: { a: 0.01, d: 0.3, s: 0.6, h: 0.3, r: 0.9 }, lowpass: 900, lowpassEnd: 100, steep: true, volume: 1 },
      { wave: 'sine', freq: 80, freqEnd: 28, env: { a: 0.01, h: 0.4, r: 0.9 }, volume: 0.9 },
      { wave: 'noise', freq: 400, env: { a: 0.001, r: 0.05 }, lowpass: 2000, volume: 0.6, delay: 0.25 },
      { wave: 'noise', freq: 300, env: { a: 0.001, r: 0.06 }, lowpass: 1800, volume: 0.5, delay: 0.5 },
      { wave: 'noise', freq: 350, env: { a: 0.001, r: 0.05 }, lowpass: 1500, volume: 0.4, delay: 0.8 },
    ],
  },
  // Boss arrival: low growl.
  boss_roar: {
    sampleRate: 22050,
    seed: 26,
    layers: [
      { wave: 'saw', freq: 70, freqEnd: 55, vibrato: { depth: 0.06, rate: 9 }, env: { a: 0.15, h: 0.5, r: 0.6 }, lowpass: 700, steep: true, unison: [-15, 15], volume: 0.9 },
      { wave: 'noise', freq: 1200, env: { a: 0.2, h: 0.4, r: 0.6 }, lowpass: 900, steep: true, volume: 0.5 },
    ],
  },
  // Portal hurt: dull low gong with a dissonant partial.
  leak: {
    sampleRate: 22050,
    seed: 27,
    layers: [
      { wave: 'sine', freq: 110, env: { a: 0.005, r: 1.1 }, volume: 0.9 },
      { wave: 'sine', freq: 156, env: { a: 0.005, r: 0.8 }, volume: 0.45 },
      { wave: 'triangle', freq: 233, freqEnd: 220, env: { a: 0.005, r: 0.5 }, volume: 0.3 },
      { wave: 'noise', freq: 1500, env: { a: 0.001, r: 0.08 }, lowpass: 1200, volume: 0.4 },
    ],
  },
  // Build: wooden thunk + sparkle arpeggio.
  build: {
    seed: 31,
    layers: [
      { wave: 'sine', freq: 180, freqEnd: 90, env: { a: 0.001, r: 0.12 }, volume: 0.9 },
      { wave: 'noise', freq: 3000, env: { a: 0.001, r: 0.06 }, lowpass: 1500, volume: 0.6 },
      { wave: 'sine', freq: N(24), arp: { ratios: [1, 1.26, 1.5, 2], step: 0.045 }, env: { a: 0.002, h: 0.15, r: 0.2 }, volume: 0.25, delay: 0.08 },
    ],
  },
  // Upgrade: rising square arpeggio with echo.
  upgrade: {
    seed: 32,
    echo: { delay: 0.09, feedback: 0.35, mix: 0.5 },
    layers: [
      { wave: 'square', duty: 0.25, freq: N(12), arp: { ratios: [1, 1.26, 1.5, 2, 2.52, 3], step: 0.055 }, env: { a: 0.002, h: 0.3, r: 0.15 }, lowpass: 4500, volume: 0.5 },
      { wave: 'triangle', freq: N(0), freqEnd: N(12), env: { a: 0.01, h: 0.25, r: 0.2 }, volume: 0.35 },
    ],
  },
  // Sell: coin cascade.
  sell: {
    seed: 33,
    layers: [0, 1, 2, 3, 4].map((i) => ({
      wave: 'square' as const,
      freq: 1976 * (1 + 0.06 * (i % 3)),
      arp: { ratios: [1, 1.335], step: 0.05 },
      env: { a: 0.001, h: 0.04, r: 0.15 },
      lowpass: 6000,
      volume: 0.45 - i * 0.06,
      delay: i * 0.065,
    })),
  },
  // War horn: slow-attack brassy saw with a bend up, fifth below for weight.
  horn: {
    sampleRate: 22050,
    seed: 41,
    layers: [
      { wave: 'saw', freq: N(-17), freqEnd: N(-12), vibrato: { depth: 0.008, rate: 5 }, env: { a: 0.18, d: 0.1, s: 0.85, h: 0.7, r: 0.5 }, lowpass: 1400, steep: true, unison: [-6, 6], volume: 0.9 },
      { wave: 'saw', freq: N(-24), freqEnd: N(-19), env: { a: 0.22, h: 0.8, r: 0.5 }, lowpass: 700, steep: true, volume: 0.5 },
    ],
  },
  // Wave cleared: short major jingle D-F#-A-D.
  jingle: {
    sampleRate: 22050,
    seed: 42,
    echo: { delay: 0.12, feedback: 0.3, mix: 0.4 },
    layers: [0, 4, 7, 12].map((semi, i) => ({
      wave: 'triangle' as const,
      freq: N(semi + 12),
      env: { a: 0.004, d: 0.05, s: 0.6, h: i === 3 ? 0.25 : 0.05, r: 0.2 },
      volume: 0.6,
      delay: i * 0.1,
    })),
  },
  // Victory fanfare: brass arpeggio into a held D major chord.
  sting_victory: {
    sampleRate: 22050,
    seed: 43,
    echo: { delay: 0.18, feedback: 0.25, mix: 0.35 },
    layers: [
      ...[0, 4, 7].map((semi, i) => ({
        wave: 'saw' as const,
        freq: N(semi),
        env: { a: 0.02, d: 0.05, s: 0.7, h: 0.08, r: 0.1 },
        lowpass: 2200,
        steep: true,
        volume: 0.5,
        delay: i * 0.16,
      })),
      ...[0, 4, 7, 12].map((semi) => ({
        wave: 'saw' as const,
        freq: N(semi),
        vibrato: { depth: 0.006, rate: 5.5 },
        env: { a: 0.05, d: 0.2, s: 0.7, h: 1.0, r: 0.8 },
        lowpass: 2600,
        lowpassEnd: 1200,
        steep: true,
        unison: [-5, 5],
        volume: 0.35,
        delay: 0.5,
      })),
      { wave: 'sine', freq: N(-12), env: { a: 0.02, h: 1.3, r: 0.8 }, volume: 0.5, delay: 0.5 },
    ],
  },
  // Defeat: slow descending minor motif (D-C-Bb-A) over a low drone.
  sting_defeat: {
    sampleRate: 22050,
    seed: 44,
    echo: { delay: 0.25, feedback: 0.3, mix: 0.4 },
    layers: [
      ...[0, -2, -4, -5].map((semi, i) => ({
        wave: 'triangle' as const,
        freq: N(semi),
        vibrato: { depth: 0.01, rate: 4.5 },
        env: { a: 0.03, d: 0.1, s: 0.7, h: i === 3 ? 0.9 : 0.25, r: 0.4 },
        volume: 0.6,
        delay: i * 0.45,
      })),
      { wave: 'saw', freq: N(-24), env: { a: 0.4, h: 1.6, r: 1.0 }, lowpass: 400, steep: true, volume: 0.5 },
    ],
  },
  // UI.
  ui_click: {
    seed: 51,
    layers: [{ wave: 'square', duty: 0.5, freq: 1200, freqEnd: 900, env: { a: 0.001, r: 0.035 }, lowpass: 4000, volume: 0.6 }],
  },
  ui_hover: {
    seed: 52,
    layers: [{ wave: 'sine', freq: 1800, env: { a: 0.003, r: 0.03 }, volume: 0.5 }],
  },
  ui_error: {
    seed: 53,
    layers: [
      { wave: 'square', duty: 0.5, freq: 140, env: { a: 0.002, h: 0.07, r: 0.03 }, lowpass: 1800, volume: 0.5 },
      { wave: 'square', duty: 0.5, freq: 147, env: { a: 0.002, h: 0.07, r: 0.03 }, lowpass: 1800, volume: 0.5, delay: 0.11 },
    ],
  },
  ui_buy: {
    seed: 54,
    layers: [
      { wave: 'square', duty: 0.5, freq: 1568, arp: { ratios: [1, 1.5], step: 0.05 }, env: { a: 0.001, h: 0.06, r: 0.12 }, lowpass: 5000, volume: 0.45 },
      { wave: 'sine', freq: 200, freqEnd: 110, env: { a: 0.001, r: 0.06 }, volume: 0.4 },
    ],
  },
  ui_open: {
    seed: 55,
    layers: [
      { wave: 'triangle', freq: 500, freqEnd: 900, env: { a: 0.005, r: 0.08 }, volume: 0.6 },
      { wave: 'noise', freq: 8000, env: { a: 0.02, r: 0.06 }, highpass: 2000, volume: 0.2 },
    ],
  },
  ui_close: {
    seed: 56,
    layers: [
      { wave: 'triangle', freq: 900, freqEnd: 480, env: { a: 0.005, r: 0.08 }, volume: 0.6 },
      { wave: 'noise', freq: 8000, env: { a: 0.02, r: 0.06 }, highpass: 2000, volume: 0.2 },
    ],
  },
};

export const SFX_IDS = Object.keys(SFX_DEFS) as SfxId[];
