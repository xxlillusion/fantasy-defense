import type { EnemyKind } from '../core/types';

export interface EnemyTraits {
  /** Every `interval` s, heals OTHER enemies within `radius` tiles by `pct` of their max HP. */
  heal?: { radius: number; pct: number; interval: number };
  /** Number of hits fully absorbed before HP takes damage (ground burn bypasses it). */
  shieldHits?: number;
  /** On death, spawns `count` enemies of `kind` at the same lane/progress (small spread). */
  split?: { kind: EnemyKind; count: number };
  /** Untargetable unless revealed (Frost range, Sniper Seer detection, hero proximity). */
  stealth?: boolean;
}

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
  /** Bosses: immune to execute, count as 2 hero blockers, trigger boss effects. */
  boss: boolean;
  /** Damage per swing and swings per second when fighting the hero (flyers never fight). */
  melee: { damage: number; rate: number };
  traits?: EnemyTraits;
  description: string;
}

type Base = Omit<EnemyDef, 'kind' | 'name' | 'hp' | 'speed' | 'bounty' | 'description' | 'melee'>;
const std: Base = { armor: 0, flying: false, slowResist: 0, stunImmune: false, livesCost: 1, size: 1, boss: false };

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  grunt: { ...std, kind: 'grunt', name: 'Goblin', hp: 60, speed: 1.0, bounty: 5, melee: { damage: 8, rate: 1 }, description: 'Baseline foot soldier.' },
  runner: { ...std, kind: 'runner', name: 'Wolf Rider', hp: 35, speed: 2.0, bounty: 4, melee: { damage: 6, rate: 1.4 }, description: 'Fast and fragile.' },
  brute: { ...std, kind: 'brute', name: 'Armored Troll', hp: 250, speed: 0.6, bounty: 12, armor: 3, size: 1.35, melee: { damage: 24, rate: 0.7 }, description: 'Slow, tough, armored.' },
  swarmling: { ...std, kind: 'swarmling', name: 'Imp', hp: 15, speed: 1.4, bounty: 1, size: 0.7, melee: { damage: 3, rate: 1.5 }, description: 'Comes in large swarms.' },
  flyer: { ...std, kind: 'flyer', name: 'Wyvern Whelp', hp: 50, speed: 1.3, bounty: 7, flying: true, melee: { damage: 0, rate: 0 }, description: 'Flies — only towers that hit air can touch it.' },
  boss: { ...std, kind: 'boss', name: 'Stone Golem', hp: 1400, speed: 0.5, bounty: 150, armor: 5, slowResist: 0.5, stunImmune: true, livesCost: 5, size: 2, boss: true, melee: { damage: 60, rate: 0.5 }, description: 'Massive. Armored, resists slows, immune to stuns.' },

  shaman: { ...std, kind: 'shaman', name: 'Goblin Shaman', hp: 80, speed: 0.9, bounty: 10, melee: { damage: 6, rate: 1 }, traits: { heal: { radius: 2, pct: 0.05, interval: 1 } }, description: 'Heals nearby enemies. Kill it first.' },
  shieldbearer: { ...std, kind: 'shieldbearer', name: 'Shield Orc', hp: 120, speed: 0.8, bounty: 9, armor: 1, size: 1.1, melee: { damage: 14, rate: 0.9 }, traits: { shieldHits: 3 }, description: 'Its shield absorbs the first 3 hits. Fast-firing towers break it.' },
  broodmother: { ...std, kind: 'broodmother', name: 'Broodmother', hp: 180, speed: 0.7, bounty: 6, size: 1.25, melee: { damage: 12, rate: 0.8 }, traits: { split: { kind: 'swarmling', count: 4 } }, description: 'Bursts into 4 imps when slain.' },
  wraith: { ...std, kind: 'wraith', name: 'Wraith', hp: 70, speed: 1.2, bounty: 9, melee: { damage: 10, rate: 1 }, traits: { stealth: true }, description: 'Invisible unless revealed by Frost towers, a Seer, or the hero.' },
  dragon: { ...std, kind: 'dragon', name: 'Elder Wyvern', hp: 1600, speed: 0.55, bounty: 175, armor: 3, flying: true, slowResist: 0.5, stunImmune: true, livesCost: 5, size: 2, boss: true, melee: { damage: 0, rate: 0 }, description: 'Flying boss. Only anti-air towers can hurt it.' },
};

export const ENEMY_KINDS: readonly EnemyKind[] = [
  'grunt',
  'runner',
  'brute',
  'swarmling',
  'flyer',
  'boss',
  'shaman',
  'shieldbearer',
  'broodmother',
  'wraith',
  'dragon',
];

/** Flying enemies hover this many tiles above the ground (visual + projectile aim). */
export const FLYER_HEIGHT = 1.2;
