// Tower cooldowns, target acquisition and firing (projectiles, chain lightning, aura pulses).
import { TOWER_PROJECTILE, TOWERS, towerStats as resolveStats, type TowerLevelStats } from '../data';
import { chainDamage, damageEnemy } from './damage';
import { applyOnHitEffects } from './effects';
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

/** `candidates` is non-empty and sorted best-first by the tower's targeting mode. */
function fire(ctx: SimContext, tower: TowerState, lvl: TowerLevelStats, candidates: EnemyState[]): void {
  const def = TOWERS[tower.kind];

  if (lvl.aura) {
    // Pulse: every valid enemy in range.
    emitFired(ctx, tower, candidates);
    for (const e of candidates) {
      const { damage, crit } = rollCrit(ctx, lvl);
      damageEnemy(ctx, e, damage, { armorPierce: lvl.armorPierce, crit, source: { type: 'tower', towerId: tower.id } });
      applyOnHitEffects(ctx, e, lvl);
    }
    return;
  }

  if (lvl.chain) {
    const chain = buildChain(ctx.state.enemies, def, candidates[0]!, lvl.chain.targets, lvl.chain.jumpRange);
    emitFired(ctx, tower, chain);
    chain.forEach((e, i) => {
      const { damage, crit } = rollCrit(ctx, lvl);
      damageEnemy(ctx, e, chainDamage(damage, lvl.chain!.falloff, i), { armorPierce: lvl.armorPierce, crit, source: { type: 'tower', towerId: tower.id } });
      applyOnHitEffects(ctx, e, lvl);
    });
    return;
  }

  // Projectiles: one per projectilesPerShot, at distinct targets when available.
  const n = Math.max(1, lvl.projectilesPerShot);
  const targets: EnemyState[] = [];
  for (let i = 0; i < n; i++) targets.push(candidates[i % candidates.length]!);
  emitFired(ctx, tower, targets);

  const projKind = TOWER_PROJECTILE[tower.kind];
  for (const target of targets) {
    const { damage, crit } = rollCrit(ctx, lvl);
    if (projKind === null || lvl.projectileSpeed <= 0) {
      // Instant hit (no projectile visual defined for this tower).
      damageEnemy(ctx, target, damage, { armorPierce: lvl.armorPierce, crit, source: { type: 'tower', towerId: tower.id } });
      applyOnHitEffects(ctx, target, lvl);
      continue;
    }
    ctx.state.projectiles.push({
      id: allocId(ctx.state),
      kind: projKind,
      sourceTowerId: tower.id,
      pos: { ...tower.pos },
      from: { ...tower.pos },
      to: { ...target.pos },
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
      pierce: lvl.pierce,
      pierced: [],
    });
  }
}
