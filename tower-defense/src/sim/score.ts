// Score: (bounty earned + waves cleared * perWave + lives left * perLife) * difficulty * modifiers.
// Stream A2 owns this file.
import { DIFFICULTIES, modifierScoreMultiplier, RULES } from '../data';
import type { SimState } from './state';

export function computeScore(state: SimState): number {
  if (state.phase === 'title') return 0;
  const base = state.bountyEarned + state.wavesCleared * RULES.score.perWave + Math.max(0, state.lives) * RULES.score.perLife;
  return Math.round(base * DIFFICULTIES[state.difficulty].scoreMultiplier * modifierScoreMultiplier(state.modifiers));
}
