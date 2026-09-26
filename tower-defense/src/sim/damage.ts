// Damage math: armor, armor-pierce, minimum damage, kills and bounties.
import { ENEMIES, RULES } from '../data';
import { earnGold } from './economy';
import type { EnemyState, SimContext } from './state';

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
export function damageEnemy(
  ctx: SimContext,
  enemy: EnemyState,
  baseDamage: number,
  opts: { armorPierce: boolean; crit: boolean },
): boolean {
  if (!enemy.alive) return false;
  const amount = mitigateDamage(baseDamage, enemy.def.armor, opts.armorPierce);
  enemy.hp -= amount;
  ctx.events.emit('enemyDamaged', { enemyId: enemy.id, amount, pos: { ...enemy.pos }, crit: opts.crit });
  if (enemy.hp <= 0) {
    killEnemy(ctx, enemy);
    return true;
  }
  return false;
}

export function killEnemy(ctx: SimContext, enemy: EnemyState): void {
  if (!enemy.alive) return;
  enemy.alive = false;
  enemy.hp = 0;
  const bounty = ENEMIES[enemy.kind].bounty;
  earnGold(ctx.state, bounty);
  ctx.state.stats.kills++;
  ctx.events.emit('enemyKilled', { enemyId: enemy.id, kind: enemy.kind, pos: { ...enemy.pos }, bounty });
}
