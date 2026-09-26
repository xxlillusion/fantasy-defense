// Combat VFX driven by snapshot.projectiles / groundEffects and game events.
import * as THREE from 'three';
import type { EventBus, GameEvents } from '../../core/events';
import { toWorld } from '../../core/grid';
import type { EntityId, GameSnapshot, Vec2 } from '../../core/types';
import { FLYER_HEIGHT, getMap, towerStats } from '../../data';
import { ENEMY_COLORS } from '../../art/sprites/enemies';
import type { BillboardFrame } from '../entities/billboard';
import { GroundLayer } from './ground';
import { LightningLayer } from './lightning';
import { ParticleSystem, rnd, type ParticleSpec } from './particles';
import { ProjectileLayer } from './projectiles';
import { RingLayer } from './rings';

const GOLD = [0xffd23a, 0xffe98a, 0xffb020];
const DUST = [0xcab89a, 0xa89878, 0xe0d4bc];

export interface Vfx {
  update(snapshot: GameSnapshot, dGame: number, dtReal: number, f: BillboardFrame, pixelScale: number): void;
  clear(): void;
  dispose(): void;
}

export function createVfx(layer: THREE.Group, events: EventBus): Vfx {
  const glow = new ParticleSystem(1600, true);
  const solid = new ParticleSystem(800, false);
  layer.add(glow.points, solid.points);
  const rings = new RingLayer(layer);
  const lightning = new LightningLayer();
  layer.add(lightning.mesh);
  const projectiles = new ProjectileLayer(layer, glow);
  const ground = new GroundLayer(layer, glow);

  let mapId: string | null = null;
  const flying = new Map<EntityId, boolean>();

  const enemyHeight = (id: EntityId): number => (flying.get(id) ? FLYER_HEIGHT + 0.35 : 0.4);

  function burst(sys: ParticleSystem, n: number, at: THREE.Vector3 | { x: number; y: number; z: number }, o: Partial<ParticleSpec> & { colors: readonly number[]; speed: number; up?: number }): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = o.speed * (0.4 + Math.random() * 0.6);
      sys.spawn({
        x: at.x + rnd() * 0.05, y: at.y + rnd() * 0.05, z: at.z + rnd() * 0.05,
        vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: (o.up ?? 0) + rnd() * sp * 0.6,
        gravity: o.gravity ?? 0,
        drag: o.drag ?? 2,
        life: (o.life ?? 0.4) * (0.7 + Math.random() * 0.5),
        color: o.colors[(Math.random() * o.colors.length) | 0]!,
        size: o.size ?? 0.06,
        sizeEnd: o.sizeEnd,
        twinkle: o.twinkle,
        gameTime: o.gameTime,
      });
    }
  }

  const w3 = (p: Vec2, h = 0) => {
    const w = toWorld(p, h);
    return new THREE.Vector3(w.x, w.y, w.z);
  };

  const handlers: { [K in keyof GameEvents]?: (e: GameEvents[K]) => void } = {
    projectileHit(e) {
      const at = w3(e.pos, 0.35);
      switch (e.kind) {
        case 'arrow':
          burst(glow, 8, at, { colors: [0xff5ab0, 0xffa0d8, 0xffffff], speed: 1.2, life: 0.22, size: 0.05 });
          break;
        case 'frostbolt':
          burst(solid, 8, at, { colors: [0xffffff, 0xbff4ff, 0x7fdcff], speed: 1.4, up: 0.8, gravity: 4, life: 0.4, size: 0.05 });
          burst(glow, 6, at, { colors: [0x7fdcff], speed: 0.8, life: 0.25, size: 0.08, sizeEnd: 0.02 });
          rings.spawn({ x: at.x, z: at.z, r0: 0.1, r1: 0.45, color: 0x80e0ff, life: 0.3, opacity: 0.8 });
          break;
        case 'crescent':
          burst(glow, 14, at, { colors: [0xb060ff, 0xe0b0ff, 0xffffff], speed: 2, life: 0.3, size: 0.06 });
          rings.spawn({ x: at.x, z: at.z, r0: 0.1, r1: 0.55, color: 0xa050ff, life: 0.3 });
          break;
        case 'shockwave': {
          const r = Math.max(0.5, e.splashRadius);
          rings.spawn({ x: at.x, z: at.z, r0: 0.15, r1: r, color: 0xff8a2a, life: 0.4 });
          rings.spawn({ x: at.x, z: at.z, r0: 0.1, r1: r * 0.7, color: 0xffd060, life: 0.28, opacity: 0.7 });
          burst(glow, 18, w3(e.pos, 0.15), { colors: [0xff8a2a, 0xffc040, 0xfff0a0], speed: 2.4, up: 1.2, gravity: 5, life: 0.45, size: 0.06 });
          burst(solid, 10, w3(e.pos, 0.05), { colors: DUST, speed: 1.6, up: 0.4, gravity: 1, life: 0.5, size: 0.09, sizeEnd: 0.14 });
          break;
        }
      }
    },
    towerFired(e) {
      if (e.kind === 'tesla') {
        const pts = [w3(e.from, 0.95)];
        for (const t of e.targets) pts.push(w3(t.pos, enemyHeight(t.id)));
        lightning.spawn(pts);
        for (let i = 1; i < pts.length; i++) burst(glow, 5, pts[i]!, { colors: [0x60e8ff, 0xffffff], speed: 1.2, life: 0.2, size: 0.05 });
      } else if (e.kind === 'frost' && towerStats('frost', e.level, e.branch).aura) {
        const at = w3(e.from, 0.04);
        const range = towerStats('frost', e.level, e.branch).range;
        rings.spawn({ x: at.x, z: at.z, r0: 0.3, r1: range, color: 0x80e8ff, life: 0.5, opacity: 0.9 });
        for (let i = 0; i < 18; i++) {
          const a = (i / 18) * Math.PI * 2;
          glow.spawn({ x: at.x + Math.cos(a) * 0.3, y: 0.15, z: at.z + Math.sin(a) * 0.3, vx: Math.cos(a) * range * 1.6, vz: Math.sin(a) * range * 1.6, drag: 3, life: 0.45, color: i % 2 ? 0xffffff : 0x9ff0ff, size: 0.06 });
        }
        for (const t of e.targets) burst(solid, 3, w3(t.pos, enemyHeight(t.id)), { colors: [0xffffff, 0xbff4ff], speed: 0.8, gravity: 3, life: 0.3, size: 0.04 });
      } else if (e.kind === 'cannon') {
        burst(solid, 6, w3(e.from, 0.1), { colors: DUST, speed: 1, up: 0.3, life: 0.35, size: 0.07, sizeEnd: 0.12 });
      } else if (e.kind === 'sniper') {
        burst(glow, 5, w3(e.from, 0.9), { colors: [0xb060ff, 0xe0b0ff], speed: 0.8, life: 0.2, size: 0.05 });
      }
    },
    enemyKilled(e) {
      const at = w3(e.pos, flying.get(e.enemyId) ? FLYER_HEIGHT + 0.3 : 0.35);
      burst(solid, 14, at, { colors: [0xe8e0f0, 0xb8b0c8, ...ENEMY_COLORS[e.kind]], speed: 1.6, up: 0.9, gravity: 2.5, life: 0.5, size: 0.07, sizeEnd: 0.03 });
      burst(glow, 6, at, { colors: [0xffffff, 0xfff0d0], speed: 1, life: 0.2, size: 0.07 });
      // coin sparkle (cosmetic: real time)
      solid.spawn({ x: at.x, y: at.y + 0.2, z: at.z, vy: 1.4, gravity: 2.2, life: 0.7, color: 0xffc23d, size: 0.1, gameTime: false });
      burst(glow, 6, { x: at.x, y: at.y + 0.3, z: at.z }, { colors: GOLD, speed: 0.6, up: 0.8, life: 0.7, size: 0.045, twinkle: true, gameTime: false });
    },
    enemyLeaked() {
      if (!mapId) return;
      const wps = getMap(mapId).paths[0]!;
      const portal = wps[wps.length - 1];
      if (!portal) return;
      const at = w3(portal, 0.05);
      rings.spawn({ x: at.x, z: at.z, r0: 0.2, r1: 1.4, color: 0x5fe6ff, life: 0.6, gameTime: false });
      rings.spawn({ x: at.x, z: at.z, r0: 0.1, r1: 0.8, color: 0xffffff, life: 0.35, opacity: 0.7, gameTime: false });
      for (let i = 0; i < 20; i++) {
        glow.spawn({ x: at.x + rnd() * 0.4, y: 0.1 + Math.random() * 0.4, z: at.z + rnd() * 0.3, vy: 1.5 + Math.random() * 2, drag: 1, life: 0.6, color: i % 3 ? 0x5fe6ff : 0xffffff, size: 0.08, sizeEnd: 0.02, gameTime: false });
      }
    },
    enemyDamaged(e) {
      if (e.crit) burst(glow, 8, w3(e.pos, enemyHeight(e.enemyId) + 0.3), { colors: [0xfff080, 0xffffff], speed: 1.5, life: 0.35, size: 0.06, twinkle: true });
    },
    enemyStunned(e) {
      burst(solid, 6, w3(e.pos, enemyHeight(e.enemyId)), { colors: [0xffffff, 0xbff4ff, 0x80d8ff], speed: 0.9, up: 0.6, gravity: 3, life: 0.4, size: 0.05 });
    },
    towerPlaced(e) {
      const at = w3(e.tower.pos, 0.05);
      burst(solid, 16, at, { colors: DUST, speed: 1.6, up: 0.4, gravity: 1, drag: 3, life: 0.6, size: 0.08, sizeEnd: 0.15, gameTime: false });
      rings.spawn({ x: at.x, z: at.z, r0: 0.2, r1: 0.7, color: 0xfff0d0, life: 0.35, opacity: 0.5, gameTime: false });
    },
    towerUpgraded(e) {
      const at = w3(e.tower.pos, 0.1);
      rings.spawn({ x: at.x, z: at.z, r0: 0.2, r1: 0.9, color: 0xffc23d, life: 0.5, gameTime: false });
      for (let i = 0; i < 24; i++) {
        glow.spawn({ x: at.x + rnd() * 0.4, y: 0.1 + Math.random() * 1.4, z: at.z + rnd() * 0.25, vy: 0.6 + Math.random() * 1.2, drag: 1.5, life: 0.8 + Math.random() * 0.4, color: GOLD[i % GOLD.length]!, size: 0.06, twinkle: true, gameTime: false });
      }
    },
    towerSold(e) {
      const at = w3({ x: e.tile.col + 0.5, y: e.tile.row + 0.5 }, 0.3);
      for (let i = 0; i < 16; i++) {
        const a = Math.random() * Math.PI * 2;
        solid.spawn({ x: at.x, y: at.y, z: at.z, vx: Math.cos(a) * 0.9, vz: Math.sin(a) * 0.9, vy: 2 + Math.random() * 1.2, gravity: 6, life: 0.8, color: GOLD[i % GOLD.length]!, size: 0.08, gameTime: false });
      }
      burst(glow, 10, at, { colors: GOLD, speed: 0.8, up: 0.8, life: 0.8, size: 0.045, twinkle: true, gameTime: false });
      burst(solid, 10, w3({ x: e.tile.col + 0.5, y: e.tile.row + 0.5 }, 0.05), { colors: DUST, speed: 1.2, up: 0.3, life: 0.5, size: 0.08, sizeEnd: 0.14, gameTime: false });
    },
    gameStarted(e) {
      mapId = e.mapId;
      api.clear();
    },
    gameExited() {
      api.clear();
    },
  };

  const unsubs: (() => void)[] = [];
  for (const name of Object.keys(handlers) as (keyof GameEvents)[]) {
    const h = handlers[name] as ((e: unknown) => void) | undefined;
    if (h) unsubs.push(events.on(name, h as never));
  }

  const api: Vfx = {
    update(s, dGame, dtReal, f, pixelScale) {
      mapId = s.mapId || mapId;
      flying.clear();
      for (const e of s.enemies) flying.set(e.id, e.flying);
      projectiles.update(s, dGame, f);
      ground.update(s.groundEffects, dGame);
      lightning.update(dGame, f.camera);
      rings.update(dGame, dtReal);
      glow.update(dGame, dtReal, pixelScale);
      solid.update(dGame, dtReal, pixelScale);
    },
    clear() {
      glow.clear();
      solid.clear();
      rings.clear();
      lightning.clear();
      projectiles.clear();
      ground.clear();
    },
    dispose() {
      for (const u of unsubs) u();
      api.clear();
      layer.remove(glow.points, solid.points, lightning.mesh);
      glow.dispose();
      solid.dispose();
      rings.dispose();
      lightning.dispose();
      projectiles.dispose();
      ground.dispose();
    },
  };
  return api;
}
