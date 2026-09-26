// Mutable internal simulation state. Never handed out directly: snapshot.ts copies it into
// immutable GameSnapshot objects.
import type { EventBus } from '../core/events';
import type {
  Difficulty,
  EnemyKind,
  EntityId,
  GamePhase,
  GameSpeed,
  ProjectileKind,
  Stars,
  TargetMode,
  TileCoord,
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
  progress: number;
  pos: Vec2;
  heading: number;
  slows: SlowEffect[];
  stunRemaining: number;
  burning: boolean;
  /** False once killed or leaked; pruned at the end of the step. */
  alive: boolean;
}

export interface TowerState {
  id: EntityId;
  kind: TowerKind;
  level: TowerLevel;
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
}

export interface GroundEffectState {
  id: EntityId;
  kind: 'burn';
  pos: Vec2;
  radius: number;
  remaining: number;
  dps: number;
  /** Time accumulated towards the next damage tick. */
  tickTimer: number;
}

export interface SpawnEntry {
  /** Seconds after wave start. */
  at: number;
  kind: EnemyKind;
}

export interface MutableStats {
  kills: number;
  leaks: number;
  goldEarned: number;
  towersBuilt: number;
}

export interface SimState {
  time: number;
  phase: GamePhase;
  difficulty: Difficulty;
  mapId: string;
  map: MapDef;
  pathLength: number;
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
  stars: Stars;
  nextId: EntityId;
}

/** Everything the per-step systems need. */
export interface SimContext {
  state: SimState;
  events: EventBus;
  rng: Rng;
}

export function createInitialState(): SimState {
  const map = getMap(DEFAULT_MAP_ID);
  return {
    time: 0,
    phase: 'title',
    difficulty: 'normal',
    mapId: map.id,
    map,
    pathLength: pathLength(map),
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
