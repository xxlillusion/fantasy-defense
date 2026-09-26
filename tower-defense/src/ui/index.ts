// Stream D entry point: HTML/CSS overlay UI (HUD, tower bar/panel, hero, abilities, wave button, screens).
import '../styles/ui.css';
import type { CommandResult } from '../core/commands';
import type { CreateUi, IUi, UiContext, UiSound } from '../core/interfaces';
import type { AbilityId, EnemyKind, EntityId, GameOptions, GamePhase, GameSnapshot, TowerKind, WaveGroupPreview } from '../core/types';
import { ABILITIES, DIFFICULTIES, getMap, HERO, mapWaves, TOWERS } from '../data';
import { AbilityBar } from './abilityBar';
import { CanvasInput } from './canvasInput';
import { h } from './dom';
import { EnemyTooltip } from './enemyTooltip';
import { FloatingText } from './floatingText';
import { HeroPanel, HeroPortrait } from './hero';
import { Hud } from './hud';
import { installKeyboard } from './input';
import { GameOverScreen, type RunResult } from './screens/gameOver';
import { HelpScreen } from './screens/help';
import { IntroCard } from './screens/intro';
import { PauseScreen } from './screens/pause';
import { SettingsScreen } from './screens/settings';
import { TitleScreen } from './screens/title';
import { inGame, keyLabel, type Overlay, type ToastKind, type Ui, type UiState } from './shared';
import { Toasts } from './toasts';
import { Tooltip } from './tooltip';
import { TowerBar } from './towerBar';
import { TowerPanel } from './towerPanel';
import { WaveButton } from './waveButton';

class OverlayUi implements IUi, Ui {
  ctx!: UiContext;
  state!: UiState;
  tooltip!: Tooltip;

  private layer!: HTMLElement;
  private gameLayer!: HTMLElement;
  private hud!: Hud;
  private bar!: TowerBar;
  private panel!: TowerPanel;
  private wave!: WaveButton;
  private abilities!: AbilityBar;
  private portrait!: HeroPortrait;
  private heroPanel!: HeroPanel;
  private enemyTip!: EnemyTooltip;
  private floating!: FloatingText;
  private toasts!: Toasts;
  private title!: TitleScreen;
  private settingsScreen!: SettingsScreen;
  private pause!: PauseScreen;
  private help!: HelpScreen;
  private intro!: IntroCard;
  private gameOver!: GameOverScreen;
  private canvas!: CanvasInput;

  private disposers: (() => void)[] = [];
  private phase: GamePhase | null = null;
  private run_: RunResult | null = null;
  /** Options of the running game (events fire before the next frame's snapshot, so don't rely on it there). */
  private options: GameOptions | null = null;
  private rejectCount = 0;
  private querying = 0;
  private selKey = '';
  private lastNextWave: readonly WaveGroupPreview[] | null = null;
  private lastLives = -1;
  private warned = { half: false, low: false };
  private lastHover: Element | null = null;
  /** Ability unlock tracking (toast on false → true). null = not yet sampled this game. */
  private unlocked: Map<AbilityId, boolean> | null = null;
  /** Whether the help overlay paused the game (so closing it resumes). */
  private helpPaused = false;
  /** Pause state set by the UI since the last frame (the frame snapshot lags behind commands). */
  private pauseIntent: boolean | null = null;

  init(ctx: UiContext): void {
    this.ctx = ctx;
    this.state = {
      placing: null,
      selected: null,
      heroSelected: false,
      targeting: null,
      overlay: 'none',
      settingsFrom: 'title',
      settings: ctx.save.getSettings(),
      sellArmed: null,
      best: null,
    };

    this.tooltip = new Tooltip();
    this.toasts = new Toasts();
    this.floating = new FloatingText(this);
    this.hud = new Hud(this);
    this.bar = new TowerBar(this, this.tooltip);
    this.panel = new TowerPanel(this);
    this.wave = new WaveButton(this);
    this.abilities = new AbilityBar(this);
    this.portrait = new HeroPortrait(this);
    this.heroPanel = new HeroPanel(this);
    this.enemyTip = new EnemyTooltip((pos, height) => ctx.view.worldToScreen(pos, height));
    this.title = new TitleScreen(this);
    this.settingsScreen = new SettingsScreen(this);
    this.pause = new PauseScreen(this);
    this.help = new HelpScreen(this);
    this.intro = new IntroCard(this);
    this.gameOver = new GameOverScreen(this);
    this.canvas = new CanvasInput(this, this.enemyTip);

    this.gameLayer = h(
      'div.game-ui.is-hidden',
      null,
      this.hud.el,
      h('div.bottom-row', null, h('div.bottom-left', null, this.portrait.el, this.abilities.el), this.bar.el, this.wave.el),
      this.heroPanel.el,
      this.panel.el,
    );
    this.layer = h(
      'div.td-ui',
      null,
      this.floating.el,
      this.gameLayer,
      this.toasts.bannerEl,
      this.toasts.el,
      this.title.el,
      this.gameOver.el,
      this.intro.el,
      this.pause.el,
      this.help.el,
      this.settingsScreen.el,
      this.enemyTip.el,
      this.tooltip.el,
    );
    ctx.root.append(this.layer);

    this.wireEvents();
    this.disposers.push(installKeyboard(this, { panel: this.panel, title: this.title, gameOver: this.gameOver, intro: this.intro }));
    this.disposers.push(() => this.canvas.dispose());

    // audio unlock on first gesture
    const unlock = () => {
      ctx.audio.unlock();
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
    };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    this.disposers.push(unlock);

    // UI buttons shouldn't keep keyboard focus after a mouse click (Space/Enter are game keys).
    const noFocus = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest('button')) e.preventDefault();
    };
    this.layer.addEventListener('mousedown', noFocus);
    // hover sound on enabled buttons
    this.layer.addEventListener('pointerover', (e) => {
      const b = (e.target as Element | null)?.closest('.ui-btn');
      if (b !== this.lastHover) {
        this.lastHover = b ?? null;
        if (b && !(b as HTMLButtonElement).disabled) this.sfx('hover');
      }
    });
  }

  private wireEvents(): void {
    const ev = this.ctx.events;
    const on = this.disposers;
    on.push(
      ev.on('gameStarted', (opts) => {
        const { difficulty, mapId, mode } = opts;
        this.options = { ...opts, modifiers: [...opts.modifiers] };
        this.state.best = this.ctx.save.getBest(mapId, difficulty, mode);
        this.run_ = null;
        this.resetGameState();
        this.hud.reset();
        this.warned = { half: false, low: false };
        this.lastLives = -1;
        this.unlocked = null;
        this.title.leave();
        this.ctx.view.setTitleMode(false);
        this.toasts.banner(getMap(mapId).name, `${DIFFICULTIES[difficulty].name} · ${mode === 'endless' ? 'Endless' : 'Campaign'} · Build your defenses`, 'wave', 2600);
      }),
    );
    on.push(
      ev.on('gameExited', () => {
        this.options = null;
        this.resetGameState();
      }),
    );
    on.push(
      ev.on('gameOver', ({ score, wave }) => {
        this.run_ = { score, wave };
      }),
    );
    on.push(ev.on('enemyDamaged', ({ enemyId, amount, pos, crit }) => this.floating.damage(enemyId, pos, amount, crit)));
    on.push(ev.on('enemyKilled', ({ pos, bounty }) => this.floating.gold(pos, bounty)));
    on.push(ev.on('enemySpawned', ({ enemy }) => this.onEnemySpawned(enemy.kind)));
    on.push(
      ev.on('commandRejected', ({ reason }) => {
        if (this.querying > 0) return;
        this.rejectCount++;
        this.toast(reason, 'error');
        this.sfx('error');
      }),
    );
    on.push(
      ev.on('waveStarted', ({ wave, early, bonus }) => {
        const o = this.options;
        const next = this.lastNextWave;
        const dragon = next?.some((g) => g.enemy === 'dragon');
        const golem = next?.some((g) => g.enemy === 'boss');
        const boss = dragon || golem;
        const campaignLen = !o || o.mode === 'endless' ? null : mapWaves(getMap(o.mapId)).length;
        let sub: string;
        if (dragon) sub = 'The Elder Wyvern takes flight!';
        else if (golem) sub = 'A colossal foe approaches!';
        else if (campaignLen === null) sub = wave > 20 ? 'Endless · the tide keeps rising' : 'Endless';
        else sub = wave === campaignLen ? 'Final wave!' : `${campaignLen - wave} more to go`;
        this.toasts.banner(`Wave ${wave}`, sub, boss ? 'boss' : 'wave');
        if (early && bonus > 0) this.toast(`Early send +${bonus} gold`, 'gold');
      }),
    );
    on.push(
      ev.on('waveCleared', ({ wave, bonus, interest }) => {
        const o = this.options;
        if (o && o.mode === 'campaign' && wave >= mapWaves(getMap(o.mapId)).length) return; // victory screen takes over
        this.toasts.banner('Wave cleared', interest > 0 ? `+${bonus} gold · +${interest} interest` : `+${bonus} gold`, 'clear', 2000);
      }),
    );
    on.push(ev.on('heroLevelUp', ({ level }) => this.toast(`${HERO.name} reached level ${level}!`, 'gold')));
    on.push(
      ev.on('heroDowned', () => {
        const lv = this.ctx.getSnapshot().hero?.level ?? 1;
        const secs = Math.max(1, HERO.respawnBase - HERO.respawnPerLevel * (lv - 1));
        this.toast(`${HERO.name} has fallen! Back in ${secs}s`, 'warn');
      }),
    );
    on.push(ev.on('heroRespawned', () => this.toast(`${HERO.name} rises again`, 'info')));
  }

  private onEnemySpawned(kind: EnemyKind): void {
    if (!this.options) return;
    if (this.state.overlay === 'intro' || this.state.overlay === 'none') {
      const wasShowing = this.intro.showing;
      this.intro.offer(kind);
      if (!wasShowing && this.intro.showing) this.onIntroOpened();
    }
  }

  private onIntroOpened(): void {
    this.cancelPlacing();
    this.cancelTargeting();
    this.syncOverlays();
  }

  private resetGameState(): void {
    this.state.placing = null;
    this.state.selected = null;
    this.state.heroSelected = false;
    this.state.targeting = null;
    this.state.sellArmed = null;
    this.state.overlay = 'none';
    this.helpPaused = false;
    this.intro.reset();
    this.canvas.clearGhost();
    this.enemyTip.hide();
    this.floating.clear();
    this.toasts.clear();
    this.tooltip.hide();
    this.syncOverlays();
  }

  // ---------------------------------------------------------------- Ui services

  snap(): GameSnapshot {
    return this.ctx.getSnapshot();
  }

  sfx(sound: UiSound): void {
    this.ctx.audio.playUi(sound);
  }

  toast(text: string, kind: ToastKind = 'info'): void {
    this.toasts.toast(text, kind);
  }

  run(cmd: () => CommandResult): CommandResult {
    const before = this.rejectCount;
    const r = cmd();
    if (!r.ok && this.rejectCount === before) {
      this.toast(r.reason, 'error');
      this.sfx('error');
    }
    return r;
  }

  query<T>(fn: () => T): T {
    this.querying++;
    try {
      return fn();
    } finally {
      this.querying--;
    }
  }

  startPlacing(kind: TowerKind): void {
    const s = this.snap();
    if (!inGame(s)) return;
    const cost = TOWERS[kind].levels[1].cost;
    if (s.gold < cost) {
      this.sfx('error');
      this.toast(`Not enough gold for ${TOWERS[kind].unitClass} (${cost})`, 'error');
      return;
    }
    this.select(null);
    this.state.heroSelected = false;
    this.state.targeting = null;
    this.state.placing = kind;
    this.sfx('click');
    this.canvas.invalidate();
  }

  cancelPlacing(): void {
    this.state.placing = null;
    this.canvas.clearGhost();
  }

  cancelTargeting(): void {
    if (!this.state.targeting) return;
    this.state.targeting = null;
    this.canvas.clearGhost();
  }

  select(id: EntityId | null): void {
    if (id !== null) {
      this.cancelPlacing();
      this.cancelTargeting();
      this.state.heroSelected = false;
    }
    if (this.state.selected !== id) this.state.sellArmed = null;
    this.state.selected = id;
  }

  selectHero(on: boolean): void {
    const s = this.snap();
    if (on && (!inGame(s) || !s.hero)) return;
    if (on === this.state.heroSelected) return;
    if (on) {
      this.select(null);
      this.cancelPlacing();
      this.cancelTargeting();
      this.sfx('open');
    } else this.sfx('close');
    this.state.heroSelected = on;
    this.canvas.invalidate();
    if (!on) this.canvas.clearGhost();
  }

  useAbility(id: AbilityId): void {
    const s = this.snap();
    if (!inGame(s)) return;
    const def = ABILITIES[id];
    const a = s.abilities.find((x) => x.id === id);
    if (a && !a.unlocked) {
      this.sfx('error');
      this.toast(`${def.name} unlocks at wave ${a.unlockWave}`, 'error');
      return;
    }
    if (def.targeted) {
      if (this.state.targeting === id) {
        this.cancelTargeting();
        this.sfx('close');
        return;
      }
      if (a && a.cooldown > 0) {
        this.sfx('error');
        this.toast(`${def.name} ready in ${Math.ceil(a.cooldown)}s`, 'error');
        return;
      }
      this.select(null);
      this.cancelPlacing();
      this.state.heroSelected = false;
      this.state.targeting = id;
      this.sfx('click');
      this.canvas.invalidate();
      return;
    }
    // Success sound comes from the audio module's abilityCast handler.
    this.run(() => this.ctx.commands.castAbility(id));
  }

  sendWave(): void {
    const s = this.snap();
    if (!inGame(s)) return;
    if (s.phase !== 'build') {
      this.sfx('error');
      this.toast('A wave is already underway', 'error');
      return;
    }
    const r = this.run(() => this.ctx.commands.sendWave());
    if (r.ok) this.sfx('click');
  }

  toggleSpeed(): void {
    const s = this.snap();
    this.ctx.commands.setSpeed(s.speed === 1 ? 2 : 1);
    this.sfx('click');
  }

  togglePause(): void {
    const was = this.isPaused();
    this.setPaused(!was);
    this.sfx(was ? 'close' : 'open');
  }

  isPaused(): boolean {
    return this.pauseIntent ?? this.snap().paused;
  }

  setPaused(p: boolean): void {
    this.pauseIntent = p;
    this.ctx.commands.setPaused(p);
  }

  openPause(): void {
    if (!inGame(this.snap())) return;
    this.setPaused(true);
    this.setOverlay('pause');
    this.pause.reset();
    this.sfx('open');
  }

  openHelp(): void {
    if (this.state.overlay !== 'none') return;
    const s = this.snap();
    this.helpPaused = inGame(s) && !this.isPaused();
    if (this.helpPaused) this.setPaused(true);
    this.setOverlay('help');
    this.sfx('open');
  }

  closeOverlay(): void {
    const o = this.state.overlay;
    if (o === 'settings') {
      this.saveSettings();
      const back = this.state.settingsFrom === 'pause' && inGame(this.snap());
      this.state.overlay = back ? 'pause' : 'none';
      if (back) this.pause.reset();
    } else if (o === 'pause') {
      this.state.overlay = 'none';
      this.setPaused(false);
    } else if (o === 'help') {
      this.state.overlay = 'none';
      if (this.helpPaused && inGame(this.snap())) this.setPaused(false);
      this.helpPaused = false;
    } else if (o === 'intro') {
      this.intro.dismiss();
    }
    this.syncOverlays();
  }

  openSettings(from: 'title' | 'pause'): void {
    this.state.settingsFrom = from;
    this.setOverlay('settings');
    this.settingsScreen.sync();
  }

  saveSettings(): void {
    this.ctx.save.saveSettings(this.state.settings);
  }

  private setOverlay(o: Overlay): void {
    this.state.overlay = o;
    this.tooltip.hide();
    this.enemyTip.hide();
    this.syncOverlays();
  }

  private syncOverlays(): void {
    const o = this.state.overlay;
    this.pause.el.classList.toggle('is-hidden', o !== 'pause');
    this.settingsScreen.el.classList.toggle('is-hidden', o !== 'settings');
    this.help.el.classList.toggle('is-hidden', o !== 'help');
  }

  // ---------------------------------------------------------------- IUi

  update(s: GameSnapshot, dtReal: number): void {
    this.pauseIntent = null;
    if (s.phase !== this.phase) this.onPhase(s);

    if (inGame(s)) {
      if (this.state.heroSelected && !s.hero) this.state.heroSelected = false;
      this.hud.update(s, dtReal);
      this.bar.update(s);
      this.wave.update(s);
      this.abilities.update(s);
      this.portrait.update(s);
      this.heroPanel.update(s);
      this.panel.update(s);
      this.canvas.update(s);
      this.syncSelection(s);
      this.checkLives(s);
      this.checkUnlocks(s);
      if (s.phase === 'build') this.lastNextWave = s.nextWave;
    }
    this.floating.update(dtReal, s.paused || !inGame(s));
  }

  private checkUnlocks(s: GameSnapshot): void {
    const first = this.unlocked === null;
    const map = this.unlocked ?? new Map<AbilityId, boolean>();
    for (const a of s.abilities) {
      const was = map.get(a.id);
      if (!first && was === false && a.unlocked) {
        const d = ABILITIES[a.id];
        this.toast(`${d.name} unlocked! Press ${keyLabel(d.hotkey)}`, 'gold');
        this.abilities.flash(a.id);
      }
      map.set(a.id, a.unlocked);
    }
    this.unlocked = map;
  }

  private onPhase(s: GameSnapshot): void {
    const prev = this.phase;
    this.phase = s.phase;
    this.layer.dataset['phase'] = s.phase;
    const game = inGame(s);
    this.gameLayer.classList.toggle('is-hidden', !game);
    this.title.el.classList.toggle('is-hidden', s.phase !== 'title');
    if (s.phase === 'title') {
      this.title.showMain();
      this.gameOver.hide();
      this.intro.reset();
      if (this.state.overlay === 'pause' || this.state.overlay === 'intro') this.state.overlay = 'none';
      this.ctx.view.setTitleMode(true);
    } else if (prev === 'title' || prev === null) {
      this.ctx.view.setTitleMode(false);
      this.title.leave();
    }
    if (game) this.gameOver.hide();
    if (s.phase === 'victory' || s.phase === 'defeat') {
      this.cancelPlacing();
      this.cancelTargeting();
      this.select(null);
      this.state.heroSelected = false;
      this.ctx.view.setSelection(null);
      this.selKey = '';
      this.intro.reset();
      this.state.overlay = 'none';
      this.tooltip.hide();
      this.enemyTip.hide();
      this.canvas.clearGhost();
      this.gameOver.show(s, this.state.best, this.run_);
      this.sfx('open');
    }
    if (!game && prev !== null) {
      this.canvas.reset();
      this.cancelPlacing();
      this.cancelTargeting();
      this.select(null);
      this.state.heroSelected = false;
      this.syncSelection(s);
    }
    this.syncOverlays();
  }

  private syncSelection(s: GameSnapshot): void {
    const id = this.state.selected;
    const t = id === null ? undefined : s.towers.find((x) => x.id === id);
    if (id !== null && !t) {
      this.state.selected = null;
      this.state.sellArmed = null;
    }
    const key = t ? `${t.id}|${t.tile.col},${t.tile.row}|${t.range}` : '';
    if (key === this.selKey) return;
    this.selKey = key;
    this.ctx.view.setSelection(t ? { tile: t.tile, range: t.range } : null);
  }

  private checkLives(s: GameSnapshot): void {
    if (this.lastLives >= 0 && s.lives < this.lastLives && s.lives > 0) {
      const frac = s.lives / s.maxLives;
      if (!this.warned.low && (frac <= 0.25 || s.lives <= 3)) {
        this.warned.low = true;
        this.warned.half = true;
        this.toasts.banner('Portal light fading!', `Only ${s.lives} ${s.lives === 1 ? 'life' : 'lives'} left`, 'warn', 2400);
        this.sfx('error');
      } else if (!this.warned.half && frac <= 0.5) {
        this.warned.half = true;
        this.toast(`The portal dims... ${s.lives} lives left`, 'warn');
      }
    }
    this.lastLives = s.lives;
  }

  dispose(): void {
    for (const d of this.disposers) d();
    this.disposers = [];
    this.ctx.view.setPlacementGhost(null);
    this.ctx.view.setSelection(null);
    this.ctx.view.setMapPreview(null);
    this.layer.remove();
  }
}

export const createUi: CreateUi = () => new OverlayUi();
