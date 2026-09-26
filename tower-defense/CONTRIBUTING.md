# Waterfall Shrine: Team Rules (v2)

The design spec is `DESIGN.md`: v1 at the top, then **"v2: Gameplay Depth, Content, Feel & Polish"**.

## Ownership (parallel streams)
| Stream | Owns (only edit these) | Entry point |
|---|---|---|
| Lead | `src/core/`, `src/data/`, `src/stubs/`, `src/render/Renderer.ts`, `src/main.ts`, `src/sim/state.ts`, `src/sim/snapshot.ts`, `src/sim/index.ts`, `tests/data/`, `tests/balance/`, `tests/sim/helpers.ts`, config files | — |
| A1 Sim: combat & enemy traits | `src/sim/towers.ts`, `targeting.ts`, `damage.ts`, `projectiles.ts`, `effects.ts`, `traits.ts`, `tests/sim/combat*.test.ts`, `tests/sim/effects*.test.ts`, `tests/sim/traits*.test.ts` | (behind `createSimulation`) |
| A2 Sim: flow, hero, meta | `src/sim/simulation.ts`, `flow.ts`, `spawner.ts`, `movement.ts`, `economy.ts`, `hero.ts`, `abilities.ts`, `endless.ts`, `modifiers.ts`, `score.ts`, `rng.ts`, `tests/sim/flow*.test.ts`, `tests/sim/economy*.test.ts`, `tests/sim/hero*.test.ts`, `tests/sim/abilities*.test.ts`, `tests/sim/endless*.test.ts`, `tests/sim/smoke*.test.ts` | `createSimulation` |
| B Environment | `src/render/scene/`, `src/render/postfx/`, `src/art/env/` | `createEnvironment` |
| C Sprites + VFX | `src/render/entities/`, `src/render/vfx/`, `src/art/sprites/` | `createEntities` |
| D UI | `src/ui/`, `src/styles/` | `createUi` |
| E Audio + Save | `src/audio/`, `src/save/`, `tests/save/` | `createAudio`, `createSaveStore` |

- **Never edit files outside your stream.** `src/core/`, `src/data/`, `sim/state.ts` and `sim/snapshot.ts` are frozen.
  If you need a change, put it in your final report under "Contract change requests" and work around it for now.
- **A1 and A2 share `src/sim/`.** Don't edit each other's files. Use the functions each side exports. The
  `step()` pipeline order in `simulation.ts` is part of the contract. The `ctx.hooks.onEnemyKilled` hook
  connects `killEnemy` (A1) to hero XP (A2).
- **No new dependencies.**
- Import game data from `src/data` (including `towerStats(kind, level, branch)`, the only way to read tower
  stats) and the contracts from `src/core`. Don't duplicate constants.
- Don't import from another stream's directory. Streams talk only through `src/core` interfaces, the
  `EventBus`, and `GameSnapshot`.

## Checks before reporting done
- `npm run typecheck`: **your files** must have zero errors. Errors in other streams' directories are not yours.
- `npm test`: your tests pass. It's fast; the slow balance harness is `npm run balance`, which the lead owns.
- Optional visual check: a dev server already runs at http://localhost:5173 (HMR). Open **your own new
  browser tab** and don't touch other tabs. Use `?stub=` to isolate yourself from other streams' in-progress work.
  Names: `sim, env, entities, ui, audio, save`. `window.__td` exposes `{ sim, events, renderer, getSnapshot }`.
  Example: `__td.sim.startGame({difficulty:'normal', mapId:'ember-forge', mode:'campaign', modifiers:[]})`.
  Maps: `waterfall-shrine`, `ember-forge`, `moonlit-ruins`.
  requestAnimationFrame stops while the pane is hidden; a screenshot advances it. You can also call
  `__td.sim.step(1/60)` in a loop to advance game time.

## Conventions
- TypeScript strict, ES modules, no default exports. Match the surrounding style.
- Game time comes from `snapshot.time` (it respects pause and 2× speed). Use real `dtReal` only for
  ambient effects.
- Coordinates: gameplay `Vec2` is in tile units; convert with `toWorld()` / `fromWorld()` from `src/core/grid.ts`.
  Compare enemies across lanes by `remaining`, not `progress`.
