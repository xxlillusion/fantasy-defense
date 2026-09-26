// Endless mode: deterministic procedural waves past the campaign.
// Stream A2 owns this file.
import type { WaveDef } from '../data';
import type { SimState } from './state';

/**
 * TODO(A2): budget = RULES.endlessBudgetBase * RULES.endlessBudgetGrowth^(wave - campaign); spend it on an
 * enemy mix that widens with the wave number; boss every RULES.endlessBossEvery waves (alternating
 * golem/dragon, count +1 every 10 waves). Deterministic in (map, wave): do not use ctx.rng.
 */
export function generateEndlessWave(_state: SimState, wave: number): WaveDef {
  return [{ enemy: 'grunt', count: 10 + wave, interval: 0.6, delay: 0 }];
}
