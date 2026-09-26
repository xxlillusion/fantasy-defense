// Game phase flow: sending waves, build countdown, wave clear, victory and defeat.
import { RULES, WAVES } from '../data';
import { computeStars, earlySendBonus, earnGold, waveClearBonus } from './economy';
import { buildSpawnQueue } from './spawner';
import type { SimContext } from './state';

export function canSendWave(ctx: SimContext): boolean {
  return ctx.state.phase === 'build' && ctx.state.wave < WAVES.length;
}

/** Start the next wave. `early` = player-initiated during a running countdown. */
export function startNextWave(ctx: SimContext, playerSent: boolean): void {
  const { state } = ctx;
  const early = playerSent && state.buildCountdown !== null;
  const bonus = early ? earlySendBonus(state.buildCountdown) : 0;
  earnGold(state, bonus);
  state.wave++;
  state.phase = 'wave';
  state.buildCountdown = null;
  state.waveTime = 0;
  state.spawnQueue = buildSpawnQueue(WAVES[state.wave - 1]!);
  ctx.events.emit('waveStarted', { wave: state.wave, early, bonus });
}

/** Build phase: tick the countdown and auto-send when it runs out. */
export function updateBuildCountdown(ctx: SimContext, dt: number): void {
  const { state } = ctx;
  if (state.phase !== 'build' || state.buildCountdown === null) return;
  state.buildCountdown -= dt;
  if (state.buildCountdown <= 1e-9) {
    state.buildCountdown = 0;
    if (canSendWave(ctx)) startNextWave(ctx, false);
  }
}

/** Returns true (and ends the game) if lives ran out. */
export function checkDefeat(ctx: SimContext): boolean {
  const { state } = ctx;
  if (state.lives > 0) return false;
  if (state.phase === 'build' || state.phase === 'wave') {
    state.phase = 'defeat';
    state.stars = 0;
    state.buildCountdown = null;
    ctx.events.emit('gameOver', { result: 'defeat', stars: 0 });
  }
  return true;
}

/** Wave phase: when nothing is left to spawn and nothing is alive, the wave is cleared. */
export function checkWaveCleared(ctx: SimContext): void {
  const { state } = ctx;
  if (state.phase !== 'wave') return;
  if (state.spawnQueue.length || state.enemies.some((e) => e.alive)) return;

  const bonus = waveClearBonus(state.wave);
  earnGold(state, bonus);
  ctx.events.emit('waveCleared', { wave: state.wave, bonus });

  if (state.wave >= WAVES.length) {
    state.phase = 'victory';
    state.stars = computeStars(state.lives, state.maxLives);
    state.buildCountdown = null;
    ctx.events.emit('gameOver', { result: 'victory', stars: state.stars });
  } else {
    state.phase = 'build';
    state.buildCountdown = RULES.buildCountdown;
  }
}
