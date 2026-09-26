// Damage math: armor, armor-pierce, minimum damage, kills and bounties.
// Stream A1 owns this file (v2: shield, vulnerable, execute, split-on-death).
import { RULES } from '../data';
import { earnGold } from './economy';
import type { DamageSource, EnemyState, SimContext } from './state';

export interface DamageOpts {
  armorPierce: boolean;
  crit: boolean;
  source: DamageSource;
}

/** Flat armor reduction with a floor of RULES.minDamage; armorPierce ignores armor entirely. */
export function mitigateDamage(base: number, armor: number, armorPierce: boolean): number {
  if (armorPierce) return base;
  return Math.max(RULES.minDamage, base - armor);
}

/** Chain damage for the n-th target (0 = first): base * (1 - falloff)^n. */
export function chainDamage(base: number, falloff: number, index: number): number {
  return base * Math.pow(1 - falloff, index);
}

/** Deal damage to an enemy, emitting enemyDamaged and handling the kill. Returns true if killed. */
export function damageEnemy(ctx: SimContext, enemy: EnemyState, baseDamage: number, opts: DamageOpts): boolean {
  if (!enemy.alive) return false;
  // TODO(A1): shield absorption (not for burn), vulnerable multiplier (after armor).
  const amount = mitigateDamage(baseDamage, enemy.armor, opts.armorPierce);
  enemy.hp -= amount;
  ctx.events.emit('enemyDamaged', { enemyId: enemy.id, amount, pos: { ...enemy.pos }, crit: opts.crit });
  if (enemy.hp <= 0) {
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
  // TODO(A1): split trait (spawn children via spawnEnemy with the same lane/progress).
}
