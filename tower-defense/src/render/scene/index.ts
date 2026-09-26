// Stream B entry point: HD-2D "Waterfall Shrine" diorama environment + post-processing.
import * as THREE from 'three';
import { fromWorld, GRID_ROWS, inBounds, tileAt } from '../../core/grid';
import type { CreateEnvironment, IEnvironment, PlacementGhost, RendererHost, Selection } from '../../core/interfaces';
import type { GameSnapshot, TileCoord, Vec2 } from '../../core/types';
import { DEFAULT_MAP_ID, getMap, isBuildable, type MapDef } from '../../data';
import { createPostFx, POSTFX, type PostFx } from '../postfx/composer';
import { applyFog, buildAtmosphere, type Atmosphere } from './atmosphere';
import { buildBackdrop } from './backdrop';
import { fitCamera, screenUv, viewDepth } from './camera';
import { buildForeground, buildTileProps, sharedFoliageMaterial } from './foliage';
import { buildGround } from './ground';
import { buildOverlays, type Overlays } from './overlays';
import { buildPortal, type Portal } from './portal';
import { buildStatues } from './statues';
import { disposeTree, tileWorld } from './util';
import { buildWaterfall, type Waterfall } from './waterfall';

export const createEnvironment: CreateEnvironment = (): IEnvironment => {
  let host: RendererHost | null = null;
  let map: MapDef;
  let root: THREE.Group;
  let overlays: Overlays;
  let portal: Portal;
  let waterfall: Waterfall;
  let atmos: Atmosphere;
  let post: PostFx;
  let ambientTime = 0;
  let lastAspect = 16 / 9;
  const raycaster = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ndc = new THREE.Vector2();
  const hit = new THREE.Vector3();

  function updateFocus() {
    if (!host) return;
    const cam = host.camera;
    const half = GRID_ROWS / 2;
    // foreground blur: everything below the front edge of the grid on screen
    const front = screenUv(cam, new THREE.Vector3(0, 0, half + 0.25));
    post.dof.setFront(front.y, POSTFX.dof.frontFeather, POSTFX.dof.frontStrength);
    // background blur: beyond the back row (pool, waterfall, cliffs)
    const back = viewDepth(cam, new THREE.Vector3(0, 0, -half - POSTFX.dof.farOffset));
    post.dof.setFar(back, back + POSTFX.dof.farRamp, POSTFX.dof.farStrength);
  }

  return {
    init(h, _events) {
      // TODO(B): use events for shake / portal reactions; rebuild on map change
      host = h;
      map = getMap(DEFAULT_MAP_ID);
      const { renderer, scene, camera, layers } = h;
      const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      // static world: render the shadow map once (and again after resize)
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = true;

      applyFog(scene);
      if (camera.aspect > 0) lastAspect = camera.aspect;
      fitCamera(camera, lastAspect);

      root = new THREE.Group();
      root.name = 'environmentRoot';
      layers.environment.add(root);

      const foliageMat = sharedFoliageMaterial();
      root.add(buildGround(map, aniso));
      root.add(buildBackdrop(foliageMat));
      root.add(buildTileProps(map, foliageMat));
      root.add(buildForeground(foliageMat));
      root.add(buildStatues(map.statues, map.portal, aniso));
      portal = buildPortal(map.portal, aniso);
      root.add(portal.group);
      waterfall = buildWaterfall(tileWorld(map.portal).x, aniso);
      root.add(waterfall.group);
      atmos = buildAtmosphere(aniso);
      root.add(atmos.group);

      overlays = buildOverlays((t) => isBuildable(map, t), aniso);
      layers.overlay.add(overlays.group);

      post = createPostFx(renderer, scene, camera);
      // dev-only handle for tuning post-FX from the console
      if (import.meta.env.DEV) (window as unknown as { __tdEnv?: unknown }).__tdEnv = { post, root, overlays };
    },

    update(snapshot: GameSnapshot, dtReal: number) {
      ambientTime += dtReal;
      const lifeFrac = snapshot.maxLives > 0 ? snapshot.lives / snapshot.maxLives : 1;
      portal.update(dtReal, ambientTime, lifeFrac, snapshot.phase);
      waterfall.update(ambientTime);
      atmos.update(ambientTime);
      overlays.update(dtReal, ambientTime);
    },

    render(dtReal: number) {
      post.render(dtReal);
    },

    resize(width: number, height: number) {
      if (!host) return;
      const { camera, renderer } = host;
      if (!(width > 0 && height > 0)) {
        // hidden / zero-size canvas: keep the last good fit (Renderer may have set aspect to NaN)
        fitCamera(camera, lastAspect);
        return;
      }
      lastAspect = width / height;
      fitCamera(camera, lastAspect);
      post.setSize(width, height);
      const bufH = height * renderer.getPixelRatio();
      waterfall.setViewport(bufH, camera.fov);
      atmos.setViewport(bufH, camera.fov);
      updateFocus();
      renderer.shadowMap.needsUpdate = true;
    },

    pickTile(clientX: number, clientY: number): TileCoord | null {
      if (!host) return null;
      const rect = host.renderer.domElement.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, host.camera);
      if (!raycaster.ray.intersectPlane(groundPlane, hit)) return null;
      const t = tileAt(fromWorld(hit.x, hit.z));
      return inBounds(t) ? t : null;
    },

    pickPoint(clientX: number, clientY: number): Vec2 | null {
      if (!host) return null;
      const rect = host.renderer.domElement.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, host.camera);
      if (!raycaster.ray.intersectPlane(groundPlane, hit)) return null;
      return fromWorld(hit.x, hit.z);
    },

    setMapPreview(_mapId: string | null) {
      // TODO(B): rebuild the scene for the previewed map
    },

    setTitleMode(_on: boolean) {
      // TODO(B): title camera pose + blend
    },

    setPlacementGhost(ghost: PlacementGhost | null) {
      overlays?.setGhost(ghost);
    },

    setSelection(selection: Selection | null) {
      overlays?.setSelection(selection);
    },

    dispose() {
      if (!host) return;
      post.dispose();
      host.layers.environment.remove(root);
      host.layers.overlay.remove(overlays.group);
      disposeTree(root);
      disposeTree(overlays.group);
      host.scene.fog = null;
      host.scene.background = null;
      host = null;
    },
  };
};
