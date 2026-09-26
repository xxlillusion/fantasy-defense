// Challenge modifiers applied at game start (other systems query them with hasModifier()).
// Stream A2 owns this file.
import type { GameOptions } from '../core/types';
import type { SimState } from './state';

/** TODO(A2): glass (maxLives = 1), austerity (start gold * MODIFIER_FX.austerityGold). */
export function applyStartModifiers(_state: SimState, _options: GameOptions): void {}
