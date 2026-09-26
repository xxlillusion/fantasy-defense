import type { EnemyKind } from '../core/types';

export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  /** Base HP at wave 1 (before wave scaling and difficulty). */
  hp: number;
  /** Tiles per second. */
  speed: number;
  bounty: number;
  /** Flat damage reduction per hit (min 1 damage). */
  armor: number;
  flying: boolean;
  /** 0..1 — fraction of incoming slow ignored. */
  slowResist: number;
  /** Immune to stuns/freezes. */
  stunImmune: boolean;
  livesCost: number;
  /** Visual scale hint relative to a normal enemy (1). */
  size: number;
  description: string;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  grunt: { kind: 'grunt', name: 'Goblin', hp: 60, speed: 1.0, bounty: 5, armor: 0, flying: false, slowResist: 0, stunImmune: false, livesCost: 1, size: 1, description: 'Baseline foot soldier.' },
  runner: { kind: 'runner', name: 'Wolf Rider', hp: 35, speed: 2.0, bounty: 4, armor: 0, flying: false, slowResist: 0, stunImmune: false, livesCost: 1, size: 1, description: 'Fast and fragile.' },
  brute: { kind: 'brute', name: 'Armored Troll', hp: 250, speed: 0.6, bounty: 12, armor: 3, flying: false, slowResist: 0, stunImmune: false, livesCost: 1, size: 1.35, description: 'Slow, tough, armored.' },
  swarmling: { kind: 'swarmling', name: 'Imp', hp: 15, speed: 1.4, bounty: 1, armor: 0, flying: false, slowResist: 0, stunImmune: false, livesCost: 1, size: 0.7, description: 'Comes in large swarms.' },
  flyer: { kind: 'flyer', name: 'Wyvern Whelp', hp: 50, speed: 1.3, bounty: 7, armor: 0, flying: true, slowResist: 0, stunImmune: false, livesCost: 1, size: 1, description: 'Flies — only towers that hit air can touch it.' },
  boss: { kind: 'boss', name: 'Stone Golem', hp: 1400, speed: 0.5, bounty: 150, armor: 5, flying: false, slowResist: 0.5, stunImmune: true, livesCost: 5, size: 2, description: 'Massive. Armored, resists slows, immune to stuns.' },
};

export const ENEMY_KINDS: readonly EnemyKind[] = ['grunt', 'runner', 'brute', 'swarmling', 'flyer', 'boss'];

/** Flying enemies hover this many tiles above the ground (visual + projectile aim). */
export const FLYER_HEIGHT = 1.2;
