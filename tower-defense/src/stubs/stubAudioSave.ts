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
  let settings: UserSettings = structuredClone(DEFAULT_USER_SETTINGS);
  return {
    getBestStars: (mapId: string, d: Difficulty) => best.get(`${mapId}:${d}`) ?? 0,
    recordResult(mapId, d, stars) {
      const key = `${mapId}:${d}`;
      if (stars <= (best.get(key) ?? 0)) return false;
      best.set(key, stars);
      return true;
    },
    getSettings: () => structuredClone(settings),
    saveSettings(s) {
      settings = structuredClone(s);
    },
  };
}
