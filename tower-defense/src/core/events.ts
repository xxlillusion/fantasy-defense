// Typed event bus. FROZEN during parallel work — request changes, don't edit.
// The simulation is the only producer of game events; renderer, UI and audio consume them.
// Events are emitted synchronously during ISimulation.step() / command calls.

import type {
  Difficulty,
  EnemyKind,
  EnemySnapshot,
  EntityId,
  ProjectileKind,
  Stars,
  TileCoord,
  TowerKind,
  TowerLevel,
  TowerSnapshot,
  Vec2,
} from './types';

export interface GameEvents {
  gameStarted: { difficulty: Difficulty; mapId: string };
  gameOver: { result: 'victory' | 'defeat'; stars: Stars };
  /** Fired when leaving a game back to the title screen. */
  gameExited: Record<string, never>;

  towerPlaced: { tower: TowerSnapshot };
  towerUpgraded: { tower: TowerSnapshot };
  towerSold: { towerId: EntityId; kind: TowerKind; tile: TileCoord; refund: number };

  /**
   * A tower attacked. For projectile towers there is one target per projectile launched.
   * For Tesla, `targets` is the full chain in hit order (instant, no projectile).
   * For Frost L3 aura pulses, `targets` is every enemy hit by the pulse (may be empty only if aura).
   */
  towerFired: {
    towerId: EntityId;
    kind: TowerKind;
    level: TowerLevel;
    from: Vec2;
    targets: { id: EntityId; pos: Vec2 }[];
  };

  /** A projectile reached its destination. splashRadius is 0 for single-target hits. */
  projectileHit: { projectileId: EntityId; kind: ProjectileKind; pos: Vec2; splashRadius: number };

  enemySpawned: { enemy: EnemySnapshot };
  enemyDamaged: { enemyId: EntityId; amount: number; pos: Vec2; crit: boolean };
  enemyKilled: { enemyId: EntityId; kind: EnemyKind; pos: Vec2; bounty: number };
  enemyLeaked: { enemyId: EntityId; kind: EnemyKind; livesLost: number };
  enemyStunned: { enemyId: EntityId; pos: Vec2; duration: number };

  waveStarted: { wave: number; early: boolean; bonus: number };
  waveCleared: { wave: number; bonus: number };

  /** A command was refused (e.g. not enough gold). UI/audio may show feedback. */
  commandRejected: { command: string; reason: string };
}

export type GameEventName = keyof GameEvents;
export type GameEventHandler<K extends GameEventName> = (payload: GameEvents[K]) => void;

export class EventBus {
  private handlers = new Map<GameEventName, Set<(payload: unknown) => void>>();

  /** Subscribe; returns an unsubscribe function. */
  on<K extends GameEventName>(name: K, handler: GameEventHandler<K>): () => void {
    let set = this.handlers.get(name);
    if (!set) {
      set = new Set();
      this.handlers.set(name, set);
    }
    const h = handler as (payload: unknown) => void;
    set.add(h);
    return () => set!.delete(h);
  }

  emit<K extends GameEventName>(name: K, payload: GameEvents[K]): void {
    const set = this.handlers.get(name);
    if (!set) return;
    for (const h of [...set]) {
      try {
        h(payload);
      } catch (err) {
        console.error(`[EventBus] handler for "${name}" threw`, err);
      }
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}
