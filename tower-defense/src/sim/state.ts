// Mutable internal simulation state. Never handed out directly: snapshot.ts copies it into
// immutable GameSnapshot objects.
//
// v2 (lead-owned layout): fields are shared by Stream A1 (combat & enemy traits) and Stream A2
// (flow, lanes, hero, abilities, modes). Ownership of *behaviour* is per file; see CONTRIBUTING.md.
import type { EventBus } from '../core/events';
import type {
  AbilityId,
  Difficulty,
  EnemyKind,
  EntityId,
  GameMode,
  GamePhase,
  GameSpeed,
  HeroState,
  ModifierId,
  ProjectileKind,
  Stars,
  TargetMode,
  TileCoord,
  TowerBranch,
  TowerKind,
  TowerLevel,
  Vec2,
} from '../core/types';
import { DEFAULT_MAP_ID, getMap, pathLength, type EnemyDef, type MapDef, type TowerLevelStats } from '../data';
import type { Rng } from './rng';

/** Small tolerance for float comparisons of timers and distances. */
export const EPS = 1e-9;

export interface SlowEffect {
  /** Effective slow after the enemy's slowResist, 0..1. */
  amount: number;
  remaining: number;
}

export interface EnemyState {
  id: EntityId;
  kind: EnemyKind;
  def: EnemyDef;
  hp: number;
  maxHp: number;
  /** Effective armor (def.armor + modifiers). Use this, not def.armor. */
  armor: number;
  /** Index into state.map.paths. */
  lane: number;
  /** Distance along its lane. */
  progress: number;
  /** Tiles left to the portal: state.pathLengths[lane] - progress (kept in sync by movement/spawn). */
  remaining: number;
  pos: Vec2;
  heading: number;
  slows: SlowEffect[];
  stunRemaining: number;
  burning: boolean;
  /** Shield hits left (Shield Orc). */
  shield: number;
  /** Vulnerable debuff: extra damage fraction and time left (null = none). */
  vulnerable: { amount: number; remaining: number } | null;
  /** Has the stealth trait. */
  stealth: boolean;
  /** For stealth enemies: currently revealed (targetable). Non-stealth enemies are always true. */
  revealed: boolean;
  /** Stopped by the hero (does not move; fights him). */
  blockedByHero: boolean;
  /** Seconds until this enemy's next melee swing at the hero. */
  meleeCooldown: number;
  /** Healer trait: seconds until the next heal pulse. */
  healTimer: number;
  /** False once killed or leaked; pruned at the end of the step. */
  alive: boolean;
}

export interface TowerState {
  id: EntityId;
  kind: TowerKind;
  level: TowerLevel;
  /** Set when upgrading L3 -> L4. */
  branch: TowerBranch | null;
  tile: TileCoord;
  pos: Vec2;
  targetMode: TargetMode;
  targetId: EntityId | null;
  facing: number;
  lastFiredAt: number;
  invested: number;
  /** Seconds until the tower may fire again (<= 0 means ready). */
  cooldown: number;
}

/** Who dealt damage (for hero XP, stats, gold rush). */
export type DamageSource =
  | { type: 'tower'; towerId: EntityId }
  | { type: 'hero' }
  | { type: 'ability'; id: AbilityId }
  | { type: 'burn' };

export interface ProjectileState {
  id: EntityId;
  kind: ProjectileKind;
  sourceTowerId: EntityId;
  pos: Vec2;
  from: Vec2;
  /** Current destination (target's last known position). */
  to: Vec2;
  /** Homing target; null once it died (projectile then flies to `to`). */
  targetId: EntityId | null;
  speed: number;
  damage: number;
  crit: boolean;
  armorPierce: boolean;
  splashRadius: number;
  hitsAir: boolean;
  hitsGround: boolean;
  slow?: TowerLevelStats['slow'];
  stun?: TowerLevelStats['stun'];
  burn?: TowerLevelStats['burn'];
  vulnerable?: TowerLevelStats['vulnerable'];
  execute?: number;
  /** Piercing: max enemies hit in total (undefined = normal projectile). */
  pierce?: number;
  /** Enemies already hit by a piercing projectile. */
  pierced: EntityId[];
}

export interface GroundEffectState {
  id: EntityId;
  kind: 'burn' | 'meteorWarning';
  pos: Vec2;
  radius: number;
  /** burn: seconds left; meteorWarning: seconds until impact. */
  remaining: number;
  /** burn only. */
  dps: number;
  /** Time accumulated towards the next damage tick. */
  tickTimer: number;
  source: DamageSource;
}

export interface SpawnEntry {
  /** Seconds after wave start. */
  at: number;
  kind: EnemyKind;
  lane: number;
}

export interface MutableStats {
  kills: number;
  leaks: number;
  goldEarned: number;
  towersBuilt: number;
}

export interface HeroInternal {
  pos: Vec2;
  rally: Vec2;
  state: HeroState;
  hp: number;
  maxHp: number;
  level: number;
  xp: number;
  facing: number;
  lastAttackAt: number;
  attackCooldown: number;
  respawnIn: number;
  /** Enemy ids currently blocked. */
  blocking: EntityId[];
  /** Sim time the hero last took damage (regen delay). */
  lastDamagedAt: number;
  /** Blade Storm seconds left. */
  stormRemaining: number;
  stormTick: number;
}

export interface AbilityInternal {
  cooldown: number;
  /** Seconds left of an active effect. */
  active: number;
}

export interface SimState {
  time: number;
  phase: GamePhase;
  difficulty: Difficulty;
  mode: GameMode;
  modifiers: ModifierId[];
  mapId: string;
  map: MapDef;
  /** Length of each lane (index = lane). */
  pathLengths: number[];
  /** Round-robin cursor for 'alternate' lane assignment. */
  laneCursor: number;
  wave: number;
  gold: number;
  lives: number;
  maxLives: number;
  speed: GameSpeed;
  paused: boolean;
  buildCountdown: number | null;
  towers: TowerState[];
  enemies: EnemyState[];
  projectiles: ProjectileState[];
  groundEffects: GroundEffectState[];
  spawnQueue: SpawnEntry[];
  /** Seconds since the current wave started. */
  waveTime: number;
  stats: MutableStats;
  /** Sum of bounties earned (score input). */
  bountyEarned: number;
  /** Waves fully cleared (score input). */
  wavesCleared: number;
  lastInterest: number;
  /** Kill bounty multiplier (Gold Rush). */
  bountyMultiplier: number;
  hero: HeroInternal | null;
  abilities: Record<AbilityId, AbilityInternal>;
  stars: Stars;
  nextId: EntityId;
}

/** Internal hooks between systems owned by different streams. */
export interface SimHooks {
  /** Called by killEnemy (A1) after the kill is applied; A2 uses it for hero XP. */
  onEnemyKilled(enemy: EnemyState, source: DamageSource): void;
}

/** Everything the per-step systems need. */
export interface SimContext {
  state: SimState;
  events: EventBus;
  rng: Rng;
  hooks: SimHooks;
}

export function createAbilityState(): Record<AbilityId, AbilityInternal> {
  return {
    meteor: { cooldown: 0, active: 0 },
    frostNova: { cooldown: 0, active: 0 },
    goldRush: { cooldown: 0, active: 0 },
    bladeStorm: { cooldown: 0, active: 0 },
  };
}

export function createInitialState(map: MapDef = getMap(DEFAULT_MAP_ID)): SimState {
  return {
    time: 0,
    phase: 'title',
    difficulty: 'normal',
    mode: 'campaign',
    modifiers: [],
    mapId: map.id,
    map,
    pathLengths: map.paths.map((_, lane) => pathLength(map, lane)),
    laneCursor: 0,
    wave: 0,
    gold: 0,
    lives: 0,
    maxLives: 0,
    speed: 1,
    paused: false,
    buildCountdown: null,
    towers: [],
    enemies: [],
    projectiles: [],
    groundEffects: [],
    spawnQueue: [],
    waveTime: 0,
    stats: { kills: 0, leaks: 0, goldEarned: 0, towersBuilt: 0 },
    bountyEarned: 0,
    wavesCleared: 0,
    lastInterest: 0,
    bountyMultiplier: 1,
    hero: null,
    abilities: createAbilityState(),
    stars: 0,
    nextId: 1,
  };
}

export function allocId(state: SimState): EntityId {
  return state.nextId++;
}

export function findEnemy(state: SimState, id: EntityId | null): EnemyState | undefined {
  if (id === null) return undefined;
  return state.enemies.find((e) => e.id === id && e.alive);
}

export function findTower(state: SimState, id: EntityId): TowerState | undefined {
  return state.towers.find((t) => t.id === id);
}

export function hasModifier(state: SimState, id: ModifierId): boolean {
  return state.modifiers.includes(id);
}
