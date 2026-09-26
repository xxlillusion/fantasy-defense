// Homing projectiles: flight, impact, splash, fizzle.
import { dist } from '../core/grid';
import { damageEnemy } from './damage';
import { applyOnHitEffects, spawnBurn } from './effects';
import { enemiesInRange } from './targeting';
import { findEnemy, type EnemyState, type ProjectileState, type SimContext } from './state';

export function updateProjectiles(ctx: SimContext, dt: number): void {
  const { state } = ctx;
  const done = new Set<ProjectileState>();
  for (const p of state.projectiles) {
    const target = findEnemy(state, p.targetId);
    if (target) {
      p.to = { ...target.pos };
    } else if (p.targetId !== null) {
      // Target died (or leaked) mid-flight.
      p.targetId = null;
      if (p.splashRadius <= 0 && !p.burn) {
        done.add(p); // single-target shot fizzles
        continue;
      }
    }

    const d = dist(p.pos, p.to);
    const travel = p.speed * dt;
    if (d <= travel) {
      p.pos = { ...p.to };
      impact(ctx, p, target ?? null);
      done.add(p);
    } else {
      p.pos = { x: p.pos.x + ((p.to.x - p.pos.x) / d) * travel, y: p.pos.y + ((p.to.y - p.pos.y) / d) * travel };
    }
  }
  if (done.size) state.projectiles = state.projectiles.filter((p) => !done.has(p));
}

function impact(ctx: SimContext, p: ProjectileState, target: EnemyState | null): void {
  ctx.events.emit('projectileHit', { projectileId: p.id, kind: p.kind, pos: { ...p.pos }, splashRadius: p.splashRadius });

  let victims: EnemyState[];
  if (p.splashRadius > 0) victims = enemiesInRange(ctx.state.enemies, p, p.pos, p.splashRadius);
  else victims = target ? [target] : [];

  for (const e of victims) {
    damageEnemy(ctx, e, p.damage, { armorPierce: p.armorPierce, crit: p.crit, source: { type: 'tower', towerId: p.sourceTowerId } });
    applyOnHitEffects(ctx, e, p);
  }
  if (p.burn) spawnBurn(ctx, p.pos, p.burn, { type: 'tower', towerId: p.sourceTowerId });
}
