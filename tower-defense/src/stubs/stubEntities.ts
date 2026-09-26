// Lead-owned STUB. Colored boxes for towers, spheres for enemies. Stream C replaces with src/render/entities/.
import * as THREE from 'three';
import { toWorld } from '../core/grid';
import type { IEntities, RendererHost } from '../core/interfaces';
import type { EnemyKind, EntityId, GameSnapshot, TowerKind } from '../core/types';
import { ENEMIES, FLYER_HEIGHT } from '../data';

const TOWER_COLORS: Record<TowerKind, number> = { arrow: 0xc070ff, cannon: 0xe04030, frost: 0x60a0ff, sniper: 0x503070, tesla: 0x80ffff };
const ENEMY_COLORS: Record<EnemyKind, number> = { grunt: 0x6a8f2a, runner: 0xa06030, brute: 0x807060, swarmling: 0xd04060, flyer: 0x8040a0, boss: 0x909090 };

export function createStubEntities(): IEntities {
  let host: RendererHost;
  const towers = new Map<EntityId, THREE.Mesh>();
  const enemies = new Map<EntityId, THREE.Mesh>();
  const box = new THREE.BoxGeometry(0.5, 0.8, 0.5);
  const ball = new THREE.SphereGeometry(0.25, 12, 8);

  function sync<T extends { id: EntityId }>(map: Map<EntityId, THREE.Mesh>, items: readonly T[], make: (i: T) => THREE.Mesh, place: (m: THREE.Mesh, i: T) => void) {
    const seen = new Set<EntityId>();
    for (const it of items) {
      seen.add(it.id);
      let m = map.get(it.id);
      if (!m) {
        m = make(it);
        map.set(it.id, m);
        host.layers.entities.add(m);
      }
      place(m, it);
    }
    for (const [id, m] of map) {
      if (!seen.has(id)) {
        host.layers.entities.remove(m);
        map.delete(id);
      }
    }
  }

  return {
    init(h) {
      host = h;
    },
    update(s: GameSnapshot) {
      sync(towers, s.towers, (t) => new THREE.Mesh(box, new THREE.MeshLambertMaterial({ color: TOWER_COLORS[t.kind] })), (m, t) => {
        const w = toWorld(t.pos, 0.4 * (0.8 + 0.2 * t.level));
        m.position.set(w.x, w.y, w.z);
        m.scale.y = 0.8 + 0.2 * t.level;
      });
      sync(enemies, s.enemies, (e) => new THREE.Mesh(ball, new THREE.MeshLambertMaterial({ color: ENEMY_COLORS[e.kind] })), (m, e) => {
        const w = toWorld(e.pos, (e.flying ? FLYER_HEIGHT : 0.25) * ENEMIES[e.kind].size);
        m.position.set(w.x, w.y, w.z);
        m.scale.setScalar(ENEMIES[e.kind].size);
      });
    },
    dispose() {},
  };
}
