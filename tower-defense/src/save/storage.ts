// Stream E: persistent save store. localStorage-backed with an in-memory fallback.
// Everything is try/catch guarded: a broken/blocked/full localStorage must never crash the game.
//
// v2 format (key 'waterfall-shrine/v2'):
//   { version: 2, runs: { "<mapId>:<difficulty>:<mode>": { stars, score, wave } }, seenEnemies: EnemyKind[], settings }
// On first load without a v2 blob we migrate 'waterfall-shrine/v1' ({ best: { "<mapId>:<difficulty>": stars }, settings })
// and leave the v1 key untouched.
import { DEFAULT_USER_SETTINGS } from '../core/defaults';
import type { AudioSettings, BestRecord, ISaveStore, UserSettings } from '../core/interfaces';
import type { Difficulty, EnemyKind, GameMode, Stars } from '../core/types';
import { ENEMY_KINDS } from '../data';

export const SAVE_KEY = 'waterfall-shrine/v2';
export const SAVE_VERSION = 2;
export const LEGACY_SAVE_KEY_V1 = 'waterfall-shrine/v1';
/** Wave recorded for migrated v1 campaign wins (a v1 win with stars > 0 cleared all 20 waves). */
const MIGRATED_WAVE = 20;

/** Minimal Storage surface we need (window.localStorage satisfies it; tests inject a fake). */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** On-disk format stored under SAVE_KEY. */
export interface SaveData {
  version: 2;
  /** Best records keyed by `${mapId}:${difficulty}:${mode}`. */
  runs: Record<string, BestRecord>;
  seenEnemies: EnemyKind[];
  settings: UserSettings;
}

const clamp01 = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const toStars = (v: unknown): Stars | null => {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  return n >= 0 && n <= 3 ? (n as Stars) : null;
};

/** Non-negative finite number (floored for waves), else 0. */
const toCount = (v: unknown, integer: boolean): number => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return 0;
  return integer ? Math.floor(v) : v;
};

const KNOWN_ENEMIES = new Set<string>(ENEMY_KINDS);
const MODES = new Set<string>(['campaign', 'endless']);
const DIFFICULTIES = new Set<string>(['easy', 'normal', 'hard']);

export function sanitizeAudio(raw: unknown): AudioSettings {
  const d = DEFAULT_USER_SETTINGS.audio;
  const r = isRecord(raw) ? raw : {};
  return {
    master: clamp01(r.master, d.master),
    music: clamp01(r.music, d.music),
    sfx: clamp01(r.sfx, d.sfx),
    muted: typeof r.muted === 'boolean' ? r.muted : d.muted,
  };
}

const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);

/** Merge arbitrary (possibly corrupt) data over the defaults. Never throws. */
export function sanitizeSettings(raw: unknown): UserSettings {
  const r = isRecord(raw) ? raw : {};
  const d = DEFAULT_USER_SETTINGS;
  return {
    audio: sanitizeAudio(r.audio),
    showDamageNumbers: bool(r.showDamageNumbers, d.showDamageNumbers),
    screenShake: bool(r.screenShake, d.screenShake),
    enemyIntros: bool(r.enemyIntros, d.enemyIntros),
  };
}

/** A sanitized record; stars are forced to 0 outside the campaign. */
export function sanitizeRecord(raw: unknown, mode: GameMode): BestRecord {
  const r = isRecord(raw) ? raw : {};
  return {
    stars: mode === 'campaign' ? (toStars(r.stars) ?? 0) : 0,
    score: toCount(r.score, false),
    wave: toCount(r.wave, true),
  };
}

export const runKey = (mapId: string, d: Difficulty, mode: GameMode) => `${mapId}:${d}:${mode}`;

/** Parse `${mapId}:${difficulty}:${mode}` (map ids may not contain ':' by convention; split from the right anyway). */
function parseRunKey(key: string): { mode: GameMode } | null {
  const parts = key.split(':');
  if (parts.length < 3) return null;
  const mode = parts[parts.length - 1];
  const diff = parts[parts.length - 2];
  if (!MODES.has(mode) || !DIFFICULTIES.has(diff) || !parts.slice(0, -2).join(':')) return null;
  return { mode: mode as GameMode };
}

function sanitizeRuns(raw: unknown): Record<string, BestRecord> {
  const out: Record<string, BestRecord> = {};
  if (!isRecord(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    const parsed = parseRunKey(k);
    if (!parsed || !isRecord(v)) continue;
    out[k] = sanitizeRecord(v, parsed.mode);
  }
  return out;
}

function sanitizeSeen(raw: unknown): EnemyKind[] {
  if (!Array.isArray(raw)) return [];
  const out = new Set<EnemyKind>();
  for (const k of raw) if (typeof k === 'string' && KNOWN_ENEMIES.has(k)) out.add(k as EnemyKind);
  return [...out];
}

export function emptyData(): SaveData {
  return { version: SAVE_VERSION, runs: {}, seenEnemies: [], settings: sanitizeSettings(null) };
}

const tryJson = (json: string): unknown => {
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
};

/** Parse a v2 blob. Returns null if absent or unusable (not an object), so the caller may try v1. */
export function parseSaveData(json: string | null): SaveData | null {
  if (json == null) return null;
  const raw = tryJson(json);
  if (!isRecord(raw)) return null;
  return {
    version: SAVE_VERSION,
    runs: sanitizeRuns(raw.runs),
    seenEnemies: sanitizeSeen(raw.seenEnemies),
    settings: sanitizeSettings(raw.settings),
  };
}

/**
 * Migrate a v1 blob: best stars (> 0) become campaign records { stars, score: 0, wave: 20 }; settings carry over.
 * Returns null if there is nothing usable.
 */
export function migrateV1(json: string | null): SaveData | null {
  if (json == null) return null;
  const raw = tryJson(json);
  if (!isRecord(raw)) return null;
  const data = emptyData();
  data.settings = sanitizeSettings(raw.settings);
  if (isRecord(raw.best)) {
    for (const [k, v] of Object.entries(raw.best)) {
      const stars = toStars(v);
      const parts = k.split(':');
      if (!stars || parts.length < 2) continue;
      const diff = parts[parts.length - 1];
      const mapId = parts.slice(0, -1).join(':');
      if (!mapId || !DIFFICULTIES.has(diff)) continue;
      data.runs[runKey(mapId, diff as Difficulty, 'campaign')] = { stars, score: 0, wave: MIGRATED_WAVE };
    }
  }
  return data;
}

/**
 * Internal factory with an injectable storage. `storage === null` means "memory only".
 * If the storage throws at any point, we keep working from the in-memory copy.
 */
export function createSaveStoreWithStorage(storage: KeyValueStorage | null): ISaveStore {
  let backend = storage;
  let data: SaveData = emptyData();
  let migrated = false;
  try {
    if (backend) {
      const v2 = parseSaveData(backend.getItem(SAVE_KEY));
      if (v2) data = v2;
      else {
        // No (usable) v2 yet: migrate v1 if present. The v1 key is left in place.
        const v1 = migrateV1(backend.getItem(LEGACY_SAVE_KEY_V1));
        if (v1) {
          data = v1;
          migrated = true;
        }
      }
    }
  } catch (err) {
    console.warn('[save] storage unavailable, using memory', err);
    backend = null;
    data = emptyData();
  }

  const seen = new Set<EnemyKind>(data.seenEnemies);

  const persist = () => {
    if (!backend) return;
    try {
      data.seenEnemies = [...seen];
      backend.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (err) {
      // Quota / privacy mode: keep the in-memory copy, try again next write.
      console.warn('[save] write failed; keeping in-memory copy', err);
    }
  };
  if (migrated) persist();

  const getRecord = (mapId: string, difficulty: Difficulty, mode: GameMode): BestRecord => {
    const r = data.runs[runKey(mapId, difficulty, mode)];
    return r ? { ...r } : { stars: 0, score: 0, wave: 0 };
  };

  const recordRun: ISaveStore['recordRun'] = (mapId, difficulty, mode, run) => {
    const improved = { stars: false, score: false, wave: false };
    try {
      const next = sanitizeRecord(run, mode);
      const prev = getRecord(mapId, difficulty, mode);
      improved.stars = mode === 'campaign' && next.stars > prev.stars;
      improved.score = next.score > prev.score;
      improved.wave = next.wave > prev.wave;
      if (improved.stars || improved.score || improved.wave) {
        data.runs[runKey(mapId, difficulty, mode)] = {
          stars: Math.max(prev.stars, next.stars) as Stars,
          score: Math.max(prev.score, next.score),
          wave: Math.max(prev.wave, next.wave),
        };
        persist();
      }
    } catch (err) {
      console.warn('[save] recordRun failed', err);
    }
    return improved;
  };

  return {
    getBestStars(mapId, difficulty) {
      return getRecord(mapId, difficulty, 'campaign').stars;
    },
    recordResult(mapId, difficulty, stars) {
      const s = toStars(stars);
      if (s === null) return false;
      return recordRun(mapId, difficulty, 'campaign', { stars: s, score: 0, wave: 0 }).stars;
    },
    getBest(mapId, difficulty, mode) {
      return getRecord(mapId, difficulty, mode);
    },
    recordRun,
    hasSeenEnemy(kind) {
      return seen.has(kind);
    },
    markEnemySeen(kind) {
      if (seen.has(kind) || !KNOWN_ENEMIES.has(kind)) return;
      seen.add(kind);
      persist();
    },
    getSettings() {
      return sanitizeSettings(data.settings);
    },
    saveSettings(settings) {
      data.settings = sanitizeSettings(settings);
      persist();
    },
  };
}

/** Resolve window.localStorage lazily and safely (access itself can throw, e.g. sandboxed iframes). */
export function getBrowserStorage(): KeyValueStorage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const ls = window.localStorage;
    ls.getItem(SAVE_KEY); // throws in some privacy modes
    return ls;
  } catch {
    return null;
  }
}
