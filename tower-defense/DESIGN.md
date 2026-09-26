# Tower Defense — Game Design Spec (Draft v0.1)

## Context
The project folder (`playground/`) is empty; this is a greenfield game. The goal of this step is a
detailed but concise design spec for a classic tower defense game — gameplay loop, one basic map, and
five tower types — that we can later implement. Open decisions (platform, tech, art style, scope) are
listed at the bottom and are being asked of the user before finalizing.

---

## 1. Core Concept
Enemies ("creeps") walk a fixed path from a **Spawn** to the player's **Base**. The player spends
**gold** to place and upgrade **towers** on buildable tiles beside the path. Towers fire automatically.
Every creep that reaches the Base costs **lives**. Survive all waves to win; lose all lives to lose.

## 2. Gameplay Loop
1. **Build phase** (between waves, untimed or 15s countdown): place / upgrade / sell towers.
2. **Wave phase**: player clicks "Send Wave" (early send = bonus gold). Creeps spawn at intervals.
3. Towers auto-target creeps in range; kills grant gold.
4. Wave ends when all creeps are dead or leaked → next build phase.
5. After final wave (20) → Victory screen with stars (3★ = no lives lost, 2★ ≥ 10 lives, 1★ survived).

### Resources
| Resource | Start | Notes |
|---|---|---|
| Gold | 150 | Earned per kill + wave-clear bonus (+20 + 5×wave#) + early-send bonus |
| Lives | 20 | Normal creep leak = −1, Boss leak = −5 |

### Economy rules
- Sell refund: **70%** of total gold invested.
- Towers have **3 upgrade tiers** (L1 → L2 → L3). No branching in v1.
- Placement: grid-based, 1 tower per tile, only on buildable tiles, never on the path.

### Targeting
Each tower has a selectable targeting mode: **First** (default, furthest along path), **Last**,
**Strongest** (highest HP), **Closest**.

### Controls
- Click tower button → ghost preview with range circle (green = valid, red = invalid) → click tile to place.
- Click placed tower → info panel: stats, Upgrade (cost), Sell (refund), Targeting mode.
- Speed toggle: 1× / 2×. Pause (Space).

## 3. Enemies (needed to make towers meaningful)
| Enemy | HP | Speed (tiles/s) | Gold | Trait |
|---|---|---|---|---|
| Grunt | 60 | 1.0 | 5 | Baseline |
| Runner | 35 | 2.0 | 4 | Fast, fragile |
| Brute | 250 | 0.6 | 12 | Armor 3 (flat damage reduction per hit) |
| Swarmling | 15 | 1.4 | 1 | Comes in groups of 15–25 |
| Flyer | 50 | 1.3 | 7 | Flying — only hit by towers marked "Air" |
| Boss (every 10th wave) | 2,500 | 0.5 | 150 | Armor 5, slow-resistant 50%, −5 lives |

HP scales **+12% per wave** (compounded) on top of base values.

### Wave outline (20 waves)
- 1–3: Grunts → introduce Runners
- 4–6: Swarms, first Brutes
- 7–9: First Flyers, mixed waves
- **10: Boss #1**
- 11–19: mixed, denser, all types
- **20: Boss #2 + escorts**

## 4. Map — "Greenfield Crossing" (basic map)
- Grid: **20 × 12 tiles** (tile = 48px → 960 × 576 play area).
- Single path, S-shaped with 6 turns, enters on the left edge and exits at the right edge.
- Terrain: grass (buildable), dirt path (not buildable), a few rocks/trees (unbuildable decoration).
- ~110 buildable tiles; tight turns create "choke points" where towers cover the path twice.

```
    0         1111111111
    0123456789 0123456789
 0  ....................
 1  S######.............
 2  ......#......T......
 3  ..T...#.....########
 4  ......#.....#.......
 5  ......#######....R..
 6  .............R......
 7  ..#########.........
 8  ..#.......#.........
 9  ..#...T...##########B
10  ..#........(see note)
11  ....................
```
Legend: `S` spawn · `B` base · `#` path · `.` buildable · `T` tree · `R` rock
(Exact waypoint list to be finalized in implementation; the intent is a snaking path with 2–3 chokepoints.)

## 5. Towers
| # | Tower | Cost | Dmg | Rate (shots/s) | Range (tiles) | Hits | Role |
|---|---|---|---|---|---|---|---|
| 1 | **Arrow** | 50 | 12 | 1.5 | 3.0 | Ground + Air | Cheap all-rounder, single target |
| 2 | **Cannon** | 100 | 30 splash (1.0 tile radius) | 0.6 | 2.5 | Ground only | AoE vs swarms |
| 3 | **Frost** | 80 | 4 | 1.0 | 2.5 | Ground + Air | Slows 40% for 2s |
| 4 | **Sniper** | 150 | 90 | 0.3 | 6.0 | Ground + Air | Long-range, ignores armor |
| 5 | **Tesla** | 125 | 20 chain (jumps to 3 targets, −25% per jump) | 0.8 | 2.5 | Ground + Air | Multi-target, good vs clustered/fast |

### Upgrade paths (cost for L2 / L3)
- **Arrow** (60 / 120): L2 +50% dmg, +0.5 range · L3 fires 2 arrows per shot.
- **Cannon** (120 / 220): L2 +60% dmg, +0.25 splash · L3 leaves burning ground (5 dps, 2s).
- **Frost** (90 / 160): L2 slow 50%, 3s · L3 slows all enemies in range (aura), 10% freeze chance (1s stun; bosses immune).
- **Sniper** (160 / 300): L2 +70% dmg · L3 15% crit for 3× damage.
- **Tesla** (140 / 250): L2 chains to 5 targets · L3 stuns each hit target 0.3s.

### Design intent (counters)
- Runners → Frost + Tesla. Swarms → Cannon + Tesla. Brutes/Boss → Sniper (armor-pierce).
- Flyers → Arrow / Sniper / Tesla (Cannon can't hit air — forces diversity).
- Armor punishes low-damage rapid fire (Arrow, Frost) → encourages mixing.

## 6. UI Layout
- Top bar: Gold · Lives · Wave X/20 · Speed · Pause.
- Right or bottom panel: 5 tower buttons (icon, cost, hotkeys 1–5; greyed if unaffordable).
- Selected-tower panel: stats, upgrade, sell, targeting.
- "Send Next Wave" button with preview of next wave's enemy types.
- Floating damage numbers / gold pop-ups (toggleable).

## 7. Screens
Title → (Map select, 1 map for now) → Game → Victory / Defeat (stars, stats, Retry / Menu).

## 8. Scope for v1 (MVP)
Must-have: 1 map, 5 towers w/ 3 tiers, 6 enemy types, 20 waves, win/lose, pause/2× speed,
SFX + music, Easy/Normal/Hard, saved best stars.
Later: more maps, tower branching upgrades, endless mode.

---

## Decisions (confirmed)
- **Tech:** Browser, **TypeScript + Three.js**, bundled with Vite. The switch from Phaser was made for
  the HD-2D art style. Post-FX use the `postprocessing` library (Bloom, DepthOfField/tilt-shift,
  Vignette, HueSaturation/teal LUT) plus `THREE.FogExp2`. Audio uses Howler.js.
  **No GSAP** for gameplay: every animation runs on the game's own simulation clock so pause and 2×
  speed stay in sync. Only reconsider it for animating HTML menus.
- **Towers:** class archetypes styled after the cast, and you can build unlimited copies.
- **Camera:** a fixed 3/4 elevated diorama view (PerspectiveCamera, narrow FOV about 30° for the
  telephoto/miniature look). The whole map is visible, with no pan or zoom.
- **Assets:** believable procedural placeholders generated in code (see Build Plan). Don't over-invest.
- **Theme:** Classic fantasy (orcs/goblins/trolls/wyverns as creeps; tower names as drafted).
- **v1 extras:** Sound effects & music, Difficulty modes (Easy/Normal/Hard: scales creep HP, starting gold,
  lives), Save progress / best stars per map (localStorage).
- **Deferred to later:** Endless mode.

## Art Direction: HD-2D (pixel sprites in a painterly 3D diorama)
Full reference prompt supplied by the user. Key rules for the game:
- **Two layers:** crisp chibi pixel-art sprites (~64–96px native, 2.5–3 heads tall, integer
  nearest-neighbor upscale, cel shading with 2–4 tones, colored outlines) stand as camera-facing
  billboards with soft blob shadows on a **smooth, painterly, non-pixel 3D environment**.
- **Palette contrast:** environment is cool and desaturated (teal, slate, forest green, misty cyan).
  Towers and enemies are warm and saturated (red, gold, magenta, purple, royal blue).
- **Post-FX:** bloom, depth of field (heavily blurred foreground grass strip, sharp gameplay
  plane, soft background), volumetric fog/light shafts, floating dust motes, vignette, teal grade.
  Pixels must never be smoothed.
- **Camera:** slightly elevated, mild-telephoto "miniature diorama" view, 16:9.

### Map reskin: "Greenfield Crossing" → "Waterfall Shrine"
- The path winds through a forest clearing onto a stone-slab shrine plaza. Grass and moss are
  buildable. Plaza slabs are the path.
- Background: a tall waterfall at the center, with cliffs and dense forest around it.
- **Base = the glowing cyan portal holding the spirit girl**, at the back center under the waterfall.
  Lives = the portal's light: it dims as enemies leak.
- Two draconic guardian statues frame the portal symmetrically. They are unbuildable set pieces.
- Enemies (fantasy): Grunt = goblin, Runner = wolf rider, Brute = armored troll, Swarmling = imp,
  Flyer = bat/wyvern whelp, Boss = stone golem / dark knight.

### Tower ↔ cast mapping (proposed)
| Tower | Sprite | Attack visual |
|---|---|---|
| Arrow | Archer girl (blonde twin tails, purple, magenta bow) | pink arrows |
| Cannon | Hammer girl (red hood, giant red/yellow hammer) | ground-slam shockwave (splash) |
| Frost | Mage boy (silver-blue hair, blue robe, tome) | ice shards / frost ring |
| Sniper | Dark swordsman (purple/black coat, katana) | long-range crescent sword wave (armor-pierce) |
| Tesla | Spirit wisp (small version of spirit girl) | chaining cyan arcane lightning |
| — | Hero (spiky blond, greatsword) | Title screen centerpiece. Possible special "hero" unit later |

Tower levels show as a new pedestal/aura + palette accent (L1 wood base, L2 stone, L3 gilded + glow).

## Build Plan (implementation)
Grid placement. The simulation is pure 2D grid logic that doesn't know about rendering. Three.js
only draws the state.

```
tower-defense/
  index.html, vite.config.ts, tsconfig.json, package.json
  src/
    main.ts                 bootstrap, fixed-timestep loop (60Hz sim, speed multiplier, pause)
    data/                   towers.ts, enemies.ts, waves.ts, maps/waterfallShrine.ts, difficulty.ts
    sim/                    Game state, Economy, Wave spawner, Enemy movement (waypoints),
                            Tower targeting/firing, Projectiles, Status effects (slow/stun/burn),
                            damage math (armor, armor-pierce, splash, chain falloff, crit)
    render/                 Scene (plaza plane, cliffs, waterfall, statues, portal), Billboard sprites
                            (nearest-neighbor textures + blob shadows), VFX (particles, shockwave,
                            lightning), PostFX composer, grid picking (raycast → tile)
    art/                    procedural placeholders: pixel sprites drawn to <canvas> from small
                            palette-indexed string grids (~32×40 px, upscaled ×4 with nearest
                            filter); painterly env from gradient/noise canvas textures + simple meshes
    ui/                     HTML/CSS overlay HUD (gold, lives, wave, speed, tower bar, tower panel),
                            title / difficulty / victory / defeat screens
    audio/                  Howler wrapper; placeholder SFX via jsfxr-style generated sounds
    save.ts                 localStorage best stars per map+difficulty (try/catch guarded)
```

## Execution Strategy: Parallel Team Split
I act as the senior engineer. I build the scaffolding and contracts myself (Phase 0). Then 5
subagents implement independent streams in parallel (Phase 1). I integrate and verify at the end
(Phase 2).

### Phase 0: Scaffolding (me, sequential, done before any agent starts)
1. `git init`. Scaffold a Vite + TS project in `tower-defense/`. Install **all** dependencies up front
   (`three`, `postprocessing`, `howler`, `vitest`, types), so agents never touch `package.json`.
2. **Shared contracts in `src/core/` (frozen once agents start):**
   - `types.ts`: ids, `Vec2`, `TileCoord`, `TowerKind`, `EnemyKind`, `TargetMode`, `GamePhase`, and a
     read-only `GameSnapshot` (towers, enemies with pos/hp/status, projectiles, gold, lives, wave, phase,
     speed).
   - `events.ts`: typed `EventBus` with events `TowerPlaced/Upgraded/Sold`, `TowerFired`,
     `ProjectileHit`, `EnemySpawned/Killed/Leaked`, `WaveStarted/Cleared`, `GameOver`.
   - `commands.ts`: the `GameCommands` interface (placeTower, upgrade, sell, setTargeting, sendWave,
     setSpeed, pause, startGame(difficulty)).
   - `interfaces.ts`: `ISimulation`, `IRenderer` (init, render(snapshot, alpha), pickTile(screenXY),
     showPlacementGhost), `IUi`, `IAudio`, `ISaveStore`.
   - `grid.ts`: tile ↔ world-space conversions and map constants (a single source of truth for sim and render).
3. **Data tables in `src/data/`** (straight from this spec): towers, enemies, waves (all 20), difficulty,
   and the Waterfall Shrine map (grid, waypoints, buildable mask, spawn, portal).
4. **Stub implementation of every interface**, wired in `main.ts` with a fixed-timestep loop, so the
   app runs end to end from day one (stub renderer = colored boxes on a plane). Each agent replaces
   its own stub.
5. Short `CONTRIBUTING.md` listing the stream rules below. Then make the baseline git commit.

### Phase 1: Parallel streams (5 subagents, launched in one message)
Each agent owns only its directories. It must not edit `src/core/`, `src/data/`, `main.ts` or
`package.json`. If it needs a contract change, it reports that back instead of making it.
Each agent must pass `npm run typecheck` (and its own tests) before reporting done.

| # | Stream | Owns | Deliverable |
|---|---|---|---|
| A | **Simulation** | `src/sim/`, `tests/sim/` | `ISimulation`: waypoint movement, spawner, targeting modes, projectiles, splash/chain/crit/armor/armor-pierce, slow/stun/burn, economy, sell refund, leaks, win/lose, stars. Vitest coverage for all damage math. Emits events. |
| B | **Environment + Post-FX** | `src/render/scene/`, `src/render/postfx/`, `src/art/env/` | Camera (fixed 3/4, FOV about 30°), plaza/grass/cliff/forest, waterfall (scrolling shader + light), statues (procedural meshes), portal (glow shader, dims with lives), fog, lighting, bloom/DOF/vignette/teal grade, dust particles, `pickTile` raycast, placement ghost + range ring. |
| C | **Sprites + VFX** | `src/render/entities/`, `src/render/vfx/`, `src/art/sprites/` | Procedural pixel sprites (palette-indexed grids → canvas → NearestFilter) for 5 towers × 3 levels, 6 enemies and the hero. Billboard manager that syncs to the snapshot, blob shadows, HP bars, 2-frame idle/attack/walk animation. Projectile and impact VFX (arrows, shockwave, ice, crescent, lightning) driven by events. |
| D | **UI + Screens** | `src/ui/`, `src/styles/` | HTML/CSS overlay: HUD, tower bar (hotkeys 1–5, affordability), tower panel (stats/upgrade/sell/targeting), send-wave + next-wave preview, damage/gold popups, title/difficulty/victory/defeat screens. Talks only through `GameCommands` + snapshot + events. |
| E | **Audio + Save** | `src/audio/`, `src/save/` | Howler wrapper; generated placeholder SFX (sfxr-style synthesis to WAV blobs) per event; a simple generated ambient fantasy loop; volume/mute; localStorage save of best stars per map+difficulty. |

B and C both render into the one Three.js scene that `IRenderer` owns. The Phase 0 contract gives
B the `RendererHost` (scene, camera, composer). C receives a `THREE.Group` layer from it, so neither
edits the other's files.

### Phase 2: Integration & polish (me)
Replace the stubs in `main.ts` with the real modules. Resolve any contract-change requests. Run the
game in the browser preview, fix integration bugs, and do the balance pass (all 20 waves on each
difficulty). A Plan/Explore subagent can review the finished diff for bugs if useful.

Difficulty: Easy = 0.8× HP, 200 gold, 30 lives. Normal = 1×, 150, 20. Hard = 1.25× HP, 120 gold, 10 lives.

## Verification (once implemented)
- `npm run dev`, then open the game in the built-in browser preview. Take screenshots to check the
  HD-2D look (crisp pixels, blurred foreground, bloom on the portal and waterfall, vignette).
- Vitest unit tests for `sim/` (pure logic, no Three.js).
- Play through all 20 waves at 2× speed; confirm economy lets a reasonable build win and a bad build lose.
- Unit-check: damage/armor math, slow stacking (non-stacking, strongest wins), splash radius, chain falloff, sell refund.
- Place/sell/upgrade edge cases: no placement on path, insufficient gold, selling during wave.
