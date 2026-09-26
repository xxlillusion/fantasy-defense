// Gold, lives and scoring rules. All numbers come from src/data.
import type { Difficulty, EnemyKind, Stars, TowerKind, TowerLevel } from '../core/types';
import { DIFFICULTIES, ENEMIES, RULES, TOWERS } from '../data';
import type { SimState } from './state';

export function buildCost(kind: TowerKind): number {
  return TOWERS[kind].levels[1].cost;
}

/** Cost of the next level, or null at max level. */
export function upgradeCost(kind: TowerKind, level: TowerLevel): number | null {
  return level < 3 ? TOWERS[kind].levels[(level + 1) as TowerLevel].cost : null;
}

export function sellValue(invested: number): number {
  return Math.floor(invested * RULES.sellRefund);
}

export function waveClearBonus(wave: number): number {
  return RULES.waveClearBonusBase + RULES.waveClearBonusPerWave * wave;
}

/** Early-send bonus for a countdown with `remaining` seconds left (null = untimed → 0). */
export function earlySendBonus(remaining: number | null): number {
  if (remaining === null || remaining <= 0) return 0;
  return Math.floor(remaining) * RULES.earlySendGoldPerSecond;
}

/** Enemy max HP for a wave (1-based) and difficulty. */
export function enemyMaxHp(kind: EnemyKind, wave: number, difficulty: Difficulty): number {
  const w = Math.max(1, wave);
  return Math.round(ENEMIES[kind].hp * Math.pow(RULES.hpGrowthPerWave, w - 1) * DIFFICULTIES[difficulty].hpMultiplier);
}

/** Victory stars: 3 = no lives lost, 2 = lives >= fraction of max, else 1. 0 if dead. */
export function computeStars(lives: number, maxLives: number): Stars {
  if (lives <= 0) return 0;
  if (lives >= maxLives) return 3;
  if (lives >= RULES.twoStarLifeFraction * maxLives) return 2;
  return 1;
}

/** Adds earned gold (kills, bonuses) and tracks it in stats. */
export function earnGold(state: SimState, amount: number): void {
  if (amount <= 0) return;
  state.gold += amount;
  state.stats.goldEarned += amount;
}
