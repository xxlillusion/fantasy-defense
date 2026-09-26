import { describe, expect, it } from 'vitest';
import { SIM_DT } from '../../src/core/grid';
import type { Vec2 } from '../../src/core/types';
import { ABILITIES, ABILITY_FX, ENEMIES, HERO } from '../../src/data';
import { damageEnemy } from '../../src/sim/damage';
import { currentSlow } from '../../src/sim/effects';
import type { SimulationHandle } from '../../src/sim';
import type { EnemyState } from '../../src/sim/state';
import { heldEnemy, makeSim, seconds, steps } from './helpers';

const SPOT: Vec2 = { x: 8.5, y: 6.5 }; // Waterfall Shrine path, progress 13
const SPOT_PROGRESS = 13;

function noHero(sim: SimulationHandle): void {
  sim.state.hero = null;
  sim.invalidate();
}

function atWave(sim: SimulationHandle, wave: number): void {
  sim.state.wave = wave;
  sim.invalidate();
}

const kill = (sim: SimulationHandle, e: EnemyState) =>
  damageEnemy(sim.ctx, e, 1e10, { armorPierce: true, crit: false, source: { type: 'tower', towerId: 1 } });

describe('ability rules', () => {
  it('unlock waves, with player-facing reasons', () => {
    const { sim, log } = makeSim();
    expect(sim.canCastAbility('meteor', { x: 5, y: 5 })).toEqual({ ok: false, reason: `Unlocks at wave ${ABILITIES.meteor.unlockWave}` });
    expect(sim.canCastAbility('frostNova')).toEqual({ ok: false, reason: 'Unlocks at wave 6' });
    expect(sim.canCastAbility('goldRush')).toEqual({ ok: false, reason: 'Unlocks at wave 9' });
    expect(sim.canCastAbility('bladeStorm')).toEqual({ ok: true });
    expect(log.all).toHaveLength(0); // pure query
    expect(sim.snapshot().abilities.map((a) => [a.id, a.unlocked])).toEqual([
      ['meteor', false],
      ['frostNova', false],
      ['goldRush', false],
      ['bladeStorm', true],
    ]);
    atWave(sim, 3);
    expect(sim.canCastAbility('meteor', { x: 5, y: 5 }).ok).toBe(true);
    expect(sim.canCastAbility('frostNova').ok).toBe(false);
    atWave(sim, 9);
    expect(sim.canCastAbility('frostNova').ok).toBe(true);
    expect(sim.canCastAbility('goldRush').ok).toBe(true);
    expect(sim.snapshot().abilities.every((a) => a.unlocked)).toBe(true);

    expect(sim.castAbility('meteor', { x: 5, y: 5 }).ok).toBe(true);
    expect(sim.castAbility('meteor', { x: 5, y: 5 })).toEqual({ ok: false, reason: 'On cooldown' });
    expect(log.of('commandRejected')).toEqual([{ command: 'castAbility', reason: 'On cooldown' }]);
    expect(makeSim({ start: false }).sim.canCastAbility('bladeStorm')).toEqual({ ok: false, reason: 'Not in a game' });
  });

  it('meteor needs a target inside the map', () => {
    const { sim } = makeSim();
    atWave(sim, 3);
    expect(sim.canCastAbility('meteor')).toEqual({ ok: false, reason: 'Pick a target' });
    expect(sim.canCastAbility('meteor', { x: NaN, y: 2 })).toEqual({ ok: false, reason: 'Pick a target' });
    expect(sim.canCastAbility('meteor', { x: -3, y: 2 })).toEqual({ ok: false, reason: 'Target is off the map' });
    expect(sim.canCastAbility('meteor', { x: 5, y: 40 })).toEqual({ ok: false, reason: 'Target is off the map' });
  });

  it('cooldowns run on game time in the build phase, and show in the snapshot', () => {
    const { sim, log } = makeSim();
    expect(sim.castAbility('bladeStorm').ok).toBe(true);
    expect(log.of('abilityCast')).toEqual([{ id: 'bladeStorm', target: null }]);
    const a = () => sim.snapshot().abilities.find((x) => x.id === 'bladeStorm')!;
    expect(a()).toMatchObject({ cooldown: ABILITIES.bladeStorm.cooldown, cooldownMax: ABILITIES.bladeStorm.cooldown, activeRemaining: ABILITY_FX.bladeStorm.duration });
    steps(sim, seconds(10));
    expect(sim.snapshot().phase).toBe('build');
    expect(a().cooldown).toBeCloseTo(ABILITIES.bladeStorm.cooldown - 10, 5);
    steps(sim, seconds(ABILITIES.bladeStorm.cooldown - 10) + 1);
    expect(a().cooldown).toBe(0);
    expect(sim.canCastAbility('bladeStorm').ok).toBe(true);
  });
});

describe('Meteor', () => {
  it('lands after the delay: armor-ignoring damage to ground and air in the radius, then burning ground', () => {
    const { sim, log } = makeSim();
    atWave(sim, 3);
    const brute = heldEnemy(sim, 'brute', 4); // (3.5, 10.5)
    const flyer = heldEnemy(sim, 'flyer', 5); // 1 tile away
    const outside = heldEnemy(sim, 'grunt', 6.2);
    brute.hp = brute.maxHp = 1000;
    flyer.hp = flyer.maxHp = 1000;
    const target = { ...brute.pos };
    expect(sim.castAbility('meteor', target).ok).toBe(true);
    expect(log.of('abilityCast')).toEqual([{ id: 'meteor', target }]);
    const warn = sim.snapshot().groundEffects.find((g) => g.kind === 'meteorWarning')!;
    expect(warn).toMatchObject({ pos: target, radius: ABILITY_FX.meteor.radius, remaining: ABILITY_FX.meteor.delay });

    steps(sim, seconds(ABILITY_FX.meteor.delay) - 3);
    expect(brute.hp).toBe(1000);
    expect(log.of('meteorImpact')).toHaveLength(0);
    for (let i = 0; i < 10 && log.of('meteorImpact').length === 0; i++) sim.step(SIM_DT);
    expect(log.of('meteorImpact')).toEqual([{ pos: target, radius: ABILITY_FX.meteor.radius }]);
    expect(brute.hp).toBe(1000 - ABILITY_FX.meteor.damage); // armor 3 ignored
    expect(flyer.hp).toBe(1000 - ABILITY_FX.meteor.damage);
    expect(outside.hp).toBe(outside.maxHp);
    expect(sim.state.groundEffects.some((g) => g.kind === 'meteorWarning')).toBe(false);
    const burn = sim.state.groundEffects.find((g) => g.kind === 'burn')!;
    expect(burn).toMatchObject({ pos: target, radius: ABILITY_FX.meteor.burn.radius, dps: ABILITY_FX.meteor.burn.dps, source: { type: 'ability', id: 'meteor' } });

    steps(sim, seconds(ABILITY_FX.meteor.burn.duration + 0.2));
    const burnt = 1000 - ABILITY_FX.meteor.damage - brute.hp;
    const total = ABILITY_FX.meteor.burn.dps * ABILITY_FX.meteor.burn.duration;
    expect(burnt).toBeGreaterThanOrEqual(total - ABILITY_FX.meteor.burn.dps * 0.5);
    expect(burnt).toBeLessThanOrEqual(total);
    expect(flyer.hp).toBe(1000 - ABILITY_FX.meteor.damage); // ground burn doesn't reach flyers
    expect(sim.state.groundEffects).toHaveLength(0);
  });
});

describe('Frost Nova', () => {
  it('slows every enemy 70% for 4s (bosses 35%), then ends', () => {
    const { sim, log } = makeSim();
    noHero(sim);
    atWave(sim, 6);
    const g = sim.debugSpawn('grunt', 2);
    const boss = sim.debugSpawn('boss', 3);
    const dragon = sim.debugSpawn('dragon', 4);
    expect(sim.castAbility('frostNova').ok).toBe(true);
    expect(currentSlow(g)).toBeCloseTo(ABILITY_FX.frostNova.slow);
    expect(currentSlow(boss)).toBeCloseTo(ABILITY_FX.frostNova.bossSlow);
    expect(currentSlow(dragon)).toBeCloseTo(ABILITY_FX.frostNova.bossSlow);
    expect(sim.snapshot().abilities[1]).toMatchObject({ id: 'frostNova', activeRemaining: ABILITY_FX.frostNova.duration });
    const p = g.progress;
    steps(sim, seconds(1));
    expect(g.progress - p).toBeCloseTo(ENEMIES.grunt.speed * (1 - ABILITY_FX.frostNova.slow), 2);
    steps(sim, seconds(ABILITY_FX.frostNova.duration - 1) + 1);
    expect(log.of('abilityEnded')).toEqual([{ id: 'frostNova' }]);
    expect(currentSlow(g)).toBe(0);
    expect(sim.snapshot().abilities[1]!.activeRemaining).toBe(0);
  });
});

describe('Gold Rush', () => {
  it('doubles kill bounties while active, then resets', () => {
    const { sim, log } = makeSim();
    noHero(sim);
    atWave(sim, 9);
    expect(sim.castAbility('goldRush').ok).toBe(true);
    expect(sim.state.bountyMultiplier).toBe(ABILITY_FX.goldRush.multiplier);
    const gold = sim.state.gold;
    kill(sim, heldEnemy(sim, 'grunt', 3));
    expect(log.of('enemyKilled').at(-1)!.bounty).toBe(ENEMIES.grunt.bounty * 2);
    expect(sim.state.gold).toBe(gold + ENEMIES.grunt.bounty * 2);
    steps(sim, seconds(ABILITY_FX.goldRush.duration) + 1);
    expect(log.of('abilityEnded')).toEqual([{ id: 'goldRush' }]);
    expect(sim.state.bountyMultiplier).toBe(1);
    kill(sim, heldEnemy(sim, 'grunt', 3));
    expect(log.of('enemyKilled').at(-1)!.bounty).toBe(ENEMIES.grunt.bounty);
  });
});

describe('Blade Storm', () => {
  it('spins for 3s: dps ticks ignoring armor within the radius, unblockable, own-kill XP', () => {
    const { sim, log } = makeSim();
    const h = sim.state.hero!;
    h.pos = { ...SPOT };
    h.rally = { ...SPOT };
    const blocked = sim.debugSpawn('grunt', SPOT_PROGRESS - 0.3);
    blocked.hp = blocked.maxHp = 1e9;
    sim.step(SIM_DT);
    expect(blocked.blockedByHero).toBe(true);

    const brute = heldEnemy(sim, 'brute', SPOT_PROGRESS + 1.5); // 1.5 tiles away, not blocked
    brute.hp = brute.maxHp = 1e6;
    const weak = heldEnemy(sim, 'runner', SPOT_PROGRESS - 1.8);
    weak.hp = 1;
    const flyer = heldEnemy(sim, 'flyer', SPOT_PROGRESS + 1);
    const far = heldEnemy(sim, 'grunt', SPOT_PROGRESS + 3);

    expect(sim.castAbility('bladeStorm').ok).toBe(true);
    expect(h.state).toBe('storming');
    expect(blocked.blockedByHero).toBe(false);
    expect(h.blocking).toEqual([]);
    expect(sim.canCastAbility('bladeStorm')).toEqual({ ok: false, reason: 'On cooldown' });

    const swingsBefore = log.of('heroAttacked').length;
    const xp = h.xp;
    const ticks = Math.round(ABILITY_FX.bladeStorm.duration / 0.25);
    for (let i = 0; i < seconds(ABILITY_FX.bladeStorm.duration); i++) {
      sim.step(SIM_DT);
      if (i < seconds(ABILITY_FX.bladeStorm.duration) - 1) {
        expect(h.state).toBe('storming');
        expect(h.blocking).toEqual([]);
      }
    }
    expect(brute.maxHp - brute.hp).toBeCloseTo(ABILITY_FX.bladeStorm.dps * 0.25 * ticks); // 135, armor ignored
    expect(weak.alive).toBe(false);
    expect(h.xp - xp).toBe(ENEMIES.runner.bounty * HERO.xpOwnKill);
    expect(flyer.hp).toBe(flyer.maxHp);
    expect(far.hp).toBe(far.maxHp);
    expect(log.of('heroAttacked').length).toBe(swingsBefore); // no sword swings while spinning
    expect(log.of('abilityEnded')).toEqual([{ id: 'bladeStorm' }]);
    expect(h.state).not.toBe('storming');
    expect(sim.snapshot().abilities[3]).toMatchObject({ activeRemaining: 0 });
    // back to normal: blocks and swings again
    const next = sim.debugSpawn('grunt', SPOT_PROGRESS - 0.3);
    next.hp = next.maxHp = 1e9;
    steps(sim, 2);
    expect(next.blockedByHero).toBe(true);
    expect(h.state).toBe('fighting');
    expect(log.of('heroAttacked').length).toBeGreaterThan(swingsBefore);
  });

  it('walks toward a new rally point while spinning', () => {
    const { sim } = makeSim();
    const h = sim.state.hero!;
    sim.castAbility('bladeStorm');
    sim.setHeroRally({ x: 10.5, y: 3.5 });
    steps(sim, seconds(1));
    expect(h.state).toBe('storming');
    expect(h.pos.y).toBeCloseTo(0.5 + HERO.speed, 5);
  });
});
