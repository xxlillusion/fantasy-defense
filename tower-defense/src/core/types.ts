// Shared data types. FROZEN during parallel work — request changes, don't edit.
//
// Coordinate conventions (see grid.ts):
//  - Gameplay positions (Vec2) are in TILE UNITS on the map plane. The center of tile
//    (col, row) is (col + 0.5, row + 0.5). x grows to the right, y grows toward the camera.
//  - Row 0 is the back of the map (under the waterfall / portal); the last row is nearest the camera.

export type EntityId = number;

export interface Vec2 {
  x: number;
  y: number;
}

export interface TileCoord {
  col: number;
  row: number;
}

export type TowerKind = 'arrow' | 'cannon' | 'frost' | 'sniper' | 'tesla';
export type EnemyKind =
  | 'grunt'
  | 'runner'
  | 'brute'
  | 'swarmling'
  | 'flyer'
  | 'boss'
  | 'shaman'
  | 'shieldbearer'
  | 'broodmother'
  | 'wraith'
  | 'dragon';
export type TargetMode = 'first' | 'last' | 'strongest' | 'closest';
export type Difficulty = 'easy' | 'normal' | 'hard';
/** L4 is a specialization: a tower at L4 always has a branch. */
export type TowerLevel = 1 | 2 | 3 | 4;
export type TowerBranch = 'a' | 'b';
export type GameMode = 'campaign' | 'endless';
export type ModifierId = 'swift' | 'ironclad' | 'glass' | 'austerity' | 'nosell' | 'horde';
/** Global spells (Q/W/E) plus the hero's Blade Storm (R). */
export type AbilityId = 'meteor' | 'frostNova' | 'goldRush' | 'bladeStorm';
export type MapTheme = 'shrine' | 'forge' | 'ruins';

export interface GameOptions {
  difficulty: Difficulty;
  mapId: string;
  mode: GameMode;
  modifiers: readonly ModifierId[];
}
export type GameSpeed = 1 | 2;
export type Stars = 0 | 1 | 2 | 3;

/**
 * title   – no game running (menus)
 * build   – between waves; towers can be placed; countdown may be running
 * wave    – enemies are spawning / alive
 * victory – all waves cleared
 * defeat  – lives reached 0
 */
export type GamePhase = 'title' | 'build' | 'wave' | 'victory' | 'defeat';

/** Visual kind of an in-flight projectile. Tesla is instant and has no projectile. */
export type ProjectileKind = 'arrow' | 'shockwave' | 'frostbolt' | 'crescent';

export interface TowerSnapshot {
  readonly id: EntityId;
  readonly kind: TowerKind;
  readonly level: TowerLevel;
  readonly tile: TileCoord;
  /** Tile-unit center of the tower's tile. */
  readonly pos: Vec2;
  readonly targetMode: TargetMode;
  /** Current target, or null when idle. */
  readonly targetId: EntityId | null;
  /** Aim direction in the map plane, radians, atan2(dy, dx). */
  readonly facing: number;
  /** Sim time (seconds) of the last shot; -Infinity if never fired. Useful for attack animations. */
  readonly lastFiredAt: number;
  /** Total gold spent on this tower (base + upgrades). */
  readonly invested: number;
  /** Gold returned if sold now. */
  readonly sellValue: number;
  /** Gold required for the next level, or null at max level. */
  readonly upgradeCost: number | null;
  /** Effective range in tiles for the current level. */
  readonly range: number;
  /** Specialization at L4, else null. */
  readonly branch: TowerBranch | null;
  /** 0 = just fired, 1 = ready to fire. Drives wind-up animation. */
  readonly cooldownFraction: number;
  /** The two L4 choices, only while the tower is L3; null otherwise. */
  readonly branchOptions: Readonly<Record<TowerBranch, BranchOption>> | null;
}

export interface BranchOption {
  readonly name: string;
  readonly blurb: string;
  readonly cost: number;
}

export interface EnemySnapshot {
  readonly id: EntityId;
  readonly kind: EnemyKind;
  readonly pos: Vec2;
  readonly hp: number;
  readonly maxHp: number;
  readonly armor: number;
  readonly flying: boolean;
  /** Current slow amount, 0 (none) .. 1 (fully stopped). */
  readonly slow: number;
  readonly stunned: boolean;
  readonly burning: boolean;
  /** Distance travelled along its lane, in tiles. */
  readonly progress: number;
  /** Movement direction in the map plane, radians, atan2(dy, dx). */
  readonly heading: number;
  /** Index into the map's paths. */
  readonly lane: number;
  /** Tiles left until the portal (lane length - progress). Use this, not progress, to compare lanes. */
  readonly remaining: number;
  /** Shield hits left (Shield Orc); 0 if none. */
  readonly shield: number;
  /** Has the stealth trait. */
  readonly stealthed: boolean;
  /** Stealthed but currently revealed (targetable). Always true for non-stealth enemies. */
  readonly revealed: boolean;
  /** Takes extra damage (Frost Shatter). */
  readonly vulnerable: boolean;
  /** Stopped and fighting the hero. */
  readonly blockedByHero: boolean;
}

export type HeroState = 'idle' | 'moving' | 'fighting' | 'storming' | 'down';

export interface HeroSnapshot {
  readonly pos: Vec2;
  readonly rally: Vec2;
  readonly state: HeroState;
  readonly hp: number;
  readonly maxHp: number;
  readonly level: number;
  readonly maxLevel: number;
  readonly xp: number;
  /** XP needed for the next level, or null at max level. */
  readonly xpNext: number | null;
  readonly facing: number;
  /** Sim time of the last sword swing; -Infinity if never. */
  readonly lastAttackAt: number;
  /** Seconds until respawn while down, else 0. */
  readonly respawnIn: number;
  /** Enemy ids currently blocked by the hero. */
  readonly blocking: readonly EntityId[];
}

export interface AbilitySnapshot {
  readonly id: AbilityId;
  readonly unlocked: boolean;
  /** Wave at which it unlocks (0 = from the start). */
  readonly unlockWave: number;
  /** Seconds until ready (0 = ready). */
  readonly cooldown: number;
  readonly cooldownMax: number;
  /** Seconds left of an active effect (Frost Nova, Gold Rush, Blade Storm), else 0. */
  readonly activeRemaining: number;
  /** Needs a ground target point (Meteor). */
  readonly targeted: boolean;
  /** Radius of the targeting circle in tiles (0 if untargeted). */
  readonly radius: number;
}

export interface ProjectileSnapshot {
  readonly id: EntityId;
  readonly kind: ProjectileKind;
  readonly sourceTowerId: EntityId;
  readonly pos: Vec2;
  /** Where it was launched from. */
  readonly from: Vec2;
  /** Where it is currently heading (target's position, updated while homing). */
  readonly to: Vec2;
  /** Homing target, or null once it died (projectile flies to last known position). */
  readonly targetId: EntityId | null;
  /** Whether the target is a flyer (aim height). False once the target is gone. */
  readonly targetFlying: boolean;
}

/** Persistent area effects on the ground (e.g. Cannon L3 burning ground). */
export interface GroundEffectSnapshot {
  readonly id: EntityId;
  /** burn = fire patch (Cannon L3 / Meteor Mortar / Meteor); meteorWarning = incoming Meteor marker. */
  readonly kind: 'burn' | 'meteorWarning';
  readonly pos: Vec2;
  readonly radius: number;
  /** Seconds remaining. */
  readonly remaining: number;
}

export interface WaveGroupPreview {
  readonly enemy: EnemyKind;
  readonly count: number;
}

export interface GameStats {
  readonly kills: number;
  readonly leaks: number;
  readonly goldEarned: number;
  readonly towersBuilt: number;
}

export interface GameSnapshot {
  /** Simulation time in seconds (does not advance while paused). */
  readonly time: number;
  readonly phase: GamePhase;
  readonly difficulty: Difficulty;
  readonly mapId: string;
  readonly mode: GameMode;
  readonly modifiers: readonly ModifierId[];
  /** Last wave started (1-based); 0 before the first wave. */
  readonly wave: number;
  /** Campaign length; null in endless mode. */
  readonly totalWaves: number | null;
  /** Live score (see RULES.score). */
  readonly score: number;
  /** Interest granted at the last wave clear. */
  readonly lastInterest: number;
  readonly gold: number;
  readonly lives: number;
  readonly maxLives: number;
  readonly speed: GameSpeed;
  readonly paused: boolean;
  /** Seconds until the next wave auto-sends, or null if untimed (before wave 1) / not in build phase. */
  readonly buildCountdown: number | null;
  /** Gold bonus the player would get by sending the next wave right now. */
  readonly earlySendBonus: number;
  /** Composition of the next wave, or null if none. */
  readonly nextWave: readonly WaveGroupPreview[] | null;
  /** Lanes the next wave spawns on (for the path preview). */
  readonly nextWaveLanes: readonly number[];
  /** Null in the title phase. */
  readonly hero: HeroSnapshot | null;
  /** All four abilities, in order meteor, frostNova, goldRush, bladeStorm. */
  readonly abilities: readonly AbilitySnapshot[];
  readonly towers: readonly TowerSnapshot[];
  readonly enemies: readonly EnemySnapshot[];
  readonly projectiles: readonly ProjectileSnapshot[];
  readonly groundEffects: readonly GroundEffectSnapshot[];
  readonly stats: GameStats;
  /** Stars earned; only meaningful in 'victory' (0 otherwise). */
  readonly stars: Stars;
}
