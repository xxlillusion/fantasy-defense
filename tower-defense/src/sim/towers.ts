// Tower cooldowns, target acquisition and firing (projectiles, chain lightning, aura pulses,
// instant hits with splash). Stream A1 owns this file.
import type { Vec2 } from '../core/types';
import { TOWER_PROJECTILE, TOWERS, towerStats as resolveStats, type TowerLevelStats } from '../data';
import { chainDamage, type DamageOpts } from './damage';
import { hitEnemy } from './effects';
import { bestByMode, buildChain, enemiesInRange, sortByMode } from './targeting';
import { allocId, type EnemyState, type SimContext, type TowerState } from './state';

export function towerStats(t: TowerState): TowerLevelStats {
  return resolveStats(t.kind, t.level, t.branch);
}

export function updateTowers(ctx: SimContext, dt: number): void {
  const { state } = ctx;
  for (const tower of state.towers) {
    const def = TOWERS[tower.kind];
    const lvl = towerStats(tower);
    tower.cooldown -= dt;

    const inRange = enemiesInRange(state.enemies, def, tower.pos, lvl.range);
    const primary = bestByMode(inRange, tower.targetMode, tower.pos);
    if (!primary) {
      tower.targetId = null;
      if (tower.cooldown < 0) tower.cooldown = 0; // idle towers don't bank shots
      continue;
    }
    tower.targetId = primary.id;
    tower.facing = Math.atan2(primary.pos.y - tower.pos.y, primary.pos.x - tower.pos.x);
    if (tower.cooldown > 0) continue;

    fire(ctx, tower, lvl, sortByMode(inRange, tower.targetMode, tower.pos));
    tower.lastFiredAt = state.time;
    tower.cooldown += 1 / lvl.fireRate;
  }
}

function targetList(enemies: EnemyState[]) {
  return enemies.map((e) => ({ id: e.id, pos: { ...e.pos } }));
}

function emitFired(ctx: SimContext, tower: TowerState, targets: EnemyState[]): void {
  ctx.events.emit('towerFired', {
    towerId: tower.id,
    kind: tower.kind,
    level: tower.level,
    branch: tower.branch,
    from: { ...tower.pos },
    targets: targetList(targets),
  });
}

function rollCrit(ctx: SimContext, lvl: TowerLevelStats): { damage: number; crit: boolean } {
  if (lvl.crit && ctx.rng() < lvl.crit.chance) return { damage: lvl.damage * lvl.crit.multiplier, crit: true };
  return { damage: lvl.damage, crit: false };
}

function hitOpts(tower: TowerState, lvl: TowerLevelStats, crit: boolean): DamageOpts {
  return { armorPierce: lvl.armorPierce, crit, source: { type: 'tower', towerId: tower.id }, execute: lvl.execute };
}

/** `candidates` is non-empty and sorted best-first by the tower's targeting mode. */
function fire(ctx: SimContext, tower: TowerState, lvl: TowerLevelStats, candidates: EnemyState[]): void {
  const def = TOWERS[tower.kind];

  if (lvl.aura) {
    // Pulse: every valid enemy in range (Frost L3 / Absolute Zero, Earthquake; hitsAir respected).
    emitFired(ctx, tower, candidates);
    for (const e of candidates) {
      const { damage, crit } = rollCrit(ctx, lvl);
      hitEnemy(ctx, e, damage, hitOpts(tower, lvl, crit), lvl);
    }
    return;
  }

  if (lvl.chain) {
    const chain = buildChain(ctx.state.enemies, def, candidates[0]!, lvl.chain.targets, lvl.chain.jumpRange);
    emitFired(ctx, tower, chain);
    chain.forEach((e, i) => {
      const { damage, crit } = rollCrit(ctx, lvl);
      hitEnemy(ctx, e, chainDamage(damage, lvl.chain!.falloff, i), hitOpts(tower, lvl, crit), lvl);
    });
    return;
  }

  // One shot per projectilesPerShot, at distinct targets when available.
  const n = Math.max(1, lvl.projectilesPerShot);
  const targets: EnemyState[] = [];
  for (let i = 0; i < n; i++) targets.push(candidates[i % candidates.length]!);

  const projKind = TOWER_PROJECTILE[tower.kind];
  if (projKind === null || lvl.projectileSpeed <= 0) {
    fireInstant(ctx, tower, lvl, targets);
    return;
  }

  emitFired(ctx, tower, targets);
  for (const target of targets) {
    const { damage, crit } = rollCrit(ctx, lvl);
    const piercing = lvl.pierce !== undefined && lvl.pierce > 0;
    ctx.state.projectiles.push({
      id: allocId(ctx.state),
      kind: projKind,
      sourceTowerId: tower.id,
      pos: { ...tower.pos },
      from: { ...tower.pos },
      // Piercing shots fly straight to the end of their reach; others home on the target.
      to: piercing ? pierceEnd(tower.pos, target.pos, lvl.range + 1, tower.facing) : { ...target.pos },
      targetId: target.id,
      speed: lvl.projectileSpeed,
      damage,
      crit,
      armorPierce: lvl.armorPierce,
      splashRadius: lvl.splashRadius,
      hitsAir: def.hitsAir,
      hitsGround: def.hitsGround,
      slow: lvl.slow,
      stun: lvl.stun,
      burn: lvl.burn,
      vulnerable: lvl.vulnerable,
      execute: lvl.execute,
      pierce: piercing ? lvl.pierce : undefined,
      pierced: [],
    });
  }
}

/** End point of a straight piercing flight of length `reach` from `from` toward `at`. */
function pierceEnd(from: Vec2, at: Vec2, reach: number, fallbackAngle: number): Vec2 {
  const dx = at.x - from.x;
  const dy = at.y - from.y;
  const len = Math.hypot(dx, dy);
  const ux = len > 1e-6 ? dx / len : Math.cos(fallbackAngle);
  const uy = len > 1e-6 ? dy / len : Math.sin(fallbackAngle);
  return { x: from.x + ux * reach, y: from.y + uy * reach };
}

/**
 * Instant hits (no projectile), e.g. Tesla Overload. With splashRadius > 0 every valid enemy
 * within it of the primary target is hit too. towerFired lists the primary targets first, then
 * the splash victims; no projectileHit is emitted.
 */
function fireInstant(ctx: SimContext, tower: TowerState, lvl: TowerLevelStats, targets: EnemyState[]): void {
  const def = TOWERS[tower.kind];
  const shots: { primary: EnemyState; victims: EnemyState[] }[] = [];
  const listed: EnemyState[] = [...targets];
  for (const primary of targets) {
    const victims = [primary];
    if (lvl.splashRadius > 0) {
      for (const e of enemiesInRange(ctx.state.enemies, def, primary.pos, lvl.splashRadius)) {
        if (e === primary) continue;
        victims.push(e);
        if (!listed.includes(e)) listed.push(e);
      }
    }
    shots.push({ primary, victims });
  }
  emitFired(ctx, tower, listed);
  for (const shot of shots) {
    const { damage, crit } = rollCrit(ctx, lvl);
    for (const e of shot.victims) hitEnemy(ctx, e, damage, hitOpts(tower, lvl, crit), lvl);
  }
}
