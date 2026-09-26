// Stream E: cheap per-theme ambient loops (8 s, mono, 22.05 kHz), played quietly under the music in game.
//  shrine: waterfall rush + spray   forge: lava rumble, bubbles, hiss   ruins: night wind + two crickets
// Continuous beds are two half-loop swells offset by half a loop, so the wrap point is seamless.
import type { MapTheme } from '../core/types';
import { createLoopJob, type LoopCtx, type RenderJob } from './music';
import type { Layer } from './synth';

export const AMBIENT_SR = 22050;
export const AMBIENT_SECONDS = 8;

/** A continuous bed: two overlapping swells covering the whole loop. */
function bed(ctx: LoopCtx, buf: Float32Array, l: Omit<Layer, 'env'>, swell = 0.5): void {
  const half = AMBIENT_SECONDS / 2;
  const a = half * swell;
  for (const t of [0, half]) ctx.layer(buf, { ...l, env: { a, h: AMBIENT_SECONDS - 2 * a, r: a } }, t);
}

const COMPOSE: Record<MapTheme, (ctx: LoopCtx, buf: Float32Array) => void> = {
  shrine(ctx, buf) {
    bed(ctx, buf, { wave: 'noise', freq: 11000, lowpass: 1300, highpass: 180, steep: true, volume: 0.8 }, 0.9);
    bed(ctx, buf, { wave: 'noise', freq: 11000, highpass: 2800, lowpass: 6000, volume: 0.18 }, 0.7);
    bed(ctx, buf, { wave: 'noise', freq: 600, lowpass: 220, steep: true, volume: 0.6 }, 0.9);
  },
  forge(ctx, buf) {
    const { rng } = ctx;
    // Deep lava rumble.
    bed(ctx, buf, { wave: 'noise', freq: 500, lowpass: 170, steep: true, volume: 1 }, 0.9);
    bed(ctx, buf, { wave: 'sine', freq: 41, vibrato: { depth: 0.05, rate: 0.7 }, volume: 0.25 }, 0.9);
    // Bubbles: rising sine blips in small clusters.
    for (let i = 0; i < 22; i++) {
      const t = rng() * AMBIENT_SECONDS;
      const count = 1 + Math.floor(rng() * 3);
      for (let k = 0; k < count; k++) {
        const f = 110 + rng() * 170;
        ctx.layer(buf, { wave: 'sine', freq: f, freqEnd: f * (1.8 + rng()), env: { a: 0.004, r: 0.05 + rng() * 0.07 }, volume: 0.25 + rng() * 0.3 }, t + k * (0.05 + rng() * 0.08));
      }
    }
    // Occasional steam hiss and ember crackle.
    for (let i = 0; i < 3; i++) {
      ctx.layer(buf, { wave: 'noise', freq: 11000, env: { a: 0.3, h: 0.3, r: 0.8 }, highpass: 2500, lowpass: 7000, volume: 0.07 }, rng() * AMBIENT_SECONDS);
    }
    for (let i = 0; i < 14; i++) {
      ctx.layer(buf, { wave: 'noise', freq: 11000, env: { a: 0.001, r: 0.01 + rng() * 0.01 }, highpass: 3000, volume: 0.1 + rng() * 0.12 }, rng() * AMBIENT_SECONDS);
    }
  },
  ruins(ctx, buf) {
    const { rng } = ctx;
    // Night wind: low filtered noise, two gusts that open the filter.
    for (const t of [0, AMBIENT_SECONDS / 2]) {
      ctx.layer(buf, { wave: 'noise', freq: 11000, env: { a: 2, h: 0, r: 2 }, lowpass: 380, lowpassEnd: 900, steep: true, volume: 0.9 }, t);
      ctx.layer(buf, { wave: 'noise', freq: 11000, env: { a: 2, h: 0, r: 2 }, lowpass: 1100, lowpassEnd: 420, highpass: 250, volume: 0.25 }, t + 1);
    }
    // Crickets: bursts of 3 short 4.4/4.9 kHz pulses.
    for (const [f, period, vol] of [[4400, 0.9, 0.1], [4900, 1.35, 0.07]] as const) {
      for (let t = rng() * 0.5; t < AMBIENT_SECONDS; t += period * (0.85 + rng() * 0.3)) {
        if (rng() < 0.2) continue;
        for (let p = 0; p < 3; p++) {
          ctx.layer(buf, { wave: 'sine', freq: f, env: { a: 0.004, h: 0.012, r: 0.012 }, volume: vol }, t + p * 0.045);
        }
      }
    }
  },
};

export function createAmbientJob(theme: MapTheme, sr = AMBIENT_SR): RenderJob<Float32Array> {
  const compose = COMPOSE[theme] ?? COMPOSE.shrine;
  const inner = createLoopJob(AMBIENT_SECONDS, sr, 1, 900 + theme.length, 0.6, (ctx, [buf]) => compose(ctx, buf));
  return {
    get result() {
      return inner.result ? inner.result[0] : null;
    },
    step: (budgetMs) => inner.step(budgetMs),
  };
}
