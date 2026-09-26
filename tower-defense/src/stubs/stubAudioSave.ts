// Lead-owned STUBS. Silent audio and in-memory save. Stream E replaces with src/audio/ and src/save/.
import { DEFAULT_AUDIO_SETTINGS, DEFAULT_USER_SETTINGS } from '../core/defaults';
import type { IAudio, ISaveStore, UserSettings } from '../core/interfaces';
import type { Difficulty, Stars } from '../core/types';

export function createStubAudio(): IAudio {
  let settings = { ...DEFAULT_AUDIO_SETTINGS };
  return {
    init(_events, s) {
      settings = { ...s };
    },
    unlock() {},
    playUi() {},
    getSettings: () => ({ ...settings }),
    setSettings(s) {
      settings = { ...settings, ...s };
    },
    dispose() {},
  };
}

export function createStubSaveStore(): ISaveStore {
  const best = new Map<string, Stars>();
  const seen = new Set<string>();
  let settings: UserSettings = structuredClone(DEFAULT_USER_SETTINGS);
  return {
    getBestStars: (mapId: string, d: Difficulty) => best.get(`${mapId}:${d}`) ?? 0,
    recordResult(mapId, d, stars) {
      const key = `${mapId}:${d}`;
      if (stars <= (best.get(key) ?? 0)) return false;
      best.set(key, stars);
      return true;
    },
    getBest: (mapId, d, mode) => ({ stars: mode === 'campaign' ? (best.get(`${mapId}:${d}`) ?? 0) : 0, score: 0, wave: 0 }),
    recordRun(mapId, d, mode, run) {
      const stars = mode === 'campaign' && run.stars > (best.get(`${mapId}:${d}`) ?? 0);
      if (stars) best.set(`${mapId}:${d}`, run.stars);
      return { stars, score: false, wave: false };
    },
    hasSeenEnemy: (kind) => seen.has(kind),
    markEnemySeen: (kind) => void seen.add(kind),
    getSettings: () => structuredClone(settings),
    saveSettings(s) {
      settings = structuredClone(s);
    },
  };
}
