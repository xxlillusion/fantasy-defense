import type { AbilityId } from '../core/types';

export interface AbilityDef {
  id: AbilityId;
  name: string;
  hotkey: 'q' | 'w' | 'e' | 'r';
  /** Wave number at which it unlocks (0 = from the start). */
  unlockWave: number;
  /** Seconds (game time). */
  cooldown: number;
  /** Needs a ground target point. */
  targeted: boolean;
  /** Targeting circle radius (tiles). */
  radius: number;
  description: string;
}

export const ABILITIES: Record<AbilityId, AbilityDef> = {
  meteor: { id: 'meteor', name: 'Meteor', hotkey: 'q', unlockWave: 3, cooldown: 45, targeted: true, radius: 1.5, description: 'Call down a meteor: 200 damage in an area, then burning ground.' },
  frostNova: { id: 'frostNova', name: 'Frost Nova', hotkey: 'w', unlockWave: 6, cooldown: 60, targeted: false, radius: 0, description: 'Slow every enemy by 70% for 4s (bosses 35%).' },
  goldRush: { id: 'goldRush', name: 'Gold Rush', hotkey: 'e', unlockWave: 9, cooldown: 90, targeted: false, radius: 0, description: 'Double kill bounties for 12s.' },
  bladeStorm: { id: 'bladeStorm', name: 'Blade Storm', hotkey: 'r', unlockWave: 0, cooldown: 40, targeted: false, radius: 2, description: "Aldric spins for 3s, shredding nearby ground enemies (ignores armor)." },
};

export const ABILITY_IDS: readonly AbilityId[] = ['meteor', 'frostNova', 'goldRush', 'bladeStorm'];

/** Effect tuning. */
export const ABILITY_FX = {
  meteor: { delay: 0.8, damage: 200, radius: 1.5, burn: { dps: 10, duration: 3, radius: 1.5 } },
  frostNova: { slow: 0.7, bossSlow: 0.35, duration: 4 },
  goldRush: { multiplier: 2, duration: 12 },
  bladeStorm: { dps: 45, radius: 2, duration: 3 },
} as const;
