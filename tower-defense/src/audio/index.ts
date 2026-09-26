// Stream E entry point: synthesized SFX + generated music on top of Howler.
// Nothing touches WebAudio until unlock() (user gesture). Every public method is exception-safe:
// if audio is unavailable we silently degrade.
import { Howl, Howler } from 'howler';
import { DEFAULT_AUDIO_SETTINGS } from '../core/defaults';
import type { EventBus } from '../core/events';
import type { AudioSettings, CreateAudio, IAudio, UiSound } from '../core/interfaces';
import type { EnemyKind, TowerKind } from '../core/types';
import { TOWERS } from '../data';
import { createMusicJob, type MusicJob } from './music';
import { PLAY_RULES, SFX_DEFS, SFX_IDS, type SfxId } from './sfxBank';
import { renderSound } from './synth';
import { VoiceLimiter } from './voiceLimiter';
import { encodeWav, wavToUrl } from './wav';

const SFX_SR = 44100;

const FIRE_SFX: Record<TowerKind, SfxId> = {
  arrow: 'fire_arrow',
  cannon: 'fire_cannon',
  frost: 'fire_frost',
  sniper: 'fire_sniper',
  tesla: 'fire_tesla',
};

const UI_SFX: Record<UiSound, SfxId> = {
  click: 'ui_click',
  hover: 'ui_hover',
  error: 'ui_error',
  buy: 'ui_buy',
  open: 'ui_open',
  close: 'ui_close',
};

/** Pitch offset for kill pops by enemy size. */
const KILL_RATE: Record<EnemyKind, number> = { grunt: 1, runner: 1.1, brute: 0.75, swarmling: 1.35, flyer: 1.2, boss: 0.6 };

type MusicMode = 'calm' | 'battle' | 'silent';
/** Stem levels per mode (multiplied by the music volume). */
const MODE_LEVELS: Record<MusicMode, { calm: number; battle: number }> = {
  calm: { calm: 1, battle: 0 },
  battle: { calm: 0.8, battle: 0.9 },
  silent: { calm: 0, battle: 0 },
};

const clamp01 = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : d);
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

interface SfxEntry {
  howl: Howl;
  durationMs: number;
}

interface Stem {
  howl: Howl;
  level: number;
}

class AudioEngine implements IAudio {
  private settings: AudioSettings = { ...DEFAULT_AUDIO_SETTINGS };
  private unsubs: (() => void)[] = [];
  private unlocked = false;
  private failed = false;
  private disposed = false;
  private sfx = new Map<SfxId, SfxEntry>();
  private urls: string[] = [];
  private limiter = new VoiceLimiter(6);
  private musicJob: MusicJob | null = null;
  private stems: { calm: Stem; battle: Stem } | null = null;
  private musicMode: MusicMode = 'calm';
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private gestureCleanup: (() => void) | null = null;
  /** Debug counters (see window.__tdAudio in dev). */
  readonly stats = { played: 0, suppressed: 0 };

  init(events: EventBus, settings: AudioSettings): void {
    this.settings = this.sanitize(settings);
    this.unsubs.forEach((u) => u());
    this.unsubs = [
      events.on('towerFired', ({ kind, level }) => {
        const aura = kind === 'frost' && TOWERS.frost.levels[level].aura;
        this.play(aura ? 'fire_frost_aura' : FIRE_SFX[kind], { rate: 1 - (level - 1) * 0.03 });
      }),
      events.on('projectileHit', ({ kind, splashRadius }) => this.play(splashRadius > 0 || kind === 'shockwave' ? 'hit_boom' : 'hit')),
      events.on('enemyKilled', ({ kind, bounty }) => {
        if (kind === 'boss') this.play('boss_death');
        else this.play('kill_pop', { rate: KILL_RATE[kind] ?? 1 });
        if (bounty > 0) this.play('coin');
      }),
      events.on('enemySpawned', ({ enemy }) => {
        if (enemy.kind === 'boss') this.play('boss_roar');
      }),
      events.on('enemyLeaked', () => this.play('leak')),
      events.on('towerPlaced', () => this.play('build')),
      events.on('towerUpgraded', () => this.play('upgrade')),
      events.on('towerSold', () => this.play('sell')),
      events.on('waveStarted', () => {
        this.play('horn');
        this.setMusicMode('battle', 2500);
      }),
      events.on('waveCleared', () => {
        this.play('jingle');
        this.setMusicMode('calm', 3000);
      }),
      events.on('gameStarted', () => this.setMusicMode('calm', 1500)),
      events.on('gameOver', ({ result }) => {
        this.setMusicMode('silent', 600);
        this.play(result === 'victory' ? 'sting_victory' : 'sting_defeat');
        this.later(5000, () => {
          if (this.musicMode === 'silent') this.setMusicMode('calm', 4000);
        });
      }),
      events.on('gameExited', () => this.setMusicMode('calm', 1500)),
      events.on('commandRejected', () => this.play('ui_error')),
    ];
    this.installGestureFallback();
  }

  unlock(): void {
    if (this.disposed || this.failed) return;
    try {
      if (!this.unlocked) {
        this.unlocked = true;
        this.applyGlobalVolume(); // creates Howler's AudioContext
        if (Howler.noAudio) throw new Error('Howler reports no audio support');
        this.buildSfx();
        this.startMusicRender();
        this.gestureCleanup?.();
        this.gestureCleanup = null;
      }
      const ctx = Howler.ctx as AudioContext | undefined;
      if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    } catch (err) {
      this.fail(err);
    }
  }

  playUi(sound: UiSound): void {
    this.play(UI_SFX[sound]);
  }

  getSettings(): AudioSettings {
    return { ...this.settings };
  }

  setSettings(partial: Partial<AudioSettings>): void {
    this.settings = this.sanitize({ ...this.settings, ...partial });
    if (!this.unlocked || this.failed) return;
    try {
      this.applyGlobalVolume();
      this.applyMusicVolume();
    } catch (err) {
      this.fail(err);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    this.gestureCleanup?.();
    this.timers.forEach((t) => clearTimeout(t));
    this.timers.clear();
    this.musicJob = null;
    try {
      for (const { howl } of this.sfx.values()) howl.unload();
      if (this.stems) {
        this.stems.calm.howl.unload();
        this.stems.battle.howl.unload();
      }
      for (const u of this.urls) if (u.startsWith('blob:')) URL.revokeObjectURL(u);
    } catch {
      /* ignore */
    }
    this.sfx.clear();
    this.stems = null;
    this.urls = [];
  }

  // ------------------------------------------------------------------ internals

  private sanitize(s: Partial<AudioSettings> | undefined): AudioSettings {
    const d = DEFAULT_AUDIO_SETTINGS;
    return {
      master: clamp01(s?.master, d.master),
      music: clamp01(s?.music, d.music),
      sfx: clamp01(s?.sfx, d.sfx),
      muted: typeof s?.muted === 'boolean' ? s.muted : d.muted,
    };
  }

  private fail(err: unknown): void {
    if (!this.failed) console.warn('[audio] disabled (falling back to silence):', err);
    this.failed = true;
  }

  private later(ms: number, fn: () => void): void {
    const t = setTimeout(() => {
      this.timers.delete(t);
      if (!this.disposed) fn();
    }, ms);
    this.timers.add(t);
  }

  /** Unlock on the first pointer/key gesture even if the UI forgets to call unlock(). */
  private installGestureFallback(): void {
    if (this.gestureCleanup || typeof window === 'undefined') return;
    const handler = () => this.unlock();
    const opts: AddEventListenerOptions = { capture: true, passive: true };
    window.addEventListener('pointerdown', handler, opts);
    window.addEventListener('keydown', handler, opts);
    this.gestureCleanup = () => {
      window.removeEventListener('pointerdown', handler, opts);
      window.removeEventListener('keydown', handler, opts);
    };
  }

  private applyGlobalVolume(): void {
    Howler.volume(this.settings.master);
    Howler.mute(this.settings.muted);
  }

  private makeHowl(pcm: Float32Array, sr: number, loop: boolean, onload?: () => void): Howl {
    const url = wavToUrl(encodeWav(pcm, sr));
    this.urls.push(url);
    return new Howl({
      src: [url],
      format: ['wav'],
      loop,
      preload: true,
      onload,
      onloaderror: (_id, e) => {
        if (!this.disposed) console.warn('[audio] load error', e);
      },
      onplayerror: (_id, e) => console.warn('[audio] play error', e),
    });
  }

  private buildOne(id: SfxId): SfxEntry {
    const def = SFX_DEFS[id];
    const sr = def.sampleRate ?? SFX_SR;
    const pcm = renderSound(def, sr);
    const entry = { howl: this.makeHowl(pcm, sr, false), durationMs: (pcm.length / sr) * 1000 };
    this.sfx.set(id, entry);
    return entry;
  }

  /** Synthesize all SFX in small time slices (UI sounds first) so unlock never blocks a frame. */
  private buildSfx(): void {
    const t0 = nowMs();
    const queue = [...SFX_IDS].sort((a, b) => Number(b.startsWith('ui_')) - Number(a.startsWith('ui_')));
    const tick = () => {
      if (this.disposed || this.failed) return;
      const start = nowMs();
      try {
        while (queue.length && nowMs() - start < 10) {
          const id = queue.shift()!;
          if (!this.sfx.has(id)) this.buildOne(id);
        }
      } catch (err) {
        this.fail(err);
        return;
      }
      if (queue.length) this.later(0, tick);
      else console.info(`[audio] synthesized ${SFX_IDS.length} sfx in ${(nowMs() - t0).toFixed(0)} ms (sliced)`);
    };
    tick();
  }

  private startMusicRender(): void {
    const t0 = nowMs();
    const job = createMusicJob();
    this.musicJob = job;
    const tick = () => {
      if (this.disposed || this.musicJob !== job) return;
      try {
        if (!job.step(8)) {
          this.later(0, tick);
          return;
        }
        const r = job.result!;
        console.info(`[audio] rendered music loop (${(r.calm.length / r.sampleRate).toFixed(1)} s x2 stems) in ${(nowMs() - t0).toFixed(0)} ms`);
        let loaded = 0;
        const onload = () => {
          if (++loaded === 2) this.startMusic();
        };
        this.stems = {
          calm: { howl: this.makeHowl(r.calm, r.sampleRate, true, onload), level: 0 },
          battle: { howl: this.makeHowl(r.battle, r.sampleRate, true, onload), level: 0 },
        };
        this.musicJob = null;
      } catch (err) {
        console.warn('[audio] music render failed', err);
      }
    };
    this.later(0, tick);
  }

  private startMusic(): void {
    if (!this.stems || this.disposed) return;
    const { calm, battle } = this.stems;
    try {
      // Start both stems in the same task so they stay sample-aligned.
      calm.howl.volume(0);
      battle.howl.volume(0);
      calm.howl.play();
      battle.howl.play();
      this.setMusicMode(this.musicMode, 2500);
    } catch (err) {
      this.fail(err);
    }
  }

  private setMusicMode(mode: MusicMode, fadeMs: number): void {
    this.musicMode = mode;
    if (!this.stems || this.failed) return;
    const target = MODE_LEVELS[mode];
    const vol = this.settings.music;
    try {
      for (const key of ['calm', 'battle'] as const) {
        const stem = this.stems[key];
        const from = stem.howl.volume() as number;
        stem.level = target[key];
        const to = stem.level * vol;
        if (Math.abs(from - to) > 0.001) stem.howl.fade(from, to, fadeMs);
      }
    } catch (err) {
      this.fail(err);
    }
  }

  private applyMusicVolume(): void {
    if (!this.stems) return;
    for (const stem of [this.stems.calm, this.stems.battle]) stem.howl.volume(stem.level * this.settings.music);
  }

  private play(id: SfxId, opts: { rate?: number; volume?: number } = {}): void {
    if (!this.unlocked || this.failed || this.disposed) return;
    try {
      // Not synthesized yet (first moments after unlock): render just this one now.
      const entry = this.sfx.get(id) ?? this.buildOne(id);
      const rule = PLAY_RULES[id];
      const now = nowMs();
      const rate = Math.min(4, Math.max(0.25, (opts.rate ?? 1) * (1 + (Math.random() * 2 - 1) * rule.pitchVar)));
      if (!this.limiter.tryStart(id, rule, now, entry.durationMs / rate)) {
        this.stats.suppressed++;
        return;
      }
      const groupVol = rule.group === 'music' ? this.settings.music : this.settings.sfx;
      const vol = rule.volume * (opts.volume ?? 1) * groupVol * (rule.noDuck ? 1 : this.limiter.duckGain(now));
      if (vol <= 0.001) return;
      const sid = entry.howl.play();
      entry.howl.volume(vol, sid);
      if (rate !== 1) entry.howl.rate(rate, sid);
      this.stats.played++;
    } catch (err) {
      this.fail(err);
    }
  }
}

export const createAudio: CreateAudio = () => {
  const engine = new AudioEngine();
  if (import.meta.env?.DEV && typeof window !== 'undefined') {
    (window as unknown as { __tdAudio: unknown }).__tdAudio = engine;
  }
  return engine;
};
