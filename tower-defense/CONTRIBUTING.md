# Waterfall Shrine: Team Rules

The full design spec (gameplay, towers, enemies, waves, art direction) is in `DESIGN.md`.

## Ownership (parallel streams)
| Stream | Owns (only edit these) | Entry point to replace |
|---|---|---|
| Lead | `src/core/`, `src/data/`, `src/stubs/`, `src/render/Renderer.ts`, `src/main.ts`, `tests/data/`, config files | — |
| A Simulation | `src/sim/`, `tests/sim/` | `src/sim/index.ts` → `createSimulation` |
| B Environment + Post-FX | `src/render/scene/`, `src/render/postfx/`, `src/art/env/` | `src/render/scene/index.ts` → `createEnvironment` |
| C Sprites + VFX | `src/render/entities/`, `src/render/vfx/`, `src/art/sprites/` | `src/render/entities/index.ts` → `createEntities` |
| D UI + Screens | `src/ui/`, `src/styles/` | `src/ui/index.ts` → `createUi` |
| E Audio + Save | `src/audio/`, `src/save/`, `tests/save/` | `src/audio/index.ts`, `src/save/index.ts` |

- **Never edit files outside your stream.** `src/core/` contracts are frozen. If you need a change,
  put it in your final report under "Contract change requests" and work around it for now.
- **No new dependencies.** Everything is already installed: `three`, `postprocessing`, `howler`, `vitest`.
- Import game data from `src/data` and the contracts from `src/core`. Don't duplicate constants.
- Don't import from another stream's directory. Streams talk only through `src/core` interfaces, the
  `EventBus`, and `GameSnapshot`.

## Checks before reporting done
- `npm run typecheck`: **your files** must have zero errors. Errors in other streams' directories
  are not yours; ignore them (other agents are mid-edit).
- `npm test`: your tests pass (A and E especially).
- Optional visual check: a dev server already runs at http://localhost:5173 (Vite HMR picks up your
  edits). Open **your own new browser tab** and don't touch other tabs. Use `?stub=` to isolate yourself from other streams'
  in-progress work, e.g. `http://localhost:5173/?stub=sim,ui` uses the lead's stub sim and UI.
  Names: `sim, env, entities, ui, audio, save`. `window.__td` exposes `{ sim, events, renderer, getSnapshot }`.
  In the console you can call `__td.sim.startGame('normal'); __td.sim.placeTower('arrow',{col:4,row:9}); __td.sim.sendWave()`.
  Note: requestAnimationFrame stops while the pane is hidden, and taking a screenshot advances it.

## Conventions
- TypeScript strict, ES modules, no default exports. Match the style of `src/core`.
- Game time comes from `snapshot.time`, which respects pause and 2× speed. Use real `dtReal` only for
  ambient effects (waterfall, fog, dust) that should keep animating while paused.
- Coordinates: gameplay `Vec2` is in tile units; convert with `toWorld()` / `fromWorld()` from `src/core/grid.ts`.
