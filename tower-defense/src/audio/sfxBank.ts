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
  | 'ui_close'
  // v2: L4 branch fire variants
  | 'fire_volley'
  | 'fire_pierce'
  | 'fire_quake'
  | 'fire_mortar'
  | 'fire_abszero'
  | 'fire_shatter'
  | 'fire_assassin'
  | 'fire_seer'
  | 'fire_storm'
  | 'fire_overload'
  // v2: hero
  | 'hero_attack'
  | 'hero_hurt'
  | 'hero_down'
  | 'hero_respawn'
  | 'hero_levelup'
  | 'hero_move'
  // v2: abilities
  | 'meteor_whistle'
  | 'meteor_impact'
  | 'frost_nova'
  | 'gold_rush'
  | 'blade_storm'
  // v2: enemy traits & specials
  | 'heal_chime'
  | 'shield_clank'
  | 'shield_break'
  | 'split_squelch'
  | 'reveal_shimmer'
  | 'execute_slash'
  | 'pierce_tick'
  | 'dragon_roar';

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
  // v2 branch fire: L4 towers fire slowly, so fewer voices but longer sounds.
  fire_volley: R(0.35, 2, 110),
  fire_pierce: R(0.45, 2, 120),
  fire_quake: R(0.7, 2, 250, 0.04),
  fire_mortar: R(0.6, 2, 180),
  fire_abszero: R(0.4, 1, 400, 0.03),
  fire_shatter: R(0.4, 3, 80),
  fire_assassin: R(0.5, 2, 150),
  fire_seer: R(0.45, 2, 180, 0.03),
  fire_storm: R(0.45, 2, 180),
  fire_overload: R(0.65, 2, 250, 0.04),
  // v2 hero
  hero_attack: R(0.5, 2, 250),
  hero_hurt: R(0.3, 1, 450, 0.08),
  hero_down: R(0.7, 1, 1000, 0),
  hero_respawn: R(0.6, 1, 1000, 0, { noDuck: true }),
  hero_levelup: R(0.65, 1, 800, 0, { noDuck: true }),
  hero_move: R(0.14, 1, 1500, 0.03, { noDuck: true }),
  // v2 abilities (player-triggered and rare: never ducked)
  meteor_whistle: R(0.5, 2, 200, 0.02, { noDuck: true }),
  meteor_impact: R(0.95, 2, 200, 0.03, { noDuck: true }),
  frost_nova: R(0.7, 1, 500, 0, { noDuck: true }),
  gold_rush: R(0.6, 1, 500, 0, { noDuck: true }),
  blade_storm: R(0.45, 1, 500, 0, { noDuck: true }),
  // v2 traits
  heal_chime: R(0.16, 1, 900, 0.04),
  shield_clank: R(0.3, 2, 90, 0.08),
  shield_break: R(0.5, 2, 120),
  split_squelch: R(0.45, 2, 120),
  reveal_shimmer: R(0.3, 2, 250),
  execute_slash: R(0.55, 2, 150),
  pierce_tick: R(0.16, 3, 35, 0.1),
  dragon_roar: R(0.75, 1, 1500, 0.02),
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

  // ---------------------------------------------------------------- v2: L4 branch fire
  // Arrow A, Rapid Volley: three quick twangs + one airy whoosh.
  fire_volley: {
    seed: 61,
    layers: [
      ...[0, 1, 2].map((i) => ({ wave: 'square' as const, duty: 0.3, freq: 700 + i * 45, freqEnd: 330, env: { a: 0.002, d: 0.025, s: 0.3, r: 0.05 }, lowpass: 3200, volume: 0.55 - i * 0.05, delay: i * 0.055 })),
      { wave: 'noise', freq: 9000, env: { a: 0.02, h: 0.08, r: 0.12 }, lowpass: 5000, lowpassEnd: 1500, highpass: 800, volume: 0.45 },
    ],
  },
  // Arrow B, Piercing Longbow: deep whoosh + heavy string + thunk.
  fire_pierce: {
    seed: 62,
    layers: [
      { wave: 'noise', freq: 6000, env: { a: 0.03, h: 0.05, r: 0.18 }, lowpass: 2500, lowpassEnd: 600, steep: true, highpass: 200, volume: 0.8 },
      { wave: 'square', duty: 0.35, freq: 330, freqEnd: 150, env: { a: 0.002, d: 0.04, s: 0.3, r: 0.08 }, lowpass: 1500, volume: 0.5 },
      { wave: 'sine', freq: 160, freqEnd: 70, env: { a: 0.001, r: 0.1 }, volume: 0.8, delay: 0.12 },
      { wave: 'noise', freq: 2000, env: { a: 0.001, r: 0.04 }, lowpass: 1500, volume: 0.5, delay: 0.12 },
    ],
  },
  // Cannon A, Earthquake: sub-bass rumble + rock cracks.
  fire_quake: {
    sampleRate: 22050,
    seed: 63,
    layers: [
      { wave: 'sine', freq: 55, freqEnd: 30, vibrato: { depth: 0.08, rate: 13 }, env: { a: 0.01, d: 0.1, s: 0.7, h: 0.25, r: 0.5 }, volume: 1 },
      { wave: 'noise', freq: 600, env: { a: 0.02, h: 0.2, r: 0.5 }, lowpass: 500, lowpassEnd: 120, steep: true, volume: 0.9 },
      { wave: 'square', freq: 80, freqEnd: 40, env: { a: 0.001, r: 0.08 }, lowpass: 500, volume: 0.4 },
      { wave: 'noise', freq: 4000, env: { a: 0.001, r: 0.07 }, lowpass: 3500, highpass: 600, volume: 0.6 },
      { wave: 'noise', freq: 2500, env: { a: 0.001, r: 0.05 }, lowpass: 2500, highpass: 500, volume: 0.4, delay: 0.09 },
      { wave: 'noise', freq: 3000, env: { a: 0.001, r: 0.04 }, lowpass: 2800, highpass: 500, volume: 0.3, delay: 0.21 },
    ],
  },
  // Cannon B, Meteor Mortar: boom + fire crackle.
  fire_mortar: {
    seed: 64,
    layers: [
      { wave: 'sine', freq: 120, freqEnd: 36, env: { a: 0.002, d: 0.1, s: 0.5, r: 0.35 }, volume: 1 },
      { wave: 'noise', freq: 2200, env: { a: 0.001, r: 0.25 }, lowpass: 1800, lowpassEnd: 200, steep: true, volume: 0.8 },
      { wave: 'noise', freq: 8000, env: { a: 0.05, h: 0.2, r: 0.3 }, highpass: 1500, lowpass: 6000, volume: 0.15, delay: 0.05 },
      ...[0.1, 0.17, 0.26, 0.31, 0.42, 0.5].map((d, i) => ({ wave: 'noise' as const, freq: 12000, env: { a: 0.001, r: 0.015 + 0.01 * (i % 2) }, highpass: 2500, volume: 0.35 - i * 0.03, delay: d })),
    ],
  },
  // Frost A, Absolute Zero: deep glassy freeze swell with a crack at the peak.
  fire_abszero: {
    sampleRate: 22050,
    seed: 65,
    layers: [
      { wave: 'sine', freq: 220, freqEnd: 196, env: { a: 0.25, h: 0.2, r: 0.5 }, volume: 0.6 },
      { wave: 'sine', freq: 1318, vibrato: { depth: 0.004, rate: 6 }, env: { a: 0.2, h: 0.15, r: 0.5 }, volume: 0.3 },
      { wave: 'triangle', freq: 1975, freqEnd: 2637, env: { a: 0.3, r: 0.4 }, volume: 0.2 },
      { wave: 'noise', freq: 10000, env: { a: 0.3, h: 0.1, r: 0.3 }, highpass: 3000, lowpass: 9000, volume: 0.3 },
      { wave: 'sine', freq: 2637, env: { a: 0.002, r: 0.3 }, volume: 0.3, delay: 0.35 },
    ],
  },
  // Frost B, Shatter: crystalline ping.
  fire_shatter: {
    seed: 66,
    layers: [
      { wave: 'sine', freq: 3136, env: { a: 0.001, r: 0.25 }, volume: 0.5 },
      { wave: 'sine', freq: 4699, env: { a: 0.001, r: 0.15 }, volume: 0.3 },
      { wave: 'triangle', freq: 2349, freqEnd: 2200, env: { a: 0.001, r: 0.18 }, volume: 0.3 },
      { wave: 'noise', freq: 18000, env: { a: 0.001, r: 0.04 }, highpass: 6000, volume: 0.35 },
    ],
  },
  // Sniper A, Assassin: quick double slice.
  fire_assassin: {
    seed: 67,
    layers: [0, 0.07].flatMap((d, i) => [
      { wave: 'noise' as const, freq: 15000, env: { a: 0.003, r: 0.06 }, highpass: 3000, lowpass: 12000, lowpassEnd: 5000, volume: 0.7, delay: d },
      { wave: 'saw' as const, freq: 2800 + i * 400, freqEnd: 3000 + i * 400, env: { a: 0.002, r: 0.12 }, highpass: 1800, lowpass: 8000, volume: 0.3, delay: d + 0.01 },
    ]),
  },
  // Sniper B, Seer: slash with a resonant chime (D6-A6-D7) and echo.
  fire_seer: {
    seed: 68,
    echo: { delay: 0.11, feedback: 0.3, mix: 0.35 },
    layers: [
      { wave: 'noise', freq: 14000, env: { a: 0.005, r: 0.1 }, highpass: 2500, lowpass: 12000, lowpassEnd: 4000, volume: 0.6 },
      { wave: 'sine', freq: N(24), vibrato: { depth: 0.003, rate: 5 }, env: { a: 0.003, r: 0.9 }, volume: 0.4, delay: 0.02 },
      { wave: 'sine', freq: N(31), env: { a: 0.003, r: 0.7 }, volume: 0.25, delay: 0.02 },
      { wave: 'sine', freq: N(36), env: { a: 0.003, r: 0.5 }, volume: 0.2, delay: 0.02 },
    ],
  },
  // Tesla A, Storm Nexus: crackling burst of zaps over a hum.
  fire_storm: {
    seed: 69,
    layers: [
      ...[0, 0.05, 0.11, 0.16, 0.23].map((d, i) => ({ wave: 'square' as const, duty: 0.2, freq: 1100 - i * 120, freqEnd: 350, vibrato: { depth: 0.4, rate: 60 + i * 7 }, env: { a: 0.001, r: 0.07 }, lowpass: 6000, volume: 0.45, delay: d })),
      { wave: 'noise', freq: 4000, env: { a: 0.001, h: 0.25, r: 0.1 }, highpass: 1500, volume: 0.45 },
      { wave: 'saw', freq: 55, env: { a: 0.001, h: 0.25, r: 0.1 }, lowpass: 900, volume: 0.2 },
    ],
  },
  // Tesla B, Overload: big electric boom.
  fire_overload: {
    seed: 70,
    layers: [
      { wave: 'square', duty: 0.3, freq: 1400, freqEnd: 120, vibrato: { depth: 0.5, rate: 45 }, env: { a: 0.001, d: 0.1, s: 0.5, r: 0.3 }, lowpass: 5000, lowpassEnd: 800, volume: 0.6 },
      { wave: 'noise', freq: 5000, env: { a: 0.001, h: 0.08, r: 0.3 }, highpass: 800, volume: 0.6 },
      { wave: 'sine', freq: 110, freqEnd: 32, env: { a: 0.002, d: 0.1, s: 0.6, r: 0.45 }, volume: 1 },
      { wave: 'noise', freq: 1500, env: { a: 0.001, r: 0.4 }, lowpass: 1500, lowpassEnd: 150, steep: true, volume: 0.7 },
    ],
  },
  // ---------------------------------------------------------------- v2: hero
  // Greatsword: heavy rising swoosh, then the hit (thud + crunch + a hint of steel).
  hero_attack: {
    seed: 71,
    layers: [
      { wave: 'noise', freq: 8000, env: { a: 0.08, d: 0.03, s: 0.5, r: 0.08 }, lowpass: 900, lowpassEnd: 4500, highpass: 250, steep: true, volume: 0.8 },
      { wave: 'sine', freq: 150, freqEnd: 60, env: { a: 0.001, r: 0.12 }, volume: 0.8, delay: 0.13 },
      { wave: 'noise', freq: 3000, env: { a: 0.001, r: 0.07 }, lowpass: 2500, volume: 0.6, delay: 0.13 },
      { wave: 'saw', freq: 1900, env: { a: 0.001, r: 0.08 }, highpass: 1200, lowpass: 5000, volume: 0.15, delay: 0.13 },
    ],
  },
  // Short low grunt: buzzy saw with a formant-ish partial.
  hero_hurt: {
    seed: 72,
    layers: [
      { wave: 'saw', freq: 170, freqEnd: 115, vibrato: { depth: 0.05, rate: 28 }, env: { a: 0.01, d: 0.04, s: 0.6, r: 0.1 }, lowpass: 900, steep: true, volume: 0.7 },
      { wave: 'triangle', freq: 470, freqEnd: 350, env: { a: 0.01, r: 0.1 }, volume: 0.2 },
      { wave: 'noise', freq: 1500, env: { a: 0.005, r: 0.1 }, lowpass: 1000, volume: 0.4 },
    ],
  },
  // Knocked down: falling armor clanks, body thud, a sinking tone.
  hero_down: {
    sampleRate: 22050,
    seed: 73,
    layers: [
      ...[0, 0.13, 0.21, 0.33].flatMap((d, i) => [
        { wave: 'square' as const, duty: 0.15, freq: 2100 - i * 250, env: { a: 0.001, r: 0.12 - i * 0.015 }, highpass: 1200, lowpass: 7000, volume: 0.45 - i * 0.06, delay: d },
        { wave: 'sine' as const, freq: (2100 - i * 250) * 1.47, env: { a: 0.001, r: 0.15 }, volume: 0.2, delay: d },
      ]),
      { wave: 'sine', freq: 140, freqEnd: 50, env: { a: 0.002, r: 0.25 }, volume: 0.9, delay: 0.3 },
      { wave: 'noise', freq: 1500, env: { a: 0.001, r: 0.15 }, lowpass: 1200, volume: 0.6, delay: 0.3 },
      { wave: 'triangle', freq: N(0), freqEnd: N(-7), env: { a: 0.02, h: 0.2, r: 0.3 }, volume: 0.25 },
    ],
  },
  // Respawn: heroic rising D major chord (brass), with a shimmer.
  hero_respawn: {
    sampleRate: 22050,
    seed: 74,
    echo: { delay: 0.14, feedback: 0.25, mix: 0.3 },
    layers: [
      ...[0, 7, 12, 16].map((semi, i) => ({ wave: 'saw' as const, freq: N(semi - 12), unison: [-5, 5], env: { a: 0.04, d: 0.05, s: 0.7, h: 0.5 - i * 0.08, r: 0.4 }, lowpass: 2200, steep: true, volume: 0.35, delay: i * 0.09 })),
      { wave: 'sine', freq: N(-24), env: { a: 0.05, h: 0.5, r: 0.4 }, volume: 0.4 },
      { wave: 'noise', freq: 11000, env: { a: 0.3, r: 0.4 }, highpass: 3000, volume: 0.12 },
    ],
  },
  // Level up: quick square fanfare arpeggio into a bright chord.
  hero_levelup: {
    sampleRate: 22050,
    seed: 75,
    echo: { delay: 0.1, feedback: 0.3, mix: 0.35 },
    layers: [
      { wave: 'square', duty: 0.25, freq: N(12), arp: { ratios: [1, 1.26, 1.5, 2], step: 0.08 }, env: { a: 0.002, h: 0.3, r: 0.05 }, lowpass: 5000, volume: 0.45 },
      ...[0, 4, 7, 12].map((semi) => ({ wave: 'saw' as const, freq: N(semi + 12), env: { a: 0.02, d: 0.1, s: 0.7, h: 0.35, r: 0.35 }, lowpass: 3500, steep: true, volume: 0.28, delay: 0.34 })),
    ],
  },
  // "On my way": a soft footstep and a tiny two-note horn blip.
  hero_move: {
    seed: 76,
    layers: [
      { wave: 'noise', freq: 2000, env: { a: 0.001, r: 0.03 }, lowpass: 1200, volume: 0.35 },
      { wave: 'triangle', freq: N(7), env: { a: 0.01, h: 0.04, r: 0.06 }, lowpass: 2000, volume: 0.5 },
      { wave: 'triangle', freq: N(12), env: { a: 0.01, h: 0.03, r: 0.1 }, lowpass: 2000, volume: 0.45, delay: 0.09 },
    ],
  },
  // ---------------------------------------------------------------- v2: abilities
  // Meteor incoming: descending whistle + rushing air, ~0.8 s (the impact is a separate event).
  meteor_whistle: {
    seed: 81,
    layers: [
      { wave: 'sine', freq: 2200, freqEnd: 480, vibrato: { depth: 0.01, rate: 9 }, env: { a: 0.05, h: 0.6, r: 0.12 }, volume: 0.5 },
      { wave: 'noise', freq: 9000, env: { a: 0.35, h: 0.3, r: 0.12 }, lowpass: 1500, lowpassEnd: 5000, highpass: 400, volume: 0.5 },
    ],
  },
  // Meteor impact: huge boom, long rumble, debris, fire tail.
  meteor_impact: {
    sampleRate: 22050,
    seed: 82,
    layers: [
      { wave: 'sine', freq: 100, freqEnd: 25, env: { a: 0.002, d: 0.2, s: 0.6, h: 0.2, r: 0.9 }, volume: 1 },
      { wave: 'noise', freq: 2500, env: { a: 0.001, d: 0.1, s: 0.6, h: 0.1, r: 0.9 }, lowpass: 3000, lowpassEnd: 100, steep: true, volume: 1 },
      { wave: 'square', freq: 60, freqEnd: 30, env: { a: 0.001, r: 0.2 }, lowpass: 400, volume: 0.5 },
      ...[0.3, 0.45, 0.6, 0.8].map((d, i) => ({ wave: 'noise' as const, freq: 500 - i * 50, env: { a: 0.001, r: 0.05 }, lowpass: 2000, volume: 0.5 - i * 0.08, delay: d })),
      { wave: 'noise', freq: 10000, env: { a: 0.1, h: 0.4, r: 0.6 }, highpass: 2000, lowpass: 8000, volume: 0.12, delay: 0.1 },
    ],
  },
  // Frost Nova: icy whoosh swell, sparkling arpeggio and a falling low tone.
  frost_nova: {
    seed: 83,
    echo: { delay: 0.13, feedback: 0.35, mix: 0.4 },
    layers: [
      { wave: 'noise', freq: 14000, env: { a: 0.35, d: 0.1, s: 0.7, h: 0.2, r: 0.6 }, highpass: 1500, lowpass: 3000, lowpassEnd: 12000, volume: 0.8 },
      { wave: 'sine', freq: N(24), arp: { ratios: [1, 1.19, 1.5, 2, 2.38, 3], step: 0.07 }, env: { a: 0.01, h: 0.4, r: 0.3 }, volume: 0.3, delay: 0.2 },
      { wave: 'sine', freq: N(-12), freqEnd: N(-24), env: { a: 0.3, h: 0.2, r: 0.6 }, volume: 0.4 },
      { wave: 'triangle', freq: N(36), env: { a: 0.001, r: 0.6 }, volume: 0.25, delay: 0.45 },
    ],
  },
  // Gold Rush: a shower of coin dings over a rising sparkle.
  gold_rush: {
    seed: 84,
    layers: [
      ...Array.from({ length: 12 }, (_, i) => ({
        wave: 'square' as const,
        freq: 1976 * [1, 1.12, 0.94, 1.06, 1.19, 1][i % 6],
        arp: { ratios: [1, 1.335], step: 0.05 },
        env: { a: 0.001, h: 0.04, r: 0.16 },
        lowpass: 6000,
        volume: 0.4 - (i % 4) * 0.05,
        delay: i * 0.055 + ((i * 7) % 5) * 0.008,
      })),
      { wave: 'sine', freq: N(24), arp: { ratios: [1, 1.26, 1.5, 2, 2.52, 3], step: 0.06 }, env: { a: 0.01, h: 0.3, r: 0.2 }, volume: 0.25 },
    ],
  },
  // Blade Storm: 3 s of whirling blade whooshes (6 per second) over a metallic ring.
  blade_storm: {
    sampleRate: 22050,
    seed: 85,
    layers: [
      ...Array.from({ length: 18 }, (_, i) => ({
        wave: 'noise' as const,
        freq: 9000,
        env: { a: 0.07, r: 0.1 },
        lowpass: i % 2 ? 1800 : 1400,
        lowpassEnd: i % 2 ? 4200 : 3600,
        highpass: 300,
        steep: true,
        volume: i >= 15 ? 0.7 - (i - 15) * 0.15 : 0.7,
        delay: i * (1 / 6),
      })),
      { wave: 'saw', freq: 880, vibrato: { depth: 0.03, rate: 6 }, env: { a: 0.1, h: 2.5, r: 0.4 }, highpass: 600, lowpass: 3000, volume: 0.08 },
      { wave: 'noise', freq: 400, vibrato: { depth: 0.5, rate: 6 }, env: { a: 0.1, h: 2.5, r: 0.4 }, lowpass: 300, volume: 0.35 },
    ],
  },
  // ---------------------------------------------------------------- v2: enemy traits
  // Shaman heal: soft two-note chime.
  heal_chime: {
    seed: 91,
    layers: [
      { wave: 'sine', freq: N(19), arp: { ratios: [1, 1.26], step: 0.07 }, env: { a: 0.01, h: 0.08, r: 0.3 }, volume: 0.4 },
      { wave: 'sine', freq: N(31), env: { a: 0.01, r: 0.25 }, volume: 0.15, delay: 0.07 },
    ],
  },
  // Shield blocks a hit: inharmonic metal clank.
  shield_clank: {
    seed: 92,
    layers: [
      { wave: 'square', duty: 0.2, freq: 1350, env: { a: 0.001, r: 0.12 }, highpass: 800, lowpass: 6000, volume: 0.4 },
      { wave: 'sine', freq: 1350 * 1.59, env: { a: 0.001, r: 0.18 }, volume: 0.3 },
      { wave: 'sine', freq: 1350 * 2.76, env: { a: 0.001, r: 0.1 }, volume: 0.25 },
      { wave: 'noise', freq: 6000, env: { a: 0.001, r: 0.02 }, highpass: 2000, volume: 0.5 },
    ],
  },
  // Shield breaks: glassy shatter + metal.
  shield_break: {
    seed: 93,
    layers: [
      { wave: 'noise', freq: 16000, env: { a: 0.001, d: 0.05, s: 0.4, r: 0.3 }, highpass: 2500, volume: 0.7 },
      ...[0, 0.03, 0.07, 0.12, 0.18].map((d, i) => ({ wave: 'sine' as const, freq: 2600 + ((i * 530) % 1900), env: { a: 0.001, r: 0.15 }, volume: 0.3, delay: d })),
      { wave: 'square', freq: 900, env: { a: 0.001, r: 0.1 }, highpass: 600, volume: 0.3 },
    ],
  },
  // Broodmother splits: wet squelch + pop.
  split_squelch: {
    seed: 94,
    layers: [
      { wave: 'sine', freq: 220, freqEnd: 90, vibrato: { depth: 0.25, rate: 30 }, env: { a: 0.005, r: 0.2 }, volume: 0.8 },
      { wave: 'noise', freq: 900, freqEnd: 300, env: { a: 0.005, r: 0.18 }, lowpass: 1200, lowpassEnd: 300, steep: true, volume: 0.6 },
      { wave: 'sine', freq: 500, freqEnd: 900, env: { a: 0.001, r: 0.06 }, volume: 0.3, delay: 0.1 },
    ],
  },
  // Stealth revealed: rising shimmer.
  reveal_shimmer: {
    seed: 95,
    layers: [
      { wave: 'sine', freq: N(24), arp: { ratios: [1, 1.5, 2, 3, 4], step: 0.04 }, vibrato: { depth: 0.01, rate: 12 }, env: { a: 0.02, h: 0.15, r: 0.25 }, volume: 0.35 },
      { wave: 'noise', freq: 14000, env: { a: 0.1, r: 0.3 }, highpass: 5000, volume: 0.2 },
    ],
  },
  // Execute: sharp slash + thud.
  execute_slash: {
    seed: 96,
    layers: [
      { wave: 'noise', freq: 15000, env: { a: 0.002, r: 0.08 }, highpass: 3000, lowpass: 12000, lowpassEnd: 3000, volume: 0.8 },
      { wave: 'saw', freq: 3200, freqEnd: 2400, env: { a: 0.001, r: 0.1 }, highpass: 1500, volume: 0.25 },
      { wave: 'sine', freq: 130, freqEnd: 45, env: { a: 0.001, r: 0.18 }, volume: 0.9, delay: 0.07 },
      { wave: 'noise', freq: 1500, env: { a: 0.001, r: 0.08 }, lowpass: 900, volume: 0.6, delay: 0.07 },
    ],
  },
  // Piercing arrow passes through: tiny tick.
  pierce_tick: {
    seed: 97,
    layers: [
      { wave: 'square', duty: 0.5, freq: 2400, freqEnd: 1800, env: { a: 0.001, r: 0.025 }, lowpass: 6000, volume: 0.5 },
      { wave: 'noise', freq: 8000, env: { a: 0.001, r: 0.015 }, highpass: 3000, volume: 0.3 },
    ],
  },
  // Elder Wyvern arrives: screech over a low growl.
  dragon_roar: {
    sampleRate: 22050,
    seed: 98,
    layers: [
      { wave: 'saw', freq: 420, freqEnd: 260, vibrato: { depth: 0.05, rate: 11 }, unison: [-20, 20], env: { a: 0.08, h: 0.5, r: 0.6 }, lowpass: 2400, steep: true, volume: 0.8 },
      { wave: 'saw', freq: 105, freqEnd: 80, vibrato: { depth: 0.08, rate: 7 }, env: { a: 0.15, h: 0.5, r: 0.6 }, lowpass: 700, volume: 0.6 },
      { wave: 'noise', freq: 3000, env: { a: 0.1, h: 0.5, r: 0.6 }, lowpass: 2500, highpass: 400, volume: 0.35 },
    ],
  },
};

export const SFX_IDS = Object.keys(SFX_DEFS) as SfxId[];
