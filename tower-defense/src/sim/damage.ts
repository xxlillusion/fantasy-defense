// Damage math: armor, armor-pierce, minimum damage, kills and bounties.
// Stream A1 owns this file (v2: shield, vulnerable, execute, split-on-death).
import { RULES } from '../data';
import { earnGold } from './economy';
import { spawnEnemy } from './spawner';
import type { DamageSource, EnemyState, SimContext } from './state';

export interface DamageOpts {
  armorPierce: boolean;
  crit: boolean;
  source: DamageSource;
  /** Burning ground: bypasses the Shield Orc's shield (set by ground-effect ticks). */
  groundBurn?: boolean;
  /** Execute threshold (HP fraction); non-boss survivors at or below it die instantly. */
  execute?: number;
}

/** Split children are spread evenly over this progress window around the parent. */
export const SPLIT_SPREAD = 0.3;

/** Flat armor reduction with a floor of RULES.minDamage; armorPierce ignores armor entirely. */
export function mitigateDamage(base: number, armor: number, armorPierce: boolean): number {
  if (armorPierce) return base;
  return Math.max(RULES.minDamage, base - armor);
}

/** Chain damage for the n-th target (0 = first): base * (1 - falloff)^n. */
export function chainDamage(base: number, falloff: number, index: number): number {
  return base * Math.pow(1 - falloff, index);
}

/** Would this hit be absorbed by the enemy's shield? (Every source except burning ground.) */
export function shieldAbsorbs(enemy: EnemyState, opts: Pick<DamageOpts, 'source' | 'groundBurn'>): boolean {
  return enemy.alive && enemy.shield > 0 && opts.source.type !== 'burn' && !opts.groundBurn;
}

/** Damage multiplier from the vulnerable debuff (applied after armor). */
export function vulnerableMultiplier(enemy: EnemyState): number {
  const v = enemy.vulnerable;
  return v && v.remaining > 0 ? 1 + v.amount : 1;
}

/**
 * Deal damage to an enemy, emitting enemyDamaged and handling the kill. Returns true if killed.
 * A shielded enemy absorbs the whole hit instead (no HP loss, no enemyDamaged).
 */
export function damageEnemy(ctx: SimContext, enemy: EnemyState, baseDamage: number, opts: DamageOpts): boolean {
  if (!enemy.alive) return false;
  if (shieldAbsorbs(enemy, opts)) {
    enemy.shield--;
    if (enemy.shield > 0) ctx.events.emit('shieldBlocked', { enemyId: enemy.id, pos: { ...enemy.pos }, remaining: enemy.shield });
    else ctx.events.emit('shieldBroken', { enemyId: enemy.id, pos: { ...enemy.pos } });
    return false;
  }
  const amount = mitigateDamage(baseDamage, enemy.armor, opts.armorPierce) * vulnerableMultiplier(enemy);
  enemy.hp -= amount;
  ctx.events.emit('enemyDamaged', { enemyId: enemy.id, amount, pos: { ...enemy.pos }, crit: opts.crit });
  if (enemy.hp <= 0) {
    killEnemy(ctx, enemy, opts.source);
    return true;
  }
  if (opts.execute !== undefined && opts.execute > 0 && !enemy.def.boss && enemy.hp <= opts.execute * enemy.maxHp) {
    ctx.events.emit('enemyExecuted', { enemyId: enemy.id, pos: { ...enemy.pos } });
    killEnemy(ctx, enemy, opts.source);
    return true;
  }
  return false;
}

export function killEnemy(ctx: SimContext, enemy: EnemyState, source: DamageSource): void {
  if (!enemy.alive) return;
  const { state } = ctx;
  enemy.alive = false;
  enemy.hp = 0;
  const bounty = Math.round(enemy.def.bounty * state.bountyMultiplier);
  earnGold(state, bounty);
  state.bountyEarned += bounty;
  state.stats.kills++;
  ctx.events.emit('enemyKilled', { enemyId: enemy.id, kind: enemy.kind, pos: { ...enemy.pos }, bounty });
  ctx.hooks.onEnemyKilled(enemy, source);
  splitOnDeath(ctx, enemy);
}

/**
 * Split trait (Broodmother): spawn children on the parent's lane, spread evenly over
 * progress +- SPLIT_SPREAD (clamped to the lane). Children are appended to state.enemies and
 * start moving next step; they get the current wave's HP scaling from spawnEnemy.
 */
function splitOnDeath(ctx: SimContext, parent: EnemyState): void {
  const split = parent.def.traits?.split;
  if (!split || split.count <= 0) return;
  const len = ctx.state.pathLengths[parent.lane] ?? parent.progress;
  const childIds: number[] = [];
  for (let i = 0; i < split.count; i++) {
    const offset = split.count > 1 ? -SPLIT_SPREAD + (2 * SPLIT_SPREAD * i) / (split.count - 1) : 0;
    const progress = Math.min(len, Math.max(0, parent.progress + offset));
    childIds.push(spawnEnemy(ctx, split.kind, { lane: parent.lane, progress }).id);
  }
  ctx.events.emit('enemySplit', { parentId: parent.id, pos: { ...parent.pos }, childIds });
}
