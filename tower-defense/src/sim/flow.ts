// Game phase flow: sending waves, build countdown, wave clear, victory and defeat.
// Stream A2 owns this file (v2: endless, interest, score in gameOver).
import { mapWaves, RULES, type WaveDef } from '../data';
import { computeStars, earlySendBonus, earnGold, waveClearBonus } from './economy';
import { generateEndlessWave } from './endless';
import { computeScore } from './score';
import { buildSpawnQueue } from './spawner';
import type { SimContext, SimState } from './state';

/** Campaign length for the current map. */
export function campaignWaves(state: SimState): number {
  return mapWaves(state.map).length;
}

/** Wave definition for a 1-based wave number (endless waves past the campaign are generated). */
export function waveDef(state: SimState, wave: number): WaveDef | null {
  const list = mapWaves(state.map);
  if (wave >= 1 && wave <= list.length) return list[wave - 1]!;
  if (state.mode === 'endless' && wave > list.length) return generateEndlessWave(state, wave);
  return null;
}

export function canSendWave(ctx: SimContext): boolean {
  const { state } = ctx;
  return state.phase === 'build' && waveDef(state, state.wave + 1) !== null;
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
  state.spawnQueue = buildSpawnQueue(state, waveDef(state, state.wave)!);
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
    ctx.events.emit('gameOver', { result: 'defeat', stars: 0, score: computeScore(state), mode: state.mode, wave: state.wave });
  }
  return true;
}

/** TODO(A2): min(floor(gold * RULES.interestRate), RULES.interestCap); 0 with the austerity modifier. */
export function interestFor(_state: SimState): number {
  return 0;
}

/** Wave phase: when nothing is left to spawn and nothing is alive, the wave is cleared. */
export function checkWaveCleared(ctx: SimContext): void {
  const { state } = ctx;
  if (state.phase !== 'wave') return;
  if (state.spawnQueue.length || state.enemies.some((e) => e.alive)) return;

  const bonus = waveClearBonus(state.wave);
  earnGold(state, bonus);
  const interest = interestFor(state);
  earnGold(state, interest);
  state.lastInterest = interest;
  state.wavesCleared = state.wave;
  ctx.events.emit('waveCleared', { wave: state.wave, bonus, interest });

  if (state.mode === 'campaign' && state.wave >= campaignWaves(state)) {
    state.phase = 'victory';
    state.stars = computeStars(state.lives, state.maxLives);
    state.buildCountdown = null;
    ctx.events.emit('gameOver', { result: 'victory', stars: state.stars, score: computeScore(state), mode: state.mode, wave: state.wave });
  } else {
    state.phase = 'build';
    state.buildCountdown = RULES.buildCountdown;
  }
}
