import { describe, expect, it } from 'vitest';
import { SIM_DT } from '../../src/core/grid';
import type { Vec2 } from '../../src/core/types';
import { ENEMIES, HERO, HERO_MAX_LEVEL } from '../../src/data';
import { damageEnemy } from '../../src/sim/damage';
import {
  grantHeroXp,
  heroCanEngage,
  heroDamage,
  heroMaxHp,
  heroRespawnTime,
  pickHeroTarget,
  updateHeroCombat,
  updateHeroMovement,
} from '../../src/sim/hero';
import type { SimulationHandle } from '../../src/sim';
import type { EnemyState, HeroInternal } from '../../src/sim/state';
import { makeSim, seconds, steps } from './helpers';

/** Waterfall Shrine: progress 13 on the only lane is the path tile center (8.5, 6.5). */
const SPOT: Vec2 = { x: 8.5, y: 6.5 };
const SPOT_PROGRESS = 13;

function hero(sim: SimulationHandle): HeroInternal {
  return sim.state.hero!;
}

/** Teleport the hero to a point and make it his rally point. */
function placeHero(sim: SimulationHandle, p: Vec2 = SPOT): HeroInternal {
  const h = hero(sim);
  h.pos = { ...p };
  h.rally = { ...p };
  h.state = 'idle';
  return h;
}

/** An enemy that can't die from normal hits (for movement/melee tests). */
function tank(sim: SimulationHandle, kind: Parameters<SimulationHandle['debugSpawn']>[0], progress: number): EnemyState {
  const e = sim.debugSpawn(kind, progress);
  e.hp = e.maxHp = 1e9;
  return e;
}

describe('hero: spawn and walking', () => {
  it('spawns idle at the portal with level-1 stats', () => {
    const { sim } = makeSim();
    const h = sim.snapshot().hero!;
    expect(h).toMatchObject({ state: 'idle', hp: HERO.hp, maxHp: HERO.hp, level: 1, xp: 0, xpNext: HERO.levelXp[1], respawnIn: 0, blocking: [] });
    expect(h.pos).toEqual({ x: 10.5, y: 0.5 });
    expect(makeSim({ start: false }).sim.snapshot().hero).toBeNull();
  });

  it('walks to the rally point in a straight line at HERO.speed', () => {
    const { sim, log } = makeSim();
    const start = { ...hero(sim).pos };
    const rally = { x: 5.5, y: 2.5 };
    expect(sim.canSetHeroRally(rally)).toEqual({ ok: true });
    expect(sim.setHeroRally(rally)).toEqual({ ok: true });
    expect(log.of('heroMoved')).toEqual([{ rally }]);
    expect(sim.snapshot().hero!.state).toBe('moving');
    steps(sim, seconds(1));
    const h = sim.snapshot().hero!;
    expect(h.state).toBe('moving');
    const travelled = Math.hypot(h.pos.x - start.x, h.pos.y - start.y);
    expect(travelled).toBeCloseTo(HERO.speed * 1, 5);
    // on the straight line
    const dir = Math.atan2(rally.y - start.y, rally.x - start.x);
    expect(Math.atan2(h.pos.y - start.y, h.pos.x - start.x)).toBeCloseTo(dir, 6);
    expect(h.facing).toBeCloseTo(dir, 6);
    const total = Math.hypot(rally.x - start.x, rally.y - start.y);
    steps(sim, seconds(total / HERO.speed));
    expect(sim.snapshot().hero).toMatchObject({ state: 'idle', pos: rally });
  });

  it('rally validation: walkable in-bounds points only, not while down', () => {
    const { sim } = makeSim();
    expect(sim.canSetHeroRally({ x: 0.5, y: 0.5 }).ok).toBe(false); // tree
    expect(sim.canSetHeroRally({ x: 7.5, y: 0.5 }).ok).toBe(false); // statue
    expect(sim.canSetHeroRally({ x: -1, y: 3 }).ok).toBe(false);
    expect(sim.canSetHeroRally({ x: NaN, y: 3 }).ok).toBe(false);
    expect(sim.canSetHeroRally({ x: 5.5, y: 10.5 }).ok).toBe(true); // path
    hero(sim).state = 'down';
    expect(sim.setHeroRally({ x: 5.5, y: 2.5 })).toEqual({ ok: false, reason: 'Aldric is recovering' });
    const title = makeSim({ start: false }).sim;
    expect(title.canSetHeroRally({ x: 5.5, y: 2.5 }).ok).toBe(false);
  });
});

describe('hero: blocking', () => {
  it('blocks the closest ground enemies up to capacity; blocked enemies stop, others walk past', () => {
    const { sim } = makeSim();
    placeHero(sim);
    const far = tank(sim, 'grunt', SPOT_PROGRESS - 0.7);
    const mid = tank(sim, 'grunt', SPOT_PROGRESS - 0.5);
    const near = tank(sim, 'grunt', SPOT_PROGRESS - 0.3);
    sim.step(SIM_DT);
    expect(near.blockedByHero).toBe(true);
    expect(mid.blockedByHero).toBe(true);
    expect(far.blockedByHero).toBe(false);
    const s = sim.snapshot();
    expect(s.hero!.state).toBe('fighting');
    expect([...s.hero!.blocking].sort()).toEqual([near.id, mid.id].sort());
    expect(s.enemies.find((e) => e.id === near.id)!.blockedByHero).toBe(true);
    const p = [near.progress, mid.progress, far.progress];
    steps(sim, seconds(1));
    expect(near.progress).toBe(p[0]);
    expect(mid.progress).toBe(p[1]);
    expect(far.progress).toBeGreaterThan(p[2]! + 0.9); // walks on through
    expect(far.blockedByHero).toBe(false);
  });

  it('a boss takes 2 slots', () => {
    const a = makeSim().sim;
    placeHero(a);
    const boss = tank(a, 'boss', SPOT_PROGRESS - 0.2);
    const grunt = tank(a, 'grunt', SPOT_PROGRESS - 0.5);
    a.step(SIM_DT);
    expect(boss.blockedByHero).toBe(true);
    expect(grunt.blockedByHero).toBe(false);

    const b = makeSim().sim;
    placeHero(b);
    const g2 = tank(b, 'grunt', SPOT_PROGRESS - 0.2);
    const boss2 = tank(b, 'boss', SPOT_PROGRESS - 0.5);
    const g3 = tank(b, 'grunt', SPOT_PROGRESS - 0.7);
    b.step(SIM_DT);
    expect(g2.blockedByHero).toBe(true);
    expect(boss2.blockedByHero).toBe(false); // 1 + 2 > capacity
    expect(g3.blockedByHero).toBe(true);
  });

  it('picks a new enemy to block when one dies', () => {
    const { sim } = makeSim();
    placeHero(sim);
    const a = tank(sim, 'grunt', SPOT_PROGRESS - 0.2);
    const b = tank(sim, 'grunt', SPOT_PROGRESS - 0.4);
    const c = sim.debugSpawn('grunt', SPOT_PROGRESS - 0.6);
    c.stunRemaining = 1e6; // waits in the engage radius
    sim.step(SIM_DT);
    expect(c.blockedByHero).toBe(false);
    damageEnemy(sim.ctx, a, 1e10, { armorPierce: true, crit: false, source: { type: 'burn' } });
    sim.step(SIM_DT);
    expect(c.blockedByHero).toBe(true);
    expect(hero(sim).blocking.sort()).toEqual([b.id, c.id].sort());
  });

  it('flyers are never blocked or attacked', () => {
    const { sim, log } = makeSim();
    placeHero(sim);
    const f = sim.debugSpawn('flyer', SPOT_PROGRESS - 0.1);
    f.stunRemaining = 1e6;
    steps(sim, seconds(2));
    expect(f.blockedByHero).toBe(false);
    expect(log.of('heroAttacked')).toHaveLength(0);
    expect(f.hp).toBe(f.maxHp);
    expect(sim.snapshot().hero!.state).toBe('idle');
  });

  it('unrevealed stealth enemies are neither blocked nor attacked', () => {
    const { sim } = makeSim();
    const h = placeHero(sim);
    const w = sim.debugSpawn('wraith', SPOT_PROGRESS - 0.2);
    w.revealed = false;
    expect(heroCanEngage(w)).toBe(false);
    // run the hero systems directly (skipping the reveal trait)
    updateHeroMovement(sim.ctx, SIM_DT);
    expect(w.blockedByHero).toBe(false);
    expect(pickHeroTarget(sim.state, h)).toBeUndefined();
    updateHeroCombat(sim.ctx, SIM_DT);
    expect(w.hp).toBe(w.maxHp);
    // once revealed he engages it
    w.revealed = true;
    expect(pickHeroTarget(sim.state, h)).toBe(w);
    updateHeroMovement(sim.ctx, SIM_DT);
    expect(w.blockedByHero).toBe(true);
  });

  it('a new rally order releases the blocks and he walks away', () => {
    const { sim } = makeSim();
    placeHero(sim);
    const a = tank(sim, 'grunt', SPOT_PROGRESS - 0.3);
    sim.step(SIM_DT);
    expect(a.blockedByHero).toBe(true);
    expect(sim.setHeroRally({ x: 8.5, y: 4.5 }).ok).toBe(true);
    expect(a.blockedByHero).toBe(false);
    expect(hero(sim).blocking).toEqual([]);
    const p = a.progress;
    sim.step(SIM_DT);
    expect(a.progress).toBeGreaterThan(p);
    expect(hero(sim).state).toBe('moving');
    expect(hero(sim).pos.y).toBeLessThan(SPOT.y);
  });
});

describe('hero: combat', () => {
  it('swings at 1/attackRate for level-scaled damage, blocked targets first', () => {
    const { sim, log } = makeSim();
    const h = placeHero(sim);
    const g = tank(sim, 'grunt', SPOT_PROGRESS - 0.5);
    steps(sim, seconds(3));
    const swings = log.of('heroAttacked');
    expect(swings.length).toBe(Math.floor(3 * HERO.attackRate) + 1);
    expect(swings.every((s) => s.targets[0]!.id === g.id)).toBe(true);
    expect(g.maxHp - g.hp).toBeCloseTo(swings.length * HERO.damage);
    expect(h.lastAttackAt).toBeGreaterThan(0);
    expect(heroDamage(3)).toBeCloseTo(HERO.damage * 1.4);
    // armor applies to the sword
    const b = makeSim().sim;
    placeHero(b);
    const brute = tank(b, 'brute', SPOT_PROGRESS - 0.5);
    b.step(SIM_DT);
    expect(brute.maxHp - brute.hp).toBe(HERO.damage - ENEMIES.brute.armor);
  });

  it('attacks the closest ground enemy in range when nothing is blocked', () => {
    const { sim, log } = makeSim();
    placeHero(sim);
    // 1.1 tiles away along the path: in sword range (1.2), outside the engage radius (0.9)
    const g = sim.debugSpawn('grunt', SPOT_PROGRESS + 1.1);
    g.stunRemaining = 1e6;
    sim.step(SIM_DT);
    expect(g.blockedByHero).toBe(false);
    expect(log.of('heroAttacked')[0]!.targets[0]!.id).toBe(g.id);
  });

  it('blocked enemies hit him with their melee stats; at 0 HP he is downed, releases blocks and respawns', () => {
    const { sim, log } = makeSim();
    const h = placeHero(sim);
    const g = tank(sim, 'grunt', SPOT_PROGRESS - 0.5);
    steps(sim, seconds(2.6)); // swings at 0.5, 1.5, 2.5
    const hits = log.of('heroDamaged');
    expect(hits).toHaveLength(3);
    expect(hits[0]).toMatchObject({ amount: ENEMIES.grunt.melee.damage, byEnemyId: g.id });
    expect(h.hp).toBe(HERO.hp - 3 * ENEMIES.grunt.melee.damage);
    expect(h.lastDamagedAt).toBeGreaterThan(2);

    h.hp = 1;
    steps(sim, seconds(1));
    expect(log.of('heroDowned')).toHaveLength(1);
    const s = sim.snapshot().hero!;
    expect(s).toMatchObject({ state: 'down', hp: 0, blocking: [] });
    expect(s.respawnIn).toBeGreaterThan(heroRespawnTime(1) - 1);
    expect(g.blockedByHero).toBe(false);
    // the grunt walks on
    const p = g.progress;
    steps(sim, 10);
    expect(g.progress).toBeGreaterThan(p);
    expect(sim.castAbility('bladeStorm')).toEqual({ ok: false, reason: 'Aldric is down' });

    // respawn at the rally point after respawnBase seconds (level 1)
    const downedAt = log.all.findIndex((e) => e.name === 'heroDowned');
    expect(downedAt).toBeGreaterThan(-1);
    for (let i = 0; i < seconds(20) && hero(sim).state === 'down'; i++) sim.step(SIM_DT);
    expect(log.of('heroRespawned')).toEqual([{ pos: SPOT }]);
    expect(sim.snapshot().hero).toMatchObject({ hp: HERO.hp, respawnIn: 0, pos: SPOT });
  });

  it('respawn time is respawnBase - respawnPerLevel * (level - 1)', () => {
    expect(heroRespawnTime(1)).toBe(HERO.respawnBase);
    expect(heroRespawnTime(3)).toBe(HERO.respawnBase - 2 * HERO.respawnPerLevel);
    const { sim, log } = makeSim();
    const h = placeHero(sim);
    grantHeroXp(sim.ctx, HERO.levelXp[2]);
    expect(h.level).toBe(3);
    tank(sim, 'grunt', SPOT_PROGRESS - 0.5);
    h.hp = 1;
    let t0 = -1;
    for (let i = 0; i < seconds(30) && log.of('heroRespawned').length === 0; i++) {
      sim.step(SIM_DT);
      if (t0 < 0 && h.state === 'down') t0 = sim.state.time;
    }
    expect(sim.state.time - t0).toBeCloseTo(heroRespawnTime(3), 1);
  });

  it('regenerates regenPct of max HP per second after regenDelay without damage', () => {
    const { sim } = makeSim();
    const h = placeHero(sim);
    h.hp = 200;
    h.lastDamagedAt = sim.state.time;
    steps(sim, seconds(HERO.regenDelay - 0.2));
    expect(h.hp).toBe(200);
    steps(sim, seconds(1.2));
    expect(h.hp).toBeCloseTo(200 + HERO.regenPct * h.maxHp * 1, 0);
    steps(sim, seconds(60));
    expect(h.hp).toBe(h.maxHp);
  });
});

describe('hero: XP and levels', () => {
  it('own kills give bounty*xpOwnKill, blocked-enemy kills bounty*xpAssist, other kills nothing', () => {
    const { sim } = makeSim();
    const h = placeHero(sim);
    // own kill: a 1-HP grunt in range
    const own = sim.debugSpawn('grunt', SPOT_PROGRESS - 0.5);
    own.hp = 1;
    sim.step(SIM_DT);
    expect(own.alive).toBe(false);
    expect(h.xp).toBe(ENEMIES.grunt.bounty * HERO.xpOwnKill);

    // assist: a blocked brute killed by a tower
    const blocked = tank(sim, 'brute', SPOT_PROGRESS - 0.3);
    sim.step(SIM_DT);
    expect(blocked.blockedByHero).toBe(true);
    damageEnemy(sim.ctx, blocked, 1e10, { armorPierce: true, crit: false, source: { type: 'tower', towerId: 1 } });
    expect(h.xp).toBe(ENEMIES.grunt.bounty * HERO.xpOwnKill + ENEMIES.brute.bounty * HERO.xpAssist);
    expect(h.blocking).toEqual([]);

    // unrelated tower kill far away
    const far = sim.debugSpawn('runner', 2);
    const xp = h.xp;
    damageEnemy(sim.ctx, far, 1e10, { armorPierce: true, crit: false, source: { type: 'tower', towerId: 1 } });
    expect(h.xp).toBe(xp);
  });

  it('levels up at the thresholds: max HP scales, the gain heals, capped at max level', () => {
    const { sim, log } = makeSim();
    const h = placeHero(sim);
    h.hp = 300;
    h.lastDamagedAt = sim.state.time; // no regen in this test
    h.xp = HERO.levelXp[1] - 5;
    const g = sim.debugSpawn('grunt', SPOT_PROGRESS - 0.5);
    g.hp = 1;
    sim.step(SIM_DT);
    expect(h.level).toBe(2);
    expect(log.of('heroLevelUp')).toMatchObject([{ level: 2 }]);
    expect(h.maxHp).toBe(heroMaxHp(2));
    expect(h.maxHp).toBe(Math.round(HERO.hp * (1 + HERO.perLevel.hp)));
    expect(h.hp).toBe(300 + (heroMaxHp(2) - HERO.hp));
    expect(sim.snapshot().hero!.xpNext).toBe(HERO.levelXp[2]);

    grantHeroXp(sim.ctx, 1e6);
    sim.invalidate();
    expect(h.level).toBe(HERO_MAX_LEVEL);
    expect(log.of('heroLevelUp').map((e) => e.level)).toEqual([2, 3, 4, 5]);
    expect(sim.snapshot().hero!.xpNext).toBeNull();
    expect(h.maxHp).toBe(heroMaxHp(HERO_MAX_LEVEL));
  });
});
