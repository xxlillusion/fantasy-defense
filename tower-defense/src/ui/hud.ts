// Top bar: gold, lives (portal light), wave X/20, speed toggle, pause.
import type { GameSnapshot } from '../core/types';
import { button, cls, fmtInt, h, setStyle, TextSlot } from './dom';
import { coinIcon, pauseGlyph, playGlyph, portalIcon, waveIcon } from './icons';
import type { Ui } from './shared';

export class Hud {
  readonly el: HTMLElement;
  private gold: TextSlot;
  private lives: TextSlot;
  private wave: TextSlot;
  private speed: TextSlot;
  private goldBox: HTMLElement;
  private livesBox: HTMLElement;
  private livesFill: HTMLElement;
  private speedBtn: HTMLButtonElement;
  private pauseBtn: HTMLButtonElement;
  private pausedTag: HTMLElement;
  private lastGold = -1;
  private lastLives = -1;
  private lastPaused: boolean | null = null;

  constructor(private ui: Ui) {
    const goldVal = h('span.stat-value');
    const livesVal = h('span.stat-value');
    const waveVal = h('span.stat-value');
    this.gold = new TextSlot(goldVal);
    this.lives = new TextSlot(livesVal);
    this.wave = new TextSlot(waveVal);
    this.livesFill = h('span.lives-fill');

    this.goldBox = h('div.stat.stat-gold', { title: 'Gold' }, h('span.stat-icon', { html: coinIcon }), goldVal);
    this.livesBox = h(
      'div.stat.stat-lives',
      { title: 'Portal light (lives)' },
      h('span.stat-icon', { html: portalIcon }),
      h('span.stat-stack', null, livesVal, h('span.lives-bar', null, this.livesFill)),
    );
    const waveBox = h('div.stat.stat-wave', { title: 'Wave' }, h('span.stat-icon', { html: waveIcon }), h('span.stat-label', null, 'Wave'), waveVal);

    const speedVal = h('span.speed-val');
    this.speed = new TextSlot(speedVal);
    this.speedBtn = button(speedVal, 'hud-btn speed-btn', () => ui.toggleSpeed(), { title: 'Game speed (F)', 'aria-label': 'Toggle speed' });
    this.pauseBtn = button('', 'hud-btn pause-btn', () => ui.openPause(), { title: 'Pause menu (Esc)', 'aria-label': 'Pause' });
    this.pausedTag = h('div.paused-tag.is-hidden', null, 'Paused');

    this.el = h(
      'div.hud',
      null,
      h('div.hud-bar.panel', null, this.goldBox, h('span.hud-sep'), this.livesBox, h('span.hud-sep'), waveBox),
      h('div.hud-controls.panel', null, this.speedBtn, this.pauseBtn),
      this.pausedTag,
    );
  }

  update(s: GameSnapshot): void {
    this.gold.set(fmtInt(s.gold));
    this.lives.set(`${s.lives}`);
    this.wave.set(`${Math.max(s.wave, 0)}/${s.totalWaves}`);
    this.speed.set(`${s.speed}×`);
    cls(this.speedBtn, 'is-active', s.speed === 2);

    if (this.lastGold >= 0 && s.gold !== this.lastGold) this.flash(this.goldBox, s.gold > this.lastGold ? 'flash-up' : 'flash-down');
    if (this.lastLives >= 0 && s.lives < this.lastLives) this.flash(this.livesBox, 'flash-down');
    this.lastGold = s.gold;
    this.lastLives = s.lives;

    const frac = s.maxLives > 0 ? Math.max(0, Math.min(1, s.lives / s.maxLives)) : 0;
    setStyle(this.livesFill, 'width', `${(frac * 100).toFixed(1)}%`);
    cls(this.livesBox, 'is-low', frac <= 0.3);

    if (s.paused !== this.lastPaused) {
      this.lastPaused = s.paused;
      this.pauseBtn.innerHTML = s.paused ? playGlyph : pauseGlyph;
      cls(this.pauseBtn, 'is-active', s.paused);
    }
    cls(this.pausedTag, 'is-hidden', !(s.paused && this.ui.state.overlay === 'none'));
  }

  private flash(el: HTMLElement, name: string): void {
    el.classList.remove('flash-up', 'flash-down');
    void el.offsetWidth; // restart animation
    el.classList.add(name);
  }
}
