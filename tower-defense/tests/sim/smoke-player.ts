// Scripted headless player shared by the smoke and endless tests (Stream A2).
import { SIM_DT } from '../../src/core/grid';
import type { TileCoord, TowerKind } from '../../src/core/types';
import { getMap, isBuildable, pointAlongPath, TOWER_KINDS } from '../../src/data';
import type { SimulationHandle } from '../../src/sim';

/** Grass tiles orthogonally or diagonally adjacent to a path tile. */
export function tilesBesidePath(mapId: string): TileCoord[] {
  const map = getMap(mapId);
  const out: TileCoord[] = [];
  for (let row = 0; row < map.layout.length; row++) {
    for (let col = 0; col < map.layout[row]!.length; col++) {
      if (!isBuildable(map, { col, row })) continue;
      let near = false;
      for (let dr = -1; dr <= 1 && !near; dr++)
        for (let dc = -1; dc <= 1 && !near; dc++) if (map.layout[row + dr]?.[col + dc] === '#') near = true;
      if (near) out.push({ col, row });
    }
  }
  return out;
}

/** Free gold, every other tile beside the path, all kinds, upgraded to `level` (L4 alternates branches). */
export function strongBuild(sim: SimulationHandle, level: 3 | 4 = 3, every = 2): void {
  sim.state.gold = 1e7;
  const kinds: TowerKind[] = [...TOWER_KINDS];
  tilesBesidePath(sim.state.mapId)
    .filter((_, i) => i % every === 0)
    .forEach((tile, i) => {
      const r = sim.placeTower(kinds[i % kinds.length]!, tile);
      if (!r.ok) throw new Error(r.reason);
    });
  sim.state.towers.forEach((t, i) => {
    while (t.level < level) {
      const r = sim.upgradeTower(t.id, t.level === 3 ? (i % 2 ? 'b' : 'a') : undefined);
      if (!r.ok) throw new Error(r.reason);
    }
  });
  sim.state.gold = 0;
}

/** Rally the hero onto the first lane at `fraction` of its length (a path tile). */
export function rallyHero(sim: SimulationHandle, fraction = 0.6): void {
  const len = sim.state.pathLengths[0]!;
  const p = pointAlongPath(sim.state.map, len * fraction, 0).pos;
  const r = sim.setHeroRally(p);
  if (!r.ok) throw new Error(r.reason);
}

/** Cast whatever is ready and useful. */
export function useAbilities(sim: SimulationHandle): void {
  const alive = sim.state.enemies.filter((e) => e.alive);
  if (!alive.length) return;
  const toughest = alive.reduce((a, b) => (b.hp > a.hp ? b : a));
  if (sim.canCastAbility('meteor', toughest.pos).ok) sim.castAbility('meteor', { ...toughest.pos });
  if (alive.length >= 8 && sim.canCastAbility('frostNova').ok) sim.castAbility('frostNova');
  if (alive.length >= 8 && sim.canCastAbility('goldRush').ok) sim.castAbility('goldRush');
  const hero = sim.state.hero;
  if (hero && hero.state === 'fighting' && sim.canCastAbility('bladeStorm').ok) sim.castAbility('bladeStorm');
}

export interface PlayResult {
  steps: number;
  phase: string;
  wave: number;
}

/** Play until the game ends (or `untilWave` is cleared), sending waves ASAP and using abilities. */
export function playOut(
  sim: SimulationHandle,
  opts: { maxSteps?: number; untilWave?: number; abilities?: boolean; dt?: number } = {},
): PlayResult {
  const maxSteps = opts.maxSteps ?? 1_000_000;
  const dt = opts.dt ?? SIM_DT;
  const castEvery = Math.max(1, Math.round(0.5 / dt));
  let n = 0;
  for (; n < maxSteps; n++) {
    const s = sim.state;
    if (s.phase === 'victory' || s.phase === 'defeat') break;
    if (s.phase === 'build') {
      if (opts.untilWave !== undefined && s.wave >= opts.untilWave) break;
      sim.sendWave();
    }
    if (opts.abilities !== false && n % castEvery === 0) useAbilities(sim);
    sim.step(dt);
  }
  return { steps: n, phase: sim.state.phase, wave: sim.state.wave };
}
