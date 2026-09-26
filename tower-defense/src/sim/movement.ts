// Enemy movement along their lanes, and leaks into the portal.
// Stream A2 owns this file (v2: hero blocking, swift modifier).
import { pointAlongPath } from '../data';
import { currentSlow, isStunned } from './effects';
import type { EnemyState, SimContext } from './state';

export function enemySpeed(enemy: EnemyState): number {
  if (isStunned(enemy) || enemy.blockedByHero) return 0;
  return enemy.def.speed * (1 - currentSlow(enemy)); // TODO(A2): swift modifier
}

export function moveEnemies(ctx: SimContext, dt: number): void {
  const { state } = ctx;
  for (const e of state.enemies) {
    if (!e.alive) continue;
    const speed = enemySpeed(e);
    if (speed <= 0) continue;
    e.progress += speed * dt;
    const len = state.pathLengths[e.lane]!;
    e.remaining = Math.max(0, len - e.progress);
    if (e.progress >= len) {
      leakEnemy(ctx, e);
      continue;
    }
    const p = pointAlongPath(state.map, e.progress, e.lane);
    e.pos = p.pos;
    e.heading = p.heading;
  }
}

function leakEnemy(ctx: SimContext, e: EnemyState): void {
  const { state } = ctx;
  e.alive = false;
  e.progress = state.pathLengths[e.lane]!;
  e.remaining = 0;
  const lost = e.def.livesCost;
  state.lives = Math.max(0, state.lives - lost);
  state.stats.leaks++;
  ctx.events.emit('enemyLeaked', { enemyId: e.id, kind: e.kind, livesLost: lost });
}
