// Status effects (slow, stun, vulnerable) and persistent ground effects (burn).
// Stream A1 owns this file.
import type { Vec2 } from '../core/types';
import type { TowerLevelStats } from '../data';
import { damageEnemy, shieldAbsorbs, type DamageOpts } from './damage';
import { enemiesInRange } from './targeting';
import { allocId, EPS, type DamageSource, type EnemyState, type SimContext } from './state';

/** Burning ground deals its damage in discrete ticks this often (seconds). */
export const BURN_TICK_INTERVAL = 0.5;

const GROUND_ONLY = { hitsAir: false, hitsGround: true };

/** Current slow: the strongest active slow wins; slows never stack. */
export function currentSlow(enemy: EnemyState): number {
  let max = 0;
  for (const s of enemy.slows) if (s.remaining > EPS && s.amount > max) max = s.amount;
  return max;
}

/** Apply a slow; the enemy's slowResist reduces its strength. */
export function applySlow(enemy: EnemyState, amount: number, duration: number): void {
  const effective = Math.min(1, Math.max(0, amount * (1 - enemy.def.slowResist)));
  if (effective <= 0 || duration <= 0) return;
  const same = enemy.slows.find((s) => Math.abs(s.amount - effective) < EPS);
  if (same) same.remaining = Math.max(same.remaining, duration);
  else enemy.slows.push({ amount: effective, remaining: duration });
}

export function isStunned(enemy: EnemyState): boolean {
  return enemy.stunRemaining > EPS;
}

/** Stun an enemy (refreshes to the longer duration). Returns false if immune/dead. */
export function stunEnemy(ctx: SimContext, enemy: EnemyState, duration: number): boolean {
  if (!enemy.alive || enemy.def.stunImmune || duration <= 0) return false;
  enemy.stunRemaining = Math.max(enemy.stunRemaining, duration);
  ctx.events.emit('enemyStunned', { enemyId: enemy.id, pos: { ...enemy.pos }, duration });
  return true;
}

/** Apply or refresh the vulnerable debuff: the larger amount and the longer time left win. */
export function applyVulnerable(enemy: EnemyState, amount: number, duration: number): void {
  if (!enemy.alive || amount <= 0 || duration <= 0) return;
  const v = enemy.vulnerable;
  if (v && v.remaining > EPS) {
    v.amount = Math.max(v.amount, amount);
    v.remaining = Math.max(v.remaining, duration);
  } else {
    enemy.vulnerable = { amount, remaining: duration };
  }
}

export interface OnHitFx {
  slow?: TowerLevelStats['slow'];
  stun?: TowerLevelStats['stun'];
  vulnerable?: TowerLevelStats['vulnerable'];
}

/** On-hit status effects of a tower level (slow and vulnerable always; stun by chance). */
export function applyOnHitEffects(ctx: SimContext, enemy: EnemyState, fx: OnHitFx): void {
  if (!enemy.alive) return;
  if (fx.slow) applySlow(enemy, fx.slow.amount, fx.slow.duration);
  if (fx.vulnerable) applyVulnerable(enemy, fx.vulnerable.amount, fx.vulnerable.duration);
  if (fx.stun && !enemy.def.stunImmune && ctx.rng() < fx.stun.chance) stunEnemy(ctx, enemy, fx.stun.duration);
}

/**
 * One tower hit: damage plus on-hit effects. A shield absorbs the attack (the damage and the
 * damage-amplifying vulnerable debuff), but crowd control (slow, stun/freeze) still lands.
 * Returns true if the enemy died.
 */
export function hitEnemy(ctx: SimContext, enemy: EnemyState, baseDamage: number, opts: DamageOpts, fx: OnHitFx): boolean {
  if (!enemy.alive) return false;
  const absorbed = shieldAbsorbs(enemy, opts);
  const killed = damageEnemy(ctx, enemy, baseDamage, opts);
  if (killed) return true;
  applyOnHitEffects(ctx, enemy, absorbed ? { slow: fx.slow, stun: fx.stun } : fx);
  return false;
}

/** Count down slow, stun and vulnerable timers. */
export function tickStatuses(ctx: SimContext, dt: number): void {
  for (const e of ctx.state.enemies) {
    if (!e.alive) continue;
    if (e.slows.length) {
      for (const s of e.slows) s.remaining -= dt;
      e.slows = e.slows.filter((s) => s.remaining > EPS);
    }
    if (e.stunRemaining > 0) {
      e.stunRemaining -= dt;
      if (e.stunRemaining <= EPS) e.stunRemaining = 0;
    }
    if (e.vulnerable) {
      e.vulnerable.remaining -= dt;
      if (e.vulnerable.remaining <= EPS) e.vulnerable = null;
    }
  }
}

export function spawnBurn(
  ctx: SimContext,
  pos: Vec2,
  burn: NonNullable<TowerLevelStats['burn']>,
  source: DamageSource = { type: 'burn' },
): void {
  ctx.state.groundEffects.push({
    id: allocId(ctx.state),
    kind: 'burn',
    pos: { ...pos },
    radius: burn.radius,
    remaining: burn.duration,
    dps: burn.dps,
    tickTimer: 0,
    source,
  });
}

/**
 * Burning ground: marks ground enemies inside as burning and deals dps in ticks of
 * BURN_TICK_INTERVAL (dps * duration total). Burn damage ignores armor, bypasses shields and
 * also hurts unrevealed stealth enemies.
 */
export function updateGroundEffects(ctx: SimContext, dt: number): void {
  const { state } = ctx;
  for (const e of state.enemies) e.burning = false;
  if (!state.groundEffects.length) return;

  for (const g of state.groundEffects) {
    if (g.kind !== 'burn') continue; // meteorWarning is ticked by abilities.ts (A2)
    const inside = enemiesInRange(state.enemies, GROUND_ONLY, g.pos, g.radius, true);
    for (const e of inside) e.burning = true;
    g.tickTimer += dt;
    if (g.tickTimer >= BURN_TICK_INTERVAL - EPS) {
      g.tickTimer -= BURN_TICK_INTERVAL;
      const amount = g.dps * BURN_TICK_INTERVAL;
      for (const e of inside) damageEnemy(ctx, e, amount, { armorPierce: true, crit: false, source: g.source, groundBurn: true });
    }
    g.remaining -= dt;
  }
  state.groundEffects = state.groundEffects.filter((g) => g.kind !== 'burn' || g.remaining > EPS);
}
