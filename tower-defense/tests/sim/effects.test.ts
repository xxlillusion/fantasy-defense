import { describe, expect, it } from 'vitest';
import { ENEMIES, TOWERS } from '../../src/data';
import { applySlow, currentSlow } from '../../src/sim/effects';
import { addTower, constRng, heldEnemy, makeSim, seconds, steps, TOWER_TILE } from './helpers';

describe('slow', () => {
  it('does not stack: the strongest active slow wins', () => {
    const { sim } = makeSim();
    const e = sim.debugSpawn('grunt', 1);
    applySlow(e, 0.4, 2);
    applySlow(e, 0.5, 3);
    applySlow(e, 0.4, 2);
    expect(currentSlow(e)).toBe(0.5);
  });

  it('falls back to a weaker, longer slow when the strongest expires', () => {
    const { sim } = makeSim();
    const e = sim.debugSpawn('grunt', 1);
    applySlow(e, 0.5, 1);
    applySlow(e, 0.4, 3);
    steps(sim, seconds(1.5));
    expect(currentSlow(e)).toBeCloseTo(0.4);
    steps(sim, seconds(2));
    expect(currentSlow(e)).toBe(0);
  });

  it('is reduced by slowResist', () => {
    const { sim } = makeSim();
    const boss = sim.debugSpawn('boss', 1);
    applySlow(boss, 0.5, 2);
    expect(currentSlow(boss)).toBeCloseTo(0.5 * (1 - ENEMIES.boss.slowResist));
  });

  it('reduces movement speed', () => {
    const { sim } = makeSim();
    const fast = sim.debugSpawn('grunt', 1);
    const slowed = sim.debugSpawn('grunt', 1);
    applySlow(slowed, 0.5, 10);
    steps(sim, seconds(2));
    expect(fast.progress - 1).toBeCloseTo(2 * ENEMIES.grunt.speed, 5);
    expect(slowed.progress - 1).toBeCloseTo(2 * ENEMIES.grunt.speed * 0.5, 5);
  });

  it('frost L1 applies its slow on hit (visible in the snapshot)', () => {
    const { sim, log } = makeSim();
    addTower(sim, 'frost', TOWER_TILE);
    const e = sim.debugSpawn('grunt', 3.5);
    for (let i = 0; i < 120 && log.of('projectileHit').length === 0; i++) sim.step(1 / 60);
    expect(log.of('projectileHit')).toHaveLength(1);
    expect(sim.snapshot().enemies.find((x) => x.id === e.id)!.slow).toBeCloseTo(TOWERS.frost.levels[1].slow!.amount);
  });
});

describe('stun', () => {
  it('tesla L3 stuns every hit target; stunned enemies do not move', () => {
    const { sim, log } = makeSim();
    addTower(sim, 'tesla', TOWER_TILE, 3);
    const e = sim.debugSpawn('grunt', 4);
    sim.step(1 / 60);
    expect(log.of('enemyStunned')).toHaveLength(1);
    expect(log.of('enemyStunned')[0]).toMatchObject({ enemyId: e.id, duration: TOWERS.tesla.levels[3].stun!.duration });
    const p = e.progress;
    steps(sim, 5);
    expect(e.progress).toBe(p);
    expect(sim.snapshot().enemies[0]!.stunned).toBe(true);
    steps(sim, seconds(0.5));
    expect(e.progress).toBeGreaterThan(p);
  });

  it('stun-immune bosses ignore stuns and keep moving', () => {
    const { sim, log } = makeSim();
    addTower(sim, 'tesla', TOWER_TILE, 3);
    const boss = sim.debugSpawn('boss', 4);
    sim.step(1 / 60);
    expect(log.of('towerFired')).toHaveLength(1);
    expect(log.of('enemyStunned')).toHaveLength(0);
    const p = boss.progress;
    steps(sim, 5);
    expect(boss.progress).toBeGreaterThan(p);
    expect(sim.snapshot().enemies[0]!.stunned).toBe(false);
  });

  it('frost L3 aura hits everything in range with damage + slow + freeze chance', () => {
    const { sim, log } = makeSim({ rng: constRng(0) });
    addTower(sim, 'frost', TOWER_TILE, 3);
    const a = sim.debugSpawn('grunt', 3);
    const b = sim.debugSpawn('flyer', 3.5);
    const boss = sim.debugSpawn('boss', 4);
    const far = sim.debugSpawn('grunt', 12); // out of range
    sim.step(1 / 60);
    const fired = log.of('towerFired');
    expect(fired).toHaveLength(1);
    expect(fired[0]!.targets.map((t) => t.id).sort()).toEqual([a.id, b.id, boss.id].sort());
    const lvl = TOWERS.frost.levels[3];
    expect(currentSlow(a)).toBeCloseTo(lvl.slow!.amount);
    expect(currentSlow(b)).toBeCloseTo(lvl.slow!.amount);
    expect(currentSlow(boss)).toBeCloseTo(lvl.slow!.amount * (1 - ENEMIES.boss.slowResist));
    expect(far.hp).toBe(far.maxHp);
    expect(a.hp).toBe(a.maxHp - lvl.damage);
    expect(boss.hp).toBe(boss.maxHp - 1); // armor 5 > 4 damage -> min damage
    const stunned = log.of('enemyStunned').map((s) => s.enemyId);
    expect(stunned).toContain(a.id);
    expect(stunned).not.toContain(boss.id);
  });

  it('frost L3 aura does not stun when the roll fails and emits nothing with no targets', () => {
    const { sim, log } = makeSim({ rng: constRng(0.5) });
    addTower(sim, 'frost', TOWER_TILE, 3);
    steps(sim, 30);
    expect(log.of('towerFired')).toHaveLength(0);
    heldEnemy(sim, 'grunt', 4);
    sim.step(1 / 60);
    expect(log.of('towerFired')).toHaveLength(1);
    expect(log.of('enemyStunned')).toHaveLength(0);
  });
});
