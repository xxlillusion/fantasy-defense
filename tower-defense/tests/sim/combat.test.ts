import { describe, expect, it } from 'vitest';
import { RULES, TOWERS } from '../../src/data';
import { chainDamage, damageEnemy, mitigateDamage } from '../../src/sim/damage';
import { addTower, constRng, heldEnemy, makeSim, seconds, steps, TOWER_TILE } from './helpers';

describe('armor and damage math', () => {
  it('flat armor reduction with a minimum damage floor', () => {
    expect(mitigateDamage(12, 3, false)).toBe(9);
    expect(mitigateDamage(4, 5, false)).toBe(RULES.minDamage);
    expect(mitigateDamage(2, 2, false)).toBe(RULES.minDamage);
    expect(mitigateDamage(12, 0, false)).toBe(12);
  });

  it('armor pierce ignores armor', () => {
    expect(mitigateDamage(90, 5, true)).toBe(90);
  });

  it('applies armor in the sim (arrow vs brute) and pierce (sniper vs boss)', () => {
    const { sim, log } = makeSim();
    addTower(sim, 'arrow', TOWER_TILE);
    const brute = heldEnemy(sim, 'brute', 4);
    steps(sim, seconds(0.5));
    expect(log.of('enemyDamaged')[0]).toMatchObject({ enemyId: brute.id, amount: TOWERS.arrow.levels[1].damage - 3 });

    const h2 = makeSim();
    addTower(h2.sim, 'sniper', TOWER_TILE);
    const boss = heldEnemy(h2.sim, 'boss', 4);
    steps(h2.sim, seconds(0.5));
    expect(h2.log.of('enemyDamaged')[0]).toMatchObject({ enemyId: boss.id, amount: TOWERS.sniper.levels[1].damage });
    expect(boss.hp).toBe(boss.maxHp - TOWERS.sniper.levels[1].damage);
  });

  it('kills grant bounty and update stats', () => {
    const { sim, log } = makeSim();
    const e = sim.debugSpawn('grunt', 3);
    const gold = sim.state.gold;
    damageEnemy(sim.ctx, e, 1000, { armorPierce: false, crit: false, source: { type: 'burn' } });
    expect(log.of('enemyKilled')).toEqual([{ enemyId: e.id, kind: 'grunt', pos: e.pos, bounty: 5 }]);
    expect(sim.state.gold).toBe(gold + 5);
    expect(sim.state.stats.kills).toBe(1);
    expect(sim.state.stats.goldEarned).toBe(5);
  });
});

describe('targeting', () => {
  it('first / last / strongest / closest', () => {
    const { sim } = makeSim();
    const t = addTower(sim, 'arrow', TOWER_TILE);
    const a = heldEnemy(sim, 'grunt', 2); // (1.5,10.5) far behind
    const b = heldEnemy(sim, 'grunt', 4); // (3.5,10.5) closest
    const c = heldEnemy(sim, 'brute', 5); // strongest
    const d = heldEnemy(sim, 'grunt', 5.8); // furthest along
    const expectTarget = (mode: 'first' | 'last' | 'strongest' | 'closest', id: number) => {
      sim.setTargetMode(t.id, mode);
      sim.step(1 / 60);
      const snap = sim.snapshot().towers[0]!;
      expect(snap.targetId).toBe(id);
      expect(snap.targetMode).toBe(mode);
    };
    expectTarget('first', d.id);
    expectTarget('last', a.id);
    expectTarget('strongest', c.id);
    expectTarget('closest', b.id);
  });

  it('respects hitsAir / hitsGround and updates facing/lastFiredAt', () => {
    const { sim } = makeSim();
    const cannon = addTower(sim, 'cannon', TOWER_TILE);
    const arrow = addTower(sim, 'arrow', { col: 4, row: 9 });
    const flyer = heldEnemy(sim, 'flyer', 4);
    sim.step(1 / 60);
    const snap = sim.snapshot();
    const c = snap.towers.find((x) => x.id === cannon.id)!;
    const a = snap.towers.find((x) => x.id === arrow.id)!;
    expect(c.targetId).toBeNull();
    expect(c.lastFiredAt).toBe(-Infinity);
    expect(a.targetId).toBe(flyer.id);
    expect(a.lastFiredAt).toBeCloseTo(1 / 60);
    // flyer at (3.5,10.5), arrow tower at (4.5,9.5): direction (-1, 1)
    expect(a.facing).toBeCloseTo(Math.atan2(1, -1));
  });

  it('fires at 1/fireRate cooldown', () => {
    const { sim, log } = makeSim();
    addTower(sim, 'arrow', TOWER_TILE);
    heldEnemy(sim, 'boss', 4);
    steps(sim, seconds(10));
    const shots = log.of('towerFired').length;
    expect(shots).toBeGreaterThanOrEqual(Math.floor(10 * TOWERS.arrow.levels[1].fireRate));
    expect(shots).toBeLessThanOrEqual(Math.ceil(10 * TOWERS.arrow.levels[1].fireRate) + 1);
  });
});

describe('splash', () => {
  it('hits all valid enemies within splash radius, never flyers', () => {
    const { sim, log } = makeSim();
    const t = addTower(sim, 'cannon', TOWER_TILE);
    sim.setTargetMode(t.id, 'last');
    const a = heldEnemy(sim, 'grunt', 4); // target (3.5,10.5)
    const flyer = heldEnemy(sim, 'flyer', 4.2); // 0.2 away but in the air
    const b = heldEnemy(sim, 'grunt', 4.8); // 0.8 away
    const c = heldEnemy(sim, 'grunt', 6); // 2.0 away
    steps(sim, seconds(1));
    const dmg = TOWERS.cannon.levels[1].damage;
    expect(log.of('projectileHit')).toHaveLength(1);
    expect(log.of('projectileHit')[0]!.splashRadius).toBe(TOWERS.cannon.levels[1].splashRadius);
    expect(a.hp).toBe(a.maxHp - dmg);
    expect(b.hp).toBe(b.maxHp - dmg);
    expect(flyer.hp).toBe(flyer.maxHp);
    expect(c.hp).toBe(c.maxHp);
  });

  it('splash still lands at the last known position if the target dies mid-flight', () => {
    const { sim, log } = makeSim();
    const t = addTower(sim, 'cannon', TOWER_TILE);
    sim.setTargetMode(t.id, 'last');
    const a = heldEnemy(sim, 'grunt', 4);
    const b = heldEnemy(sim, 'grunt', 4.8);
    sim.step(1 / 60);
    expect(sim.state.projectiles).toHaveLength(1);
    damageEnemy(sim.ctx, a, 1e6, { armorPierce: true, crit: false, source: { type: 'burn' } });
    steps(sim, seconds(1));
    expect(log.of('projectileHit')).toHaveLength(1);
    expect(log.of('projectileHit')[0]!.pos.x).toBeCloseTo(3.5);
    expect(b.hp).toBe(b.maxHp - TOWERS.cannon.levels[1].damage);
  });

  it('single-target shots on a dead target fizzle', () => {
    const { sim, log } = makeSim();
    addTower(sim, 'arrow', TOWER_TILE);
    const a = heldEnemy(sim, 'grunt', 4);
    sim.step(1 / 60);
    expect(sim.state.projectiles).toHaveLength(1);
    damageEnemy(sim.ctx, a, 1e6, { armorPierce: true, crit: false, source: { type: 'burn' } });
    steps(sim, 3);
    expect(sim.state.projectiles).toHaveLength(0);
    expect(log.of('projectileHit')).toHaveLength(0);
  });
});

describe('arrow L3 multi-shot', () => {
  it('fires projectilesPerShot at distinct targets when available', () => {
    const { sim, log } = makeSim();
    addTower(sim, 'arrow', TOWER_TILE, 3);
    heldEnemy(sim, 'grunt', 4);
    heldEnemy(sim, 'grunt', 5);
    sim.step(1 / 60);
    const fired = log.of('towerFired')[0]!;
    expect(fired.targets).toHaveLength(TOWERS.arrow.levels[3].projectilesPerShot);
    expect(new Set(fired.targets.map((x) => x.id)).size).toBe(2);
    expect(sim.snapshot().projectiles).toHaveLength(2);
  });

  it('with one target, both arrows go to it', () => {
    const { sim, log } = makeSim();
    addTower(sim, 'arrow', TOWER_TILE, 3);
    const e = heldEnemy(sim, 'grunt', 4);
    steps(sim, seconds(0.5));
    expect(log.of('towerFired')[0]!.targets.map((x) => x.id)).toEqual([e.id, e.id]);
    expect(e.hp).toBe(e.maxHp - 2 * TOWERS.arrow.levels[3].damage);
  });
});

describe('tesla chain', () => {
  const tesla = TOWERS.tesla.levels;

  it('chain damage falloff formula', () => {
    expect(chainDamage(20, 0.25, 0)).toBe(20);
    expect(chainDamage(20, 0.25, 1)).toBe(15);
    expect(chainDamage(20, 0.25, 2)).toBe(11.25);
  });

  it('hits chain.targets enemies with falloff, nearest jump, one towerFired event', () => {
    const { sim, log } = makeSim();
    addTower(sim, 'tesla', TOWER_TILE);
    const e2 = heldEnemy(sim, 'grunt', 2);
    const e3 = heldEnemy(sim, 'grunt', 3);
    const e4 = heldEnemy(sim, 'grunt', 4);
    const e5 = heldEnemy(sim, 'grunt', 5);
    sim.step(1 / 60);
    const fired = log.of('towerFired');
    expect(fired).toHaveLength(1);
    expect(fired[0]!.targets.map((t) => t.id)).toEqual([e5.id, e4.id, e3.id]);
    const d = tesla[1].damage;
    const f = tesla[1].chain!.falloff;
    expect(e5.hp).toBeCloseTo(e5.maxHp - d);
    expect(e4.hp).toBeCloseTo(e4.maxHp - d * (1 - f));
    expect(e3.hp).toBeCloseTo(e3.maxHp - d * (1 - f) ** 2);
    expect(e2.hp).toBe(e2.maxHp);
    expect(sim.state.projectiles).toHaveLength(0);
  });

  it('L2 chains to 5 targets', () => {
    const { sim, log } = makeSim();
    addTower(sim, 'tesla', TOWER_TILE, 2);
    for (let p = 1; p <= 6; p++) heldEnemy(sim, 'grunt', p);
    sim.step(1 / 60);
    expect(log.of('towerFired')[0]!.targets).toHaveLength(tesla[2].chain!.targets);
  });

  it('does not jump further than jumpRange', () => {
    const jump = tesla[1].chain!.jumpRange;
    const { sim, log } = makeSim();
    addTower(sim, 'tesla', TOWER_TILE);
    heldEnemy(sim, 'grunt', 5);
    heldEnemy(sim, 'grunt', 5 - jump - 0.1);
    sim.step(1 / 60);
    expect(log.of('towerFired')[0]!.targets).toHaveLength(1);

    const h2 = makeSim();
    addTower(h2.sim, 'tesla', TOWER_TILE);
    heldEnemy(h2.sim, 'grunt', 5);
    heldEnemy(h2.sim, 'grunt', 5 - jump + 0.01);
    h2.sim.step(1 / 60);
    expect(h2.log.of('towerFired')[0]!.targets).toHaveLength(2);
  });
});

describe('crit', () => {
  it('sniper L3 crits for multiplier when the roll succeeds', () => {
    const { sim, log } = makeSim({ rng: constRng(0) });
    addTower(sim, 'sniper', TOWER_TILE, 3);
    const boss = heldEnemy(sim, 'boss', 4);
    steps(sim, seconds(0.5));
    const lvl = TOWERS.sniper.levels[3];
    expect(log.of('enemyDamaged')[0]).toMatchObject({ enemyId: boss.id, amount: lvl.damage * lvl.crit!.multiplier, crit: true });
  });

  it('no crit when the roll fails, and never below L3', () => {
    const { sim, log } = makeSim({ rng: constRng(0.99) });
    addTower(sim, 'sniper', TOWER_TILE, 3);
    heldEnemy(sim, 'boss', 4);
    steps(sim, seconds(0.5));
    expect(log.of('enemyDamaged')[0]).toMatchObject({ amount: TOWERS.sniper.levels[3].damage, crit: false });

    const h2 = makeSim({ rng: constRng(0) });
    addTower(h2.sim, 'sniper', TOWER_TILE, 2);
    heldEnemy(h2.sim, 'boss', 4);
    steps(h2.sim, seconds(0.5));
    expect(h2.log.of('enemyDamaged')[0]).toMatchObject({ amount: TOWERS.sniper.levels[2].damage, crit: false });
  });
});

describe('cannon L3 burning ground', () => {
  it('spawns a burn effect that damages ground enemies inside (not flyers)', () => {
    const { sim, log } = makeSim();
    const t = addTower(sim, 'cannon', TOWER_TILE, 3);
    sim.setTargetMode(t.id, 'last');
    const brute = heldEnemy(sim, 'brute', 4);
    const flyer = heldEnemy(sim, 'flyer', 4.1);
    for (let i = 0; i < 120 && log.of('projectileHit').length === 0; i++) sim.step(1 / 60);
    expect(log.of('projectileHit')).toHaveLength(1);
    sim.sellTower(t.id); // no further shots; the burn remains
    const snap = sim.snapshot();
    const burn = TOWERS.cannon.levels[3].burn!;
    expect(snap.groundEffects).toHaveLength(1);
    expect(snap.groundEffects[0]).toMatchObject({ kind: 'burn', radius: burn.radius });
    const hpAfterHit = brute.hp;
    const flyerHp = flyer.hp;
    sim.step(1 / 60);
    expect(sim.snapshot().enemies.find((e) => e.id === brute.id)!.burning).toBe(true);
    expect(sim.snapshot().enemies.find((e) => e.id === flyer.id)!.burning).toBe(false);
    steps(sim, seconds(burn.duration + 0.5));
    expect(brute.hp).toBeCloseTo(hpAfterHit - burn.dps * burn.duration);
    expect(flyer.hp).toBe(flyerHp);
    expect(sim.snapshot().groundEffects).toHaveLength(0);
    expect(sim.snapshot().enemies.find((e) => e.id === brute.id)!.burning).toBe(false);
  });
});
