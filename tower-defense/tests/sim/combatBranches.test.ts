// v2 L4 branch mechanics and cross-lane targeting (Stream A1).
import { describe, expect, it, vi } from 'vitest';
import type { EventBus, GameEventName, GameEvents } from '../../src/core/events';
import { towerStats } from '../../src/data';
import { damageEnemy } from '../../src/sim/damage';
import { applyVulnerable } from '../../src/sim/effects';
import { addTower, constRng, heldEnemy, makeSim, seconds, steps, TOWER_TILE } from './helpers';

function record<K extends GameEventName>(events: EventBus, name: K): GameEvents[K][] {
  const out: GameEvents[K][] = [];
  events.on(name, (p) => out.push(p));
  return out;
}

const burnSrc = { type: 'ability', id: 'meteor' } as const;

describe('Arrow L4a Rapid Volley', () => {
  it('fires 3 projectiles per shot at 3 distinct targets', () => {
    const { sim, log } = makeSim();
    addTower(sim, 'arrow', TOWER_TILE, 4, 'a');
    heldEnemy(sim, 'grunt', 3);
    heldEnemy(sim, 'grunt', 4);
    heldEnemy(sim, 'grunt', 5);
    heldEnemy(sim, 'grunt', 5.5);
    sim.step(1 / 60);
    const fired = log.of('towerFired')[0]!;
    expect(fired.targets).toHaveLength(3);
    expect(new Set(fired.targets.map((t) => t.id)).size).toBe(3);
    expect(fired.branch).toBe('a');
    expect(sim.state.projectiles).toHaveLength(3);
  });
});

describe('Arrow L4b Piercing Longbow', () => {
  const lvl = towerStats('arrow', 4, 'b');

  /** Enemies placed on a horizontal line from the tower (positions set directly; they are held). */
  function lineSetup(xs: number[]) {
    const h = makeSim();
    const t = addTower(h.sim, 'arrow', TOWER_TILE, 4, 'b');
    h.sim.setTargetMode(t.id, 'closest');
    const es = xs.map((x) => {
      const e = heldEnemy(h.sim, 'grunt', 4);
      e.pos = { x, y: 9.5 };
      return e;
    });
    return { ...h, tower: t, es };
  }

  it('passes through up to `pierce` enemies in a line and stops at the limit', () => {
    const { sim, events, log, es } = lineSetup([4.5, 5.3, 6.1, 6.9, 7.7]);
    const pierceHits = record(events, 'pierceHit');
    const off = heldEnemy(sim, 'grunt', 4);
    off.pos = { x: 5.7, y: 10.0 }; // 0.5 off the line
    steps(sim, seconds(0.5));
    expect(log.of('towerFired')).toHaveLength(1);
    expect(pierceHits.map((p) => p.enemyId)).toEqual(es.slice(0, lvl.pierce!).map((e) => e.id));
    for (const e of es.slice(0, 4)) expect(e.hp).toBe(e.maxHp - lvl.damage);
    expect(es[4]!.hp).toBe(es[4]!.maxHp);
    expect(off.hp).toBe(off.maxHp);
    const hits = log.of('projectileHit');
    expect(hits).toHaveLength(1);
    expect(Math.abs(hits[0]!.pos.x - 6.9)).toBeLessThanOrEqual(0.35 + 1e-9); // ends at the 4th enemy
    expect(sim.state.projectiles).toHaveLength(0);
  });

  it('flies straight to range + 1 when it runs out of enemies, without homing', () => {
    const { sim, events, log, tower, es } = lineSetup([4.5, 6.0]);
    const pierceHits = record(events, 'pierceHit');
    sim.step(1 / 60);
    const p = sim.state.projectiles[0]!;
    expect(p.pierce).toBe(lvl.pierce);
    expect(p.to.x).toBeCloseTo(tower.pos.x + lvl.range + 1);
    expect(p.to.y).toBeCloseTo(tower.pos.y);
    es[0]!.pos = { x: 4.5, y: 12 }; // the target moves away: no homing, so it's missed
    steps(sim, seconds(0.6));
    expect(pierceHits.map((h) => h.enemyId)).toEqual([es[1]!.id]);
    expect(es[0]!.hp).toBe(es[0]!.maxHp);
    const hit = log.of('projectileHit');
    expect(hit).toHaveLength(1);
    expect(hit[0]!.pos.x).toBeCloseTo(tower.pos.x + lvl.range + 1);
  });
});

describe('Cannon L4a Earthquake', () => {
  const lvl = towerStats('cannon', 4, 'a');

  it('slams every ground enemy in range, ignores flyers, stuns by chance', () => {
    const { sim, log } = makeSim({ rng: constRng(0) });
    addTower(sim, 'cannon', TOWER_TILE, 4, 'a');
    const a = heldEnemy(sim, 'brute', 3);
    const b = heldEnemy(sim, 'brute', 5);
    const flyer = heldEnemy(sim, 'flyer', 4);
    sim.step(1 / 60);
    const fired = log.of('towerFired');
    expect(fired).toHaveLength(1);
    expect(fired[0]!.targets.map((t) => t.id).sort()).toEqual([a.id, b.id].sort());
    expect(a.hp).toBe(a.maxHp - (lvl.damage - a.armor));
    expect(b.hp).toBe(b.maxHp - (lvl.damage - b.armor));
    expect(flyer.hp).toBe(flyer.maxHp);
    expect(log.of('enemyStunned').map((s) => s.enemyId).sort()).toEqual([a.id, b.id].sort());
    expect(log.of('enemyStunned')[0]!.duration).toBe(lvl.stun!.duration);
    expect(sim.state.projectiles).toHaveLength(0);
  });

  it('no stun when the roll fails', () => {
    const { sim, log } = makeSim({ rng: constRng(lvl.stun!.chance + 0.01) });
    addTower(sim, 'cannon', TOWER_TILE, 4, 'a');
    heldEnemy(sim, 'brute', 4);
    sim.step(1 / 60);
    expect(log.of('towerFired')).toHaveLength(1);
    expect(log.of('enemyStunned')).toHaveLength(0);
  });
});

describe('Cannon L4b Meteor Mortar', () => {
  it('big splash then burning ground', () => {
    const lvl = towerStats('cannon', 4, 'b');
    const { sim, log } = makeSim();
    const t = addTower(sim, 'cannon', TOWER_TILE, 4, 'b');
    sim.setTargetMode(t.id, 'last');
    const a = heldEnemy(sim, 'brute', 3); // target
    const b = heldEnemy(sim, 'brute', 4.5); // 1.5 away: inside the 1.75 splash
    const c = heldEnemy(sim, 'brute', 5.5); // 2.5 away: outside
    for (let i = 0; i < 120 && log.of('projectileHit').length === 0; i++) sim.step(1 / 60);
    expect(log.of('projectileHit')[0]!.splashRadius).toBe(lvl.splashRadius);
    expect(a.hp).toBe(a.maxHp - (lvl.damage - a.armor));
    expect(b.hp).toBe(b.maxHp - (lvl.damage - b.armor));
    expect(c.hp).toBe(c.maxHp);
    expect(sim.snapshot().groundEffects[0]).toMatchObject({ kind: 'burn', radius: lvl.burn!.radius });
    sim.sellTower(t.id);
    const hp = b.hp;
    steps(sim, seconds(lvl.burn!.duration + 0.5));
    expect(b.hp).toBeCloseTo(hp - lvl.burn!.dps * lvl.burn!.duration);
  });
});

describe('Frost L4a Absolute Zero', () => {
  it('aura: 65% slow and freeze chance on everything in range', () => {
    const lvl = towerStats('frost', 4, 'a');
    const { sim, log } = makeSim({ rng: constRng(0) });
    addTower(sim, 'frost', TOWER_TILE, 4, 'a');
    const g = sim.debugSpawn('grunt', 3);
    const f = sim.debugSpawn('flyer', 4);
    sim.step(1 / 60);
    expect(log.of('towerFired')[0]!.targets.map((t) => t.id).sort()).toEqual([g.id, f.id].sort());
    const snap = sim.snapshot().enemies;
    for (const e of snap) {
      expect(e.slow).toBeCloseTo(lvl.slow!.amount);
      expect(e.stunned).toBe(true);
      expect(e.hp).toBe(e.maxHp - lvl.damage);
    }
    expect(log.of('enemyStunned')[0]!.duration).toBe(lvl.stun!.duration);
    expect(sim.state.projectiles).toHaveLength(0);
  });
});

describe('Frost L4b Shatter (vulnerable)', () => {
  it('multiplies damage from every source after armor, then expires', () => {
    const lvl = towerStats('frost', 4, 'b');
    const { sim, log } = makeSim();
    const t = addTower(sim, 'frost', TOWER_TILE, 4, 'b');
    const brute = heldEnemy(sim, 'brute', 4);
    for (let i = 0; i < 120 && log.of('projectileHit').length === 0; i++) sim.step(1 / 60);
    expect(brute.vulnerable).toEqual({ amount: lvl.vulnerable!.amount, remaining: lvl.vulnerable!.duration });
    expect(sim.snapshot().enemies[0]!.vulnerable).toBe(true);
    // The bolt that applies it is not amplified itself.
    expect(log.of('enemyDamaged')[0]!.amount).toBe(Math.max(1, lvl.damage - brute.armor));
    sim.sellTower(t.id);

    log.clear();
    damageEnemy(sim.ctx, brute, 20, { armorPierce: false, crit: false, source: burnSrc });
    expect(log.of('enemyDamaged')[0]!.amount).toBeCloseTo((20 - brute.armor) * (1 + lvl.vulnerable!.amount));
    damageEnemy(sim.ctx, brute, 20, { armorPierce: true, crit: false, source: { type: 'hero' } });
    expect(log.of('enemyDamaged')[1]!.amount).toBeCloseTo(20 * (1 + lvl.vulnerable!.amount));

    steps(sim, seconds(lvl.vulnerable!.duration + 0.1));
    expect(brute.vulnerable).toBeNull();
    expect(sim.snapshot().enemies[0]!.vulnerable).toBe(false);
    damageEnemy(sim.ctx, brute, 20, { armorPierce: false, crit: false, source: burnSrc });
    expect(log.of('enemyDamaged')[2]!.amount).toBe(20 - brute.armor);
  });

  it('refresh keeps the larger amount and the longer duration', () => {
    const { sim } = makeSim();
    const e = sim.debugSpawn('grunt', 1);
    applyVulnerable(e, 0.3, 3);
    applyVulnerable(e, 0.1, 1);
    expect(e.vulnerable).toEqual({ amount: 0.3, remaining: 3 });
    e.vulnerable!.remaining = 0.5;
    applyVulnerable(e, 0.2, 2);
    expect(e.vulnerable).toEqual({ amount: 0.3, remaining: 2 });
  });
});

describe('Sniper L4a Assassin', () => {
  const lvl = towerStats('sniper', 4, 'a');

  it('crits for x4', () => {
    const { sim, log } = makeSim({ rng: constRng(0) });
    addTower(sim, 'sniper', TOWER_TILE, 4, 'a');
    heldEnemy(sim, 'boss', 4);
    steps(sim, seconds(0.5));
    expect(log.of('enemyDamaged')[0]).toMatchObject({ amount: lvl.damage * lvl.crit!.multiplier, crit: true });
  });

  it('executes non-bosses at or below the threshold (hook fires once), never bosses', () => {
    const { sim, events, log } = makeSim({ rng: constRng(0.99) });
    const executed = record(events, 'enemyExecuted');
    const hook = vi.fn();
    const orig = sim.ctx.hooks.onEnemyKilled;
    sim.ctx.hooks.onEnemyKilled = (e, s) => {
      hook(e.id, s);
      orig(e, s);
    };
    const t = addTower(sim, 'sniper', TOWER_TILE, 4, 'a');
    const brute = heldEnemy(sim, 'brute', 4);
    brute.hp = lvl.damage + 0.1 * brute.maxHp; // 10% left after the hit
    steps(sim, seconds(0.5));
    expect(executed.map((x) => x.enemyId)).toEqual([brute.id]);
    expect(brute.alive).toBe(false);
    expect(log.of('enemyKilled').map((k) => k.enemyId)).toEqual([brute.id]);
    expect(hook).toHaveBeenCalledTimes(1);
    expect(hook).toHaveBeenCalledWith(brute.id, { type: 'tower', towerId: t.id });

    const h2 = makeSim({ rng: constRng(0.99) });
    const ex2 = record(h2.events, 'enemyExecuted');
    addTower(h2.sim, 'sniper', TOWER_TILE, 4, 'a');
    const boss = heldEnemy(h2.sim, 'boss', 4);
    boss.hp = lvl.damage + 0.05 * boss.maxHp;
    const g = heldEnemy(h2.sim, 'brute', 3);
    g.hp = lvl.damage + 0.2 * g.maxHp; // 20% left: above the threshold
    steps(h2.sim, seconds(0.5));
    h2.sim.setTargetMode(h2.sim.state.towers[0]!.id, 'last');
    steps(h2.sim, seconds(3.5));
    expect(boss.alive).toBe(true);
    expect(ex2).toHaveLength(0);
  });
});

describe('Sniper L4b Seer', () => {
  it('reveals stealth within its detection radius so it can be targeted', () => {
    const { sim, events, log } = makeSim();
    const revealed = record(events, 'enemyRevealed');
    const t = addTower(sim, 'sniper', TOWER_TILE, 3);
    const wraith = heldEnemy(sim, 'wraith', 4);
    steps(sim, seconds(1));
    expect(wraith.revealed).toBe(false);
    expect(log.of('towerFired')).toHaveLength(0);

    sim.state.gold = 1e6;
    expect(sim.upgradeTower(t.id, 'b').ok).toBe(true);
    steps(sim, 2);
    expect(wraith.revealed).toBe(true);
    expect(revealed.map((r) => r.enemyId)).toEqual([wraith.id]);
    expect(log.of('towerFired')[0]!.targets[0]!.id).toBe(wraith.id);
  });

  it('Assassin does not reveal', () => {
    const { sim, log } = makeSim();
    addTower(sim, 'sniper', TOWER_TILE, 4, 'a');
    const wraith = heldEnemy(sim, 'wraith', 4);
    steps(sim, seconds(1));
    expect(wraith.revealed).toBe(false);
    expect(log.of('towerFired')).toHaveLength(0);
  });
});

describe('Tesla L4a Storm Nexus', () => {
  it('chains to 8 targets with 15% falloff', () => {
    const lvl = towerStats('tesla', 4, 'a');
    const { sim, log } = makeSim();
    addTower(sim, 'tesla', TOWER_TILE, 4, 'a');
    for (let p = 1; p <= 10; p++) heldEnemy(sim, 'grunt', p);
    sim.step(1 / 60);
    const fired = log.of('towerFired')[0]!;
    expect(fired.targets).toHaveLength(8);
    expect(new Set(fired.targets.map((t) => t.id)).size).toBe(8);
    const amounts = log.of('enemyDamaged').map((d) => d.amount);
    expect(amounts).toHaveLength(8);
    amounts.forEach((a, i) => expect(a).toBeCloseTo(lvl.damage * (1 - lvl.chain!.falloff) ** i));
  });
});

describe('Tesla L4b Overload', () => {
  it('instant bolt with splash and stun; primary listed first; no projectileHit', () => {
    const lvl = towerStats('tesla', 4, 'b');
    const { sim, log } = makeSim({ rng: constRng(0) });
    addTower(sim, 'tesla', TOWER_TILE, 4, 'b');
    const primary = heldEnemy(sim, 'brute', 4.5); // 'first' = smallest remaining
    const near = heldEnemy(sim, 'brute', 4); // 0.5 away
    const far = heldEnemy(sim, 'brute', 2); // in tower range but 2.5 from the primary
    const flyer = heldEnemy(sim, 'flyer', 4.2); // tesla hits air: splashed too
    sim.step(1 / 60);
    const fired = log.of('towerFired');
    expect(fired).toHaveLength(1);
    const ids = fired[0]!.targets.map((t) => t.id);
    expect(ids[0]).toBe(primary.id);
    expect(ids.slice(1).sort()).toEqual([near.id, flyer.id].sort());
    expect(primary.hp).toBe(primary.maxHp - (lvl.damage - primary.armor));
    expect(near.hp).toBe(near.maxHp - (lvl.damage - near.armor));
    expect(far.hp).toBe(far.maxHp);
    expect(flyer.alive).toBe(false);
    expect(log.of('enemyStunned').map((s) => s.enemyId).sort()).toEqual([primary.id, near.id].sort());
    expect(log.of('enemyStunned')[0]!.duration).toBe(lvl.stun!.duration);
    expect(log.of('projectileHit')).toHaveLength(0);
    expect(sim.state.projectiles).toHaveLength(0);
  });
});

describe('targeting across lanes (remaining, not progress)', () => {
  it('first = smallest remaining, last = largest remaining', () => {
    const { sim } = makeSim({ mapId: 'ember-forge' });
    expect(sim.state.pathLengths[0]).not.toBe(sim.state.pathLengths[1]);
    const t = addTower(sim, 'arrow', { col: 9, row: 7 });
    const a = sim.debugSpawn('grunt', 19, 0); // further along by progress...
    const b = sim.debugSpawn('grunt', 18.5, 1); // ...but b is closer to the portal
    a.stunRemaining = b.stunRemaining = 1e6;
    expect(a.progress).toBeGreaterThan(b.progress);
    expect(b.remaining).toBeLessThan(a.remaining);
    sim.step(1 / 60);
    expect(sim.snapshot().towers[0]!.targetId).toBe(b.id);
    sim.setTargetMode(t.id, 'last');
    sim.step(1 / 60);
    expect(sim.snapshot().towers[0]!.targetId).toBe(a.id);
  });

  it('ties on remaining go to the lower id', () => {
    const { sim } = makeSim({ mapId: 'ember-forge' });
    addTower(sim, 'arrow', { col: 9, row: 7 });
    const len0 = sim.state.pathLengths[0]!;
    const len1 = sim.state.pathLengths[1]!;
    const a = sim.debugSpawn('grunt', len0 - 7, 0);
    const b = sim.debugSpawn('grunt', len1 - 7, 1);
    a.stunRemaining = b.stunRemaining = 1e6;
    sim.step(1 / 60);
    expect(sim.snapshot().towers[0]!.targetId).toBe(Math.min(a.id, b.id));
  });
});

describe('bounty', () => {
  it('uses state.bountyMultiplier', () => {
    const { sim, log } = makeSim();
    sim.state.bountyMultiplier = 2;
    const e = sim.debugSpawn('grunt', 3);
    damageEnemy(sim.ctx, e, 1000, { armorPierce: true, crit: false, source: { type: 'burn' } });
    expect(log.of('enemyKilled')[0]!.bounty).toBe(10);
  });
});
