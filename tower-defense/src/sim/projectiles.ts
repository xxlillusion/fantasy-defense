// Projectiles: homing flight, impact, splash, fizzle; straight-line piercing shots.
// Stream A1 owns this file.
import { dist } from '../core/grid';
import type { DamageOpts } from './damage';
import { hitEnemy, spawnBurn } from './effects';
import { canHit, canTouch, enemiesInRange, pointSegment } from './targeting';
import { findEnemy, type EnemyState, type ProjectileState, type SimContext } from './state';

/** A piercing projectile hits enemies whose centre comes within this many tiles of its path. */
export const PIERCE_HIT_RADIUS = 0.35;

export function updateProjectiles(ctx: SimContext, dt: number): void {
  const { state } = ctx;
  const done = new Set<ProjectileState>();
  for (const p of state.projectiles) {
    if (p.pierce !== undefined) {
      if (updatePiercing(ctx, p, dt)) done.add(p);
      continue;
    }
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

function damageOpts(p: ProjectileState): DamageOpts {
  return { armorPierce: p.armorPierce, crit: p.crit, source: { type: 'tower', towerId: p.sourceTowerId }, execute: p.execute };
}

function impact(ctx: SimContext, p: ProjectileState, target: EnemyState | null): void {
  ctx.events.emit('projectileHit', { projectileId: p.id, kind: p.kind, pos: { ...p.pos }, splashRadius: p.splashRadius });

  let victims: EnemyState[];
  if (p.splashRadius > 0) {
    victims = enemiesInRange(ctx.state.enemies, p, p.pos, p.splashRadius);
    // The homing target is always hit, even if it slipped back into stealth mid-flight.
    if (target && canTouch(p, target) && !victims.includes(target)) victims.unshift(target);
  } else {
    victims = target ? [target] : [];
  }

  for (const e of victims) hitEnemy(ctx, e, p.damage, damageOpts(p), p);
  if (p.burn) spawnBurn(ctx, p.pos, p.burn, { type: 'tower', towerId: p.sourceTowerId });
}

/**
 * Piercing flight: a fixed straight line (no homing) toward `p.to`, which is range + 1 from the
 * tower. Every valid enemy within PIERCE_HIT_RADIUS of the path swept this step is hit once, in
 * path order (pierceHit each). The shot ends (projectileHit) after `pierce` hits or at the end of
 * its reach. Returns true when finished.
 */
function updatePiercing(ctx: SimContext, p: ProjectileState, dt: number): boolean {
  const { state } = ctx;
  if (p.targetId !== null && !findEnemy(state, p.targetId)) p.targetId = null; // visuals only; no fizzle

  const start = { ...p.pos };
  const d = dist(start, p.to);
  const travel = p.speed * dt;
  const reachedEnd = d <= travel;
  const end = reachedEnd ? { ...p.to } : { x: start.x + ((p.to.x - start.x) / d) * travel, y: start.y + ((p.to.y - start.y) / d) * travel };

  const limit = p.pierce ?? 1;
  const hits: { e: EnemyState; t: number }[] = [];
  for (const e of state.enemies) {
    if (p.pierced.includes(e.id)) continue;
    // The launch target stays hittable even if it slipped back into stealth mid-flight.
    if (!(canHit(p, e) || (e.id === p.targetId && canTouch(p, e)))) continue;
    const ps = pointSegment(e.pos, start, end);
    if (ps.dist <= PIERCE_HIT_RADIUS) hits.push({ e, t: ps.t });
  }
  hits.sort((a, b) => a.t - b.t || a.e.id - b.e.id);

  for (const { e, t } of hits) {
    if (p.pierced.length >= limit) break;
    p.pierced.push(e.id);
    ctx.events.emit('pierceHit', { projectileId: p.id, enemyId: e.id, pos: { ...e.pos } });
    hitEnemy(ctx, e, p.damage, damageOpts(p), p);
    if (p.pierced.length >= limit) {
      p.pos = { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t };
      ctx.events.emit('projectileHit', { projectileId: p.id, kind: p.kind, pos: { ...p.pos }, splashRadius: 0 });
      return true;
    }
  }

  p.pos = end;
  if (reachedEnd) {
    ctx.events.emit('projectileHit', { projectileId: p.id, kind: p.kind, pos: { ...p.pos }, splashRadius: 0 });
    return true;
  }
  return false;
}
