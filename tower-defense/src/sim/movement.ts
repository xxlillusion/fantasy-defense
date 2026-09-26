// Enemy movement along the map waypoints, and leaks into the portal.
import { pointAlongPath } from '../data';
import { currentSlow, isStunned } from './effects';
import type { EnemyState, SimContext } from './state';

export function enemySpeed(enemy: EnemyState): number {
  if (isStunned(enemy)) return 0;
  return enemy.def.speed * (1 - currentSlow(enemy));
}

export function moveEnemies(ctx: SimContext, dt: number): void {
  const { state } = ctx;
  for (const e of state.enemies) {
    if (!e.alive) continue;
    const speed = enemySpeed(e);
    if (speed <= 0) continue;
    e.progress += speed * dt;
    if (e.progress >= state.pathLength) {
      leakEnemy(ctx, e);
      continue;
    }
    const p = pointAlongPath(state.map, e.progress);
    e.pos = p.pos;
    e.heading = p.heading;
  }
}

function leakEnemy(ctx: SimContext, e: EnemyState): void {
  const { state } = ctx;
  e.alive = false;
  e.progress = state.pathLength;
  const lost = e.def.livesCost;
  state.lives = Math.max(0, state.lives - lost);
  state.stats.leaks++;
  ctx.events.emit('enemyLeaked', { enemyId: e.id, kind: e.kind, livesLost: lost });
}
