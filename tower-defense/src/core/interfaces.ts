// Module interfaces — the seams between parallel work streams.
// FROZEN during parallel work — request changes, don't edit.
//
//  Stream A  ISimulation        src/sim/index.ts        createSimulation()
//  Stream B  IEnvironment       src/render/scene/index.ts  createEnvironment()
//  Stream C  IEntities          src/render/entities/index.ts  createEntities()
//  Stream D  IUi                src/ui/index.ts         createUi()
//  Stream E  IAudio, ISaveStore src/audio/index.ts, src/save/index.ts
//
// IRenderer is owned by the lead (src/render/Renderer.ts) and composes B + C.

import type * as THREE from 'three';
import type { GameCommands } from './commands';
import type { EventBus } from './events';
import type { AbilityId, Difficulty, EnemyKind, GameMode, GameSnapshot, Stars, TileCoord, TowerKind, Vec2 } from './types';

// ---------------------------------------------------------------- Stream A

export interface ISimulation extends GameCommands {
  /** Advance the simulation by exactly `dt` seconds of game time (main calls with SIM_DT). */
  step(dt: number): void;
  /** Immutable view of the current state. May return the same object if nothing changed. */
  snapshot(): GameSnapshot;
}

export type CreateSimulation = (events: EventBus) => ISimulation;

// ---------------------------------------------------------------- Rendering (B + C)

/** Shared Three.js objects, created by the lead's Renderer and handed to B and C. */
export interface RendererHost {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  /** Positioned/configured by the environment (Stream B) in init(). */
  readonly camera: THREE.PerspectiveCamera;
  /** Scene sub-groups. B adds to `environment` and `overlay`; C adds to `entities` and `vfx`. */
  readonly layers: {
    readonly environment: THREE.Group;
    readonly entities: THREE.Group;
    readonly vfx: THREE.Group;
    readonly overlay: THREE.Group;
  };
}

/** What the cursor is currently previewing. */
export type PlacementGhost =
  | {
      type: 'tower';
      kind: TowerKind;
      tile: TileCoord;
      valid: boolean;
      /** Range in tiles, for the range ring. */
      range: number;
    }
  | { type: 'rally'; point: Vec2; valid: boolean }
  | { type: 'ability'; id: AbilityId; point: Vec2; radius: number; valid: boolean };

export interface Selection {
  tile: TileCoord;
  range: number;
}

/** Stream B: static world, lighting, camera, post-processing, picking, overlays. */
export interface IEnvironment {
  /** Events are for reactions (camera shake, portal flash/cracks, ability tints). */
  init(host: RendererHost, events: EventBus): void;
  /** Per frame, before drawing. dtReal = real seconds since last frame (for ambient animation). */
  update(snapshot: GameSnapshot, dtReal: number): void;
  /** Draw the frame (owns the post-processing composer; must render host.scene with host.camera). */
  render(dtReal: number): void;
  resize(width: number, height: number): void;
  /** Screen (client) coordinates -> tile under the cursor on the ground plane, or null. */
  pickTile(clientX: number, clientY: number): TileCoord | null;
  /** Screen -> continuous ground point in tile units (may be outside the grid), or null. */
  pickPoint(clientX: number, clientY: number): Vec2 | null;
  setPlacementGhost(ghost: PlacementGhost | null): void;
  setSelection(selection: Selection | null): void;
  /**
   * Map to show while in the title phase (map-select preview). null = use snapshot.mapId.
   * The environment rebuilds itself whenever the effective map changes.
   */
  setMapPreview(mapId: string | null): void;
  /** Title phase: closer 'party lineup' camera pose; off = gameplay pose (blend ~1.2s). */
  setTitleMode(on: boolean): void;
  dispose(): void;
}

export type CreateEnvironment = () => IEnvironment;

/** Stream C: towers, enemies, projectiles as pixel billboards, plus combat VFX. */
export interface IEntities {
  init(host: RendererHost, events: EventBus): void;
  /** Per frame. Sync visuals to the snapshot. dtReal is real seconds (for VFX that should play while paused, prefer snapshot.time). */
  update(snapshot: GameSnapshot, dtReal: number): void;
  dispose(): void;
}

export type CreateEntities = () => IEntities;

/** Facade the UI uses to talk to the renderer (implemented by the lead's Renderer). */
export interface IRendererView {
  pickTile(clientX: number, clientY: number): TileCoord | null;
  pickPoint(clientX: number, clientY: number): Vec2 | null;
  setMapPreview(mapId: string | null): void;
  setTitleMode(on: boolean): void;
  setPlacementGhost(ghost: PlacementGhost | null): void;
  setSelection(selection: Selection | null): void;
  /** Project a gameplay position (plus height in tiles) to client/CSS pixel coordinates. */
  worldToScreen(pos: Vec2, height?: number): { x: number; y: number; visible: boolean };
  readonly canvas: HTMLCanvasElement;
}

// ---------------------------------------------------------------- Stream D

export interface UiContext {
  readonly root: HTMLElement;
  readonly commands: GameCommands;
  readonly events: EventBus;
  readonly view: IRendererView;
  readonly audio: IAudio;
  readonly save: ISaveStore;
  /** Current snapshot at any time (same as passed to update). */
  getSnapshot(): GameSnapshot;
}

export interface IUi {
  init(ctx: UiContext): void;
  /** Per frame (real time). */
  update(snapshot: GameSnapshot, dtReal: number): void;
  dispose(): void;
}

export type CreateUi = () => IUi;

// ---------------------------------------------------------------- Stream E

export type UiSound = 'click' | 'hover' | 'error' | 'buy' | 'open' | 'close';

export interface AudioSettings {
  master: number; // 0..1
  music: number; // 0..1
  sfx: number; // 0..1
  muted: boolean;
}

export interface IAudio {
  /** Subscribes to game events and plays SFX/music automatically. */
  init(events: EventBus, settings: AudioSettings): void;
  /** Call from a user gesture (first click) to unlock WebAudio. Safe to call repeatedly. */
  unlock(): void;
  playUi(sound: UiSound): void;
  getSettings(): AudioSettings;
  setSettings(settings: Partial<AudioSettings>): void;
  dispose(): void;
}

export type CreateAudio = () => IAudio;

export interface UserSettings {
  audio: AudioSettings;
  showDamageNumbers: boolean;
  screenShake: boolean;
  /** Show the one-time 'new enemy' intro card (pauses the game). */
  enemyIntros: boolean;
}

export interface BestRecord {
  /** Campaign stars (0 in endless). */
  stars: Stars;
  score: number;
  /** Highest wave reached. */
  wave: number;
}

export interface ISaveStore {
  getBestStars(mapId: string, difficulty: Difficulty): Stars;
  /** v1 API (campaign stars only). Prefer recordRun. */
  recordResult(mapId: string, difficulty: Difficulty, stars: Stars): boolean;
  getBest(mapId: string, difficulty: Difficulty, mode: GameMode): BestRecord;
  /** Keeps per-field bests. Returns which fields improved. */
  recordRun(
    mapId: string,
    difficulty: Difficulty,
    mode: GameMode,
    run: BestRecord,
  ): { stars: boolean; score: boolean; wave: boolean };
  hasSeenEnemy(kind: EnemyKind): boolean;
  markEnemySeen(kind: EnemyKind): void;
  getSettings(): UserSettings;
  saveSettings(settings: UserSettings): void;
}

export type CreateSaveStore = () => ISaveStore;
