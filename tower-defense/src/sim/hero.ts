// Aldric the Greatsword: the walking-blocker hero.
// Stream A2 owns this file.
import { tileCenter } from '../core/grid';
import { HERO } from '../data';
import type { DamageSource, EnemyState, HeroInternal, SimContext, SimState } from './state';

/** Create the hero at the portal (called by startGame). */
export function createHero(state: SimState): HeroInternal {
  const pos = tileCenter(state.map.portal);
  return {
    pos: { ...pos },
    rally: { ...pos },
    state: 'idle',
    hp: HERO.hp,
    maxHp: HERO.hp,
    level: 1,
    xp: 0,
    facing: Math.PI / 2,
    lastAttackAt: -Infinity,
    attackCooldown: 0,
    respawnIn: 0,
    blocking: [],
    lastDamagedAt: -Infinity,
    stormRemaining: 0,
    stormTick: 0,
  };
}

/** TODO(A2): walk toward the rally point; acquire/release blocked enemies (enemy.blockedByHero). Runs before moveEnemies. */
export function updateHeroMovement(_ctx: SimContext, _dt: number): void {}

/** TODO(A2): sword attacks, enemy melee on the hero, down/respawn, regen, Blade Storm damage. Runs after statuses. */
export function updateHeroCombat(_ctx: SimContext, _dt: number): void {}

/** TODO(A2): XP (own kill = bounty * xpOwnKill; blocked-enemy kill = bounty * xpAssist) and level-ups. */
export function onEnemyKilledForHero(_ctx: SimContext, _enemy: EnemyState, _source: DamageSource): void {}
