// Stream E entry point: synthesized SFX + generated music on top of Howler.
// Nothing touches WebAudio until unlock() (user gesture). Every public method is exception-safe:
// if audio is unavailable we silently degrade.
//
// All synthesis runs in a background task queue, time-sliced (~5 ms per slice) so it never causes a
// frame hitch: SFX first (UI sounds first of all), then the music stems of the theme currently wanted,
// then the in-game ambient loop. Music and ambience are rendered lazily per map theme and cached.
import { Howl, Howler } from 'howler';
import { DEFAULT_AUDIO_SETTINGS } from '../core/defaults';
import type { EventBus } from '../core/events';
import type { AudioSettings, CreateAudio, IAudio, UiSound } from '../core/interfaces';
import type { AbilityId, EnemyKind, MapTheme, TowerBranch, TowerKind } from '../core/types';
import { ENEMIES, getMap, towerStats } from '../data';
import { AMBIENT_SR, createAmbientJob } from './ambient';
import { createMusicJob, MUSIC_SR } from './music';
import { PLAY_RULES, SFX_DEFS, SFX_IDS, type SfxId } from './sfxBank';
import { createSoundJob } from './synth';
import { VoiceLimiter } from './voiceLimiter';
import { createWavJob, wavToUrl } from './wav';

const SFX_SR = 44100;
/** Max ms of synthesis per background slice (a single slice may overrun by ~1-3 ms). */
const SLICE_BUDGET_MS = 4;
/** Ambient bed level relative to the sfx volume. */
const AMBIENT_LEVEL = 0.3;

const FIRE_SFX: Record<TowerKind, SfxId> = {
  arrow: 'fire_arrow',
  cannon: 'fire_cannon',
  frost: 'fire_frost',
  sniper: 'fire_sniper',
  tesla: 'fire_tesla',
};

/** L4 branch fire variants. */
const BRANCH_FIRE_SFX: Record<TowerKind, Record<TowerBranch, SfxId>> = {
  arrow: { a: 'fire_volley', b: 'fire_pierce' },
  cannon: { a: 'fire_quake', b: 'fire_mortar' },
  frost: { a: 'fire_abszero', b: 'fire_shatter' },
  sniper: { a: 'fire_assassin', b: 'fire_seer' },
  tesla: { a: 'fire_storm', b: 'fire_overload' },
};

const ABILITY_SFX: Record<AbilityId, SfxId> = {
  meteor: 'meteor_whistle',
  frostNova: 'frost_nova',
  goldRush: 'gold_rush',
  bladeStorm: 'blade_storm',
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
const KILL_RATE: Record<EnemyKind, number> = {
  grunt: 1,
  runner: 1.1,
  brute: 0.75,
  swarmling: 1.35,
  flyer: 1.2,
  boss: 0.6,
  shaman: 1.05,
  shieldbearer: 0.85,
  broodmother: 0.8,
  wraith: 1.25,
  dragon: 0.55,
};

type MusicMode = 'calm' | 'battle' | 'silent';
/** Stem levels per mode (multiplied by the music volume). */
const MODE_LEVELS: Record<MusicMode, { calm: number; battle: number }> = {
  calm: { calm: 1, battle: 0 },
  battle: { calm: 0.8, battle: 0.9 },
  silent: { calm: 0, battle: 0 },
};
/** Crossfade between theme stem sets. */
const THEME_FADE_MS = 1800;

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

/** One theme's music: two sample-aligned looping stems. */
interface ThemeMusic {
  theme: MapTheme;
  calm: Stem;
  battle: Stem;
  loaded: number;
  ready: boolean;
  /** Bumped on every (de)activation so stale delayed stops are ignored. */
  token: number;
}

interface Ambient {
  theme: MapTheme;
  howl: Howl;
  ready: boolean;
  token: number;
}

/** A resumable background job (synthesis / encoding). Lower `prio` runs first; ties run in queue order. */
interface Task {
  key: string;
  prio: number;
  step(budgetMs: number): boolean;
}

/** Background task priorities. */
const PRIO = { urgent: -1, uiSfx: 0, sfx: 1, wantedMusic: 2, ambient: 3, otherMusic: 4 } as const;

/** A playing sound we may need to cut short (e.g. meteor whistle, blade storm). */
interface Held {
  howl: Howl;
  sid: number;
}

const themeOf = (mapId: string): MapTheme => {
  try {
    return getMap(mapId).theme;
  } catch {
    return 'shrine';
  }
};

class AudioEngine implements IAudio {
  private settings: AudioSettings = { ...DEFAULT_AUDIO_SETTINGS };
  private unsubs: (() => void)[] = [];
  private unlocked = false;
  private failed = false;
  private disposed = false;
  private sfx = new Map<SfxId, SfxEntry>();
  private urls: string[] = [];
  private limiter = new VoiceLimiter(6);
  private tasks: Task[] = [];
  private pumping = false;
  private music = new Map<MapTheme, ThemeMusic>();
  private activeMusic: ThemeMusic | null = null;
  /** Theme the music should be playing (title = shrine). */
  private desiredTheme: MapTheme = 'shrine';
  private musicMode: MusicMode = 'calm';
  private ambients = new Map<MapTheme, Ambient>();
  private activeAmbient: Ambient | null = null;
  /** Ambient loop wanted (null on the title screen). */
  private desiredAmbient: MapTheme | null = null;
  private held = new Map<'meteor' | 'bladeStorm', Held>();
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private gestureCleanup: (() => void) | null = null;
  /** Debug counters (see window.__tdAudio in dev). */
  readonly stats = { played: 0, suppressed: 0, byId: {} as Record<string, number>, renderMs: {} as Record<string, number>, maxSliceMs: 0 };

  init(events: EventBus, settings: AudioSettings): void {
    this.settings = this.sanitize(settings);
    this.unsubs.forEach((u) => u());
    this.unsubs = [
      events.on('towerFired', ({ kind, level, branch }) => {
        if (level === 4 && branch) {
          this.play(BRANCH_FIRE_SFX[kind][branch]);
          return;
        }
        const aura = kind === 'frost' && towerStats('frost', level, branch).aura;
        this.play(aura ? 'fire_frost_aura' : FIRE_SFX[kind], { rate: 1 - (level - 1) * 0.03 });
      }),
      events.on('projectileHit', ({ kind, splashRadius }) => this.play(splashRadius > 0 || kind === 'shockwave' ? 'hit_boom' : 'hit')),
      events.on('pierceHit', () => this.play('pierce_tick')),
      events.on('enemyKilled', ({ kind, bounty }) => {
        if (ENEMIES[kind]?.boss) this.play('boss_death', { rate: kind === 'dragon' ? 1.2 : 1 });
        else this.play('kill_pop', { rate: KILL_RATE[kind] ?? 1 });
        if (bounty > 0) this.play('coin');
      }),
      events.on('enemySpawned', ({ enemy }) => {
        if (enemy.kind === 'dragon') this.play('dragon_roar');
        else if (ENEMIES[enemy.kind]?.boss) this.play('boss_roar');
      }),
      events.on('enemyLeaked', () => this.play('leak')),
      // Enemy traits.
      events.on('enemyHealed', () => this.play('heal_chime')),
      events.on('shieldBlocked', () => this.play('shield_clank')),
      events.on('shieldBroken', () => this.play('shield_break')),
      events.on('enemySplit', () => this.play('split_squelch')),
      events.on('enemyRevealed', () => this.play('reveal_shimmer')),
      events.on('enemyExecuted', () => this.play('execute_slash')),
      // Hero.
      events.on('heroAttacked', () => this.play('hero_attack')),
      events.on('heroDamaged', () => this.play('hero_hurt')),
      events.on('heroDowned', () => {
        this.stopHeld('bladeStorm', 150);
        this.play('hero_down');
      }),
      events.on('heroRespawned', () => this.play('hero_respawn')),
      events.on('heroLevelUp', () => this.play('hero_levelup')),
      events.on('heroMoved', () => this.play('hero_move')),
      // Abilities.
      events.on('abilityCast', ({ id }) => {
        const h = this.play(ABILITY_SFX[id]);
        if (h && (id === 'meteor' || id === 'bladeStorm')) this.held.set(id, h);
      }),
      events.on('abilityEnded', ({ id }) => {
        if (id === 'bladeStorm') this.stopHeld('bladeStorm', 200);
      }),
      events.on('meteorImpact', () => {
        this.stopHeld('meteor', 40); // at 2x speed the impact lands before the whistle ends
        this.play('meteor_impact');
      }),
      // Building.
      events.on('towerPlaced', () => this.play('build')),
      events.on('towerUpgraded', () => this.play('upgrade')),
      events.on('towerSold', () => this.play('sell')),
      // Flow + music.
      events.on('waveStarted', () => {
        this.play('horn');
        this.setMusicMode('battle', 2500);
      }),
      events.on('waveCleared', ({ interest }) => {
        this.play('jingle');
        if (interest > 0) this.later(450, () => this.play('coin', { rate: 1.12 }));
        this.setMusicMode('calm', 3000);
      }),
      events.on('gameStarted', ({ mapId }) => {
        const theme = themeOf(mapId);
        this.musicMode = 'calm';
        this.setDesiredTheme(theme);
        this.setDesiredAmbient(theme);
        this.setMusicMode('calm', 1500);
      }),
      events.on('gameOver', ({ result }) => {
        this.stopAllHeld();
        this.setMusicMode('silent', 600);
        this.play(result === 'victory' ? 'sting_victory' : 'sting_defeat');
        this.later(5000, () => {
          if (this.musicMode === 'silent') this.setMusicMode('calm', 4000);
        });
      }),
      events.on('gameExited', () => {
        this.stopAllHeld();
        this.setDesiredAmbient(null);
        this.setDesiredTheme('shrine');
        this.setMusicMode('calm', 1500);
      }),
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
        this.queueSfx();
        this.ensureMusic(this.desiredTheme);
        if (this.desiredAmbient) this.ensureAmbient(this.desiredAmbient);
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
      if (this.activeAmbient) this.activeAmbient.howl.volume(this.ambientVolume());
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
    this.tasks = [];
    try {
      for (const { howl } of this.sfx.values()) howl.unload();
      for (const m of this.music.values()) {
        m.calm.howl.unload();
        m.battle.howl.unload();
      }
      for (const a of this.ambients.values()) a.howl.unload();
      for (const u of this.urls) if (u.startsWith('blob:')) URL.revokeObjectURL(u);
    } catch {
      /* ignore */
    }
    this.sfx.clear();
    this.music.clear();
    this.ambients.clear();
    this.held.clear();
    this.activeMusic = null;
    this.activeAmbient = null;
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

  private makeHowl(wav: ArrayBuffer, loop: boolean, onload?: () => void): Howl {
    const url = wavToUrl(wav);
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

  // ---------------------------------------------------------------- background task queue

  private enqueue(task: Task): void {
    if (this.tasks.some((t) => t.key === task.key)) return;
    this.tasks.push(task);
    this.pump();
  }

  /** Change the priority of a queued task (no-op if it isn't queued). */
  private reprioritize(key: string, prio: number): void {
    const t = this.tasks.find((x) => x.key === key);
    if (t) t.prio = prio;
  }

  /** Index of the next task to run (lowest prio, first queued among equals). */
  private nextTask(): number {
    let best = 0;
    for (let i = 1; i < this.tasks.length; i++) if (this.tasks[i].prio < this.tasks[best].prio) best = i;
    return best;
  }

  private pump(): void {
    if (this.pumping || this.disposed || this.failed) return;
    this.pumping = true;
    const tick = () => {
      if (this.disposed || this.failed) return;
      const start = nowMs();
      let current = 0;
      try {
        while (this.tasks.length && nowMs() - start < SLICE_BUDGET_MS) {
          const i = this.nextTask();
          current = i;
          if (this.tasks[i].step(SLICE_BUDGET_MS - (nowMs() - start))) this.tasks.splice(i, 1);
        }
      } catch (err) {
        const [bad] = this.tasks.splice(current, 1);
        console.warn(`[audio] background task ${bad?.key} failed`, err);
      }
      this.stats.maxSliceMs = Math.max(this.stats.maxSliceMs, nowMs() - start);
      if (this.tasks.length) this.later(0, tick);
      else this.pumping = false;
    };
    this.later(0, tick);
  }

  /** Wrap a PCM render job + WAV encode as one resumable task; `done` receives the WAV bytes. */
  private pcmTask(key: string, prio: number, job: { step(b: number): boolean; readonly result: Float32Array | null }, sr: number, done: (wav: ArrayBuffer, pcm: Float32Array) => void): Task {
    let wav: ReturnType<typeof createWavJob> | null = null;
    let cpu = 0;
    return {
      key,
      prio,
      step: (budget) => {
        const s = nowMs();
        try {
          if (!wav) {
            if (!job.step(budget)) return false;
            wav = createWavJob(job.result!, sr);
            if (nowMs() - s >= budget) return false;
          }
          if (!wav.step(budget - (nowMs() - s))) return false;
          done(wav.result!, job.result!);
          return true;
        } finally {
          cpu += nowMs() - s;
          this.stats.renderMs[key] = Math.round(cpu);
        }
      },
    };
  }

  // ---------------------------------------------------------------- sfx

  /** Queue synthesis of all SFX (UI sounds first). */
  private queueSfx(): void {
    const t0 = nowMs();
    const ids = [...SFX_IDS].sort((a, b) => Number(b.startsWith('ui_')) - Number(a.startsWith('ui_')));
    ids.forEach((id, i) => {
      const def = SFX_DEFS[id];
      const sr = def.sampleRate ?? SFX_SR;
      const prio = id.startsWith('ui_') ? PRIO.uiSfx : PRIO.sfx;
      const task = this.pcmTask(`sfx:${id}`, prio, createSoundJob(def, sr), sr, (wav, pcm) => {
        this.sfx.set(id, { howl: this.makeHowl(wav, false), durationMs: (pcm.length / sr) * 1000 });
        if (i === ids.length - 1) console.info(`[audio] synthesized ${ids.length} sfx in ${(nowMs() - t0).toFixed(0)} ms wall (sliced)`);
      });
      this.enqueue(task);
    });
  }

  /**
   * Play a sound. Returns a handle (for sounds we may cut short) or null if it didn't play
   * (locked, not rendered yet, anti-spam).
   */
  private play(id: SfxId, opts: { rate?: number; volume?: number } = {}): Held | null {
    if (!this.unlocked || this.failed || this.disposed) return null;
    try {
      const entry = this.sfx.get(id);
      if (!entry) {
        // Still synthesizing (first moments after unlock): skip, and render this one next.
        this.reprioritize(`sfx:${id}`, PRIO.urgent);
        this.stats.suppressed++;
        return null;
      }
      const rule = PLAY_RULES[id];
      const now = nowMs();
      const rate = Math.min(4, Math.max(0.25, (opts.rate ?? 1) * (1 + (Math.random() * 2 - 1) * rule.pitchVar)));
      if (!this.limiter.tryStart(id, rule, now, entry.durationMs / rate)) {
        this.stats.suppressed++;
        return null;
      }
      const groupVol = rule.group === 'music' ? this.settings.music : this.settings.sfx;
      const vol = rule.volume * (opts.volume ?? 1) * groupVol * (rule.noDuck ? 1 : this.limiter.duckGain(now));
      if (vol <= 0.001) return null;
      const sid = entry.howl.play();
      entry.howl.volume(vol, sid);
      if (rate !== 1) entry.howl.rate(rate, sid);
      this.stats.played++;
      this.stats.byId[id] = (this.stats.byId[id] ?? 0) + 1;
      return { howl: entry.howl, sid };
    } catch (err) {
      this.fail(err);
      return null;
    }
  }

  private stopHeld(key: 'meteor' | 'bladeStorm', fadeMs: number): void {
    const h = this.held.get(key);
    if (!h) return;
    this.held.delete(key);
    try {
      if (!h.howl.playing(h.sid)) return;
      const v = h.howl.volume(h.sid) as unknown as number;
      h.howl.fade(v, 0, fadeMs, h.sid);
      this.later(fadeMs + 20, () => {
        try {
          h.howl.stop(h.sid);
        } catch {
          /* ignore */
        }
      });
    } catch (err) {
      this.fail(err);
    }
  }

  private stopAllHeld(): void {
    this.stopHeld('meteor', 100);
    this.stopHeld('bladeStorm', 200);
  }

  // ---------------------------------------------------------------- music (per theme)

  private setDesiredTheme(theme: MapTheme): void {
    this.desiredTheme = theme;
    if (!this.unlocked || this.failed) return;
    for (const t of this.tasks) if (t.key.startsWith('music:')) t.prio = t.key === `music:${theme}` ? PRIO.wantedMusic : PRIO.otherMusic;
    this.ensureMusic(theme);
    this.syncMusic();
  }

  /** Render (lazily, once) the stems for a theme. */
  private ensureMusic(theme: MapTheme): void {
    const key = `music:${theme}`;
    if (this.music.has(theme) || this.tasks.some((t) => t.key === key)) return;
    const job = createMusicJob(MUSIC_SR, theme);
    let calmWav: ReturnType<typeof createWavJob> | null = null;
    let battleWav: ReturnType<typeof createWavJob> | null = null;
    const t0 = nowMs();
    let cpu = 0;
    this.enqueue({
      key,
      prio: theme === this.desiredTheme ? PRIO.wantedMusic : PRIO.otherMusic,
      step: (budget) => {
        const s = nowMs();
        try {
          if (!job.step(budget)) return false;
          const r = job.result!;
          calmWav ??= createWavJob(r.calm, r.sampleRate);
          battleWav ??= createWavJob(r.battle, r.sampleRate);
          if (!calmWav.step(budget - (nowMs() - s))) return false;
          if (!battleWav.step(budget - (nowMs() - s))) return false;
          console.info(`[audio] rendered ${theme} music (${(r.calm.length / r.sampleRate).toFixed(1)} s x2 stems): ${Math.round(cpu + nowMs() - s)} ms cpu, ${(nowMs() - t0).toFixed(0)} ms wall`);
          const tm: ThemeMusic = {
            theme,
            calm: { howl: this.makeHowl(calmWav.result!, true, () => this.onStemLoaded(tm)), level: 0 },
            battle: { howl: this.makeHowl(battleWav.result!, true, () => this.onStemLoaded(tm)), level: 0 },
            loaded: 0,
            ready: false,
            token: 0,
          };
          this.music.set(theme, tm);
          return true;
        } finally {
          cpu += nowMs() - s;
          this.stats.renderMs[key] = Math.round(cpu);
        }
      },
    });
  }

  private onStemLoaded(tm: ThemeMusic): void {
    if (++tm.loaded < 2 || this.disposed) return;
    tm.ready = true;
    this.syncMusic();
  }

  /** Switch to the desired theme's stems if they're ready (otherwise keep what's playing). */
  private syncMusic(): void {
    if (this.failed || this.disposed) return;
    const tm = this.music.get(this.desiredTheme);
    if (!tm || !tm.ready || this.activeMusic === tm) return;
    const prev = this.activeMusic;
    this.activeMusic = tm;
    try {
      if (prev) this.fadeOutMusic(prev);
      tm.token++;
      // Restart both stems in the same task so they stay sample-aligned.
      for (const stem of [tm.calm, tm.battle]) {
        stem.howl.stop();
        stem.howl.volume(0);
        stem.level = 0;
      }
      tm.calm.howl.play();
      tm.battle.howl.play();
      this.setMusicMode(this.musicMode, 2500);
    } catch (err) {
      this.fail(err);
    }
  }

  private fadeOutMusic(tm: ThemeMusic): void {
    const token = ++tm.token;
    for (const stem of [tm.calm, tm.battle]) {
      const from = stem.howl.volume() as number;
      stem.level = 0;
      if (from > 0.001) stem.howl.fade(from, 0, THEME_FADE_MS);
    }
    this.later(THEME_FADE_MS + 100, () => {
      if (tm.token !== token || this.activeMusic === tm) return;
      try {
        tm.calm.howl.stop();
        tm.battle.howl.stop();
      } catch {
        /* ignore */
      }
    });
  }

  private setMusicMode(mode: MusicMode, fadeMs: number): void {
    this.musicMode = mode;
    const tm = this.activeMusic;
    if (!tm || this.failed) return;
    const target = MODE_LEVELS[mode];
    const vol = this.settings.music;
    try {
      for (const key of ['calm', 'battle'] as const) {
        const stem = tm[key];
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
    const tm = this.activeMusic;
    if (!tm) return;
    for (const stem of [tm.calm, tm.battle]) stem.howl.volume(stem.level * this.settings.music);
  }

  // ---------------------------------------------------------------- ambient (per theme, in game only)

  private ambientVolume(): number {
    return AMBIENT_LEVEL * this.settings.sfx;
  }

  private setDesiredAmbient(theme: MapTheme | null): void {
    this.desiredAmbient = theme;
    if (!this.unlocked || this.failed) return;
    if (theme) this.ensureAmbient(theme);
    this.syncAmbient();
  }

  private ensureAmbient(theme: MapTheme): void {
    if (this.ambients.has(theme)) return;
    this.enqueue(
      this.pcmTask(`ambient:${theme}`, PRIO.ambient, createAmbientJob(theme, AMBIENT_SR), AMBIENT_SR, (wav) => {
        const amb: Ambient = {
          theme,
          howl: this.makeHowl(wav, true, () => {
            amb.ready = true;
            this.syncAmbient();
          }),
          ready: false,
          token: 0,
        };
        this.ambients.set(theme, amb);
      }),
    );
  }

  private syncAmbient(): void {
    if (this.failed || this.disposed) return;
    const want = this.desiredAmbient ? this.ambients.get(this.desiredAmbient) : undefined;
    const cur = this.activeAmbient;
    if (cur && cur !== want) {
      this.activeAmbient = null;
      const token = ++cur.token;
      try {
        cur.howl.fade(cur.howl.volume() as number, 0, 1200);
      } catch (err) {
        this.fail(err);
      }
      this.later(1300, () => {
        if (cur.token === token && this.activeAmbient !== cur) cur.howl.stop();
      });
    }
    if (!want || !want.ready || this.activeAmbient === want) return;
    this.activeAmbient = want;
    want.token++;
    try {
      want.howl.stop();
      want.howl.volume(0);
      want.howl.play();
      want.howl.fade(0, this.ambientVolume(), 2500);
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
