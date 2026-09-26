import { EventBus, type GameEventName, type GameEvents } from '../../src/core/events';
import { SIM_DT } from '../../src/core/grid';
import type { Difficulty, EnemyKind, GameMode, ModifierId, TileCoord, TowerBranch, TowerKind, TowerLevel } from '../../src/core/types';
import { DEFAULT_MAP_ID } from '../../src/data';
import type { EnemyState, TowerState } from '../../src/sim/state';
import { createSeededRng, createSimulationWithOptions, type Rng, type SimulationHandle } from '../../src/sim';

const EVENT_NAMES: GameEventName[] = [
  'gameStarted',
  'gameOver',
  'gameExited',
  'towerPlaced',
  'towerUpgraded',
  'towerSold',
  'towerFired',
  'projectileHit',
  'enemySpawned',
  'enemyDamaged',
  'enemyKilled',
  'enemyLeaked',
  'enemyStunned',
  'waveStarted',
  'waveCleared',
  'commandRejected',
];

export interface Recorded {
  name: GameEventName;
  payload: unknown;
}

export class EventLog {
  readonly all: Recorded[] = [];
  constructor(events: EventBus) {
    for (const name of EVENT_NAMES) events.on(name, (payload) => this.all.push({ name, payload }));
  }
  of<K extends GameEventName>(name: K): GameEvents[K][] {
    return this.all.filter((e) => e.name === name).map((e) => e.payload as GameEvents[K]);
  }
  clear(): void {
    this.all.length = 0;
  }
}

export interface Harness {
  sim: SimulationHandle;
  events: EventBus;
  log: EventLog;
}

export function makeSim(
  opts: { difficulty?: Difficulty; rng?: Rng; start?: boolean; gold?: number; mapId?: string; mode?: GameMode; modifiers?: ModifierId[] } = {},
): Harness {
  const events = new EventBus();
  const log = new EventLog(events);
  const sim = createSimulationWithOptions(events, { rng: opts.rng ?? createSeededRng(1234) });
  if (opts.start !== false) {
    sim.startGame({ difficulty: opts.difficulty ?? 'normal', mapId: opts.mapId ?? DEFAULT_MAP_ID, mode: opts.mode ?? 'campaign', modifiers: opts.modifiers ?? [] });
    if (opts.gold !== undefined) sim.state.gold = opts.gold;
  }
  log.clear();
  return { sim, events, log };
}

export function steps(sim: SimulationHandle, n: number): void {
  for (let i = 0; i < n; i++) sim.step(SIM_DT);
}

export function seconds(s: number): number {
  return Math.round(s / SIM_DT);
}

/** Place a tower (with unlimited gold) and upgrade it to `level`. */
export function addTower(
  sim: SimulationHandle,
  kind: TowerKind,
  tile: TileCoord,
  level: TowerLevel = 1,
  branch: TowerBranch = 'a',
): TowerState {
  const gold = sim.state.gold;
  sim.state.gold = 1e9;
  const r = sim.placeTower(kind, tile);
  if (!r.ok) throw new Error(`placeTower failed: ${r.reason}`);
  const t = sim.state.towers[sim.state.towers.length - 1]!;
  while (t.level < level) {
    const u = sim.upgradeTower(t.id, t.level === 3 ? branch : undefined);
    if (!u.ok) throw new Error(`upgrade failed: ${u.reason}`);
  }
  sim.state.gold = gold;
  return t;
}

/** Spawn an enemy that stays put (long stun that doesn't affect damage math). */
export function heldEnemy(sim: SimulationHandle, kind: EnemyKind, progress: number): EnemyState {
  const e = sim.debugSpawn(kind, progress);
  e.stunRemaining = 1e6;
  return e;
}

/** A tile beside the first path segment: center (3.5, 9.5). Path y = 10.5, x = progress - 0.5. */
export const TOWER_TILE: TileCoord = { col: 3, row: 9 };

export function constRng(v: number): Rng {
  return () => v;
}
