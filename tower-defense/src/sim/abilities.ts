// Global abilities (Meteor, Frost Nova, Gold Rush) and the hero's Blade Storm trigger.
// Stream A2 owns this file. Blade Storm's per-tick damage and its end live in hero.ts (it moves
// with the hero); everything else about abilities is here.
import { fail, OK, type CommandResult } from '../core/commands';
import { GRID_COLS, GRID_ROWS } from '../core/grid';
import type { AbilityId, Vec2 } from '../core/types';
import { ABILITIES, ABILITY_FX, ABILITY_IDS } from '../data';
import { damageEnemy } from './damage';
import { applySlow, spawnBurn } from './effects';
import { releaseBlocks } from './hero';
import { allocId, EPS, type DamageSource, type EnemyState, type GroundEffectState, type SimContext } from './state';

const METEOR_SOURCE: DamageSource = { type: 'ability', id: 'meteor' };

function validPoint(p: Vec2 | undefined): p is Vec2 {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
}

export function inMapBounds(p: Vec2): boolean {
  return p.x >= 0 && p.x <= GRID_COLS && p.y >= 0 && p.y <= GRID_ROWS;
}

/** Unlocked by wave, off cooldown, a target for Meteor, a standing hero for Blade Storm. */
export function checkCast(ctx: SimContext, id: AbilityId, target?: Vec2): CommandResult {
  const { state } = ctx;
  const def = ABILITIES[id];
  if (!def) return fail('Unknown ability');
  if (state.wave < def.unlockWave) return fail(`Unlocks at wave ${def.unlockWave}`);
  if (state.abilities[id].cooldown > EPS) return fail('On cooldown');
  if (def.targeted) {
    if (!validPoint(target)) return fail('Pick a target');
    if (!inMapBounds(target)) return fail('Target is off the map');
  }
  if (id === 'bladeStorm') {
    const hero = state.hero;
    if (!hero) return fail('No hero');
    if (hero.state === 'down') return fail('Aldric is down');
    if (hero.state === 'storming') return fail('Already storming');
  }
  return OK;
}

/**
 * Effective slow Frost Nova should leave on an enemy: the nominal slow (bossSlow for bosses). It is
 * pre-divided by the enemy's slowResist so applySlow lands exactly on the nominal value (the design
 * numbers are final: 70% for everyone, 35% for bosses).
 */
export function frostNovaAmount(enemy: EnemyState): number {
  const fx = ABILITY_FX.frostNova;
  const nominal = enemy.def.boss ? fx.bossSlow : fx.slow;
  const keep = 1 - enemy.def.slowResist;
  return keep <= EPS ? 0 : Math.min(1, nominal / keep);
}

/** Apply the ability. Callers check with checkCast first. */
export function cast(ctx: SimContext, id: AbilityId, target?: Vec2): void {
  const { state } = ctx;
  const def = ABILITIES[id];
  const ab = state.abilities[id];
  ab.cooldown = def.cooldown;
  const tgt = validPoint(target) ? { x: target.x, y: target.y } : null;
  ctx.events.emit('abilityCast', { id, target: tgt ? { ...tgt } : null });

  switch (id) {
    case 'meteor': {
      const fx = ABILITY_FX.meteor;
      const warning: GroundEffectState = {
        id: allocId(state),
        kind: 'meteorWarning',
        pos: tgt ?? { x: 0, y: 0 },
        radius: fx.radius,
        remaining: fx.delay,
        dps: 0,
        tickTimer: 0,
        source: METEOR_SOURCE,
      };
      state.groundEffects.push(warning);
      break;
    }
    case 'frostNova': {
      const fx = ABILITY_FX.frostNova;
      for (const e of state.enemies) if (e.alive) applySlow(e, frostNovaAmount(e), fx.duration);
      ab.active = fx.duration;
      break;
    }
    case 'goldRush': {
      const fx = ABILITY_FX.goldRush;
      state.bountyMultiplier = fx.multiplier;
      ab.active = fx.duration;
      break;
    }
    case 'bladeStorm': {
      const fx = ABILITY_FX.bladeStorm;
      const hero = state.hero;
      if (!hero) break;
      releaseBlocks(state);
      hero.state = 'storming';
      hero.stormRemaining = fx.duration;
      hero.stormTick = 0;
      ab.active = fx.duration;
      break;
    }
  }
}

function meteorImpact(ctx: SimContext, g: GroundEffectState): void {
  const { state } = ctx;
  const fx = ABILITY_FX.meteor;
  const r = g.radius + EPS;
  const hit = state.enemies.filter((e) => e.alive && e.revealed && (e.pos.x - g.pos.x) ** 2 + (e.pos.y - g.pos.y) ** 2 <= r * r);
  for (const e of hit) damageEnemy(ctx, e, fx.damage, { armorPierce: true, crit: false, source: METEOR_SOURCE });
  spawnBurn(ctx, g.pos, fx.burn, METEOR_SOURCE);
  ctx.events.emit('meteorImpact', { pos: { ...g.pos }, radius: g.radius });
}

/** Cooldowns, active timers (Gold Rush -> state.bountyMultiplier), meteorWarning -> impact. */
export function updateAbilities(ctx: SimContext, dt: number): void {
  const { state } = ctx;
  for (const id of ABILITY_IDS) {
    const ab = state.abilities[id];
    if (ab.cooldown > 0) ab.cooldown = Math.max(0, ab.cooldown - dt);
    if (id === 'bladeStorm') continue; // its active timer follows the hero (hero.ts)
    if (ab.active > 0) {
      ab.active -= dt;
      if (ab.active <= EPS) {
        ab.active = 0;
        if (id === 'goldRush') state.bountyMultiplier = 1;
        ctx.events.emit('abilityEnded', { id });
      }
    }
  }

  if (!state.groundEffects.some((g) => g.kind === 'meteorWarning')) return;
  const landed: GroundEffectState[] = [];
  for (const g of state.groundEffects) {
    if (g.kind !== 'meteorWarning') continue;
    g.remaining -= dt;
    if (g.remaining <= EPS) landed.push(g);
  }
  if (!landed.length) return;
  state.groundEffects = state.groundEffects.filter((g) => !landed.includes(g));
  for (const g of landed) meteorImpact(ctx, g);
}
