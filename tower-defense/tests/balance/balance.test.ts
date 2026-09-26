// Lead-owned balance harness (v2): a scripted "reasonable player" plays full games headless on every
// map and difficulty. Run with `npm run balance` (slow; excluded from `npm test`).
//
// The player is map-agnostic: it ranks buildable tiles by how much path they cover, places towers
// in a fixed kind rotation, upgrades the cheapest tower once it has enough towers (L3 -> L4 alternates
// branches), rallies the hero to the walkable spot of maximum path coverage and uses abilities.
import { describe, expect, it } from 'vitest';
import { EventBus } from '../../src/core/events';
import { SIM_DT } from '../../src/core/grid';
import type { Difficulty, GameMode, ModifierId, TileCoord, TowerKind, Vec2 } from '../../src/core/types';
import { getMap, isBuildable, isWalkable, MAP_IDS, pathLength, pointAlongPath } from '../../src/data';
import { createSeededRng, createSimulationWithOptions, type SimulationHandle } from '../../src/sim';
import { useAbilities } from '../sim/smoke-player';

const ROTATION: TowerKind[] = ['arrow', 'cannon', 'frost', 'arrow', 'sniper', 'tesla', 'cannon', 'frost', 'arrow', 'tesla', 'sniper'];

interface PlayerOpts {
  hero?: boolean;
  abilities?: boolean;
  /** Stop building after this many towers (lazy player). */
  maxTowers?: number;
  upgrades?: boolean;
  /** Extra towers allowed per wave before the player prefers upgrades. */
  towersPerWave?: number;
}

/** Path sample points (every 0.5 tiles) across all lanes. */
function pathSamples(mapId: string): Vec2[] {
  const map = getMap(mapId);
  const pts: Vec2[] = [];
  map.paths.forEach((_, lane) => {
    const len = pathLength(map, lane);
    for (let d = 0; d < len; d += 0.5) pts.push(pointAlongPath(map, d, lane).pos);
  });
  return pts;
}

function coverage(p: Vec2, samples: Vec2[], r: number): number {
  let n = 0;
  for (const s of samples) if (Math.hypot(s.x - p.x, s.y - p.y) <= r) n++;
  return n;
}

function rankedTiles(mapId: string): TileCoord[] {
  const map = getMap(mapId);
  const samples = pathSamples(mapId);
  const tiles: { t: TileCoord; score: number }[] = [];
  for (let row = 0; row < map.layout.length; row++)
    for (let col = 0; col < map.layout[row]!.length; col++) {
      const t = { col, row };
      if (!isBuildable(map, t)) continue;
      tiles.push({ t, score: coverage({ x: col + 0.5, y: row + 0.5 }, samples, 3) });
    }
  return tiles.sort((a, b) => b.score - a.score).map((x) => x.t);
}

function heroSpot(mapId: string): Vec2 {
  const map = getMap(mapId);
  const samples = pathSamples(mapId);
  let best = samples[0]!;
  let bestScore = -1;
  for (const s of samples) {
    if (!isWalkable(map, { col: Math.floor(s.x), row: Math.floor(s.y) })) continue;
    const sc = coverage(s, samples, 2);
    if (sc > bestScore) {
      bestScore = sc;
      best = s;
    }
  }
  return best;
}

export interface GameResult {
  result: string;
  wave: number;
  lives: number;
  stars: number;
  towers: number;
  score: number;
}

export function play(
  mapId: string,
  difficulty: Difficulty,
  opts: PlayerOpts = {},
  game: { mode?: GameMode; modifiers?: ModifierId[]; seed?: number } = {},
): GameResult {
  const events = new EventBus();
  const sim: SimulationHandle = createSimulationWithOptions(events, { rng: createSeededRng(game.seed ?? 7) });
  sim.startGame({ difficulty, mapId, mode: game.mode ?? 'campaign', modifiers: game.modifiers ?? [] });
  const tiles = rankedTiles(mapId);
  if (opts.hero === false) sim.state.hero = null;
  else sim.setHeroRally(heroSpot(mapId));

  const maxTowers = opts.maxTowers ?? Infinity;
  const perWave = opts.towersPerWave ?? 1.2;
  let placed = 0;
  let tileIdx = 0;
  let branchFlip = false;
  let lastBuildWave = -1;

  const spend = () => {
    for (let guard = 0; guard < 200; guard++) {
      const s = sim.state;
      const wantPlace = placed < maxTowers && s.towers.length < 4 + s.wave * perWave;
      if (wantPlace && tileIdx < tiles.length) {
        const kind = ROTATION[placed % ROTATION.length]!;
        const tile = tiles[tileIdx]!;
        const check = sim.canPlaceTower(kind, tile);
        if (check.ok) {
          sim.placeTower(kind, tile);
          placed++;
          tileIdx++;
          continue;
        }
        if (check.reason === 'Tile occupied') {
          tileIdx++;
          continue;
        }
        if (s.towers.length < 3) return; // save up for the first towers
      }
      if (opts.upgrades === false) return;
      const snap = sim.snapshot();
      const up = snap.towers
        .filter((t) => t.level < 4)
        .map((t) => {
          const branch = t.level === 3 ? (branchFlip ? 'b' : 'a') : undefined;
          const cost = t.level === 3 ? t.branchOptions![branch!].cost : t.upgradeCost!;
          return { id: t.id, cost, branch };
        })
        .sort((a, b) => a.cost - b.cost)[0];
      if (!up || up.cost > s.gold) return;
      if (!sim.upgradeTower(up.id, up.branch as 'a' | 'b' | undefined).ok) return;
      if (up.branch) branchFlip = !branchFlip;
    }
  };

  for (let n = 0; n < 60 * 60 * 120; n++) {
    const s = sim.state;
    if (s.phase === 'victory' || s.phase === 'defeat') {
      return { result: s.phase, wave: s.wave, lives: s.lives, stars: s.stars, towers: s.towers.length, score: sim.snapshot().score };
    }
    if (s.phase === 'build' && lastBuildWave !== s.wave) {
      lastBuildWave = s.wave;
      spend();
      sim.sendWave();
    }
    if (opts.abilities !== false && n % 30 === 0) useAbilities(sim);
    sim.step(SIM_DT);
  }
  throw new Error('game did not finish');
}

const fmt = (r: GameResult) =>
  `${r.result.padEnd(7)} wave ${String(r.wave).padStart(2)} lives ${String(r.lives).padStart(2)} ${'*'.repeat(r.stars).padEnd(3)} towers ${r.towers} score ${r.score}`;

describe.each(MAP_IDS)('balance: %s', (mapId) => {
  it('reasonable player: easy and normal win', () => {
    const easy = play(mapId, 'easy');
    const normal = play(mapId, 'normal');
    const hard = play(mapId, 'hard');
    const noHelp = play(mapId, 'normal', { hero: false, abilities: false });
    console.log(
      `[balance] ${mapId}\n  easy    ${fmt(easy)}\n  normal  ${fmt(normal)}\n  hard    ${fmt(hard)}\n  normal, no hero/abilities ${fmt(noHelp)}`,
    );
    expect(easy.result).toBe('victory');
    expect(normal.result).toBe('victory');
  });

  it('lazy player (3 towers, no upgrades) loses on normal', () => {
    const lazy = play(mapId, 'normal', { maxTowers: 3, upgrades: false, abilities: false });
    console.log(`[balance] ${mapId} lazy ${fmt(lazy)}`);
    expect(lazy.result).toBe('defeat');
  });
});

describe('balance: endless', () => {
  it('reasonable player on normal dies somewhere in the endless waves', () => {
    const r = play('waterfall-shrine', 'normal', {}, { mode: 'endless' });
    console.log(`[balance] endless normal ${fmt(r)}`);
    expect(r.result).toBe('defeat');
    expect(r.wave).toBeGreaterThan(20);
  });
});
