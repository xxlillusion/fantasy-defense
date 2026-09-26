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
export type EnemyKind = 'grunt' | 'runner' | 'brute' | 'swarmling' | 'flyer' | 'boss';
export type TargetMode = 'first' | 'last' | 'strongest' | 'closest';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type TowerLevel = 1 | 2 | 3;
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
  /** Distance travelled along the path, in tiles. */
  readonly progress: number;
  /** Movement direction in the map plane, radians, atan2(dy, dx). */
  readonly heading: number;
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
  readonly kind: 'burn';
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
  /** Last wave started (1-based); 0 before the first wave. */
  readonly wave: number;
  readonly totalWaves: number;
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
  readonly towers: readonly TowerSnapshot[];
  readonly enemies: readonly EnemySnapshot[];
  readonly projectiles: readonly ProjectileSnapshot[];
  readonly groundEffects: readonly GroundEffectSnapshot[];
  readonly stats: GameStats;
  /** Stars earned; only meaningful in 'victory' (0 otherwise). */
  readonly stars: Stars;
}
