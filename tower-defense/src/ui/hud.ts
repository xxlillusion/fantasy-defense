// Top bar: gold, lives (portal light), wave (X/20 or endless "Wave N" + best), live score, active modifiers,
// speed toggle, pause, controls help.
import type { GameSnapshot, ModifierId } from '../core/types';
import { MODIFIERS } from '../data';
import { button, cls, fmtInt, h, setStyle, show, TextSlot } from './dom';
import { coinIcon, helpGlyph, modifierIcon, pauseGlyph, playGlyph, portalIcon, starSvg, waveIcon } from './icons';
import type { Ui } from './shared';

export function modifierTooltip(id: ModifierId): HTMLElement {
  const m = MODIFIERS[id];
  return h(
    'div.tt',
    null,
    h('div.tt-head', null, h('span.tt-title', null, m.name), h('span.tt-sub', null, `Score ×${m.scoreMultiplier}`)),
    h('p.tt-desc', null, m.description),
  );
}

export class Hud {
  readonly el: HTMLElement;
  private gold: TextSlot;
  private lives: TextSlot;
  private wave: TextSlot;
  private waveBest: TextSlot;
  private waveBestEl: HTMLElement;
  private score: TextSlot;
  private speed: TextSlot;
  private goldBox: HTMLElement;
  private livesBox: HTMLElement;
  private livesFill: HTMLElement;
  private scoreBox: HTMLElement;
  private mods: HTMLElement;
  private speedBtn: HTMLButtonElement;
  private pauseBtn: HTMLButtonElement;
  private pausedTag: HTMLElement;
  private lastGold = -1;
  private lastLives = -1;
  private lastPaused: boolean | null = null;
  private shownScore = 0;
  private modsKey = '';

  constructor(private ui: Ui) {
    const goldVal = h('span.stat-value');
    const livesVal = h('span.stat-value');
    const waveVal = h('span.stat-value');
    const scoreVal = h('span.stat-value');
    const bestVal = h('span');
    this.gold = new TextSlot(goldVal);
    this.lives = new TextSlot(livesVal);
    this.wave = new TextSlot(waveVal);
    this.score = new TextSlot(scoreVal);
    this.waveBest = new TextSlot(bestVal);
    this.livesFill = h('span.lives-fill');
    this.waveBestEl = h('span.wave-best.is-hidden', { title: 'Your best wave on this map and difficulty' }, bestVal);

    this.goldBox = h('div.stat.stat-gold', { title: 'Gold' }, h('span.stat-icon', { html: coinIcon }), goldVal);
    this.livesBox = h(
      'div.stat.stat-lives',
      { title: 'Portal light (lives)' },
      h('span.stat-icon', { html: portalIcon }),
      h('span.stat-stack', null, livesVal, h('span.lives-bar', null, this.livesFill)),
    );
    const waveBox = h(
      'div.stat.stat-wave',
      { title: 'Wave' },
      h('span.stat-icon', { html: waveIcon }),
      h('span.stat-label', null, 'Wave'),
      h('span.stat-stack', null, waveVal, this.waveBestEl),
    );
    this.scoreBox = h('div.stat.stat-score', { title: 'Score' }, h('span.stat-icon', { html: starSvg('star is-on') }), h('span.stat-label', null, 'Score'), scoreVal);
    this.mods = h('div.hud-mods', { 'aria-label': 'Active modifiers' });

    const speedVal = h('span.speed-val');
    this.speed = new TextSlot(speedVal);
    this.speedBtn = button(speedVal, 'hud-btn speed-btn', () => ui.toggleSpeed(), { title: 'Game speed (F)', 'aria-label': 'Toggle speed' });
    this.pauseBtn = button('', 'hud-btn pause-btn', () => ui.openPause(), { title: 'Pause menu (Esc)', 'aria-label': 'Pause' });
    const helpBtn = button(h('span', { html: helpGlyph }), 'hud-btn help-btn', () => ui.openHelp(), { title: 'Controls (?)', 'aria-label': 'Controls' });
    this.pausedTag = h('div.paused-tag.is-hidden', null, 'Paused');

    this.el = h(
      'div.hud',
      null,
      h(
        'div.hud-left',
        null,
        h('div.hud-bar.panel', null, this.goldBox, h('span.hud-sep'), this.livesBox, h('span.hud-sep'), waveBox, h('span.hud-sep'), this.scoreBox),
        this.mods,
      ),
      h('div.hud-controls.panel', null, this.speedBtn, this.pauseBtn, helpBtn),
      this.pausedTag,
    );
  }

  /** Reset the score tween (new game). */
  reset(): void {
    this.shownScore = 0;
    this.lastGold = -1;
    this.lastLives = -1;
  }

  update(s: GameSnapshot, dtReal: number): void {
    this.gold.set(fmtInt(s.gold));
    this.lives.set(`${s.lives}`);
    this.wave.set(s.totalWaves === null ? `${Math.max(s.wave, 0)}` : `${Math.max(s.wave, 0)}/${s.totalWaves}`);
    const best = this.ui.state.best;
    const endless = s.totalWaves === null;
    show(this.waveBestEl, endless && !!best && best.wave > 0);
    if (endless && best && best.wave > 0) {
      const beaten = s.wave > best.wave;
      this.waveBest.set(beaten ? 'New best!' : `Best ${best.wave}`);
      cls(this.waveBestEl, 'is-beaten', beaten);
    }
    this.speed.set(`${s.speed}×`);
    cls(this.speedBtn, 'is-active', s.speed === 2);

    // score: ease toward the live value
    const target = s.score;
    const diff = target - this.shownScore;
    if (Math.abs(diff) < 1 || diff < 0) this.shownScore = target;
    else this.shownScore += diff * Math.min(1, dtReal * 7) + Math.sign(diff) * 0.5;
    if ((diff > 0 && this.shownScore > target) || (diff < 0 && this.shownScore < target)) this.shownScore = target;
    this.score.set(fmtInt(this.shownScore));
    cls(this.scoreBox, 'is-rising', diff >= 1);

    if (this.lastGold >= 0 && s.gold !== this.lastGold) this.flash(this.goldBox, s.gold > this.lastGold ? 'flash-up' : 'flash-down');
    if (this.lastLives >= 0 && s.lives < this.lastLives) this.flash(this.livesBox, 'flash-down');
    this.lastGold = s.gold;
    this.lastLives = s.lives;

    const frac = s.maxLives > 0 ? Math.max(0, Math.min(1, s.lives / s.maxLives)) : 0;
    setStyle(this.livesFill, 'width', `${(frac * 100).toFixed(1)}%`);
    cls(this.livesBox, 'is-low', frac <= 0.3);

    const modsKey = s.modifiers.join(',');
    if (modsKey !== this.modsKey) {
      this.modsKey = modsKey;
      this.buildMods(s.modifiers);
    }

    if (s.paused !== this.lastPaused) {
      this.lastPaused = s.paused;
      this.pauseBtn.innerHTML = s.paused ? playGlyph : pauseGlyph;
      cls(this.pauseBtn, 'is-active', s.paused);
    }
    cls(this.pausedTag, 'is-hidden', !(s.paused && this.ui.state.overlay === 'none'));
  }

  private buildMods(ids: readonly ModifierId[]): void {
    const tip = this.ui.tooltip;
    this.mods.replaceChildren(
      ...ids.map((id) => {
        const chip = h('span.mod-chip', { tabindex: 0, 'aria-label': `${MODIFIERS[id].name}: ${MODIFIERS[id].description}`, html: modifierIcon(id) });
        chip.addEventListener('pointerenter', () => tip.show(chip, modifierTooltip(id)));
        chip.addEventListener('pointerleave', () => tip.hide(chip));
        chip.addEventListener('focus', () => tip.show(chip, modifierTooltip(id)));
        chip.addEventListener('blur', () => tip.hide(chip));
        return chip;
      }),
    );
    show(this.mods, ids.length > 0);
  }

  private flash(el: HTMLElement, name: string): void {
    el.classList.remove('flash-up', 'flash-down');
    void el.offsetWidth; // restart animation
    el.classList.add(name);
  }
}
