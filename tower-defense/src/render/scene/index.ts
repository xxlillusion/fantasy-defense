// Stream B entry point: themed HD-2D diorama environments (Waterfall Shrine / Ember Forge / Moonlit
// Ruins) + post-processing, map switching with a fade, camera poses (gameplay / title) and shake,
// portal reactions, path preview, ghosts and ability ambience.
import * as THREE from 'three';
import type { EventBus } from '../../core/events';
import { fromWorld, GRID_ROWS, inBounds, tileAt } from '../../core/grid';
import type { CreateEnvironment, IEnvironment, PlacementGhost, RendererHost, Selection } from '../../core/interfaces';
import type { GameSnapshot, TileCoord, Vec2 } from '../../core/types';
import { DEFAULT_MAP_ID, getMap, isBuildable, MAPS, type MapDef } from '../../data';
import { applyPostSpec, createPostFx, POSTFX, type PostFx } from '../postfx/composer';
import { applyFog } from './atmosphere';
import { applyPose, gameplayPose, screenUv, TITLE_CAMERA, titlePose, viewDepth, type CameraPose } from './camera';
import { buildOverlays, type Overlays } from './overlays';
import { buildPathPreview, type PathPreview } from './pathPreview';
import { buildWorld, THEMES, type ThemeSpec, type World } from './theme';
import { disposeLights, disposeTree, tileWorld } from './util';

/** Screen shake tuning. Amplitude (world units at the camera) = maxOffset * trauma^1.5. */
export const SHAKE = {
  maxOffset: 0.45,
  /** Trauma lost per second (fast decay). */
  decay: 1.7,
  /** Oscillation speed (rad/s). */
  freq: 38,
  tiny: 0.18,
  small: 0.3,
  medium: 0.5,
  large: 0.8,
} as const;

/** Map transition: darken, rebuild, brighten (seconds). */
const FADE = { out: 0.2, in: 0.25 } as const;

type FadeState = 'idle' | 'out' | 'in';

function shakeEnabled(): boolean {
  const s = (window as unknown as { __tdSettings?: { screenShake?: boolean } }).__tdSettings;
  return s?.screenShake !== false;
}

const easeInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);

export const createEnvironment: CreateEnvironment = (): IEnvironment => {
  let host: RendererHost | null = null;
  const unsubs: (() => void)[] = [];
  let post: PostFx;
  let aniso = 4;

  // world
  let map: MapDef;
  let theme: ThemeSpec;
  let world: World | null = null;
  let overlays: Overlays | null = null;
  let preview: PathPreview | null = null;
  let ghost: PlacementGhost | null = null;
  let selection: Selection | null = null;
  let mapPreviewId: string | null = null;
  let fadeState: FadeState = 'idle';
  let fade = 0;

  // camera
  let lastAspect = 16 / 9;
  let bufferHeight = 1080;
  let gamePose: CameraPose;
  let titleCamPose: CameraPose;
  let titleOn = false;
  let blendP = 0; // 0 gameplay .. 1 title (linear progress)
  let started = false;
  let focusDirty = true;

  // feel
  let ambientTime = 0;
  let trauma = 0;
  const shakeOffset = new THREE.Vector3();
  let lastSnapshot: GameSnapshot | null = null;
  let revealDone = false;
  let frostAmt = 0;
  let goldAmt = 0;

  const raycaster = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();
  const tmpV = new THREE.Vector3();

  // ------------------------------------------------------------ world lifecycle

  function disposeWorld() {
    if (!host) return;
    const { layers } = host;
    if (world) {
      layers.environment.remove(world.root);
      disposeLights(world.root);
      disposeTree(world.root);
      world = null;
    }
    if (overlays) {
      layers.overlay.remove(overlays.group);
      disposeTree(overlays.group);
      overlays = null;
    }
    if (preview) {
      layers.overlay.remove(preview.group);
      disposeTree(preview.group);
      preview = null;
    }
  }

  function buildMap(id: string) {
    if (!host) return;
    const { renderer, scene, camera, layers } = host;
    disposeWorld();
    map = getMap(MAPS[id] ? id : DEFAULT_MAP_ID);
    theme = THEMES[map.theme];
    world = buildWorld(map, theme, aniso);
    layers.environment.add(world.root);
    overlays = buildOverlays((t) => isBuildable(map, t), aniso);
    layers.overlay.add(overlays.group);
    overlays.setGhost(ghost);
    overlays.setSelection(selection);
    preview = buildPathPreview(map);
    layers.overlay.add(preview.group);
    applyFog(scene, theme.pal, theme.atmos);
    applyPostSpec(post, theme.post);
    for (const p of world.parts) p.setViewport?.(bufferHeight, camera.fov);
    world.portal.update(1, ambientTime, 1, lastSnapshot?.phase ?? 'title');
    computePoses();
    renderer.shadowMap.needsUpdate = true;
    // warm up shader programs while the screen is dark
    try {
      renderer.compile(scene, camera);
    } catch {
      /* compile is an optimization only */
    }
    if (import.meta.env.DEV) (window as unknown as { __tdEnv?: unknown }).__tdEnv = { post, world, overlays, preview, theme, shake: SHAKE };
  }

  function effectiveMapId(s: GameSnapshot | null): string {
    if (s?.phase === 'title' && mapPreviewId && MAPS[mapPreviewId]) return mapPreviewId;
    return s?.mapId && MAPS[s.mapId] ? s.mapId : map?.id ?? DEFAULT_MAP_ID;
  }

  // ------------------------------------------------------------ camera

  function computePoses() {
    const p = tileWorld(map.portal);
    gamePose = gameplayPose(lastAspect);
    titleCamPose = titlePose(lastAspect, p.x, p.z);
    focusDirty = true;
  }

  function applyCamera() {
    if (!host) return;
    const cam = host.camera;
    cam.fov = 30;
    cam.aspect = lastAspect;
    cam.near = 1;
    cam.far = 220;
    cam.updateProjectionMatrix();
    applyPose(cam, gamePose, titleCamPose, easeInOut(blendP));
  }

  function updateFocus() {
    if (!host) return;
    const cam = host.camera;
    const half = GRID_ROWS / 2;
    const t = easeInOut(blendP);
    // foreground blur: below the front edge of the grid (gameplay) / in front of the lineup (title)
    const frontGame = screenUv(cam, tmpV.set(0, 0, half + 0.25)).y;
    const p = tileWorld(map.portal);
    const frontTitle = screenUv(cam, tmpV.set(p.x, 0, p.z - 0.5 + TITLE_CAMERA.frontRow + 1.2)).y;
    post.dof.setFront(frontGame + (frontTitle - frontGame) * t, POSTFX.dof.frontFeather, POSTFX.dof.frontStrength);
    // background blur: beyond the back row (pool, fall, cliffs)
    const back = viewDepth(cam, tmpV.set(0, 0, -half - POSTFX.dof.farOffset));
    post.dof.setFar(back, back + POSTFX.dof.farRamp, POSTFX.dof.farStrength);
  }

  /** Continuous ground point under the cursor (tile units); pickTile is tileAt() of this. */
  function pickPoint(clientX: number, clientY: number): Vec2 | null {
    if (!host) return null;
    const rect = host.renderer.domElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, host.camera);
    if (!raycaster.ray.intersectPlane(groundPlane, hit)) return null;
    return fromWorld(hit.x, hit.z);
  }

  // ------------------------------------------------------------ feel

  function addShake(amount: number) {
    if (!shakeEnabled()) return;
    trauma = Math.min(1, Math.max(trauma, amount) + amount * 0.1);
  }

  function subscribe(ev: EventBus) {
    unsubs.push(
      ev.on('towerFired', (e) => {
        if (e.kind === 'cannon' && e.level === 4 && e.branch === 'a') addShake(SHAKE.small);
      }),
      ev.on('meteorImpact', () => addShake(SHAKE.medium)),
      ev.on('heroDamaged', (e) => {
        const kind = lastSnapshot?.enemies.find((x) => x.id === e.byEnemyId)?.kind;
        if (kind === 'boss' || kind === 'dragon' || e.amount >= 40) addShake(SHAKE.small);
      }),
      ev.on('enemyKilled', (e) => {
        if (e.kind === 'boss' || e.kind === 'dragon') addShake(SHAKE.large);
      }),
      ev.on('enemyLeaked', () => {
        addShake(SHAKE.tiny);
        world?.portal.leak();
      }),
      ev.on('waveCleared', () => world?.portal.pulse()),
      ev.on('gameStarted', () => {
        revealDone = false;
      }),
    );
  }

  return {
    init(h, ev) {
      host = h;
      const { renderer, scene, camera } = h;
      aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      // static world: render the shadow map once (and again after resize / rebuild)
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = true;

      if (camera.aspect > 0 && Number.isFinite(camera.aspect)) lastAspect = camera.aspect;
      post = createPostFx(renderer, scene, camera);
      buildMap(DEFAULT_MAP_ID);
      applyCamera();
      subscribe(ev);
    },

    update(snapshot: GameSnapshot, dtReal: number) {
      if (!host || !world || !overlays || !preview) return;
      lastSnapshot = snapshot;
      ambientTime += dtReal;

      // --- map switching with a quick fade through dark
      const want = effectiveMapId(snapshot);
      if (!started && want !== map.id) buildMap(want);
      else if (fadeState === 'idle' && want !== map.id) fadeState = 'out';
      if (fadeState === 'out') {
        fade = Math.min(1, fade + dtReal / FADE.out);
        if (fade >= 1) {
          buildMap(effectiveMapId(snapshot));
          fadeState = 'in';
        }
      } else if (fadeState === 'in') {
        fade = Math.max(0, fade - dtReal / FADE.in);
        if (fade <= 0) fadeState = 'idle';
      }
      if (!world || !overlays || !preview) return;

      // --- camera pose blend (gameplay <-> title)
      const target = titleOn ? 1 : 0;
      if (!started) blendP = target;
      if (blendP !== target) {
        const step = dtReal / TITLE_CAMERA.blendSeconds;
        blendP = target > blendP ? Math.min(target, blendP + step) : Math.max(target, blendP - step);
        focusDirty = true;
      }
      applyCamera();
      if (focusDirty) {
        updateFocus();
        focusDirty = blendP !== target;
      }
      started = true;

      // --- shake decays in real time
      trauma = Math.max(0, trauma - SHAKE.decay * dtReal);

      // --- world animation
      for (const p of world.parts) p.update?.(ambientTime, dtReal);
      const lifeFrac = snapshot.maxLives > 0 ? snapshot.lives / snapshot.maxLives : 1;
      world.portal.update(dtReal, ambientTime, lifeFrac, snapshot.phase);

      // --- overlays
      overlays.setHero(snapshot.hero ? snapshot.hero.pos : null);
      overlays.setWarnings(snapshot.groundEffects);
      overlays.update(dtReal, ambientTime);

      // --- path preview: chevrons in the build phase, one-time reveal sweep before wave 1
      if (snapshot.phase === 'title') revealDone = false;
      const inGame = snapshot.phase === 'build' && !titleOn && fadeState === 'idle';
      if (inGame && snapshot.wave === 0 && !revealDone && blendP < 0.25) {
        preview.reveal();
        revealDone = true;
      }
      preview.update(dtReal, ambientTime, inGame, snapshot.nextWaveLanes);

      // --- ability ambience: Frost Nova (icy grade + vignette), Gold Rush (warm edges)
      const ab = (id: string) => snapshot.abilities.find((a) => a.id === id);
      const frostOn = (ab('frostNova')?.activeRemaining ?? 0) > 0 && snapshot.phase !== 'title';
      const goldOn = (ab('goldRush')?.activeRemaining ?? 0) > 0 && snapshot.phase !== 'title';
      frostAmt += ((frostOn ? 1 : 0) - frostAmt) * Math.min(1, dtReal * 3);
      goldAmt += ((goldOn ? 1 : 0) - goldAmt) * Math.min(1, dtReal * 3);
      const g = post.grade;
      g.setTint(1 - 0.16 * frostAmt, 1 - 0.04 * frostAmt, 1 + 0.12 * frostAmt);
      g.setEdgeTint(0.28 * goldAmt, 0.05 * frostAmt + 0.18 * goldAmt, 0.1 * frostAmt + 0.02 * goldAmt);
      post.vignette.darkness = theme.post.vignette.darkness + 0.14 * frostAmt;
      g.fade = fade;
    },

    render(dtReal: number) {
      if (!host) return;
      const cam = host.camera;
      // shake: offset the camera only around the composer render, then restore
      let shaking = false;
      if (trauma > 0.001) {
        const amp = SHAKE.maxOffset * trauma ** 1.5;
        const t = ambientTime * SHAKE.freq;
        const x = (Math.sin(t + 0.3) * 0.6 + Math.sin(t * 1.73 + 1.1) * 0.4) * amp;
        const y = (Math.sin(t * 1.31 + 2.2) * 0.6 + Math.sin(t * 2.07 + 0.4) * 0.4) * amp;
        const e = cam.matrixWorld.elements;
        shakeOffset.set(e[0]! * x + e[4]! * y, e[1]! * x + e[5]! * y, e[2]! * x + e[6]! * y);
        cam.position.add(shakeOffset);
        cam.updateMatrixWorld(true);
        shaking = true;
      }
      post.render(dtReal);
      if (shaking) {
        cam.position.sub(shakeOffset);
        cam.updateMatrixWorld(true);
      }
    },

    resize(width: number, height: number) {
      if (!host) return;
      const { renderer } = host;
      if (!(width > 0 && height > 0)) {
        // hidden / zero-size canvas: keep the last good fit (Renderer may have set aspect to NaN)
        applyCamera();
        return;
      }
      lastAspect = width / height;
      computePoses();
      applyCamera();
      post.setSize(width, height);
      bufferHeight = height * renderer.getPixelRatio();
      if (world) for (const p of world.parts) p.setViewport?.(bufferHeight, host.camera.fov);
      updateFocus();
      renderer.shadowMap.needsUpdate = true;
    },

    pickTile(clientX: number, clientY: number): TileCoord | null {
      const p = pickPoint(clientX, clientY);
      if (!p) return null;
      const t = tileAt(p);
      return inBounds(t) ? t : null;
    },

    pickPoint,

    setMapPreview(mapId: string | null) {
      mapPreviewId = mapId;
    },

    setTitleMode(on: boolean) {
      titleOn = on;
    },

    setPlacementGhost(g: PlacementGhost | null) {
      ghost = g;
      overlays?.setGhost(g);
    },

    setSelection(s: Selection | null) {
      selection = s;
      overlays?.setSelection(s);
    },

    dispose() {
      if (!host) return;
      for (const u of unsubs.splice(0)) u();
      disposeWorld();
      post.dispose();
      host.scene.fog = null;
      host.scene.background = null;
      host = null;
    },
  };
};
