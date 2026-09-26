// Aldric the Greatsword: the walking-blocker hero.
// Stream A2 owns this file.
//
// updateHeroMovement (before moveEnemies): walk to rally, acquire/release blocked enemies.
// updateHeroCombat   (after statuses/traits/ground effects): respawn, Blade Storm ticks, sword swings,
//                    enemy melee on the hero, knock-down, regen.
// onEnemyKilledForHero (ctx.hooks.onEnemyKilled): XP and level-ups.
import { tileCenter } from '../core/grid';
import type { Vec2 } from '../core/types';
import { ABILITY_FX, HERO, HERO_MAX_LEVEL } from '../data';
import { damageEnemy } from './damage';
import { isStunned } from './effects';
import { EPS, type DamageSource, type EnemyState, type HeroInternal, type SimContext, type SimState } from './state';

/** Blade Storm damages in discrete ticks this often (seconds). */
export const STORM_TICK = 0.25;

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

// ---- level-derived stats

export function heroDamage(level: number): number {
  return HERO.damage * (1 + HERO.perLevel.damage * (level - 1));
}

export function heroRange(level: number): number {
  return HERO.range + HERO.perLevel.range * (level - 1);
}

export function heroMaxHp(level: number): number {
  return Math.round(HERO.hp * (1 + HERO.perLevel.hp * (level - 1)));
}

export function heroRespawnTime(level: number): number {
  return Math.max(0, HERO.respawnBase - HERO.respawnPerLevel * (level - 1));
}

/** Blocker slots an enemy takes (bosses 2). */
export function blockSlots(enemy: EnemyState): number {
  return enemy.def.boss ? 2 : 1;
}

/** Ground, alive and revealed: the only enemies the hero can block or hit. */
export function heroCanEngage(enemy: EnemyState): boolean {
  return enemy.alive && !enemy.def.flying && enemy.revealed;
}

const distSq = (a: Vec2, b: Vec2): number => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

// ---- blocking

/** Release every blocked enemy (they resume walking). */
export function releaseBlocks(state: SimState): void {
  const hero = state.hero;
  if (!hero) return;
  if (hero.blocking.length) {
    const ids = new Set(hero.blocking);
    for (const e of state.enemies) if (ids.has(e.id)) e.blockedByHero = false;
  }
  hero.blocking = [];
}

/** Drop blocked ids whose enemy is gone (dead, leaked, pruned). */
function pruneBlocks(state: SimState, hero: HeroInternal): void {
  if (!hero.blocking.length) return;
  hero.blocking = hero.blocking.filter((id) => {
    const e = state.enemies.find((x) => x.id === id);
    if (e && e.alive) return true;
    if (e) e.blockedByHero = false;
    return false;
  });
}

function blockedEnemies(state: SimState, hero: HeroInternal): EnemyState[] {
  const out: EnemyState[] = [];
  for (const id of hero.blocking) {
    const e = state.enemies.find((x) => x.id === id && x.alive);
    if (e) out.push(e);
  }
  return out;
}

function acquireBlocks(state: SimState, hero: HeroInternal): void {
  let used = 0;
  for (const e of blockedEnemies(state, hero)) used += blockSlots(e);
  if (used >= HERO.blockCapacity) return;
  const r = HERO.engageRadius + EPS;
  const candidates = state.enemies
    .filter((e) => heroCanEngage(e) && !e.blockedByHero && distSq(e.pos, hero.pos) <= r * r)
    .sort((a, b) => distSq(a.pos, hero.pos) - distSq(b.pos, hero.pos) || a.id - b.id);
  for (const e of candidates) {
    const slots = blockSlots(e);
    if (used + slots > HERO.blockCapacity) continue;
    used += slots;
    e.blockedByHero = true;
    // First swing comes after half a swing period.
    e.meleeCooldown = e.def.melee.rate > 0 ? 0.5 / e.def.melee.rate : 0;
    hero.blocking.push(e.id);
    if (used >= HERO.blockCapacity) break;
  }
}

/** A new rally order: drop the fight and walk (storming keeps its state; movement handles it). */
export function orderHeroRally(state: SimState, point: Vec2): void {
  const hero = state.hero;
  if (!hero) return;
  hero.rally = { x: point.x, y: point.y };
  releaseBlocks(state);
  if (hero.state !== 'storming' && hero.state !== 'down') {
    hero.state = distSq(hero.pos, hero.rally) > EPS ? 'moving' : 'idle';
  }
}

/** Walk toward the rally point; acquire/release blocked enemies. Runs before moveEnemies. */
export function updateHeroMovement(ctx: SimContext, dt: number): void {
  const { state } = ctx;
  const hero = state.hero;
  if (!hero || hero.state === 'down') return;
  pruneBlocks(state, hero);

  const storming = hero.state === 'storming';
  if (storming && hero.blocking.length) releaseBlocks(state);

  const fighting = !storming && hero.blocking.length > 0;
  if (!fighting) {
    const dx = hero.rally.x - hero.pos.x;
    const dy = hero.rally.y - hero.pos.y;
    const d = Math.hypot(dx, dy);
    if (d > EPS) {
      const stepLen = HERO.speed * dt;
      if (stepLen >= d) hero.pos = { x: hero.rally.x, y: hero.rally.y };
      else hero.pos = { x: hero.pos.x + (dx / d) * stepLen, y: hero.pos.y + (dy / d) * stepLen };
      hero.facing = Math.atan2(dy, dx);
      if (!storming) hero.state = stepLen >= d ? 'idle' : 'moving';
    } else if (!storming) {
      hero.state = 'idle';
    }
  }

  if (storming || hero.state === 'moving') return;
  acquireBlocks(state, hero);
  hero.state = hero.blocking.length ? 'fighting' : 'idle';
}

// ---- combat

function knockDown(ctx: SimContext, hero: HeroInternal): void {
  hero.hp = 0;
  hero.state = 'down';
  hero.stormRemaining = 0;
  hero.stormTick = 0;
  releaseBlocks(ctx.state);
  hero.respawnIn = heroRespawnTime(hero.level);
  hero.attackCooldown = 0;
  ctx.events.emit('heroDowned', { pos: { ...hero.pos } });
}

function updateStorm(ctx: SimContext, hero: HeroInternal, dt: number): void {
  const { state } = ctx;
  const fx = ABILITY_FX.bladeStorm;
  hero.stormRemaining -= dt;
  hero.stormTick += dt;
  while (hero.stormTick >= STORM_TICK - EPS) {
    hero.stormTick -= STORM_TICK;
    const r = fx.radius + EPS;
    const targets = state.enemies.filter((e) => heroCanEngage(e) && distSq(e.pos, hero.pos) <= r * r);
    for (const e of targets) {
      damageEnemy(ctx, e, fx.dps * STORM_TICK, { armorPierce: true, crit: false, source: { type: 'ability', id: 'bladeStorm' } });
    }
  }
  state.abilities.bladeStorm.active = Math.max(0, hero.stormRemaining);
  if (hero.stormRemaining <= EPS) {
    hero.stormRemaining = 0;
    hero.stormTick = 0;
    state.abilities.bladeStorm.active = 0;
    hero.state = distSq(hero.pos, hero.rally) > EPS ? 'moving' : 'idle';
    ctx.events.emit('abilityEnded', { id: 'bladeStorm' });
  }
}

/** Best sword target: a blocked enemy first (closest), else the closest engageable enemy in range. */
export function pickHeroTarget(state: SimState, hero: HeroInternal): EnemyState | undefined {
  const range = heroRange(hero.level) + EPS;
  const r2 = range * range;
  let best: EnemyState | undefined;
  let bestD = Infinity;
  for (const e of blockedEnemies(state, hero)) {
    if (!heroCanEngage(e)) continue;
    const d = distSq(e.pos, hero.pos);
    if (d < bestD) {
      best = e;
      bestD = d;
    }
  }
  if (best) return best;
  for (const e of state.enemies) {
    if (!heroCanEngage(e)) continue;
    const d = distSq(e.pos, hero.pos);
    if (d <= r2 && (d < bestD || (d === bestD && best && e.id < best.id))) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

/** Sword attacks, enemy melee on the hero, down/respawn, regen, Blade Storm damage. Runs after statuses. */
export function updateHeroCombat(ctx: SimContext, dt: number): void {
  const { state } = ctx;
  const hero = state.hero;
  if (!hero) return;

  if (hero.state === 'down') {
    hero.respawnIn -= dt;
    if (hero.respawnIn <= EPS) {
      hero.respawnIn = 0;
      hero.hp = hero.maxHp;
      hero.pos = { ...hero.rally };
      hero.state = 'idle';
      hero.lastDamagedAt = -Infinity;
      hero.attackCooldown = 0;
      ctx.events.emit('heroRespawned', { pos: { ...hero.pos } });
    }
    return;
  }

  pruneBlocks(state, hero);

  if (hero.state === 'storming') updateStorm(ctx, hero, dt);

  // Sword (not while walking or spinning).
  // The cooldown may dip one step below 0 so the average swing rate is exact at any dt.
  hero.attackCooldown = Math.max(-dt, hero.attackCooldown - dt);
  if ((hero.state === 'idle' || hero.state === 'fighting') && hero.attackCooldown <= EPS) {
    const target = pickHeroTarget(state, hero);
    if (target) {
      hero.facing = Math.atan2(target.pos.y - hero.pos.y, target.pos.x - hero.pos.x);
      hero.lastAttackAt = state.time;
      hero.attackCooldown = Math.max(0, hero.attackCooldown) + 1 / HERO.attackRate;
      ctx.events.emit('heroAttacked', { pos: { ...hero.pos }, targets: [{ id: target.id, pos: { ...target.pos } }] });
      damageEnemy(ctx, target, heroDamage(hero.level), { armorPierce: false, crit: false, source: { type: 'hero' } });
      pruneBlocks(state, hero);
    }
  }

  // Blocked enemies swing back.
  for (const e of blockedEnemies(state, hero)) {
    const { damage, rate } = e.def.melee;
    if (rate <= 0 || damage <= 0 || isStunned(e)) continue;
    e.meleeCooldown -= dt;
    if (e.meleeCooldown > EPS) continue;
    e.meleeCooldown += 1 / rate;
    hero.hp -= damage;
    hero.lastDamagedAt = state.time;
    ctx.events.emit('heroDamaged', { amount: damage, byEnemyId: e.id, pos: { ...hero.pos } });
    if (hero.hp <= EPS) {
      knockDown(ctx, hero);
      return;
    }
  }

  // Out-of-combat regen.
  if (hero.hp < hero.maxHp && state.time - hero.lastDamagedAt >= HERO.regenDelay - EPS) {
    hero.hp = Math.min(hero.maxHp, hero.hp + HERO.regenPct * hero.maxHp * dt);
  }
}

// ---- XP

/** XP for a kill: own kill (sword or Blade Storm) = bounty * xpOwnKill; blocked-enemy kill = bounty * xpAssist. */
export function xpForKill(enemy: EnemyState, source: DamageSource): number {
  const own = source.type === 'hero' || (source.type === 'ability' && source.id === 'bladeStorm');
  if (own) return enemy.def.bounty * HERO.xpOwnKill;
  if (enemy.blockedByHero) return enemy.def.bounty * HERO.xpAssist;
  return 0;
}

export function grantHeroXp(ctx: SimContext, amount: number): void {
  const hero = ctx.state.hero;
  if (!hero || amount <= 0) return;
  hero.xp += amount;
  while (hero.level < HERO_MAX_LEVEL && hero.xp >= HERO.levelXp[hero.level]!) {
    hero.level++;
    const newMax = heroMaxHp(hero.level);
    const gained = newMax - hero.maxHp;
    hero.maxHp = newMax;
    if (hero.state !== 'down') hero.hp = Math.min(newMax, hero.hp + gained);
    ctx.events.emit('heroLevelUp', { level: hero.level, pos: { ...hero.pos } });
  }
}

/** XP (own kill = bounty * xpOwnKill; blocked-enemy kill = bounty * xpAssist) and level-ups. */
export function onEnemyKilledForHero(ctx: SimContext, enemy: EnemyState, source: DamageSource): void {
  const hero = ctx.state.hero;
  if (!hero) return;
  const xp = xpForKill(enemy, source);
  if (enemy.blockedByHero) {
    enemy.blockedByHero = false;
    hero.blocking = hero.blocking.filter((id) => id !== enemy.id);
  }
  grantHeroXp(ctx, xp);
}
