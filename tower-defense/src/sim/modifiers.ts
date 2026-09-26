// Challenge modifiers. Start-of-game effects are applied here; per-system effects (swift speed,
// ironclad armor, horde counts, austerity interest, no-sell) live in small helpers below that the
// owning systems call, so every modifier rule is findable in one file.
// Stream A2 owns this file.
import type { GameOptions } from '../core/types';
import { MODIFIER_FX, type WaveDef } from '../data';
import { hasModifier, type SimState } from './state';

/** glass: exactly 1 life. austerity: start gold * MODIFIER_FX.austerityGold (floored). */
export function applyStartModifiers(state: SimState, _options: GameOptions): void {
  if (hasModifier(state, 'glass')) {
    state.lives = 1;
    state.maxLives = 1;
  }
  if (hasModifier(state, 'austerity')) {
    state.gold = Math.floor(state.gold * MODIFIER_FX.austerityGold);
  }
}

/** swift: enemy movement speed multiplier. */
export function speedMultiplier(state: SimState): number {
  return hasModifier(state, 'swift') ? MODIFIER_FX.swiftSpeed : 1;
}

/** ironclad: flat armor added to every enemy at spawn. */
export function bonusArmor(state: SimState): number {
  return hasModifier(state, 'ironclad') ? MODIFIER_FX.ironcladArmor : 0;
}

/** austerity: no interest at wave clear. */
export function interestAllowed(state: SimState): boolean {
  return !hasModifier(state, 'austerity');
}

/**
 * horde: each group's count * MODIFIER_FX.hordeCount (ceil). The interval shrinks by the same ratio so
 * a group lasts as long as before (denser, not longer). Returns the wave unchanged without horde.
 */
export function applyWaveModifiers(state: SimState, wave: WaveDef): WaveDef {
  if (!hasModifier(state, 'horde')) return wave;
  return wave.map((g) => {
    const count = Math.ceil(g.count * MODIFIER_FX.hordeCount);
    const interval = count > 1 && g.count > 1 ? (g.interval * (g.count - 1)) / (count - 1) : g.interval;
    return { ...g, count, interval };
  });
}
