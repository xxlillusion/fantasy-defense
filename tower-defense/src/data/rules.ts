import type { Difficulty } from '../core/types';

export const RULES = {
  sellRefund: 0.7,
  /** Compounded HP multiplier per wave: hp * hpGrowth^(wave-1). */
  hpGrowthPerWave: 1.12,
  /** Wave-clear bonus = base + perWave * waveNumber. */
  waveClearBonusBase: 20,
  waveClearBonusPerWave: 5,
  /** Seconds between waves before the next one auto-sends (no countdown before wave 1). */
  buildCountdown: 15,
  /** Early-send bonus = floor(seconds remaining) * this. Before wave 1 there is no bonus. */
  earlySendGoldPerSecond: 2,
  /** Min damage per hit after armor. */
  minDamage: 1,
  /** Victory stars: 3 = no lives lost, 2 = lives >= this fraction of max, else 1. */
  twoStarLifeFraction: 0.5,
} as const;

export interface DifficultyDef {
  id: Difficulty;
  name: string;
  hpMultiplier: number;
  startGold: number;
  lives: number;
}

export const DIFFICULTIES: Record<Difficulty, DifficultyDef> = {
  easy: { id: 'easy', name: 'Easy', hpMultiplier: 0.8, startGold: 200, lives: 30 },
  normal: { id: 'normal', name: 'Normal', hpMultiplier: 1.0, startGold: 150, lives: 20 },
  hard: { id: 'hard', name: 'Hard', hpMultiplier: 1.2, startGold: 150, lives: 15 },
};
