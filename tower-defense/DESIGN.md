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

---

# v2: Gameplay Depth, Content, Feel & Polish

## Context
v1 is committed on `main` (`7c142f5`). It has 1 map, 5 towers × 3 levels, 6 enemies, 20 waves, 3 difficulties, the HD-2D look, UI, audio and saves. The user wants v2 to cover **gameplay depth**, **content**, and **feel & polish**. QoL and technical work is deferred to a backlog (last section), which also goes into `BACKLOG.md` and memory.

The user decided:
- **Hero:** a *walking blocker* in the Kingdom Rush style.
- **Maps:** **two** new maps, Ember Forge (2 lanes) and Moonlit Ruins.
- **Endless mode:** play the **campaign's 20 waves, then procedural waves forever**.

We build it the same way as v1:
- **Phase 0:** I update the contracts and data, migrate the existing code so everything still compiles, and update the stubs.
- **Phase 1:** 6 parallel subagent streams, each owning its own files.
- **Phase 2:** I integrate, tune balance, and verify in the browser.

The v1 spec stays in `tower-defense/DESIGN.md`. This v2 design gets appended there as "v2".

---

## 1. Feature Design

### 1.1 Branching L4 specializations
A tower at L3 can upgrade to **L4 by picking one of two branches** (`'a' | 'b'`). Each branch has full stats (not deltas) and adds one new mechanic. Costs are roughly 1.6× the L3 upgrade cost (tune during balancing).

| Tower | Branch A | Branch B |
|---|---|---|
| Arrow (L4 ~200) | **Rapid Volley**: 3 arrows per shot, fireRate 2.4, damage 16 | **Piercing Longbow**: damage 45, arrows **pierce** up to 4 enemies in a line, range 4.5 |
| Cannon (~350) | **Earthquake**: aura slam hitting all ground enemies in range 2.5 for 70 damage, with a 30% chance of a 0.6s stun | **Meteor Mortar**: range 4.5, splash 1.75, damage 110, burn 10 dps for 3s |
| Frost (~260) | **Absolute Zero**: aura with 65% slow and a 20% chance of a 1.5s freeze | **Shatter**: bolt that applies **vulnerable** (+30% damage taken from every source for 3s) |
| Sniper (~480) | **Assassin**: 35% crit for ×4, and **executes** non-boss enemies below 15% HP | **Seer**: damage 200, range 7, **reveals stealth** in a 4-tile radius |
| Tesla (~400) | **Storm Nexus**: chains to 8 targets, 15% falloff, jump range 2.5 | **Overload**: one bolt dealing 140 damage, splash 1.0, stun 1s |

New optional fields on `TowerLevelStats`:
- `pierce`: number of enemies a projectile passes through.
- `vulnerable`: `{ amount, duration }`.
- `execute`: HP fraction below which a non-boss enemy dies outright.
- `detection`: radius in tiles within which stealth is revealed.

The simulation reads stats through a single resolver, `towerStats(kind, level, branch)` in `src/data/towers.ts`, and nothing indexes `levels[...]` directly any more.

### 1.2 Hero: Aldric the Greatsword (walking blocker)
- **Spawn:** appears at the portal at game start for free. There's one per game.
- **Rally:** the player sets a rally point by selecting the hero and clicking any walkable tile (grass or path) in any phase. He walks there in a straight line at 2.2 tiles/s.
- **Blocking:**
  - Engages up to **2** ground enemies within 0.9 tiles of him; flyers are ignored.
  - Blocked enemies stop moving and fight him using their new `melee` stats.
  - A new blocked enemy is picked when an old one dies.
  - Bosses count as 2 blockers.
- **Combat:**
  - Greatsword damage 30 at 1.1 attacks/s, range 1.2, ground only.
  - He targets enemies he is blocking first, then the closest ground enemy in range.
- **Health:**
  - 400 HP.
  - Regenerates 4% of max HP per second after 3s out of combat.
  - At 0 HP he is **knocked down**; he respawns at his rally point after 15s, minus 1s per level.
- **Progression:**
  - XP comes from kills he lands (bounty × 2) and from kills made while he is blocking (bounty × 1).
  - Levels 1–5 at 0/120/300/550/900 XP. Each level adds +20% damage, +15% max HP and +0.1 range.
- **Stealth:** reveals stealthed enemies within 2.5 tiles.
- **Blade Storm** (hotkey **R**):
  - Cooldown 40s. Spins for 3s, dealing 45 damage per second (ignoring armor) to all ground enemies within 2 tiles.
  - He can't be blocked while spinning.
  - Can't be used while he's knocked down.

### 1.3 Global abilities (spells)
They unlock by wave and their cooldowns run on game time. Hotkeys are Q, W and E; R is Blade Storm.

| Ability | Unlocks | Cooldown | Effect |
|---|---|---|---|
| **Meteor** (Q) | wave 3 | 45s | Aimed at a point. Lands 0.8s later: 200 damage in a 1.5-tile radius (ignores armor), then 10 dps burn for 3s |
| **Frost Nova** (W) | wave 6 | 60s | Every enemy on the map is slowed 70% for 4s (35% for bosses) |
| **Gold Rush** (E) | wave 9 | 90s | Kill bounties are doubled for 12s |

### 1.4 New enemies and traits
New fields on `EnemyDef`:
- `traits?: { heal?, shieldHits?, split?, stealth? }`.
- `melee: { damage, rate }`, used when an enemy fights the hero.

| Kind | Name | HP | Speed | Bounty | Trait |
|---|---|---|---|---|---|
| `shaman` | Goblin Shaman | 80 | 0.9 | 10 | Every 1s, heals other enemies within 2 tiles by 5% of their max HP |
| `shieldbearer` | Shield Orc | 120 | 0.8 | 9 | Armor 1. A shield absorbs the damage (and Shatter vulnerable) of the next 3 hits; crowd control (slow, stun/freeze) still lands. Ground burn ignores the shield |
| `broodmother` | Broodmother | 180 | 0.7 | 6 | On death, spawns 4 imps (`swarmling`) at her path progress |
| `wraith` | Wraith | 70 | 1.2 | 9 | Stealthed. Can only be targeted while revealed, by a Frost tower's range (any level), Sniper Seer's detection, or the hero's 2.5 tiles |
| `dragon` | Elder Wyvern (boss) | 1600 | 0.55 | 175 | Flying boss. Armor 3, 50% slow resist, stun-immune, costs 5 lives |

Rules for the new traits:
- **Vulnerable** multiplies damage after armor.
- **Execute** skips bosses.
- **Stealth + projectiles:** a projectile already in flight still hits a target that becomes stealthed again. Keep that simple.

### 1.5 Maps and lanes
`MapDef` changes:
- `waypoints` is replaced by `paths: Vec2[][]`. There can be several lanes, and all of them end at the single `portal`.
- New field `theme: 'shrine' | 'forge' | 'ruins'`.
- New field `description`.

Wave groups get an optional `lane?: number | 'alternate'`. The default is `'alternate'`, which spreads spawns across the lanes in turn.

Enemy changes for lanes:
- Enemies store their `lane`.
- Targeting `first` and `last` compare **remaining distance to the portal** (`pathLength[lane] - progress`) instead of raw progress. The snapshot exposes `remaining`.

The maps:
1. **Waterfall Shrine** (existing). 1 lane; migrated to `paths: [waypoints]`.
2. **Ember Forge** (`theme: 'forge'`). **2 lanes:** one enters from the far left and one from the far right. They wind down and merge in the middle before the forge-heart portal at the back.
   - Tiles on the merged section are the key chokepoint.
   - Look: basalt ground, glowing lava channels beside the paths (unbuildable `L` tiles), a lava-fall behind the portal, anvil or brazier statues, ember particles, and a warm-orange rim light against cool smoke.
3. **Moonlit Ruins** (`theme: 'ruins'`). **1 long serpentine lane** with many turns, so there are lots of double-coverage spots, but the path is long so fast enemies matter.
   - Look: night, blue-violet palette, a large moon glow, broken columns (the statues), fallen stones (rocks), fireflies, moon shafts, and a portal that is a ruined arch.
   - Its waves use more wraiths and shamans.

Map wave sets: `MapDef.waves?: WaveDef[]` overrides the shared set. Ruins gets its own variant with more stealth. Forge uses the shared set with lane assignment.

The layouts get a new tile char, `L` (lava, unbuildable). The ruins reuse `S`/`T`/`R` with a different look.

### 1.6 Game modes, modifiers, interest, score
`startGame(options)`, where options is `{ difficulty, mapId, mode: 'campaign'|'endless', modifiers: ModifierId[] }`.

**Endless mode:**
- Waves 1–20 are the map's wave set.
- Waves 21 and up come from a deterministic generator, `src/sim/endless.ts`, seeded by the wave number:
  - A point budget of `120 × 1.14^(w−20)` buys from an enemy mix that widens with the wave number.
  - A boss appears every 5 waves, alternating golem and dragon, with the count going up every 10 waves.
  - HP growth after wave 20 is `RULES.endlessHpGrowth = 1.09` per wave.
- There is no victory. The game ends only in defeat.

**Modifiers:** each one multiplies the score and can be combined with the others.

| Id | Name | Effect | Score × |
|---|---|---|---|
| `swift` | Swift Foes | Enemies move 30% faster | 1.3 |
| `ironclad` | Ironclad | +2 armor on all enemies | 1.25 |
| `glass` | Glass Portal | Max lives = 1 | 1.5 |
| `austerity` | Austerity | 40% less starting gold, no interest | 1.3 |
| `nosell` | No Refunds | Selling is disabled | 1.1 |
| `horde` | Horde | +50% enemy count | 1.4 |

**Interest:** at each wave clear you earn `min(floor(gold × 5%), 50)`. It's added to the `waveCleared` event.

**Score:**
- Formula: `(bounty earned + waves cleared × 100 + lives left × 50) × difficulty multiplier (easy 0.75 / normal 1 / hard 1.5) × the product of the modifier multipliers`.
- It shows live in the HUD and on the results screen.
- Saved: best stars for the campaign, plus best score and best wave for each map × difficulty × mode.

### 1.7 Feel & polish
- **Tower animation 2.0:** sheets grow from 4 to 6 frames: idle0, idle1, **windup**, attack0, attack1, **recover**.
  - Windup plays while the tower has a target and `cooldownFraction > 0.8`, a new snapshot field.
  - Recover plays briefly after the attack frames.
  - L4 branches get distinct sprites: new weapons, auras and palette accents.
- **Hero visuals:** a 48px chibi with a walk cycle (2 frames), attack (3 frames), a spinning Blade Storm (2 frames), knocked-down (1 frame) and a victory pose. He gets an HP bar and a level badge.
- **Impact:**
  - **Screen shake:** a small, event-driven shake on the Cannon Earthquake, Meteor landing, boss hits on the hero, a boss death, and a leak. Intensity is capped and it can be turned off in settings.
  - **Hit-stop:** time runs at 0.3× for 0.35s of real time when a boss dies.
- **Portal reactions:**
  - The portal shader gains a **crack overlay** that grows as `1 − lives/maxLives`, and a flash and wobble on each leak.
  - A **spirit-girl pixel billboard** floats inside the portal. She idles, flinches when enemies leak, cheers on wave clear and at victory, and fades on defeat.
- **Title screen party lineup:** the six cast members stand in the V-formation from the art reference in front of the portal. From left to right: archer, hammer, hero in front, spirit behind, swordsman, mage.
  - The camera uses a closer **title pose** and blends to the gameplay pose over 1.2s when a game starts.
  - The lineup is only shown in the `title` phase.
- **Enemy hover tooltip:** hovering an enemy shows its name, HP, armor, speed, traits and status (slowed, vulnerable, stealthed or revealed, shield hits left). It uses a screen-space hit test through `worldToScreen`.
- **Path preview:**
  - In the build phase, animated chevrons flow along each lane toward the portal.
  - Lanes the next wave will use are highlighted brighter.
  - Before wave 1 a "route reveal" sweep plays once.
- **New-enemy intro card:** the first time a kind appears (per save), a small card shows its name, portrait and trait. It pauses the game, and can be turned off in settings.

---

## 2. Contract Changes (Phase 0, done by me)
All of these go in `src/core/`. They are refrozen once the streams start.

**`types.ts`**
- `TowerLevel = 1|2|3|4`, `TowerBranch = 'a'|'b'`.
- `TowerSnapshot` adds:
  - `branch: TowerBranch | null`
  - `cooldownFraction: number`
  - `branchOptions: { a: {name, blurb, cost}, b: {…} } | null`, filled at L3.
- `EnemyKind` adds `shaman`, `shieldbearer`, `broodmother`, `wraith` and `dragon`.
- `EnemySnapshot` adds:
  - `lane`, `remaining`
  - `shield` (hits left)
  - `stealthed`, `revealed`
  - `vulnerable: boolean`
  - `blockedByHero: boolean`
- `GameMode = 'campaign'|'endless'`, `ModifierId`, `AbilityId = 'meteor'|'frostNova'|'goldRush'|'bladeStorm'`.
- `HeroSnapshot`: `pos`, `rally`, `state: 'idle'|'moving'|'fighting'|'storming'|'down'`, `hp`, `maxHp`, `level`, `xp`, `xpNext`, `facing`, `lastAttackAt`, `respawnIn`, `blocking: EntityId[]`.
- `AbilitySnapshot`: `id`, `unlocked`, `cooldown`, `cooldownMax`, `activeRemaining`, `unlockWave`.
- `GroundEffectSnapshot.kind` adds `'meteorWarning'`.
- `GameSnapshot` adds:
  - `mode`, `modifiers`, `score`
  - `hero: HeroSnapshot | null`, `abilities: AbilitySnapshot[]`
  - `nextWaveLanes: number[]`
  - `lastInterest`
  - `totalWaves: number | null` (null in endless)

**`events.ts`**
- New events:
  - Hero: `heroSpawned`, `heroMoved{rally}`, `heroAttacked{targets}`, `heroDamaged{amount, by}`, `heroDowned`, `heroRespawned`, `heroLevelUp{level}`
  - Abilities: `abilityCast{id, target?}`, `abilityEnded{id}`, `meteorImpact{pos, radius}`
  - Enemy traits: `enemyHealed{enemyId, amount, pos, sourceId}`, `shieldBlocked{enemyId, pos, remaining}`, `shieldBroken{enemyId, pos}`, `enemySplit{parentId, pos, childIds}`, `enemyRevealed{enemyId}`, `enemyExecuted{enemyId, pos}`
  - `pierceHit{projectileId, enemyId, pos}`
- Changed events:
  - `waveCleared` adds `interest`.
  - `gameOver` adds `score`, `mode` and `wave`.
  - `gameStarted` carries the full `GameOptions`.

**`commands.ts`**
- Changed: `startGame(options: GameOptions)`, `upgradeTower(id, branch?)` (a branch is required from L3 to L4).
- New: `setHeroRally(point: Vec2)`, `canSetHeroRally(point)`, `castAbility(id, target?: Vec2)`, `canCastAbility(id, target?)`.

**`interfaces.ts`**
- `IEnvironment.init(host, events)`. The environment can now shake the camera and play portal reactions from events.
- `IEnvironment.setMapPreview(mapId | null)`. The title screen uses it to preview a map; otherwise `snapshot.mapId` decides. The environment disposes and rebuilds when the effective map changes.
- `IEnvironment.pickPoint(clientX, clientY): Vec2 | null`, a continuous ground point used for meteor aim and rally.
- `PlacementGhost` becomes a union:
  - `{type:'tower', kind, tile, valid, range}`
  - `{type:'rally', point, valid}`
  - `{type:'ability', id, point, radius, valid}`
- `IRendererView` adds `pickPoint`, `setMapPreview` and `setTitleMode(on)`.
- `ISaveStore`:
  - Adds `getBest(mapId, difficulty, mode)` returning `{stars, score, wave}` and `recordRun(...)`.
  - Adds `hasSeenEnemy(kind)` / `markEnemySeen(kind)`.
  - `UserSettings` adds `screenShake: boolean` and `enemyIntros: boolean`.
  - Includes v1 → v2 save migration.

**`src/data/` (me):**
- The `towerStats` resolver plus branch data.
- The new enemies and `melee` stats.
- `abilities.ts`, `hero.ts`, `modifiers.ts`.
- `RULES` gains interest, endless growth and score settings.
- The migrated maps plus the **Ember Forge and Moonlit Ruins layouts, paths and wave sets**.
- `validateMap` checks every lane.

**Migration:** I update every v1 call site so `npm run typecheck` and `npm test` are green before any stream starts. The call sites come from exploration:
- Stubs.
- `ui/towerPanel.ts:116`, `ui/title.ts`.
- `render/entities/towerViews.ts:71` (level checks).
- Sim tests that read `levels[3]`.
- Uses of `map.waypoints`, including `render/vfx/index.ts:120` and `sim/*`.
- `startGame` callers.

**Stubs:** every new command and snapshot field gets a minimal stub, so each stream can run with `?stub=` again.

**Balance harness:** extend `tests/balance/` with per-map plans, a hero-rally policy and ability usage.

---

## 3. Parallel Streams (Phase 1): 6 subagents launched in one message
The ownership rules are the same as v1 (`CONTRIBUTING.md`, updated). The simulation is split into two streams by file ownership.

In Phase 0 I add every new field to `sim/state.ts`, extend `sim/snapshot.ts`, and put empty function skeletons in place. Both sim streams only fill in bodies inside the files they own.

| # | Stream | Owns | Deliverable |
|---|---|---|---|
| A1 | **Sim: combat & enemies** | `sim/towers.ts`, `targeting.ts`, `damage.ts`, `projectiles.ts`, `effects.ts`, new `sim/traits.ts`, `tests/sim/combat*` | L4 branch mechanics (pierce, vulnerable, execute, detection, the aura and overload variants); the enemy traits heal, shield, split and stealth/reveal; targeting by `remaining`; tests for every mechanic |
| A2 | **Sim: flow, hero, meta** | `sim/simulation.ts`, `flow.ts`, `spawner.ts`, `movement.ts`, `economy.ts`, new `hero.ts`, `abilities.ts`, `endless.ts`, `modifiers.ts`, `score.ts`, `tests/sim/flow*`, `tests/sim/hero*` | Lanes and lane-aware movement; the hero (rally, walking, blocking, melee, regen, down/respawn, XP, Blade Storm); abilities; endless generator; modifiers; interest; score; `upgradeTower` branch validation; tests, including an endless smoke test to wave 45 |
| B | **Environment** | `render/scene/`, `render/postfx/`, `art/env/` | A theme system: `ThemeSpec` palettes and per-theme builders. Forge and ruins scenes; rebuild on map change plus preview; multi-lane ground; lava channels (`L`); portal cracks and leak reactions; screen shake; title camera pose and blend; path-preview chevrons; rally and ability ghosts; a time-freeze grade tint while Frost Nova is active |
| C | **Sprites + VFX** | `render/entities/`, `render/vfx/`, `art/sprites/` | 6-frame tower sheets, 10 L4 branch looks, 5 new enemies (translucent wraith with a shimmer when revealed), the hero view (states, HP bar, level badge), the portal spirit girl, the title lineup. New VFX: meteor warning and impact, frost nova wave, gold-rush coin sparkle on kills, blade storm, heal pulse, shield bubble and break, split burst, pierce trail, earthquake cracks, overload bolt, execute slash, reveal ripple, hero level-up |
| D | **UI** | `ui/`, `styles/` | Map select with previews (via `setMapPreview`); mode select and modifiers with a live score multiplier; branch-choice cards at L3; hero selection, rally click and hero panel; ability bar with cooldown rings, Q/W/E/R and meteor aiming; enemy hover tooltip; score and interest in the HUD; endless HUD; new-enemy intro cards; results with score and bests; settings for shake and intros |
| E | **Audio + Save** | `audio/`, `save/`, `tests/save/` | SFX for every new event (hero swings, grunts, level-up fanfare, storm whirl, meteor whistle and boom, frost nova, gold-rush jingle, heal chime, shield clank and break, split squelch, reveal shimmer, execute slash, quake rumble, overload crack); a theme music variant per map (forge = heavier drums, ruins = sparse and ethereal); save v2 with migration, run records and enemies seen; tests |

Contract-change requests during Phase 1 go into each final report, the same as in v1.

## 4. Phase 2: Integration & Balance (me)
1. Wire everything together, apply any contract requests, and add hit-stop in `main.ts` using the boss `enemyKilled` event.
2. **Balance:**
   - Per-map scripted-player runs:
     - Easy: 3★.
     - Normal: at least 2★.
     - Hard: the scripted player reaches wave 18 or later, and loses or scrapes a win.
     - Lazy build: loses.
   - The hero and abilities must not trivialize the game. Compare runs with and without them; they should shift results by about one star, not more.
   - Endless: the scripted player dies somewhere around wave 30–40.
   - Each L4 branch should get picked in at least one sensible plan, with no dominant branch (compare damage-per-gold in the harness).
3. Browser playtest on all 3 maps, including the title lineup, preview, abilities and hero; fix bugs.
4. Update `DESIGN.md` (v2 section), `CONTRIBUTING.md` and `BACKLOG.md`. Commit on `main`.

## 5. Verification
- `npm run typecheck` is clean, and `npm test` passes: all sim combat and flow tests, hero tests, endless smoke, save migration, and balance assertions.
- Browser (`npm --prefix tower-defense run dev`):
  - For each map: start a campaign, build to L4 on both branch types, set a hero rally and watch him block and fight, cast all four abilities, and hover each new enemy.
  - Play endless past wave 20.
  - Toggle modifiers and check the score multiplier.
  - Check the title lineup and camera blend, portal cracks and spirit reactions, screen shake, and turning shake off in settings.
- Save: v1 save data migrates correctly; best score and wave are recorded per mode.
- Screenshots at 16:9 and at a small window size for each map.

---

## 6. Backlog (deferred QoL + technical; also written to `BACKLOG.md` and memory)
- Undo last placement during build (full refund).
- Per-tower stats: damage dealt and kills.
- 3× speed; rebindable hotkeys.
- Tutorial / guided first game.
- Mobile / touch controls and layout.
- Quality presets (Low/Med/High: MSAA, DOF, particle caps); FPS counter; bundle code-splitting (currently 880 KB).
- Asset manifest so hand-drawn Aseprite sprites can replace the procedural art.
- Save and resume a game in progress.
- GitHub repo, CI (typecheck, tests, balance), GitHub Pages deploy.
