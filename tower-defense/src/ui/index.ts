// Stream D entry point: HTML/CSS overlay UI (HUD, tower bar/panel, wave button, screens).
import '../styles/ui.css';
import type { CommandResult } from '../core/commands';
import type { CreateUi, IUi, UiContext, UiSound } from '../core/interfaces';
import type { EntityId, GamePhase, GameSnapshot, Stars, TowerKind, WaveGroupPreview } from '../core/types';
import { DIFFICULTIES, TOWERS } from '../data';
import { h } from './dom';
import { FloatingText } from './floatingText';
import { Hud } from './hud';
import { installKeyboard } from './input';
import { Placement } from './placement';
import { GameOverScreen } from './screens/gameOver';
import { PauseScreen } from './screens/pause';
import { SettingsScreen } from './screens/settings';
import { TitleScreen } from './screens/title';
import { inGame, type ToastKind, type Ui, type UiState } from './shared';
import { Toasts } from './toasts';
import { Tooltip } from './tooltip';
import { TowerBar } from './towerBar';
import { TowerPanel } from './towerPanel';
import { WaveButton } from './waveButton';

class OverlayUi implements IUi, Ui {
  ctx!: UiContext;
  state!: UiState;

  private layer!: HTMLElement;
  private gameLayer!: HTMLElement;
  private hud!: Hud;
  private bar!: TowerBar;
  private panel!: TowerPanel;
  private wave!: WaveButton;
  private floating!: FloatingText;
  private toasts!: Toasts;
  private tooltip!: Tooltip;
  private title!: TitleScreen;
  private settingsScreen!: SettingsScreen;
  private pause!: PauseScreen;
  private gameOver!: GameOverScreen;
  private placement!: Placement;

  private disposers: (() => void)[] = [];
  private phase: GamePhase | null = null;
  private prevBest: Stars = 0;
  private rejectCount = 0;
  private querying = 0;
  private selKey = '';
  private lastNextWave: readonly WaveGroupPreview[] | null = null;
  private lastLives = -1;
  private warned = { half: false, low: false };
  private lastHover: Element | null = null;

  init(ctx: UiContext): void {
    this.ctx = ctx;
    this.state = { placing: null, selected: null, overlay: 'none', settingsFrom: 'title', settings: ctx.save.getSettings(), sellArmed: null };

    this.tooltip = new Tooltip();
    this.toasts = new Toasts();
    this.floating = new FloatingText(this);
    this.hud = new Hud(this);
    this.bar = new TowerBar(this, this.tooltip);
    this.panel = new TowerPanel(this);
    this.wave = new WaveButton(this);
    this.title = new TitleScreen(this);
    this.settingsScreen = new SettingsScreen(this);
    this.pause = new PauseScreen(this);
    this.gameOver = new GameOverScreen(this);
    this.placement = new Placement(this, (fn) => {
      this.querying++;
      try {
        return fn();
      } finally {
        this.querying--;
      }
    });

    this.gameLayer = h(
      'div.game-ui.is-hidden',
      null,
      this.hud.el,
      h('div.bottom-row', null, h('div.bottom-spacer'), this.bar.el, this.wave.el),
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
      this.pause.el,
      this.settingsScreen.el,
      this.tooltip.el,
    );
    ctx.root.append(this.layer);

    this.wireEvents();
    this.disposers.push(installKeyboard(this, this.panel, this.title, this.gameOver));
    this.disposers.push(() => this.placement.dispose());

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
      ev.on('gameStarted', ({ difficulty, mapId }) => {
        this.prevBest = this.ctx.save.getBestStars(mapId, difficulty);
        this.resetGameState();
        this.warned = { half: false, low: false };
        this.lastLives = -1;
        this.toasts.banner('Waterfall Shrine', `${DIFFICULTIES[difficulty].name} · Build your defenses`, 'wave', 2600);
      }),
    );
    on.push(ev.on('gameExited', () => this.resetGameState()));
    on.push(ev.on('enemyDamaged', ({ enemyId, amount, pos, crit }) => this.floating.damage(enemyId, pos, amount, crit)));
    on.push(ev.on('enemyKilled', ({ pos, bounty }) => this.floating.gold(pos, bounty)));
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
        const s = this.ctx.getSnapshot();
        const boss = this.lastNextWave?.some((g) => g.enemy === 'boss');
        const sub = boss ? 'A colossal foe approaches!' : s.totalWaves === null ? 'Endless' : wave === s.totalWaves ? 'Final wave!' : `${s.totalWaves - wave} more to go`;
        this.toasts.banner(`Wave ${wave}`, sub, boss ? 'boss' : 'wave');
        if (early && bonus > 0) this.toast(`Early send +${bonus} gold`, 'gold');
      }),
    );
    on.push(
      ev.on('waveCleared', ({ wave, bonus }) => {
        const s = this.ctx.getSnapshot();
        if (s.totalWaves !== null && wave >= s.totalWaves) return; // victory screen takes over
        this.toasts.banner('Wave cleared', `+${bonus} gold`, 'clear', 1800);
      }),
    );
  }

  private resetGameState(): void {
    this.state.placing = null;
    this.state.selected = null;
    this.state.sellArmed = null;
    this.state.overlay = 'none';
    this.placement.clearGhost();
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
    this.state.placing = kind;
    this.sfx('click');
    this.placement.invalidate();
  }

  cancelPlacing(): void {
    this.state.placing = null;
    this.placement.clearGhost();
  }

  select(id: EntityId | null): void {
    if (id !== null) this.cancelPlacing();
    if (this.state.selected !== id) this.state.sellArmed = null;
    this.state.selected = id;
  }

  sendWave(): void {
    const s = this.snap();
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
    const s = this.snap();
    this.ctx.commands.setPaused(!s.paused);
    this.sfx(s.paused ? 'close' : 'open');
  }

  openPause(): void {
    if (!inGame(this.snap())) return;
    this.ctx.commands.setPaused(true);
    this.state.overlay = 'pause';
    this.tooltip.hide();
    this.pause.reset();
    this.sfx('open');
    this.syncOverlays();
  }

  closeOverlay(): void {
    if (this.state.overlay === 'settings') {
      this.saveSettings();
      this.state.overlay = this.state.settingsFrom === 'pause' && inGame(this.snap()) ? 'pause' : 'none';
      if (this.state.overlay === 'pause') this.pause.reset();
    } else if (this.state.overlay === 'pause') {
      this.state.overlay = 'none';
      this.ctx.commands.setPaused(false);
    }
    this.syncOverlays();
  }

  openSettings(from: 'title' | 'pause'): void {
    this.state.settingsFrom = from;
    this.state.overlay = 'settings';
    this.settingsScreen.sync();
    this.syncOverlays();
  }

  saveSettings(): void {
    this.ctx.save.saveSettings(this.state.settings);
  }

  private syncOverlays(): void {
    const o = this.state.overlay;
    this.pause.el.classList.toggle('is-hidden', o !== 'pause');
    this.settingsScreen.el.classList.toggle('is-hidden', o !== 'settings');
  }

  // ---------------------------------------------------------------- IUi

  update(s: GameSnapshot, dtReal: number): void {
    if (s.phase !== this.phase) this.onPhase(s);

    if (inGame(s)) {
      this.hud.update(s);
      this.bar.update(s);
      this.wave.update(s);
      this.panel.update(s);
      this.placement.update(s);
      this.syncSelection(s);
      this.checkLives(s);
      if (s.phase === 'build') this.lastNextWave = s.nextWave;
    }
    this.floating.update(dtReal, s.paused || !inGame(s));
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
      if (this.state.overlay === 'pause') this.state.overlay = 'none';
    }
    if (game) this.gameOver.hide();
    if (s.phase === 'victory' || s.phase === 'defeat') {
      this.cancelPlacing();
      this.select(null);
      this.ctx.view.setSelection(null);
      this.selKey = '';
      this.state.overlay = 'none';
      this.tooltip.hide();
      this.gameOver.show(s, this.prevBest);
      this.sfx('open');
    }
    if (!game && prev !== null) {
      this.cancelPlacing();
      this.select(null);
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
    this.layer.remove();
  }
}

export const createUi: CreateUi = () => new OverlayUi();
