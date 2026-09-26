import { describe, expect, it } from 'vitest';
import { DEFAULT_USER_SETTINGS } from '../../src/core/defaults';
import type { UserSettings } from '../../src/core/interfaces';
import { createSaveStore } from '../../src/save';
import { createSaveStoreWithStorage, LEGACY_SAVE_KEY_V1, SAVE_KEY, type KeyValueStorage } from '../../src/save/storage';

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

const CUSTOM: UserSettings = {
  audio: { master: 0.3, music: 0.1, sfx: 0.9, muted: true },
  showDamageNumbers: false,
  screenShake: false,
  enemyIntros: false,
};

const ZERO = { stars: 0, score: 0, wave: 0 };

describe('save store: basics', () => {
  it('starts with defaults, zero records and nothing seen', () => {
    const s = createSaveStoreWithStorage(new FakeStorage());
    expect(s.getBestStars('waterfall-shrine', 'normal')).toBe(0);
    expect(s.getBest('waterfall-shrine', 'normal', 'campaign')).toEqual(ZERO);
    expect(s.getBest('waterfall-shrine', 'hard', 'endless')).toEqual(ZERO);
    expect(s.hasSeenEnemy('wraith')).toBe(false);
    expect(s.getSettings()).toEqual(DEFAULT_USER_SETTINGS);
  });

  it('recordResult (v1 API) keeps the best and maps onto the campaign record', () => {
    const s = createSaveStoreWithStorage(new FakeStorage());
    expect(s.recordResult('m', 'normal', 2)).toBe(true);
    expect(s.recordResult('m', 'normal', 2)).toBe(false);
    expect(s.recordResult('m', 'normal', 1)).toBe(false);
    expect(s.getBestStars('m', 'normal')).toBe(2);
    expect(s.getBest('m', 'normal', 'campaign').stars).toBe(2);
    expect(s.getBest('m', 'normal', 'endless').stars).toBe(0);
    expect(s.recordResult('m', 'normal', 3)).toBe(true);
    expect(s.getBestStars('m', 'normal')).toBe(3);
    expect(s.getBestStars('m', 'hard')).toBe(0);
    expect(s.recordResult('m', 'easy', 0)).toBe(false);
  });

  it('persists runs, seen enemies and settings across instances under the v2 key', () => {
    const st = new FakeStorage();
    const a = createSaveStoreWithStorage(st);
    a.recordRun('m', 'hard', 'campaign', { stars: 3, score: 5000, wave: 20 });
    a.recordRun('m', 'hard', 'endless', { stars: 0, score: 9000, wave: 33 });
    a.markEnemySeen('shaman');
    a.markEnemySeen('dragon');
    a.saveSettings(CUSTOM);
    expect(st.map.has(SAVE_KEY)).toBe(true);
    expect(JSON.parse(st.map.get(SAVE_KEY)!).version).toBe(2);
    const b = createSaveStoreWithStorage(st);
    expect(b.getBestStars('m', 'hard')).toBe(3);
    expect(b.getBest('m', 'hard', 'campaign')).toEqual({ stars: 3, score: 5000, wave: 20 });
    expect(b.getBest('m', 'hard', 'endless')).toEqual({ stars: 0, score: 9000, wave: 33 });
    expect(b.hasSeenEnemy('shaman')).toBe(true);
    expect(b.hasSeenEnemy('dragon')).toBe(true);
    expect(b.hasSeenEnemy('wraith')).toBe(false);
    expect(b.getSettings()).toEqual(CUSTOM);
  });
});

describe('save store: recordRun', () => {
  it('keeps per-field maxima and reports exactly which fields improved', () => {
    const st = new FakeStorage();
    const s = createSaveStoreWithStorage(st);
    expect(s.recordRun('m', 'normal', 'campaign', { stars: 1, score: 1000, wave: 12 })).toEqual({ stars: true, score: true, wave: true });
    // Worse on everything: nothing improves, no write.
    const writes = st.writes;
    expect(s.recordRun('m', 'normal', 'campaign', { stars: 0, score: 500, wave: 8 })).toEqual({ stars: false, score: false, wave: false });
    expect(st.writes).toBe(writes);
    // Equal is not an improvement.
    expect(s.recordRun('m', 'normal', 'campaign', { stars: 1, score: 1000, wave: 12 })).toEqual({ stars: false, score: false, wave: false });
    // Only score improves; the others keep their old max.
    expect(s.recordRun('m', 'normal', 'campaign', { stars: 0, score: 1500, wave: 3 })).toEqual({ stars: false, score: true, wave: false });
    expect(s.getBest('m', 'normal', 'campaign')).toEqual({ stars: 1, score: 1500, wave: 12 });
    // Only stars.
    expect(s.recordRun('m', 'normal', 'campaign', { stars: 3, score: 100, wave: 1 })).toEqual({ stars: true, score: false, wave: false });
    // Only wave.
    expect(s.recordRun('m', 'normal', 'campaign', { stars: 0, score: 0, wave: 20 })).toEqual({ stars: false, score: false, wave: true });
    expect(s.getBest('m', 'normal', 'campaign')).toEqual({ stars: 3, score: 1500, wave: 20 });
    // Other difficulty untouched.
    expect(s.getBest('m', 'easy', 'campaign')).toEqual(ZERO);
  });

  it('stars only count in the campaign; modes are separate records', () => {
    const s = createSaveStoreWithStorage(new FakeStorage());
    expect(s.recordRun('m', 'hard', 'endless', { stars: 3, score: 200, wave: 25 })).toEqual({ stars: false, score: true, wave: true });
    expect(s.getBest('m', 'hard', 'endless')).toEqual({ stars: 0, score: 200, wave: 25 });
    expect(s.getBest('m', 'hard', 'campaign')).toEqual(ZERO);
    expect(s.getBestStars('m', 'hard')).toBe(0);
  });

  it('sanitizes garbage run values', () => {
    const s = createSaveStoreWithStorage(new FakeStorage());
    const bad = { stars: 7, score: Number.NaN, wave: -3 } as never;
    expect(s.recordRun('m', 'easy', 'campaign', bad)).toEqual({ stars: false, score: false, wave: false });
    expect(s.recordRun('m', 'easy', 'campaign', { stars: 2, score: 12.5, wave: 7.9 })).toEqual({ stars: true, score: true, wave: true });
    expect(s.getBest('m', 'easy', 'campaign')).toEqual({ stars: 2, score: 12.5, wave: 7 });
  });

  it('returned records are copies', () => {
    const s = createSaveStoreWithStorage(null);
    s.recordRun('m', 'easy', 'campaign', { stars: 1, score: 10, wave: 5 });
    const r = s.getBest('m', 'easy', 'campaign');
    r.score = 999;
    expect(s.getBest('m', 'easy', 'campaign').score).toBe(10);
  });
});

describe('save store: migration from v1', () => {
  const v1Blob = JSON.stringify({
    version: 1,
    best: { 'waterfall-shrine:normal': 2, 'waterfall-shrine:hard': 0, 'waterfall-shrine:easy': 3, 'bad-key': 3, 'x:nightmare': 2, 'y:easy': 'x' },
    settings: { audio: { master: 0.4, music: 0.2, sfx: 0.6, muted: false }, showDamageNumbers: false },
  });

  it('keeps best stars as campaign records (score 0, wave 20) and settings; leaves v1 in place', () => {
    const st = new FakeStorage();
    st.map.set(LEGACY_SAVE_KEY_V1, v1Blob);
    const s = createSaveStoreWithStorage(st);
    expect(s.getBest('waterfall-shrine', 'normal', 'campaign')).toEqual({ stars: 2, score: 0, wave: 20 });
    expect(s.getBest('waterfall-shrine', 'easy', 'campaign')).toEqual({ stars: 3, score: 0, wave: 20 });
    expect(s.getBest('waterfall-shrine', 'hard', 'campaign')).toEqual(ZERO); // 0 stars: no record
    expect(s.getBest('waterfall-shrine', 'normal', 'endless')).toEqual(ZERO);
    expect(s.getBestStars('waterfall-shrine', 'normal')).toBe(2);
    expect(s.getSettings()).toEqual({
      audio: { master: 0.4, music: 0.2, sfx: 0.6, muted: false },
      showDamageNumbers: false,
      screenShake: DEFAULT_USER_SETTINGS.screenShake,
      enemyIntros: DEFAULT_USER_SETTINGS.enemyIntros,
    });
    // v1 untouched; v2 written.
    expect(st.map.get(LEGACY_SAVE_KEY_V1)).toBe(v1Blob);
    const v2 = JSON.parse(st.map.get(SAVE_KEY)!);
    expect(v2.version).toBe(2);
    expect(Object.keys(v2.runs).sort()).toEqual(['waterfall-shrine:easy:campaign', 'waterfall-shrine:normal:campaign']);
    expect(v2.seenEnemies).toEqual([]);
  });

  it('prefers existing v2 data over v1 and does not re-migrate', () => {
    const st = new FakeStorage();
    st.map.set(LEGACY_SAVE_KEY_V1, v1Blob);
    const a = createSaveStoreWithStorage(st);
    a.recordRun('waterfall-shrine', 'normal', 'campaign', { stars: 3, score: 4200, wave: 20 });
    const b = createSaveStoreWithStorage(st);
    expect(b.getBest('waterfall-shrine', 'normal', 'campaign')).toEqual({ stars: 3, score: 4200, wave: 20 });
    // A fresh v2 (e.g. settings only) wins over v1 even if it has no runs.
    const st2 = new FakeStorage();
    st2.map.set(LEGACY_SAVE_KEY_V1, v1Blob);
    st2.map.set(SAVE_KEY, JSON.stringify({ version: 2, runs: {}, seenEnemies: [], settings: {} }));
    expect(createSaveStoreWithStorage(st2).getBestStars('waterfall-shrine', 'normal')).toBe(0);
  });

  it('ignores a corrupt v1 blob', () => {
    const st = new FakeStorage();
    st.map.set(LEGACY_SAVE_KEY_V1, '{broken');
    const s = createSaveStoreWithStorage(st);
    expect(s.getSettings()).toEqual(DEFAULT_USER_SETTINGS);
    expect(s.getBestStars('waterfall-shrine', 'normal')).toBe(0);
  });
});

describe('save store: robustness', () => {
  it('survives corrupt / wrong-shaped v2 data', () => {
    for (const bad of ['{not json', 'null', '42', '[]', '"str"', JSON.stringify({ runs: 'x', seenEnemies: 'grunt', settings: { audio: 'loud', showDamageNumbers: 'yes', screenShake: 1 } })]) {
      const st = new FakeStorage();
      st.map.set(SAVE_KEY, bad);
      const s = createSaveStoreWithStorage(st);
      expect(s.getSettings()).toEqual(DEFAULT_USER_SETTINGS);
      expect(s.getBestStars('m', 'easy')).toBe(0);
      expect(s.getBest('m', 'easy', 'endless')).toEqual(ZERO);
      expect(s.hasSeenEnemy('grunt')).toBe(false);
      // Still writable afterwards.
      s.markEnemySeen('grunt');
      expect(createSaveStoreWithStorage(st).hasSeenEnemy('grunt')).toBe(true);
    }
  });

  it('drops invalid entries but keeps valid ones', () => {
    const st = new FakeStorage();
    st.map.set(
      SAVE_KEY,
      JSON.stringify({
        version: 2,
        runs: {
          'm:easy:campaign': { stars: 2, score: 300, wave: 20 },
          'm:hard:campaign': { stars: 9, score: 'x', wave: -1 },
          'm:easy:endless': { stars: 3, score: 800, wave: 31.7 },
          'm:easy:weird': { stars: 3, score: 1, wave: 1 },
          'no-colons': { stars: 3 },
          'm:normal:campaign': 'nope',
        },
        seenEnemies: ['grunt', 'wraith', 'notAnEnemy', 42, 'grunt'],
        settings: { audio: { master: 0.5 }, screenShake: false },
      }),
    );
    const s = createSaveStoreWithStorage(st);
    expect(s.getBest('m', 'easy', 'campaign')).toEqual({ stars: 2, score: 300, wave: 20 });
    expect(s.getBest('m', 'hard', 'campaign')).toEqual(ZERO);
    expect(s.getBest('m', 'easy', 'endless')).toEqual({ stars: 0, score: 800, wave: 31 });
    expect(s.getBest('m', 'normal', 'campaign')).toEqual(ZERO);
    expect(s.hasSeenEnemy('grunt')).toBe(true);
    expect(s.hasSeenEnemy('wraith')).toBe(true);
    expect(s.getSettings()).toEqual({ ...DEFAULT_USER_SETTINGS, audio: { ...DEFAULT_USER_SETTINGS.audio, master: 0.5 }, screenShake: false });
  });

  it('seen enemies persist across instances and marking twice does not rewrite', () => {
    const st = new FakeStorage();
    const a = createSaveStoreWithStorage(st);
    a.markEnemySeen('broodmother');
    const writes = st.writes;
    a.markEnemySeen('broodmother');
    expect(st.writes).toBe(writes);
    const b = createSaveStoreWithStorage(st);
    expect(b.hasSeenEnemy('broodmother')).toBe(true);
    b.markEnemySeen('wraith');
    const c = createSaveStoreWithStorage(st);
    expect(c.hasSeenEnemy('broodmother') && c.hasSeenEnemy('wraith')).toBe(true);
    expect(c.hasSeenEnemy('shaman')).toBe(false);
  });

  it('sanitizes settings: clamps volumes, fills missing fields, rejects non-booleans', () => {
    const s = createSaveStoreWithStorage(new FakeStorage());
    s.saveSettings({ audio: { master: 5, music: -1, sfx: Number.NaN, muted: false }, showDamageNumbers: true, screenShake: true, enemyIntros: true });
    const got = s.getSettings();
    expect(got.audio.master).toBe(1);
    expect(got.audio.music).toBe(0);
    expect(got.audio.sfx).toBe(DEFAULT_USER_SETTINGS.audio.sfx);
    s.saveSettings({ audio: null, screenShake: 'no', enemyIntros: false } as never);
    expect(s.getSettings()).toEqual({ ...DEFAULT_USER_SETTINGS, enemyIntros: false });
    s.saveSettings({ ...DEFAULT_USER_SETTINGS, screenShake: false, enemyIntros: 0 } as never);
    expect(s.getSettings().screenShake).toBe(false);
    expect(s.getSettings().enemyIntros).toBe(DEFAULT_USER_SETTINGS.enemyIntros);
  });

  it('falls back to memory when storage throws', () => {
    const s = createSaveStoreWithStorage(new ThrowingStorage());
    expect(s.recordResult('m', 'normal', 1)).toBe(true);
    expect(s.getBestStars('m', 'normal')).toBe(1);
    expect(s.recordRun('m', 'normal', 'endless', { stars: 0, score: 10, wave: 22 }).wave).toBe(true);
    s.markEnemySeen('wraith');
    expect(s.hasSeenEnemy('wraith')).toBe(true);
    s.saveSettings({ ...DEFAULT_USER_SETTINGS, showDamageNumbers: false });
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
    s.markEnemySeen('shaman');
    expect(s.hasSeenEnemy('shaman')).toBe(true);
  });

  it('keeps working when only the v1 migration write throws', () => {
    const st = new FakeStorage();
    st.map.set(LEGACY_SAVE_KEY_V1, JSON.stringify({ best: { 'm:easy': 3 } }));
    st.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    const s = createSaveStoreWithStorage(st);
    expect(s.getBestStars('m', 'easy')).toBe(3);
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
