import { describe, expect, it } from 'vitest';
import { DEFAULT_MAP_ID, DIFFICULTIES, ENEMIES, RULES, TOWERS } from '../../src/data';
import { computeStars, enemyMaxHp, sellValue } from '../../src/sim/economy';
import { addTower, makeSim, TOWER_TILE } from './helpers';

describe('placement validation', () => {
  it('places on buildable grass, deducting gold', () => {
    const { sim, log } = makeSim();
    const gold = sim.state.gold;
    expect(sim.canPlaceTower('arrow', TOWER_TILE)).toEqual({ ok: true });
    expect(sim.placeTower('arrow', TOWER_TILE)).toEqual({ ok: true });
    expect(sim.state.gold).toBe(gold - TOWERS.arrow.levels[1].cost);
    const placed = log.of('towerPlaced')[0]!.tower;
    expect(placed).toMatchObject({ kind: 'arrow', level: 1, tile: TOWER_TILE, pos: { x: 3.5, y: 9.5 }, targetMode: 'first' });
    expect(placed.upgradeCost).toBe(TOWERS.arrow.levels[2].cost);
    expect(placed.range).toBe(TOWERS.arrow.levels[1].range);
    expect(sim.snapshot().stats.towersBuilt).toBe(1);
  });

  it('rejects path, decoration, portal, statue and out-of-bounds tiles', () => {
    const { sim } = makeSim();
    const bad = [
      { col: 5, row: 10 }, // path
      { col: 1, row: 8 }, // tree
      { col: 9, row: 8 }, // rock
      { col: 10, row: 0 }, // portal
      { col: 7, row: 0 }, // statue
      { col: -1, row: 3 },
      { col: 20, row: 3 },
      { col: 3, row: 12 },
      { col: 2.5, row: 3 },
    ];
    for (const tile of bad) expect(sim.canPlaceTower('arrow', tile)).toEqual({ ok: false, reason: "Can't build there" });
  });

  it('rejects occupied tiles and insufficient gold', () => {
    const { sim } = makeSim();
    sim.placeTower('arrow', TOWER_TILE);
    expect(sim.canPlaceTower('arrow', TOWER_TILE)).toEqual({ ok: false, reason: 'Tile occupied' });
    sim.state.gold = 10;
    expect(sim.canPlaceTower('arrow', { col: 2, row: 9 })).toEqual({ ok: false, reason: 'Not enough gold' });
  });

  it('only allows placement during build or wave phases', () => {
    const { sim } = makeSim({ start: false });
    expect(sim.canPlaceTower('arrow', TOWER_TILE).ok).toBe(false);
    sim.startGame({ difficulty: 'normal', mapId: DEFAULT_MAP_ID, mode: 'campaign', modifiers: [] });
    sim.sendWave();
    expect(sim.snapshot().phase).toBe('wave');
    expect(sim.canPlaceTower('arrow', TOWER_TILE).ok).toBe(true);
  });

  it('canPlaceTower is a pure query; placeTower emits commandRejected', () => {
    const { sim, log } = makeSim();
    const before = sim.snapshot();
    sim.canPlaceTower('arrow', { col: 5, row: 10 });
    expect(log.all).toHaveLength(0);
    expect(sim.snapshot()).toBe(before);
    const r = sim.placeTower('arrow', { col: 5, row: 10 });
    expect(r.ok).toBe(false);
    expect(log.of('commandRejected')).toEqual([{ command: 'placeTower', reason: "Can't build there" }]);
  });
});

describe('upgrade / sell / target mode', () => {
  it('upgrades with level cost from data and rejects at max level / without gold', () => {
    const { sim, log } = makeSim({ gold: 1000 });
    sim.placeTower('cannon', TOWER_TILE);
    const id = sim.state.towers[0]!.id;
    expect(sim.upgradeTower(id).ok).toBe(true);
    expect(sim.state.gold).toBe(1000 - TOWERS.cannon.levels[1].cost - TOWERS.cannon.levels[2].cost);
    expect(log.of('towerUpgraded')[0]!.tower.level).toBe(2);
    sim.state.gold = 0;
    expect(sim.upgradeTower(id)).toEqual({ ok: false, reason: 'Not enough gold' });
    sim.state.gold = 1000;
    expect(sim.upgradeTower(id).ok).toBe(true);
    expect(sim.upgradeTower(id)).toEqual({ ok: false, reason: 'Choose a specialization' });
    expect(sim.upgradeTower(id, 'b').ok).toBe(true);
    expect(sim.state.towers[0]!.branch).toBe('b');
    expect(sim.upgradeTower(id, 'a')).toEqual({ ok: false, reason: 'Already at max level' });
    expect(sim.snapshot().towers[0]!.upgradeCost).toBeNull();
    expect(sim.upgradeTower(9999)).toEqual({ ok: false, reason: 'Tower not found' });
    expect(log.of('commandRejected')).toHaveLength(4);
  });

  it('sells for floor(invested * sellRefund), including during a wave', () => {
    const { sim, log } = makeSim({ gold: 1000 });
    const t = addTower(sim, 'arrow', TOWER_TILE, 2);
    const invested = TOWERS.arrow.levels[1].cost + TOWERS.arrow.levels[2].cost;
    expect(sim.snapshot().towers[0]!.invested).toBe(invested);
    expect(sim.snapshot().towers[0]!.sellValue).toBe(Math.floor(invested * RULES.sellRefund));
    sim.sendWave();
    const gold = sim.state.gold;
    expect(sim.sellTower(t.id).ok).toBe(true);
    expect(sim.state.gold).toBe(gold + Math.floor(invested * RULES.sellRefund));
    expect(log.of('towerSold')[0]).toEqual({ towerId: t.id, kind: 'arrow', tile: TOWER_TILE, refund: sellValue(invested) });
    expect(sim.snapshot().towers).toHaveLength(0);
    expect(sim.sellTower(t.id).ok).toBe(false);
    // the tile is free again
    expect(sim.canPlaceTower('arrow', TOWER_TILE).ok).toBe(true);
  });

  it('setTargetMode changes the mode and rejects unknown towers', () => {
    const { sim } = makeSim();
    const t = addTower(sim, 'arrow', TOWER_TILE);
    expect(sim.setTargetMode(t.id, 'strongest').ok).toBe(true);
    expect(sim.snapshot().towers[0]!.targetMode).toBe('strongest');
    expect(sim.setTargetMode(424242, 'last').ok).toBe(false);
  });
});

describe('enemy HP scaling', () => {
  it('hp = round(base * growth^(wave-1) * difficulty)', () => {
    expect(enemyMaxHp('grunt', 1, 'normal')).toBe(60);
    expect(enemyMaxHp('grunt', 5, 'hard')).toBe(Math.round(60 * RULES.hpGrowthPerWave ** 4 * DIFFICULTIES.hard.hpMultiplier));
    expect(enemyMaxHp('boss', 10, 'easy')).toBe(Math.round(ENEMIES.boss.hp * RULES.hpGrowthPerWave ** 9 * DIFFICULTIES.easy.hpMultiplier));
  });

  it('spawned enemies use the current wave', () => {
    const { sim, log } = makeSim({ difficulty: 'easy' });
    sim.state.wave = 9;
    sim.sendWave(); // wave 10 starts with the boss
    sim.step(1 / 60);
    const boss = log.of('enemySpawned').find((e) => e.enemy.kind === 'boss')!.enemy;
    expect(boss.maxHp).toBe(enemyMaxHp('boss', 10, 'easy'));
    expect(boss.hp).toBe(boss.maxHp);
    expect(boss.armor).toBe(5);
  });
});

describe('stars', () => {
  it('3 = no lives lost, 2 = at least the fraction, else 1', () => {
    expect(computeStars(20, 20)).toBe(3);
    expect(computeStars(19, 20)).toBe(2);
    expect(computeStars(10, 20)).toBe(2);
    expect(computeStars(9, 20)).toBe(1);
    expect(computeStars(1, 20)).toBe(1);
    expect(computeStars(0, 20)).toBe(0);
  });
});
