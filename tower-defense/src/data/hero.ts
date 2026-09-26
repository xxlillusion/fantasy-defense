// Aldric the Greatsword: the walking-blocker hero.
export const HERO = {
  name: 'Aldric',
  title: 'the Greatsword',
  /** Level-1 stats. */
  hp: 400,
  damage: 30,
  attackRate: 1.1,
  /** Sword reach in tiles. */
  range: 1.2,
  /** Walk speed in tiles/s (straight line to the rally point). */
  speed: 2.2,
  /** Ground enemies within this distance of the hero get blocked (up to blockCapacity). */
  engageRadius: 0.9,
  /** Blocker "slots"; bosses use 2. */
  blockCapacity: 2,
  /** Reveals stealthed enemies within this radius. */
  detection: 2.5,
  /** Out-of-combat regen: fraction of max HP per second, after this many seconds without taking damage. */
  regenPct: 0.04,
  regenDelay: 3,
  /** Respawn time when downed = base - perLevel * (level - 1). */
  respawnBase: 15,
  respawnPerLevel: 1,
  /** XP from kills: the hero's own kills give bounty * xpOwnKill; kills of enemies he is blocking give bounty * xpAssist. */
  xpOwnKill: 2,
  xpAssist: 1,
  /** Cumulative XP thresholds for levels 1..5. */
  levelXp: [0, 120, 300, 550, 900] as const,
  /** Per level above 1. */
  perLevel: { damage: 0.2, hp: 0.15, range: 0.1 },
  /** Tiles that the rally point may be on. */
  rallyTiles: ['grass', 'path'] as const,
} as const;

export const HERO_MAX_LEVEL = HERO.levelXp.length;
