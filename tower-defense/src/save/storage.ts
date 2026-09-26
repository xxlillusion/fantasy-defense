// Stream E: persistent save store. localStorage-backed with an in-memory fallback.
// Everything is try/catch guarded: a broken/blocked/full localStorage must never crash the game.
import { DEFAULT_USER_SETTINGS } from '../core/defaults';
import type { AudioSettings, ISaveStore, UserSettings } from '../core/interfaces';
import type { Difficulty, Stars } from '../core/types';

export const SAVE_KEY = 'waterfall-shrine/v1';
export const SAVE_VERSION = 1;

/** Minimal Storage surface we need (window.localStorage satisfies it; tests inject a fake). */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** On-disk format stored under SAVE_KEY. */
export interface SaveData {
  version: number;
  /** Best stars keyed by `${mapId}:${difficulty}`. */
  best: Record<string, Stars>;
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

/** Merge arbitrary (possibly corrupt) data over the defaults. Never throws. */
export function sanitizeSettings(raw: unknown): UserSettings {
  const r = isRecord(raw) ? raw : {};
  return {
    audio: sanitizeAudio(r.audio),
    showDamageNumbers: typeof r.showDamageNumbers === 'boolean' ? r.showDamageNumbers : DEFAULT_USER_SETTINGS.showDamageNumbers,
    screenShake: typeof r.screenShake === 'boolean' ? r.screenShake : DEFAULT_USER_SETTINGS.screenShake,
    enemyIntros: typeof r.enemyIntros === 'boolean' ? r.enemyIntros : DEFAULT_USER_SETTINGS.enemyIntros,
  };
}

function sanitizeBest(raw: unknown): Record<string, Stars> {
  const out: Record<string, Stars> = {};
  if (!isRecord(raw)) return out;
  for (const [k, v] of Object.entries(raw)) {
    const s = toStars(v);
    if (s !== null) out[k] = s;
  }
  return out;
}

function emptyData(): SaveData {
  return { version: SAVE_VERSION, best: {}, settings: sanitizeSettings(null) };
}

export function parseSaveData(json: string | null): SaveData {
  if (json == null) return emptyData();
  try {
    const raw: unknown = JSON.parse(json);
    if (!isRecord(raw)) return emptyData();
    return { version: SAVE_VERSION, best: sanitizeBest(raw.best), settings: sanitizeSettings(raw.settings) };
  } catch {
    return emptyData();
  }
}

const keyOf = (mapId: string, d: Difficulty) => `${mapId}:${d}`;

/**
 * Internal factory with an injectable storage. `storage === null` means "memory only".
 * If the storage throws at any point, we keep working from the in-memory copy.
 */
export function createSaveStoreWithStorage(storage: KeyValueStorage | null): ISaveStore {
  let backend = storage;
  let data: SaveData;
  try {
    data = parseSaveData(backend ? backend.getItem(SAVE_KEY) : null);
  } catch (err) {
    console.warn('[save] storage unavailable, using memory', err);
    backend = null;
    data = emptyData();
  }

  const runs = new Map<string, { score: number; wave: number }>();
  const seen = new Set<string>();

  const persist = () => {
    if (!backend) return;
    try {
      backend.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (err) {
      // Quota / privacy mode: keep the in-memory copy, try again next write.
      console.warn('[save] write failed; keeping in-memory copy', err);
    }
  };

  return {
    getBestStars(mapId, difficulty) {
      return data.best[keyOf(mapId, difficulty)] ?? 0;
    },
    recordResult(mapId, difficulty, stars) {
      const s = toStars(stars);
      if (s === null) return false;
      const key = keyOf(mapId, difficulty);
      if (s <= (data.best[key] ?? 0)) return false;
      data.best[key] = s;
      persist();
      return true;
    },
    // TODO(E): v2 save format (runs per mode, enemies seen) with v1 migration. In-memory placeholders:
    getBest(mapId, difficulty, mode) {
      const r = runs.get(`${mapId}:${difficulty}:${mode}`);
      const stars = mode === 'campaign' ? (data.best[keyOf(mapId, difficulty)] ?? 0) : 0;
      return { stars, score: r?.score ?? 0, wave: r?.wave ?? 0 };
    },
    recordRun(mapId, difficulty, mode, run) {
      const key = `${mapId}:${difficulty}:${mode}`;
      const prev = runs.get(key) ?? { score: 0, wave: 0 };
      const improved = { stars: false, score: run.score > prev.score, wave: run.wave > prev.wave };
      runs.set(key, { score: Math.max(prev.score, run.score), wave: Math.max(prev.wave, run.wave) });
      if (mode === 'campaign') {
        const s = toStars(run.stars);
        const bk = keyOf(mapId, difficulty);
        if (s !== null && s > (data.best[bk] ?? 0)) {
          data.best[bk] = s;
          improved.stars = true;
          persist();
        }
      }
      return improved;
    },
    hasSeenEnemy(kind) {
      return seen.has(kind);
    },
    markEnemySeen(kind) {
      seen.add(kind);
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
