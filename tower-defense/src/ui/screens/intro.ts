// New-enemy intro card: the first time a kind appears (per save) the game pauses and a card introduces it.
// Queues multiple kinds; only unpauses if it was the one that paused.
import type { EnemyKind } from '../../core/types';
import { ENEMIES } from '../../data';
import { button, h } from '../dom';
import { enemyIcon } from '../icons';
import { traitLines } from '../enemyTooltip';
import type { Ui } from '../shared';

export const ENEMY_TIPS: Record<EnemyKind, string> = {
  grunt: 'Any tower handles these. Archers are a cheap start.',
  runner: 'Fast! Frost towers slow them so your damage can land.',
  brute: 'Heavy armor shrugs off small hits. Snipers ignore armor; Cannons hit hard.',
  swarmling: 'They come in crowds. Cannon splash and Tesla chains shred swarms.',
  flyer: 'Flies over the path. Cannons cannot hit it; use Archers, Frost, Snipers or Tesla.',
  boss: 'Focus everything on it. Snipers ignore its armor, and slows only half work.',
  shaman: 'Heals nearby foes. Kill it first; Snipers and Archers pick it off.',
  shieldbearer: 'The shield soaks 3 hits. Fast Archers or Tesla chains break it; burning ground ignores it.',
  broodmother: 'Bursts into 4 imps when slain. Keep splash damage behind your main killing zone.',
  wraith: 'Build Frost towers or bring Aldric close to reveal it. A Sniper Seer reveals it too.',
  dragon: 'A flying boss with armor. Only anti-air towers can hurt it; Snipers ignore its armor.',
};

export class IntroCard {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private queue: EnemyKind[] = [];
  private queued = new Set<EnemyKind>();
  private current: EnemyKind | null = null;
  /** True when this card paused the game (so it should unpause at the end). */
  private pausedByUs = false;

  constructor(private ui: Ui) {
    this.body = h('div.modal.panel.intro-modal', { role: 'dialog', 'aria-label': 'New enemy' });
    this.el = h('div.screen.modal-screen.intro-screen.is-hidden', null, this.body);
  }

  get showing(): boolean {
    return this.current !== null;
  }

  /** Called on enemySpawned. */
  offer(kind: EnemyKind): void {
    const ui = this.ui;
    if (!ui.state.settings.enemyIntros) return;
    if (this.queued.has(kind) || ui.ctx.save.hasSeenEnemy(kind)) return;
    this.queued.add(kind);
    this.queue.push(kind);
    if (!this.current) this.next();
    else this.render(this.current); // refresh the 'N more' count
  }

  private next(): void {
    const kind = this.queue.shift();
    if (!kind) return this.finish();
    const ui = this.ui;
    if (!this.current) {
      // first card of a batch: pause only if the player hadn't already
      this.pausedByUs = !ui.isPaused();
      if (this.pausedByUs) ui.setPaused(true);
    }
    this.current = kind;
    ui.ctx.save.markEnemySeen(kind);
    this.render(kind);
    ui.state.overlay = 'intro';
    ui.tooltip.hide();
    this.el.classList.remove('is-hidden');
    ui.sfx('open');
  }

  /** "Got it" (Enter). */
  dismiss(): void {
    if (!this.current) return;
    this.ui.ctx.save.markEnemySeen(this.current);
    this.ui.sfx('click');
    this.current = null;
    if (this.queue.length) {
      // keep the paused state; show the next one
      const keep = this.pausedByUs;
      this.next();
      this.pausedByUs = keep;
      return;
    }
    this.finish();
  }

  private finish(): void {
    this.current = null;
    this.el.classList.add('is-hidden');
    if (this.ui.state.overlay === 'intro') this.ui.state.overlay = 'none';
    if (this.pausedByUs) this.ui.setPaused(false);
    this.pausedByUs = false;
  }

  /** New game / exit: drop everything without touching pause. */
  reset(): void {
    this.queue = [];
    this.queued.clear();
    this.current = null;
    this.pausedByUs = false;
    this.el.classList.add('is-hidden');
    if (this.ui.state.overlay === 'intro') this.ui.state.overlay = 'none';
  }

  private render(kind: EnemyKind): void {
    const d = ENEMIES[kind];
    const traits = traitLines(d);
    const more = this.queue.length;
    this.body.className = `modal panel intro-modal${d.boss ? ' is-boss' : ''}`;
    this.body.replaceChildren(
      h('div.result-kicker', null, d.boss ? 'A mighty foe appears' : 'New enemy'),
      h('div.intro-portrait', { html: enemyIcon(kind) }),
      h('h2.intro-name', null, d.name),
      traits.length ? h('div.et-traits.intro-traits', null, ...traits.map((t) => h('span.trait', null, t))) : '',
      h(
        'dl.stat-grid.intro-stats',
        null,
        h('dt', null, 'HP'),
        h('dd', null, String(d.hp)),
        h('dt', null, 'Speed'),
        h('dd', null, d.speed.toFixed(1)),
        h('dt', null, 'Armor'),
        h('dd', null, String(d.armor)),
        h('dt', null, 'Bounty'),
        h('dd', null, String(d.bounty)),
      ),
      h('p.intro-desc', null, d.description),
      h('div.intro-tip', null, h('span.intro-tip-label', null, 'Tip'), ENEMY_TIPS[kind]),
      h('div.modal-actions', null, button(more ? `Got it (${more} more)` : 'Got it', 'menu-btn primary', () => this.dismiss())),
      h('div.modal-hint', null, 'Enter to continue · intros can be turned off in Settings'),
    );
  }
}
