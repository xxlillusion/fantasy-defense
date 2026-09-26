import type { ModifierId } from '../core/types';

export interface ModifierDef {
  id: ModifierId;
  name: string;
  description: string;
  scoreMultiplier: number;
}

export const MODIFIERS: Record<ModifierId, ModifierDef> = {
  swift: { id: 'swift', name: 'Swift Foes', description: 'Enemies move 30% faster.', scoreMultiplier: 1.3 },
  ironclad: { id: 'ironclad', name: 'Ironclad', description: '+2 armor on every enemy.', scoreMultiplier: 1.25 },
  glass: { id: 'glass', name: 'Glass Portal', description: 'You have exactly 1 life.', scoreMultiplier: 1.5 },
  austerity: { id: 'austerity', name: 'Austerity', description: '-40% starting gold and no interest.', scoreMultiplier: 1.3 },
  nosell: { id: 'nosell', name: 'No Refunds', description: 'Towers cannot be sold.', scoreMultiplier: 1.1 },
  horde: { id: 'horde', name: 'Horde', description: '+50% enemies in every wave.', scoreMultiplier: 1.4 },
};

export const MODIFIER_IDS: readonly ModifierId[] = ['swift', 'ironclad', 'glass', 'austerity', 'nosell', 'horde'];

/** Effect tuning. */
export const MODIFIER_FX = {
  swiftSpeed: 1.3,
  ironcladArmor: 2,
  austerityGold: 0.6,
  hordeCount: 1.5,
} as const;

export function modifierScoreMultiplier(ids: readonly ModifierId[]): number {
  return ids.reduce((m, id) => m * MODIFIERS[id].scoreMultiplier, 1);
}
