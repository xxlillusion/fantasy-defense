import { describe, expect, it } from 'vitest';
import { DEFAULT_USER_SETTINGS } from '../../src/core/defaults';
import { createSaveStore } from '../../src/save';
import { createSaveStoreWithStorage, SAVE_KEY, type KeyValueStorage } from '../../src/save/storage';

class FakeStorage implements KeyValueStorage {
  map = new Map<string, string>();
  writes = 0;
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.writes++;
    this.map.set(key, value);
  }
}

class ThrowingStorage implements KeyValueStorage {
  getItem(): string | null {
    throw new Error('SecurityError');
  }
  setItem(): void {
    throw new Error('QuotaExceededError');
  }
}

describe('save store', () => {
  it('starts with defaults and 0 stars', () => {
    const s = createSaveStoreWithStorage(new FakeStorage());
    expect(s.getBestStars('waterfallShrine', 'normal')).toBe(0);
    expect(s.getSettings()).toEqual(DEFAULT_USER_SETTINGS);
  });

  it('recordResult keeps the best and returns true only on strict improvement', () => {
    const st = new FakeStorage();
    const s = createSaveStoreWithStorage(st);
    expect(s.recordResult('m', 'normal', 2)).toBe(true);
    expect(s.recordResult('m', 'normal', 2)).toBe(false);
    expect(s.recordResult('m', 'normal', 1)).toBe(false);
    expect(s.getBestStars('m', 'normal')).toBe(2);
    expect(s.recordResult('m', 'normal', 3)).toBe(true);
    expect(s.getBestStars('m', 'normal')).toBe(3);
    expect(s.getBestStars('m', 'hard')).toBe(0);
    expect(s.recordResult('m', 'easy', 0)).toBe(false);
  });

  it('persists across instances under the versioned key', () => {
    const st = new FakeStorage();
    const a = createSaveStoreWithStorage(st);
    a.recordResult('m', 'hard', 3);
    a.saveSettings({ audio: { master: 0.3, music: 0.1, sfx: 0.9, muted: true }, showDamageNumbers: false, screenShake: true, enemyIntros: true });
    expect(st.map.has(SAVE_KEY)).toBe(true);
    const b = createSaveStoreWithStorage(st);
    expect(b.getBestStars('m', 'hard')).toBe(3);
    expect(b.getSettings()).toEqual({ audio: { master: 0.3, music: 0.1, sfx: 0.9, muted: true }, showDamageNumbers: false, screenShake: true, enemyIntros: true });
  });

  it('clamps volumes and fills missing fields', () => {
    const s = createSaveStoreWithStorage(new FakeStorage());
    s.saveSettings({ audio: { master: 5, music: -1, sfx: Number.NaN, muted: false }, showDamageNumbers: true, screenShake: true, enemyIntros: true });
    const got = s.getSettings();
    expect(got.audio.master).toBe(1);
    expect(got.audio.music).toBe(0);
    expect(got.audio.sfx).toBe(DEFAULT_USER_SETTINGS.audio.sfx);
  });

  it('survives corrupt / wrong-shaped data', () => {
    for (const bad of ['{not json', 'null', '42', '[]', JSON.stringify({ best: 'x', settings: { audio: 'loud', showDamageNumbers: 'yes' } })]) {
      const st = new FakeStorage();
      st.map.set(SAVE_KEY, bad);
      const s = createSaveStoreWithStorage(st);
      expect(s.getSettings()).toEqual(DEFAULT_USER_SETTINGS);
      expect(s.getBestStars('m', 'easy')).toBe(0);
    }
    const st = new FakeStorage();
    st.map.set(SAVE_KEY, JSON.stringify({ best: { 'm:easy': 2, 'm:hard': 9, 'm:normal': 'x' }, settings: { audio: { master: 0.5 } } }));
    const s = createSaveStoreWithStorage(st);
    expect(s.getBestStars('m', 'easy')).toBe(2);
    expect(s.getBestStars('m', 'hard')).toBe(0);
    expect(s.getSettings().audio).toEqual({ ...DEFAULT_USER_SETTINGS.audio, master: 0.5 });
  });

  it('falls back to memory when storage throws', () => {
    const s = createSaveStoreWithStorage(new ThrowingStorage());
    expect(s.recordResult('m', 'normal', 1)).toBe(true);
    expect(s.getBestStars('m', 'normal')).toBe(1);
    s.saveSettings({ ...DEFAULT_USER_SETTINGS, showDamageNumbers: false, screenShake: true, enemyIntros: true });
    expect(s.getSettings().showDamageNumbers).toBe(false);
  });

  it('keeps working when only writes throw', () => {
    const st = new FakeStorage();
    st.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    const s = createSaveStoreWithStorage(st);
    expect(s.recordResult('m', 'normal', 3)).toBe(true);
    expect(s.getBestStars('m', 'normal')).toBe(3);
  });

  it('returned settings are copies', () => {
    const s = createSaveStoreWithStorage(null);
    const got = s.getSettings();
    got.audio.master = 0;
    expect(s.getSettings().audio.master).toBe(DEFAULT_USER_SETTINGS.audio.master);
  });

  it('exported createSaveStore works without window (node)', () => {
    const s = createSaveStore();
    expect(s.recordResult('m', 'easy', 1)).toBe(true);
    expect(s.getBestStars('m', 'easy')).toBe(1);
  });
});
