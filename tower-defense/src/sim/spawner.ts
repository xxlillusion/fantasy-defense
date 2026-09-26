// Wave spawn schedule and enemy creation.
// Stream A2 owns this file (v2: lanes, horde modifier, ironclad armor).
import type { EnemyKind } from '../core/types';
import { ENEMIES, pointAlongPath, type WaveDef } from '../data';
import { enemyMaxHp } from './economy';
import { toEnemySnapshot } from './snapshot';
import { allocId, EPS, type EnemyState, type SimContext, type SimState, type SpawnEntry } from './state';

/** Flatten a wave definition into a time-sorted spawn list (stable for equal times), assigning lanes. */
export function buildSpawnQueue(state: SimState, wave: WaveDef): SpawnEntry[] {
  const lanes = state.map.paths.length;
  const out: SpawnEntry[] = [];
  for (const g of wave) {
    for (let i = 0; i < g.count; i++) {
      let lane: number;
      if (typeof g.lane === 'number') lane = Math.min(lanes - 1, Math.max(0, g.lane));
      else lane = state.laneCursor++ % lanes;
      out.push({ at: g.delay + i * g.interval, kind: g.enemy, lane });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

export interface SpawnOpts {
  lane?: number;
  progress?: number;
}

/** Create an enemy on a lane at a distance along it (HP scaled by the current wave). */
export function spawnEnemy(ctx: SimContext, kind: EnemyKind, opts: SpawnOpts = {}): EnemyState {
  const { state } = ctx;
  const def = ENEMIES[kind];
  const lane = Math.min(state.map.paths.length - 1, Math.max(0, opts.lane ?? 0));
  const progress = opts.progress ?? 0;
  const hp = enemyMaxHp(kind, state.wave, state.difficulty);
  const p = pointAlongPath(state.map, progress, lane);
  const stealth = !!def.traits?.stealth;
  const enemy: EnemyState = {
    id: allocId(state),
    kind,
    def,
    hp,
    maxHp: hp,
    armor: def.armor, // TODO(A2): + ironclad modifier
    lane,
    progress,
    remaining: state.pathLengths[lane]! - progress,
    pos: p.pos,
    heading: p.heading,
    slows: [],
    stunRemaining: 0,
    burning: false,
    shield: def.traits?.shieldHits ?? 0,
    vulnerable: null,
    stealth,
    revealed: !stealth,
    blockedByHero: false,
    meleeCooldown: 0,
    healTimer: def.traits?.heal?.interval ?? 0,
    alive: true,
  };
  state.enemies.push(enemy);
  ctx.events.emit('enemySpawned', { enemy: toEnemySnapshot(enemy) });
  return enemy;
}

export function updateSpawner(ctx: SimContext, dt: number): void {
  const { state } = ctx;
  state.waveTime += dt;
  while (state.spawnQueue.length && state.spawnQueue[0]!.at <= state.waveTime + EPS) {
    const s = state.spawnQueue.shift()!;
    spawnEnemy(ctx, s.kind, { lane: s.lane });
  }
}
