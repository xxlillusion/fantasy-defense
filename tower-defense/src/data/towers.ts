// Tower definitions. Stats are FULL values per level (not deltas).
import type { TowerKind, TowerLevel } from '../core/types';

export interface TowerLevelStats {
  /** Cost to reach this level (L1 = build cost). */
  cost: number;
  /** Base damage per hit (before armor). */
  damage: number;
  /** Shots (or pulses) per second. */
  fireRate: number;
  /** Range in tiles. */
  range: number;
  /** Projectile speed in tiles/s; 0 = instant (Tesla, Frost aura). */
  projectileSpeed: number;
  /** Projectiles launched per shot, at distinct targets when possible (Arrow L3 = 2). */
  projectilesPerShot: number;
  /** AoE radius in tiles on impact; 0 = single target. */
  splashRadius: number;
  /** Ignores enemy armor. */
  armorPierce: boolean;
  slow?: { amount: number; duration: number };
  /** Chain lightning: total targets hit (incl. first), damage falloff per jump, max jump distance. */
  chain?: { targets: number; falloff: number; jumpRange: number };
  crit?: { chance: number; multiplier: number };
  /** Leaves burning ground where it lands. */
  burn?: { dps: number; duration: number; radius: number };
  /** Chance to stun each target hit; bosses are immune. */
  stun?: { chance: number; duration: number };
  /** Instead of firing a projectile, pulses and hits every valid enemy in range. */
  aura: boolean;
  /** One-line summary of what this level adds (for UI). */
  blurb: string;
}

export interface TowerDef {
  kind: TowerKind;
  /** Display name of the tower. */
  name: string;
  /** Unit class shown in the UI (fantasy flavour; styled after the cast). */
  unitClass: string;
  hotkey: '1' | '2' | '3' | '4' | '5';
  hitsAir: boolean;
  hitsGround: boolean;
  description: string;
  levels: Record<TowerLevel, TowerLevelStats>;
}

const base = { projectilesPerShot: 1, splashRadius: 0, armorPierce: false, aura: false };

export const TOWERS: Record<TowerKind, TowerDef> = {
  arrow: {
    kind: 'arrow',
    name: 'Arrow',
    unitClass: 'Archer',
    hotkey: '1',
    hitsAir: true,
    hitsGround: true,
    description: 'Cheap, reliable single-target archer. Hits air.',
    levels: {
      1: { ...base, cost: 50, damage: 12, fireRate: 1.5, range: 3.0, projectileSpeed: 12, blurb: 'Fires pink arrows at one target.' },
      2: { ...base, cost: 60, damage: 18, fireRate: 1.5, range: 3.5, projectileSpeed: 12, blurb: '+50% damage, +0.5 range.' },
      3: { ...base, cost: 120, damage: 18, fireRate: 1.5, range: 3.5, projectileSpeed: 12, projectilesPerShot: 2, blurb: 'Looses two arrows per shot.' },
    },
  },
  cannon: {
    kind: 'cannon',
    name: 'Cannon',
    unitClass: 'Hammer Knight',
    hotkey: '2',
    hitsAir: false,
    hitsGround: true,
    description: 'Hammer slam shockwave that splashes. Cannot hit air.',
    levels: {
      1: { ...base, cost: 100, damage: 30, fireRate: 0.6, range: 2.5, projectileSpeed: 6, splashRadius: 1.0, blurb: 'Splash damage in a 1-tile radius.' },
      2: { ...base, cost: 120, damage: 48, fireRate: 0.6, range: 2.5, projectileSpeed: 6, splashRadius: 1.25, blurb: '+60% damage, bigger splash.' },
      3: { ...base, cost: 220, damage: 48, fireRate: 0.6, range: 2.5, projectileSpeed: 6, splashRadius: 1.25, burn: { dps: 5, duration: 2, radius: 1.25 }, blurb: 'Leaves burning ground (5 dps, 2s).' },
    },
  },
  frost: {
    kind: 'frost',
    name: 'Frost',
    unitClass: 'Frost Mage',
    hotkey: '3',
    hitsAir: true,
    hitsGround: true,
    description: 'Slows enemies. Great against runners.',
    levels: {
      1: { ...base, cost: 80, damage: 4, fireRate: 1.0, range: 2.5, projectileSpeed: 9, slow: { amount: 0.4, duration: 2 }, blurb: 'Slows the target by 40% for 2s.' },
      2: { ...base, cost: 90, damage: 4, fireRate: 1.0, range: 2.5, projectileSpeed: 9, slow: { amount: 0.5, duration: 3 }, blurb: 'Slow 50% for 3s.' },
      3: { ...base, cost: 160, damage: 4, fireRate: 1.0, range: 2.5, projectileSpeed: 0, aura: true, slow: { amount: 0.5, duration: 3 }, stun: { chance: 0.1, duration: 1 }, blurb: 'Frost aura hits everything in range; 10% freeze.' },
    },
  },
  sniper: {
    kind: 'sniper',
    name: 'Sniper',
    unitClass: 'Shadow Blade',
    hotkey: '4',
    hitsAir: true,
    hitsGround: true,
    description: 'Long-range crescent slash that ignores armor.',
    levels: {
      1: { ...base, cost: 150, damage: 90, fireRate: 0.3, range: 6.0, projectileSpeed: 20, armorPierce: true, blurb: 'Huge range, ignores armor.' },
      2: { ...base, cost: 160, damage: 153, fireRate: 0.3, range: 6.0, projectileSpeed: 20, armorPierce: true, blurb: '+70% damage.' },
      3: { ...base, cost: 300, damage: 153, fireRate: 0.3, range: 6.0, projectileSpeed: 20, armorPierce: true, crit: { chance: 0.15, multiplier: 3 }, blurb: '15% chance to crit for 3x.' },
    },
  },
  tesla: {
    kind: 'tesla',
    name: 'Tesla',
    unitClass: 'Spirit Wisp',
    hotkey: '5',
    hitsAir: true,
    hitsGround: true,
    description: 'Arcane lightning that chains between enemies.',
    levels: {
      1: { ...base, cost: 125, damage: 20, fireRate: 0.8, range: 2.5, projectileSpeed: 0, chain: { targets: 3, falloff: 0.25, jumpRange: 1.75 }, blurb: 'Chains to 3 targets (-25% per jump).' },
      2: { ...base, cost: 140, damage: 20, fireRate: 0.8, range: 2.5, projectileSpeed: 0, chain: { targets: 5, falloff: 0.25, jumpRange: 1.75 }, blurb: 'Chains to 5 targets.' },
      3: { ...base, cost: 250, damage: 20, fireRate: 0.8, range: 2.5, projectileSpeed: 0, chain: { targets: 5, falloff: 0.25, jumpRange: 1.75 }, stun: { chance: 1, duration: 0.3 }, blurb: 'Each hit stuns for 0.3s.' },
    },
  },
};

export const TOWER_KINDS: readonly TowerKind[] = ['arrow', 'cannon', 'frost', 'sniper', 'tesla'];

/** Projectile visual used by each tower (Tesla has none; Frost L3 aura has none). */
export const TOWER_PROJECTILE = {
  arrow: 'arrow',
  cannon: 'shockwave',
  frost: 'frostbolt',
  sniper: 'crescent',
  tesla: null,
} as const;
