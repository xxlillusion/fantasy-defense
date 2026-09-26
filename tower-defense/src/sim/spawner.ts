// Wave spawn schedule and enemy creation.
import type { EnemyKind } from '../core/types';
import { ENEMIES, pointAlongPath, type WaveDef } from '../data';
import { enemyMaxHp } from './economy';
import { toEnemySnapshot } from './snapshot';
import { allocId, EPS, type EnemyState, type SimContext, type SpawnEntry } from './state';

/** Flatten a wave definition into a time-sorted spawn list (stable for equal times). */
export function buildSpawnQueue(wave: WaveDef): SpawnEntry[] {
  const out: SpawnEntry[] = [];
  for (const g of wave) {
    for (let i = 0; i < g.count; i++) out.push({ at: g.delay + i * g.interval, kind: g.enemy });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Create an enemy at a distance along the path (HP scaled by the current wave). */
export function spawnEnemy(ctx: SimContext, kind: EnemyKind, progress = 0): EnemyState {
  const { state } = ctx;
  const def = ENEMIES[kind];
  const hp = enemyMaxHp(kind, state.wave, state.difficulty);
  const p = pointAlongPath(state.map, progress);
  const enemy: EnemyState = {
    id: allocId(state),
    kind,
    def,
    hp,
    maxHp: hp,
    progress,
    pos: p.pos,
    heading: p.heading,
    slows: [],
    stunRemaining: 0,
    burning: false,
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
    spawnEnemy(ctx, state.spawnQueue.shift()!.kind);
  }
}
