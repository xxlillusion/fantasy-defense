// Stream C entry point: pixel-sprite billboards for towers / enemies / hero / portal spirit /
// title lineup, plus combat VFX.
import * as THREE from 'three';
import type { EventBus } from '../../core/events';
import type { CreateEntities, IEntities, RendererHost } from '../../core/interfaces';
import type { EntityId, GameSnapshot } from '../../core/types';
import { createVfx, type Vfx } from '../vfx';
import { computeBillboardFrame, disposeSheetTextures, type BillboardFrame } from './billboard';
import { disposeEnemyStatusTextures, EnemyView } from './enemyViews';
import { disposeGlow } from './glow';
import { HeroView } from './heroView';
import { LineupView } from './lineupView';
import { disposeShadows } from './shadows';
import { SpiritView } from './spiritView';
import { TowerView } from './towerViews';

const MAX_POOL = 128;

export const createEntities: CreateEntities = (): IEntities => {
  let host: RendererHost | null = null;
  let vfx: Vfx | null = null;
  const unsubs: (() => void)[] = [];
  const towers = new Map<EntityId, TowerView>();
  const enemies = new Map<EntityId, EnemyView>();
  const towerPool: TowerView[] = [];
  const enemyPool: EnemyView[] = [];
  let hero: HeroView | null = null;
  let spirit: SpiritView | null = null;
  let lineup: LineupView | null = null;
  const frame: BillboardFrame = { yaw: 0, stretch: 1, camera: new THREE.PerspectiveCamera() };
  const bufSize = new THREE.Vector2();
  let lastTime = 0;
  let clock = 0;

  function syncTowers(s: GameSnapshot): void {
    const layer = host!.layers.entities;
    const seen = new Set<EntityId>();
    for (const t of s.towers) {
      seen.add(t.id);
      let v = towers.get(t.id);
      if (!v) {
        v = towerPool.pop() ?? new TowerView();
        v.bind(t);
        towers.set(t.id, v);
        layer.add(v.root);
      }
      v.update(t, s.time, clock, frame);
    }
    for (const [id, v] of towers) {
      if (seen.has(id)) continue;
      layer.remove(v.root);
      towers.delete(id);
      if (towerPool.length < MAX_POOL) towerPool.push(v);
      else v.dispose();
    }
  }

  function syncEnemies(s: GameSnapshot, dtReal: number): void {
    const layer = host!.layers.entities;
    const seen = new Set<EntityId>();
    for (const e of s.enemies) {
      seen.add(e.id);
      let v = enemies.get(e.id);
      if (!v) {
        v = enemyPool.pop() ?? new EnemyView();
        v.bind(e);
        enemies.set(e.id, v);
        layer.add(v.root);
      }
      v.update(e, s.time, dtReal, frame, clock);
    }
    for (const [id, v] of enemies) {
      if (seen.has(id)) continue;
      layer.remove(v.root);
      enemies.delete(id);
      if (enemyPool.length < MAX_POOL) enemyPool.push(v);
      else v.dispose();
    }
  }

  return {
    init(h: RendererHost, events: EventBus) {
      host = h;
      vfx = createVfx(h.layers.vfx, events);
      hero = new HeroView();
      spirit = new SpiritView();
      lineup = new LineupView();
      h.layers.entities.add(hero.root, hero.flagRoot, spirit.root, lineup.root);
      unsubs.push(
        events.on('enemyDamaged', (e) => enemies.get(e.enemyId)?.flash()),
        events.on('shieldBlocked', (e) => enemies.get(e.enemyId)?.shieldFlash()),
        events.on('towerFired', (e) => {
          const v = towers.get(e.towerId);
          if (v) v.firedAt = lastTime;
        }),
        events.on('heroAttacked', () => {
          if (hero) hero.attackAt = lastTime;
        }),
        events.on('heroDamaged', () => hero?.hurt()),
        events.on('heroRespawned', () => hero?.respawn()),
        events.on('heroSpawned', () => hero?.respawn()),
        events.on('enemyLeaked', () => spirit?.flinch()),
        events.on('waveCleared', () => spirit?.cheer()),
        events.on('gameStarted', () => {
          spirit?.reset();
          hero?.reset();
        }),
      );
    },

    update(s: GameSnapshot, dtReal: number) {
      if (!host || !vfx) return;
      let dGame = s.time - lastTime;
      if (dGame < 0 || dGame > 0.5) dGame = 0; // new game / big jump
      lastTime = s.time;
      clock += dtReal;

      const cam = host.camera;
      cam.updateMatrixWorld();
      computeBillboardFrame(cam, frame);
      host.renderer.getDrawingBufferSize(bufSize);
      const pixelScale = bufSize.y / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));

      syncTowers(s);
      syncEnemies(s, dtReal);
      hero?.update(s.hero, s.phase, s.time, dtReal, clock, frame);
      spirit?.update(s, dtReal, clock, frame);
      lineup?.update(s, clock, frame);
      vfx.update(s, dGame, dtReal, frame, pixelScale);
    },

    dispose() {
      for (const u of unsubs) u();
      unsubs.length = 0;
      vfx?.dispose();
      vfx = null;
      for (const v of towers.values()) {
        host?.layers.entities.remove(v.root);
        v.dispose();
      }
      for (const v of enemies.values()) {
        host?.layers.entities.remove(v.root);
        v.dispose();
      }
      for (const v of towerPool) v.dispose();
      for (const v of enemyPool) v.dispose();
      towers.clear();
      enemies.clear();
      towerPool.length = 0;
      enemyPool.length = 0;
      if (hero) host?.layers.entities.remove(hero.root, hero.flagRoot);
      if (spirit) host?.layers.entities.remove(spirit.root);
      if (lineup) host?.layers.entities.remove(lineup.root);
      hero?.dispose();
      spirit?.dispose();
      lineup?.dispose();
      hero = null;
      spirit = null;
      lineup = null;
      disposeSheetTextures();
      disposeShadows();
      disposeGlow();
      disposeEnemyStatusTextures();
      host = null;
    },
  };
};
