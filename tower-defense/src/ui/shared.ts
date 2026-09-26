// State and services shared between UI components (implemented in index.ts).
import type { CommandResult } from '../core/commands';
import type { BestRecord, UiContext, UiSound, UserSettings } from '../core/interfaces';
import type { AbilityId, EntityId, GameSnapshot, TowerKind } from '../core/types';
import type { Tooltip } from './tooltip';

export type Overlay = 'none' | 'pause' | 'settings' | 'help' | 'intro';
export type ToastKind = 'info' | 'error' | 'gold' | 'warn';

export interface UiState {
  placing: TowerKind | null;
  /** Selected tower id. Mutually exclusive with heroSelected. */
  selected: EntityId | null;
  /** Hero selected: the canvas shows a rally ghost and left-click sets his rally point. */
  heroSelected: boolean;
  /** Targeted ability being aimed (Meteor), or null. */
  targeting: AbilityId | null;
  overlay: Overlay;
  /** Where the settings screen returns to. */
  settingsFrom: 'title' | 'pause';
  settings: UserSettings;
  /** Id of the tower whose Sell button is armed (second click/press sells). */
  sellArmed: EntityId | null;
  /** Personal bests for the current map/difficulty/mode, read at gameStarted (before this run). */
  best: BestRecord | null;
}

export interface Ui {
  readonly ctx: UiContext;
  readonly state: UiState;
  readonly tooltip: Tooltip;
  snap(): GameSnapshot;
  sfx(sound: UiSound): void;
  toast(text: string, kind?: ToastKind): void;
  /** Run a command; if it fails and the sim didn't already emit commandRejected, show the reason. */
  run(cmd: () => CommandResult): CommandResult;
  /** Run a pure query without surfacing any commandRejected it might emit. */
  query<T>(fn: () => T): T;
  startPlacing(kind: TowerKind): void;
  cancelPlacing(): void;
  select(id: EntityId | null): void;
  selectHero(on: boolean): void;
  /** Q/W/E/R or an ability-bar click: aim (targeted) or cast immediately. */
  useAbility(id: AbilityId): void;
  cancelTargeting(): void;
  sendWave(): void;
  toggleSpeed(): void;
  togglePause(): void;
  /** Pause state including changes the UI made since the last frame snapshot. */
  isPaused(): boolean;
  setPaused(paused: boolean): void;
  openPause(): void;
  openHelp(): void;
  closeOverlay(): void;
  openSettings(from: 'title' | 'pause'): void;
  saveSettings(): void;
}

export const inGame = (s: GameSnapshot): boolean => s.phase === 'build' || s.phase === 'wave';

/** Display key for a letter hotkey. */
export const keyLabel = (k: string): string => k.toUpperCase();
