// v2 enemy traits: shield, split, heal, stealth (Stream A1).
import { describe, expect, it } from 'vitest';
import type { EventBus, GameEventName, GameEvents } from '../../src/core/events';
import { ENEMIES, towerStats } from '../../src/data';
import { damageEnemy } from '../../src/sim/damage';
import { enemyMaxHp } from '../../src/sim/economy';
import { currentSlow, hitEnemy, spawnBurn } from '../../src/sim/effects';
import { addTower, heldEnemy, makeSim, seconds, steps, TOWER_TILE } from './helpers';

function record<K extends GameEventName>(events: EventBus, name: K): GameEvents[K][] {
  const out: GameEvents[K][] = [];
  events.on(name, (p) => out.push(p));
  return out;
}

const towerSrc = { type: 'tower', towerId: 999 } as const;

describe('shield (Shield Orc)', () => {
  it('absorbs exactly 3 hits with events, then takes damage', () => {
    const { sim, events, log } = makeSim();
    const blocked = record(events, 'shieldBlocked');
    const broken = record(events, 'shieldBroken');
    const orc = sim.debugSpawn('shieldbearer', 2);
    expect(orc.shield).toBe(ENEMIES.shieldbearer.traits!.shieldHits);
    for (let i = 0; i < 3; i++) damageEnemy(sim.ctx, orc, 50, { armorPierce: false, crit: false, source: towerSrc });
    expect(blocked.map((b) => b.remaining)).toEqual([2, 1]);
    expect(broken.map((b) => b.enemyId)).toEqual([orc.id]);
    expect(log.of('enemyDamaged')).toHaveLength(0);
    expect(orc.hp).toBe(orc.maxHp);
    expect(sim.snapshot().enemies[0]!.shield).toBe(0);
    damageEnemy(sim.ctx, orc, 50, { armorPierce: false, crit: false, source: towerSrc });
    expect(orc.hp).toBe(orc.maxHp - (50 - orc.armor));
    expect(blocked).toHaveLength(2);
    expect(broken).toHaveLength(1);
  });

  it('every chain jump consumes a hit on its own orc', () => {
    const { sim, events } = makeSim();
    const blocked = record(events, 'shieldBlocked');
    addTower(sim, 'tesla', TOWER_TILE, 4, 'a');
    const orcs = [3, 4, 5].map((p) => heldEnemy(sim, 'shieldbearer', p));
    sim.step(1 / 60);
    expect(blocked).toHaveLength(3);
    for (const o of orcs) {
      expect(o.shield).toBe(2);
      expect(o.hp).toBe(o.maxHp);
    }
  });

  it('a tower breaks it in 3 shots; absorbed hits still slow but do not apply vulnerable', () => {
    const { sim, log } = makeSim();
    addTower(sim, 'frost', TOWER_TILE, 4, 'b');
    const orc = heldEnemy(sim, 'shieldbearer', 4);
    for (let i = 0; i < 400 && log.of('projectileHit').length < 1; i++) sim.step(1 / 60);
    expect(orc.shield).toBe(2);
    expect(currentSlow(orc)).toBeGreaterThan(0); // crowd control lands through the shield
    for (let i = 0; i < 400 && log.of('projectileHit').length < 3; i++) sim.step(1 / 60);
    expect(orc.shield).toBe(0);
    expect(orc.hp).toBe(orc.maxHp);
    expect(orc.vulnerable).toBeNull(); // the damage amplifier is part of the blocked attack
    for (let i = 0; i < 200 && log.of('projectileHit').length < 4; i++) sim.step(1 / 60);
    expect(orc.hp).toBeLessThan(orc.maxHp);
    expect(currentSlow(orc)).toBeGreaterThan(0);
  });

  it('burning ground (even a tower-sourced one) bypasses the shield', () => {
    const { sim, events } = makeSim();
    const blocked = record(events, 'shieldBlocked');
    const orc = heldEnemy(sim, 'shieldbearer', 4);
    spawnBurn(sim.ctx, orc.pos, { dps: 10, duration: 1, radius: 1 }, towerSrc);
    steps(sim, seconds(1.2));
    expect(orc.hp).toBeCloseTo(orc.maxHp - 10);
    expect(orc.shield).toBe(3);
    expect(blocked).toHaveLength(0);
    damageEnemy(sim.ctx, orc, 5, { armorPierce: true, crit: false, source: { type: 'burn' } });
    expect(orc.shield).toBe(3);
  });
});

describe('split (Broodmother)', () => {
  it('spawns 4 imps at the parent lane/progress with current-wave HP; wave waits for them', () => {
    const { sim, events, log } = makeSim();
    const splits = record(events, 'enemySplit');
    sim.state.phase = 'wave';
    sim.state.wave = 5;
    sim.state.spawnQueue = [];
    const brood = heldEnemy(sim, 'broodmother', 5);
    log.clear();
    damageEnemy(sim.ctx, brood, 1e6, { armorPierce: true, crit: false, source: towerSrc });
    const split = ENEMIES.broodmother.traits!.split!;
    expect(splits).toHaveLength(1);
    expect(splits[0]!.parentId).toBe(brood.id);
    const children = sim.state.enemies.filter((e) => splits[0]!.childIds.includes(e.id));
    expect(children).toHaveLength(split.count);
    for (const c of children) {
      expect(c.kind).toBe(split.kind);
      expect(c.lane).toBe(brood.lane);
      expect(Math.abs(c.progress - brood.progress)).toBeLessThanOrEqual(0.3 + 1e-9);
      expect(c.maxHp).toBe(enemyMaxHp(split.kind, 5, 'normal'));
    }
    expect(log.of('enemyKilled').map((k) => k.enemyId)).toEqual([brood.id]);
    expect(log.of('enemySpawned')).toHaveLength(split.count);

    sim.step(1 / 60);
    expect(log.of('waveCleared')).toHaveLength(0);
    expect(sim.state.phase).toBe('wave');
    expect(children.every((c) => c.alive && c.progress > 0)).toBe(true);
    for (const c of children) damageEnemy(sim.ctx, c, 1e6, { armorPierce: true, crit: false, source: towerSrc });
    sim.step(1 / 60);
    expect(log.of('waveCleared')).toHaveLength(1);
  });

  it('clamps child progress at the lane start', () => {
    const { sim, events } = makeSim();
    const splits = record(events, 'enemySplit');
    const brood = heldEnemy(sim, 'broodmother', 0.1);
    damageEnemy(sim.ctx, brood, 1e6, { armorPierce: true, crit: false, source: towerSrc });
    const kids = sim.state.enemies.filter((e) => splits[0]!.childIds.includes(e.id));
    expect(Math.min(...kids.map((k) => k.progress))).toBe(0);
  });

  it('a tower kill mid-step is safe and the children join the fight', () => {
    const { sim, events, log } = makeSim();
    const splits = record(events, 'enemySplit');
    addTower(sim, 'tesla', TOWER_TILE, 2);
    const brood = heldEnemy(sim, 'broodmother', 4);
    brood.hp = 1;
    sim.step(1 / 60);
    expect(splits).toHaveLength(1);
    expect(sim.state.enemies.filter((e) => e.alive)).toHaveLength(4);
    steps(sim, seconds(3));
    const kids = new Set(splits[0]!.childIds);
    expect(log.of('enemyDamaged').some((d) => kids.has(d.enemyId))).toBe(true);
  });
});

describe('heal (Goblin Shaman)', () => {
  it('heals other enemies in radius every interval, not itself, capped at max HP', () => {
    const { sim, events } = makeSim();
    const healed = record(events, 'enemyHealed');
    const heal = ENEMIES.shaman.traits!.heal!;
    const shaman = heldEnemy(sim, 'shaman', 4); // (3.5, 10.5)
    const near = heldEnemy(sim, 'grunt', 5); // 1 away
    const capped = heldEnemy(sim, 'grunt', 3); // 1 away, nearly full
    const full = heldEnemy(sim, 'grunt', 4.5); // full HP: no event
    const far = heldEnemy(sim, 'grunt', 8); // (5.5, 8.5): 2.83 away
    shaman.hp = 10;
    near.hp = 20;
    capped.hp = capped.maxHp - 1;
    far.hp = 20;

    steps(sim, seconds(heal.interval) - 2);
    expect(healed).toHaveLength(0);
    steps(sim, 3);
    expect(near.hp).toBeCloseTo(20 + heal.pct * near.maxHp);
    expect(capped.hp).toBe(capped.maxHp);
    expect(full.hp).toBe(full.maxHp);
    expect(far.hp).toBe(20);
    expect(shaman.hp).toBe(10);
    expect(healed.map((h) => h.enemyId).sort()).toEqual([near.id, capped.id].sort());
    expect(healed.find((h) => h.enemyId === capped.id)!.amount).toBeCloseTo(1);
    expect(healed.every((h) => h.sourceId === shaman.id)).toBe(true);

    steps(sim, seconds(heal.interval));
    expect(near.hp).toBeCloseTo(20 + 2 * heal.pct * near.maxHp);
    expect(healed).toHaveLength(3);
  });
});

describe('stealth (Wraith)', () => {
  it('cannot be targeted, chained to or splashed while hidden; burning ground still hurts it', () => {
    const { sim, log } = makeSim();
    addTower(sim, 'arrow', TOWER_TILE);
    const w = heldEnemy(sim, 'wraith', 4);
    steps(sim, seconds(1));
    expect(sim.snapshot().enemies[0]).toMatchObject({ stealthed: true, revealed: false });
    expect(log.of('towerFired')).toHaveLength(0);

    const h2 = makeSim();
    addTower(h2.sim, 'tesla', TOWER_TILE);
    const g = heldEnemy(h2.sim, 'grunt', 4);
    const w2 = heldEnemy(h2.sim, 'wraith', 4.5);
    h2.sim.step(1 / 60);
    expect(h2.log.of('towerFired')[0]!.targets.map((t) => t.id)).toEqual([g.id]);
    expect(w2.hp).toBe(w2.maxHp);

    const h3 = makeSim();
    const c = addTower(h3.sim, 'cannon', TOWER_TILE);
    h3.sim.setTargetMode(c.id, 'last');
    heldEnemy(h3.sim, 'grunt', 4);
    const w3 = heldEnemy(h3.sim, 'wraith', 4.3);
    for (let i = 0; i < 120 && h3.log.of('projectileHit').length === 0; i++) h3.sim.step(1 / 60);
    expect(h3.log.of('projectileHit')).toHaveLength(1);
    expect(w3.hp).toBe(w3.maxHp);

    spawnBurn(sim.ctx, w.pos, { dps: 10, duration: 1, radius: 1 });
    steps(sim, seconds(1.2));
    expect(w.hp).toBeCloseTo(w.maxHp - 10);
  });

  it('frost range reveals it (edge event once) and other towers can then shoot it', () => {
    const { sim, events, log } = makeSim();
    const revealed = record(events, 'enemyRevealed');
    const arrow = addTower(sim, 'arrow', { col: 1, row: 9 });
    const w = heldEnemy(sim, 'wraith', 4); // (3.5, 10.5)
    steps(sim, 10);
    expect(log.of('towerFired')).toHaveLength(0);
    addTower(sim, 'frost', TOWER_TILE); // detection = range 2.5
    expect(towerStats('frost', 1).detection).toBe(towerStats('frost', 1).range);
    steps(sim, seconds(1));
    expect(w.revealed).toBe(true);
    expect(revealed.map((r) => r.enemyId)).toEqual([w.id]);
    expect(log.of('towerFired').some((f) => f.towerId === arrow.id && f.targets[0]!.id === w.id)).toBe(true);
    expect(sim.snapshot().enemies[0]!.revealed).toBe(true);
  });

  it('hero proximity reveals it; a downed hero does not', () => {
    const { sim, events } = makeSim();
    const revealed = record(events, 'enemyRevealed');
    const w = heldEnemy(sim, 'wraith', 2); // (1.5, 10.5)
    sim.step(1 / 60);
    expect(w.revealed).toBe(false);
    const hero = sim.state.hero!;
    hero.pos = { x: 1.5, y: 8.5 }; // 2 tiles away
    hero.rally = { ...hero.pos };
    sim.step(1 / 60);
    expect(w.revealed).toBe(true);
    expect(revealed).toHaveLength(1);
    hero.state = 'down';
    hero.respawnIn = 100;
    sim.step(1 / 60);
    expect(w.revealed).toBe(false);
    hero.state = 'idle';
    hero.respawnIn = 0;
    hero.pos = { x: 1.5, y: 8.5 };
    sim.step(1 / 60);
    expect(w.revealed).toBe(true);
    expect(revealed).toHaveLength(2);
  });

  it('an in-flight projectile still hits a target that re-stealths', () => {
    const { sim, log } = makeSim();
    addTower(sim, 'arrow', { col: 1, row: 9 });
    const frost = addTower(sim, 'frost', TOWER_TILE);
    const w = heldEnemy(sim, 'wraith', 4);
    sim.step(1 / 60);
    expect(w.revealed).toBe(true);
    expect(sim.state.projectiles.length).toBeGreaterThan(0);
    sim.sellTower(frost.id);
    for (let i = 0; i < 60 && sim.state.projectiles.length > 0; i++) sim.step(1 / 60);
    expect(w.revealed).toBe(false);
    expect(log.of('projectileHit').length).toBeGreaterThanOrEqual(1);
    expect(w.hp).toBeLessThan(w.maxHp);
  });
});

describe('shield vs crowd control', () => {
  it('a stun (freeze) lands through the shield while the damage is absorbed', () => {
    const { sim } = makeSim({ rng: () => 0 });
    const orc = heldEnemy(sim, 'shieldbearer', 4);
    orc.stunRemaining = 0;
    hitEnemy(sim.ctx, orc, 50, { armorPierce: false, crit: false, source: { type: 'tower', towerId: 1 } }, { stun: { chance: 1, duration: 1 }, slow: { amount: 0.5, duration: 2 } });
    expect(orc.shield).toBe(2);
    expect(orc.hp).toBe(orc.maxHp);
    expect(orc.stunRemaining).toBeGreaterThan(0);
    expect(currentSlow(orc)).toBeCloseTo(0.5);
  });
});
