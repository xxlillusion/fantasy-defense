// Combat VFX driven by snapshot.projectiles / groundEffects and game events.
import * as THREE from 'three';
import type { EventBus, GameEvents } from '../../core/events';
import { dist, tileCenter, toWorld } from '../../core/grid';
import type { EntityId, GameSnapshot, Vec2 } from '../../core/types';
import { ABILITY_FX, FLYER_HEIGHT, getMap, towerStats } from '../../data';
import { ENEMY_COLORS } from '../../art/sprites/enemies';
import type { BillboardFrame } from '../entities/billboard';
import { GroundLayer } from './ground';
import { LightningLayer } from './lightning';
import { MeteorLayer } from './meteor';
import { ParticleSystem, rnd, type ParticleSpec } from './particles';
import { ProjectileLayer } from './projectiles';
import { RingLayer } from './rings';
import { FxSpriteLayer, type FxTex } from './sprites';
import { BladeStormLayer } from './storm';

const GOLD = [0xffd23a, 0xffe98a, 0xffb020];
const DUST = [0xcab89a, 0xa89878, 0xe0d4bc];
const FIRE = [0xff5a1a, 0xff8a2a, 0xffc040, 0xfff0a0];
const DEBRIS = [0x3a3036, 0x5a4a48, 0x7a6a60, 0x2a1a14];
const ICE = [0xffffff, 0xd8f8ff, 0x9ff0ff];
const HEAL = [0x7aff7a, 0xb8ffb0, 0xffffff];
const GOO = [0xa04a9a, 0xd070c8, 0x7aff6a, 0x4a2a5a];
const VIOLET = [0xb070ff, 0xd8b0ff, 0xffffff];

/** Max scheduled callbacks (Frost Nova enemy sparkles). */
const MAX_PENDING = 160;

export interface Vfx {
  update(snapshot: GameSnapshot, dGame: number, dtReal: number, f: BillboardFrame, pixelScale: number): void;
  clear(): void;
  dispose(): void;
}

export function createVfx(layer: THREE.Group, events: EventBus): Vfx {
  const glow = new ParticleSystem(2400, true);
  const solid = new ParticleSystem(1200, false);
  layer.add(glow.points, solid.points);
  const rings = new RingLayer(layer);
  const lightning = new LightningLayer();
  layer.add(lightning.mesh);
  const projectiles = new ProjectileLayer(layer, glow);
  const ground = new GroundLayer(layer, glow);
  const sprites = new FxSpriteLayer(layer);
  const meteors = new MeteorLayer(layer, glow, solid);
  const storm = new BladeStormLayer(layer, glow);

  let mapId: string | null = null;
  let snap: GameSnapshot | null = null;
  const flying = new Map<EntityId, boolean>();
  const enemyPos = new Map<EntityId, Vec2>();
  const pierceTowers = new Set<EntityId>();
  const healPulse = new Map<EntityId, number>();
  /** Game-time clock for scheduled effects. */
  let vtime = 0;
  let goldRushUntil = -1;
  const pending: { at: number; fn: () => void }[] = [];

  const later = (delay: number, fn: () => void) => {
    if (pending.length < MAX_PENDING) pending.push({ at: vtime + delay, fn });
  };

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

  function portalPos(): Vec2 | null {
    if (!mapId) return null;
    try {
      return tileCenter(getMap(mapId).portal);
    } catch {
      return null;
    }
  }

  /** Rising gold coins + sparkles. */
  function coins(at: { x: number; y: number; z: number }, n: number, spread: number, real = true): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      solid.spawn({ x: at.x, y: at.y, z: at.z, vx: Math.cos(a) * spread, vz: Math.sin(a) * spread, vy: 2.2 + Math.random() * 1.6, gravity: 6.5, life: 0.9, color: GOLD[i % GOLD.length]!, size: 0.09, gameTime: !real });
    }
  }

  /** A "+" made of five glow squares, floating up. */
  function plus(at: THREE.Vector3): void {
    const s = 0.05;
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      glow.spawn({ x: at.x + dx * s, y: at.y + dy * s, z: at.z, vy: 0.75, drag: 0.5, life: 0.75, color: dx === 0 && dy === 0 ? 0xffffff : 0x7aff7a, size: 0.05 });
    }
  }

  function crack(at: THREE.Vector3, w: number, life: number): void {
    const tex = (['crack0', 'crack1', 'crack2'] as const)[(Math.random() * 3) | 0]! as FxTex;
    sprites.spawn({ tex, x: at.x, y: 0.028 + Math.random() * 0.004, z: at.z, w, mode: 'ground', life, rot: Math.random() * Math.PI * 2, opacity: 0.95, fadeOut: 0.5 });
  }

  function meteorExplosion(pos: Vec2, radius: number): void {
    const at = w3(pos, 0.1);
    rings.spawn({ x: at.x, z: at.z, r0: 0.2, r1: radius * 1.35, color: 0xff7a2a, life: 0.55 });
    rings.spawn({ x: at.x, z: at.z, r0: 0.1, r1: radius, color: 0xfff0a0, life: 0.35, opacity: 0.9 });
    rings.spawn({ x: at.x, z: at.z, r0: radius * 0.6, r1: radius * 1.9, color: 0xd8c8a8, life: 0.8, opacity: 0.5 });
    burst(glow, 70, w3(pos, 0.3), { colors: FIRE, speed: 4.5, up: 2.5, gravity: 4, drag: 2.5, life: 0.7, size: 0.1, sizeEnd: 0.03 });
    burst(glow, 16, w3(pos, 0.6), { colors: [0xffffff, 0xfff0a0], speed: 1.5, up: 1, life: 0.25, size: 0.22, sizeEnd: 0.05 });
    burst(solid, 34, w3(pos, 0.2), { colors: DEBRIS, speed: 3.6, up: 4, gravity: 11, drag: 0.6, life: 1.0, size: 0.09 });
    burst(solid, 18, w3(pos, 0.3), { colors: [0x3a3036, 0x5a4e50, 0x7a6e6a], speed: 1.2, up: 1.2, drag: 1.5, life: 1.3, size: 0.2, sizeEnd: 0.4 });
    sprites.spawn({ tex: 'scorch', x: at.x, y: 0.026, z: at.z, w: radius * 2.3, mode: 'ground', life: 4.5, rot: Math.random() * 6.28, opacity: 0.85, fadeOut: 0.5 });
    crack(at, radius * 2.2, 3.5);
  }

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
          const big = r > 1.5; // Meteor Mortar
          rings.spawn({ x: at.x, z: at.z, r0: 0.15, r1: r, color: big ? 0xff5a1a : 0xff8a2a, life: 0.4 });
          rings.spawn({ x: at.x, z: at.z, r0: 0.1, r1: r * 0.7, color: 0xffd060, life: 0.28, opacity: 0.7 });
          burst(glow, big ? 30 : 18, w3(e.pos, 0.15), { colors: [0xff8a2a, 0xffc040, 0xfff0a0], speed: big ? 3.2 : 2.4, up: 1.2, gravity: 5, life: 0.45, size: 0.06 });
          burst(solid, 10, w3(e.pos, 0.05), { colors: DUST, speed: 1.6, up: 0.4, gravity: 1, life: 0.5, size: 0.09, sizeEnd: 0.14 });
          if (big) burst(solid, 8, w3(e.pos, 0.1), { colors: DEBRIS, speed: 2, up: 2.5, gravity: 9, life: 0.7, size: 0.07 });
          break;
        }
      }
    },
    pierceHit(e) {
      const at = w3(e.pos, enemyHeight(e.enemyId));
      burst(glow, 10, at, { colors: [0xffffff, 0x9ff7d8, 0xfff0b0], speed: 2, life: 0.25, size: 0.05, twinkle: true });
      rings.spawn({ x: at.x, z: at.z, r0: 0.05, r1: 0.35, color: 0x9ff7d8, life: 0.22, opacity: 0.8 });
    },
    towerFired(e) {
      const l4 = e.level === 4;
      if (e.kind === 'tesla') {
        const pts = [w3(e.from, 0.95)];
        for (const t of e.targets) pts.push(w3(t.pos, enemyHeight(t.id)));
        if (l4 && e.branch === 'b') {
          // Overload: one thick white-cyan bolt, splash ring and stun stars
          lightning.spawn(pts, 0.32, 2.6);
          lightning.spawn(pts, 0.2, 1.2);
          const radius = towerStats('tesla', 4, 'b').splashRadius;
          for (const t of e.targets) {
            const at = w3(t.pos, enemyHeight(t.id));
            burst(glow, 24, at, { colors: [0xffffff, 0xd8ffff, 0x60e8ff], speed: 2.6, life: 0.3, size: 0.08, sizeEnd: 0.02 });
            rings.spawn({ x: at.x, z: at.z, r0: 0.1, r1: Math.max(0.6, radius), color: 0xc8ffff, life: 0.35 });
            sprites.spawn({ tex: 'stars', x: at.x, y: at.y + 0.45, z: at.z, w: 0.75, mode: 'ground', life: 1.0, spin: 5, fadeIn: 0.1, fadeOut: 0.3 });
          }
        } else {
          lightning.spawn(pts, l4 ? 0.2 : 0.16, l4 ? 1.25 : 1);
          for (let i = 1; i < pts.length; i++) burst(glow, 5, pts[i]!, { colors: [0x60e8ff, 0xffffff], speed: 1.2, life: 0.2, size: 0.05 });
        }
      } else if (e.kind === 'frost' && towerStats('frost', e.level, e.branch).aura) {
        const at = w3(e.from, 0.04);
        const range = towerStats('frost', e.level, e.branch).range;
        const zero = l4 && e.branch === 'a';
        rings.spawn({ x: at.x, z: at.z, r0: 0.3, r1: range, color: zero ? 0xd8f8ff : 0x80e8ff, life: 0.5, opacity: 0.9 });
        if (zero) rings.spawn({ x: at.x, z: at.z, r0: 0.2, r1: range * 0.8, color: 0xffffff, life: 0.7, opacity: 0.5 });
        const n = zero ? 26 : 18;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          glow.spawn({ x: at.x + Math.cos(a) * 0.3, y: 0.15, z: at.z + Math.sin(a) * 0.3, vx: Math.cos(a) * range * 1.6, vz: Math.sin(a) * range * 1.6, drag: 3, life: 0.45, color: i % 2 ? 0xffffff : 0x9ff0ff, size: 0.06 });
        }
        for (const t of e.targets) burst(solid, zero ? 5 : 3, w3(t.pos, enemyHeight(t.id)), { colors: [0xffffff, 0xbff4ff], speed: 0.8, gravity: 3, life: 0.3, size: 0.04 });
      } else if (e.kind === 'frost' && l4 && e.branch === 'b') {
        burst(glow, 6, w3(e.from, 1.0), { colors: [0xf0c8ff, 0x9ff0ff, 0xffffff], speed: 0.9, life: 0.25, size: 0.05, twinkle: true });
      } else if (e.kind === 'cannon' && l4 && e.branch === 'a') {
        // Earthquake: ground cracks, dust ring, debris at every target
        const at = w3(e.from, 0.05);
        const range = towerStats('cannon', 4, 'a').range;
        rings.spawn({ x: at.x, z: at.z, r0: 0.3, r1: range, color: 0xd8c8a8, life: 0.6, opacity: 0.8 });
        rings.spawn({ x: at.x, z: at.z, r0: 0.2, r1: range * 0.75, color: 0xff9a3a, life: 0.45, opacity: 0.7 });
        crack(at, range * 1.5, 1.6);
        for (let i = 0; i < 36; i++) {
          const a = (i / 36) * Math.PI * 2 + rnd() * 0.08;
          const sp = range * (1.6 + Math.random() * 0.8);
          solid.spawn({ x: at.x + Math.cos(a) * 0.3, y: 0.06, z: at.z + Math.sin(a) * 0.3, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 0.3, drag: 3, life: 0.6, color: DUST[i % DUST.length]!, size: 0.1, sizeEnd: 0.2 });
        }
        for (const t of e.targets) {
          const tp = w3(t.pos, 0.05);
          crack(tp, 0.9, 1.2);
          burst(solid, 5, tp, { colors: DEBRIS, speed: 1, up: 2.4, gravity: 9, life: 0.6, size: 0.06 });
        }
      } else if (e.kind === 'cannon') {
        burst(solid, 6, w3(e.from, 0.1), { colors: DUST, speed: 1, up: 0.3, life: 0.35, size: 0.07, sizeEnd: 0.12 });
        if (l4 && e.branch === 'b') burst(glow, 10, w3(e.from, 1.1), { colors: FIRE, speed: 1.2, up: 1, life: 0.35, size: 0.07 });
      } else if (e.kind === 'sniper') {
        const col = l4 ? (e.branch === 'a' ? [0xff3048, 0xff90a0] : [0xb070ff, 0xffffff]) : [0xb060ff, 0xe0b0ff];
        burst(glow, 5, w3(e.from, 0.9), { colors: col, speed: 0.8, life: 0.2, size: 0.05 });
      } else if (e.kind === 'arrow' && l4) {
        burst(glow, 6, w3(e.from, 0.9), { colors: e.branch === 'a' ? GOLD : [0x9ff7d8, 0xffffff], speed: 0.8, life: 0.2, size: 0.045 });
      }
    },
    enemyKilled(e) {
      const at = w3(e.pos, flying.get(e.enemyId) ? FLYER_HEIGHT + 0.3 : 0.35);
      burst(solid, 14, at, { colors: [0xe8e0f0, 0xb8b0c8, ...ENEMY_COLORS[e.kind]], speed: 1.6, up: 0.9, gravity: 2.5, life: 0.5, size: 0.07, sizeEnd: 0.03 });
      burst(glow, 6, at, { colors: [0xffffff, 0xfff0d0], speed: 1, life: 0.2, size: 0.07 });
      const rush = goldRushActive();
      if (rush) {
        // Gold Rush: a bigger coin fountain
        coins({ x: at.x, y: at.y + 0.2, z: at.z }, 9, 0.9);
        burst(glow, 16, { x: at.x, y: at.y + 0.3, z: at.z }, { colors: GOLD, speed: 1.2, up: 1.4, life: 0.9, size: 0.055, twinkle: true, gameTime: false });
      } else {
        solid.spawn({ x: at.x, y: at.y + 0.2, z: at.z, vy: 1.4, gravity: 2.2, life: 0.7, color: 0xffc23d, size: 0.1, gameTime: false });
        burst(glow, 6, { x: at.x, y: at.y + 0.3, z: at.z }, { colors: GOLD, speed: 0.6, up: 0.8, life: 0.7, size: 0.045, twinkle: true, gameTime: false });
      }
      if (e.kind === 'boss' || e.kind === 'dragon') {
        rings.spawn({ x: at.x, z: at.z, r0: 0.3, r1: 2.2, color: 0xfff0d0, life: 0.7 });
        burst(glow, 40, at, { colors: [0xffffff, 0xfff0a0, ...ENEMY_COLORS[e.kind]], speed: 3, up: 1.5, gravity: 2, life: 0.8, size: 0.09 });
      }
    },
    enemyLeaked() {
      const portal = portalPos();
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

    // ---- v2 enemy traits
    enemyHealed(e) {
      const at = w3(e.pos, enemyHeight(e.enemyId) + 0.25);
      plus(at);
      const src = enemyPos.get(e.sourceId);
      if (src) {
        const from = w3(src, 0.75);
        for (let i = 1; i < 8; i++) {
          const k = i / 8;
          glow.spawn({ x: from.x + (at.x - from.x) * k, y: from.y + (at.y - from.y) * k + Math.sin(k * Math.PI) * 0.25, z: from.z + (at.z - from.z) * k, vy: 0.2, life: 0.18 + k * 0.2, color: HEAL[i % HEAL.length]!, size: 0.04 });
        }
        const last = healPulse.get(e.sourceId) ?? -9;
        if (vtime - last > 0.4) {
          healPulse.set(e.sourceId, vtime);
          const g = w3(src, 0.04);
          rings.spawn({ x: g.x, z: g.z, r0: 0.2, r1: 2, color: 0x6aff6a, life: 0.6, opacity: 0.55 });
          plus(w3(src, 1.05));
        }
      }
    },
    shieldBlocked(e) {
      const at = w3(e.pos, 0.45);
      burst(glow, 10, at, { colors: [0xbff8ff, 0x7fe8ff, 0xffffff], speed: 1.6, life: 0.22, size: 0.05 });
    },
    shieldBroken(e) {
      const at = w3(e.pos, 0.5);
      burst(solid, 22, at, { colors: [0xbff8ff, 0x7fe8ff, 0xffffff, 0x2a90c0], speed: 2.6, up: 1.8, gravity: 6, drag: 1, life: 0.7, size: 0.07, sizeEnd: 0.03 });
      burst(glow, 14, at, { colors: [0xffffff, 0x9ff0ff], speed: 2, life: 0.3, size: 0.08, sizeEnd: 0.02 });
      rings.spawn({ x: at.x, z: at.z, r0: 0.2, r1: 0.9, color: 0x7fe8ff, life: 0.35 });
    },
    enemySplit(e) {
      const at = w3(e.pos, 0.35);
      burst(solid, 26, at, { colors: GOO, speed: 2.2, up: 2, gravity: 7, drag: 1, life: 0.7, size: 0.08, sizeEnd: 0.05 });
      burst(glow, 10, at, { colors: [0xff80e0, 0x7aff6a], speed: 1.4, life: 0.3, size: 0.07 });
      rings.spawn({ x: at.x, z: at.z, r0: 0.15, r1: 0.9, color: 0xc060c0, life: 0.4, opacity: 0.8 });
    },
    enemyRevealed(e) {
      const at = w3(e.pos, 0.05);
      rings.spawn({ x: at.x, z: at.z, r0: 0.1, r1: 0.9, color: 0xb070ff, life: 0.45 });
      rings.spawn({ x: at.x, z: at.z, r0: 0.1, r1: 0.55, color: 0xe0c0ff, life: 0.6, opacity: 0.6 });
      burst(glow, 12, w3(e.pos, 0.5), { colors: VIOLET, speed: 0.9, up: 0.8, life: 0.5, size: 0.05, twinkle: true });
    },
    enemyExecuted(e) {
      const at = w3(e.pos, enemyHeight(e.enemyId));
      sprites.spawn({ tex: 'slash', x: at.x, y: at.y + 0.1, z: at.z, w: 0.95, mode: 'camera', life: 0.32, grow: 1.5, fadeOut: 0.5 });
      burst(glow, 18, at, { colors: [0xff3048, 0xffffff, 0xff90a0], speed: 2.4, life: 0.3, size: 0.06 });
      rings.spawn({ x: at.x, z: at.z, r0: 0.1, r1: 0.7, color: 0xff3048, life: 0.3 });
    },

    // ---- v2 hero
    heroAttacked(e) {
      const h = snap?.hero;
      const pos = h?.pos ?? e.pos;
      const face = h?.facing ?? 0;
      const flip = Math.cos(face) < 0;
      const at = w3(pos, 0.55);
      at.x += (flip ? -1 : 1) * 0.3;
      sprites.spawn({ tex: 'swoosh', x: at.x, y: at.y, z: at.z + 0.05, w: 1.25, mode: 'camera', life: 0.2, flip, grow: 1.15, fadeOut: 0.6 });
      for (const t of e.targets) burst(glow, 6, w3(t.pos, enemyHeight(t.id)), { colors: [0xffffff, 0xfff0a0, 0xc8f0ff], speed: 1.6, life: 0.2, size: 0.05 });
    },
    heroDamaged(e) {
      burst(glow, 4, w3(e.pos, 0.6), { colors: [0xff3030, 0xff8080], speed: 1, life: 0.25, size: 0.05 });
    },
    heroDowned(e) {
      const at = w3(e.pos, 0.05);
      burst(solid, 24, at, { colors: DUST, speed: 1.8, up: 0.5, gravity: 1, drag: 3, life: 0.8, size: 0.1, sizeEnd: 0.2 });
      rings.spawn({ x: at.x, z: at.z, r0: 0.2, r1: 1.0, color: 0xd8c8a8, life: 0.5, opacity: 0.6 });
    },
    heroRespawned(e) {
      respawnSparkles(e.pos);
    },
    heroSpawned(e) {
      respawnSparkles(e.pos);
    },
    heroLevelUp(e) {
      const h = snap?.hero?.pos ?? e.pos;
      const at = w3(h, 0);
      sprites.spawn({ tex: 'pillar', x: at.x, y: 1.5, z: at.z, w: 0.9, h: 3.0, mode: 'camera', life: 1.4, fadeIn: 0.12, fadeOut: 0.5, gameTime: false });
      rings.spawn({ x: at.x, z: at.z, r0: 0.2, r1: 1.3, color: 0xffd23a, life: 0.8, gameTime: false });
      for (let i = 0; i < 40; i++) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * 0.5;
        glow.spawn({ x: at.x + Math.cos(a) * r, y: 0.1 + Math.random() * 0.6, z: at.z + Math.sin(a) * r, vy: 1 + Math.random() * 2.2, drag: 0.8, life: 1 + Math.random() * 0.6, color: GOLD[i % GOLD.length]!, size: 0.06, twinkle: true, gameTime: false });
      }
    },

    // ---- v2 abilities
    abilityCast(e) {
      if (e.id === 'meteor' && e.target) {
        meteors.spawn(e.target, ABILITY_FX.meteor.delay);
      } else if (e.id === 'frostNova') {
        frostNova();
      } else if (e.id === 'goldRush') {
        goldRushUntil = vtime + ABILITY_FX.goldRush.duration;
        const portal = portalPos();
        if (portal) {
          const at = w3(portal, 0.3);
          rings.spawn({ x: at.x, z: at.z, r0: 0.3, r1: 3.2, color: 0xffd23a, life: 0.9 });
          rings.spawn({ x: at.x, z: at.z, r0: 0.2, r1: 1.6, color: 0xfff0a0, life: 0.6, opacity: 0.8 });
          coins(at, 24, 1.4);
          for (let i = 0; i < 70; i++) {
            const a = Math.random() * Math.PI * 2, r = Math.random() * 1.4;
            glow.spawn({ x: at.x + Math.cos(a) * r, y: 0.1 + Math.random() * 1.2, z: at.z + Math.sin(a) * r, vy: 0.8 + Math.random() * 2.5, drag: 1, life: 1 + Math.random() * 0.8, color: GOLD[i % GOLD.length]!, size: 0.06, twinkle: true, gameTime: false });
          }
        }
      } else if (e.id === 'bladeStorm') {
        const h = snap?.hero;
        if (h) {
          const at = w3(h.pos, 0.05);
          rings.spawn({ x: at.x, z: at.z, r0: 0.3, r1: ABILITY_FX.bladeStorm.radius, color: 0xc8f0ff, life: 0.4 });
        }
      }
    },
    abilityEnded(e) {
      if (e.id === 'goldRush') goldRushUntil = -1;
    },
    meteorImpact(e) {
      meteors.impact(e.pos);
      meteorExplosion(e.pos, e.radius);
    },

    towerPlaced(e) {
      const at = w3(e.tower.pos, 0.05);
      burst(solid, 16, at, { colors: DUST, speed: 1.6, up: 0.4, gravity: 1, drag: 3, life: 0.6, size: 0.08, sizeEnd: 0.15, gameTime: false });
      rings.spawn({ x: at.x, z: at.z, r0: 0.2, r1: 0.7, color: 0xfff0d0, life: 0.35, opacity: 0.5, gameTime: false });
    },
    towerUpgraded(e) {
      const at = w3(e.tower.pos, 0.1);
      const l4 = e.tower.level === 4;
      rings.spawn({ x: at.x, z: at.z, r0: 0.2, r1: l4 ? 1.3 : 0.9, color: 0xffc23d, life: l4 ? 0.8 : 0.5, gameTime: false });
      const n = l4 ? 44 : 24;
      for (let i = 0; i < n; i++) {
        glow.spawn({ x: at.x + rnd() * 0.4, y: 0.1 + Math.random() * 1.4, z: at.z + rnd() * 0.25, vy: 0.6 + Math.random() * (l4 ? 2 : 1.2), drag: 1.5, life: 0.8 + Math.random() * 0.4, color: GOLD[i % GOLD.length]!, size: 0.06, twinkle: true, gameTime: false });
      }
      if (l4) sprites.spawn({ tex: 'pillar', x: at.x, y: 1.1, z: at.z, w: 0.9, h: 2.2, mode: 'camera', life: 0.9, fadeIn: 0.1, gameTime: false });
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

  function respawnSparkles(pos: Vec2): void {
    const at = w3(pos, 0.05);
    rings.spawn({ x: at.x, z: at.z, r0: 0.1, r1: 0.9, color: 0xfff0a0, life: 0.6, gameTime: false });
    for (let i = 0; i < 28; i++) {
      const a = Math.random() * Math.PI * 2, r = 0.2 + Math.random() * 0.5;
      glow.spawn({ x: at.x + Math.cos(a) * r, y: Math.random() * 1.2, z: at.z + Math.sin(a) * r, vy: 0.5 + Math.random(), drag: 1, life: 0.8 + Math.random() * 0.5, color: i % 3 ? 0xfff0a0 : 0xffffff, size: 0.05, twinkle: true, gameTime: false });
    }
  }

  function goldRushActive(): boolean {
    const a = snap?.abilities.find((x) => x.id === 'goldRush');
    return (a?.activeRemaining ?? 0) > 0 || vtime < goldRushUntil;
  }

  function frostNova(): void {
    const portal = portalPos();
    if (!portal) return;
    const at = w3(portal, 0.05);
    const reach = 24;
    const life = 1.3;
    rings.spawn({ x: at.x, z: at.z, r0: 0.4, r1: reach, color: 0xbff4ff, life, thin: true });
    rings.spawn({ x: at.x, z: at.z, r0: 0.3, r1: reach * 0.8, color: 0xffffff, life: life * 0.8, opacity: 0.6, thin: true });
    rings.spawn({ x: at.x, z: at.z, r0: 0.2, r1: 2.5, color: 0x9ff0ff, life: 0.5 });
    // icy wavefront shards racing outward
    const n = 150;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.02;
      const sp = 15 + Math.random() * 4;
      glow.spawn({ x: at.x, y: 0.1 + Math.random() * 0.4, z: at.z, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, drag: 0.9, life: 1.1, color: ICE[i % ICE.length]!, size: 0.07, sizeEnd: 0.03 });
    }
    // sparkle on every enemy as the wave reaches it
    for (const en of snap?.enemies ?? []) {
      const id = en.id;
      later(Math.min(1.2, dist(portal, en.pos) / 17), () => {
        const p = enemyPos.get(id);
        if (!p) return;
        const ep = w3(p, enemyHeight(id));
        burst(glow, 8, ep, { colors: ICE, speed: 1.2, up: 0.6, life: 0.6, size: 0.05, twinkle: true });
        burst(solid, 6, ep, { colors: ICE, speed: 1, up: 1, gravity: 4, life: 0.5, size: 0.05 });
        rings.spawn({ x: ep.x, z: ep.z, r0: 0.1, r1: 0.5, color: 0xbff4ff, life: 0.4, opacity: 0.8 });
      });
    }
  }

  const unsubs: (() => void)[] = [];
  for (const name of Object.keys(handlers) as (keyof GameEvents)[]) {
    const h = handlers[name] as ((e: unknown) => void) | undefined;
    if (h) unsubs.push(events.on(name, h as never));
  }

  const heroWorld = new THREE.Vector3();

  const api: Vfx = {
    update(s, dGame, dtReal, f, pixelScale) {
      snap = s;
      mapId = s.mapId || mapId;
      vtime += dGame;
      flying.clear();
      enemyPos.clear();
      for (const e of s.enemies) {
        flying.set(e.id, e.flying);
        enemyPos.set(e.id, e.pos);
      }
      pierceTowers.clear();
      for (const t of s.towers) if (t.level === 4 && t.kind === 'arrow' && towerStats(t.kind, t.level, t.branch).pierce) pierceTowers.add(t.id);
      for (let i = pending.length - 1; i >= 0; i--) {
        if (pending[i]!.at <= vtime) {
          const p = pending[i]!;
          pending.splice(i, 1);
          p.fn();
        }
      }
      const h = s.hero;
      let heroAt: THREE.Vector3 | null = null;
      if (h) {
        const w = toWorld(h.pos);
        heroAt = heroWorld.set(w.x, 0, w.z);
      }
      const bs = s.abilities.find((a) => a.id === 'bladeStorm');
      storm.update(heroAt, !!h && (h.state === 'storming' || (bs?.activeRemaining ?? 0) > 0) && h.state !== 'down', dGame, dtReal);
      meteors.update(s.groundEffects, dGame, f);
      projectiles.update(s, dGame, f, pierceTowers);
      ground.update(s.groundEffects, dGame);
      lightning.update(dGame, f.camera);
      rings.update(dGame, dtReal);
      sprites.update(dGame, dtReal, f);
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
      sprites.clear();
      meteors.clear();
      storm.clear();
      pending.length = 0;
      goldRushUntil = -1;
      healPulse.clear();
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
      sprites.dispose();
      meteors.dispose();
      storm.dispose();
    },
  };
  return api;
}
