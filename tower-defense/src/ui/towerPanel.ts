// Selected-tower panel: name + 4 level stars, current stats, next level (or the two L4 branch cards at L3),
// Upgrade / Sell / targeting.
import type { GameSnapshot, TargetMode, TowerBranch, TowerSnapshot } from '../core/types';
import { TOWER_BRANCHES, TOWERS, towerDisplayName, type BaseLevel } from '../data';
import { button, cls, h, setDisabled, TextSlot } from './dom';
import { coinIcon, levelStars, towerIcon } from './icons';
import type { Ui } from './shared';
import { statRows } from './towerInfo';

export const TARGET_MODES: readonly TargetMode[] = ['first', 'last', 'strongest', 'closest'];
const MODE_LABEL: Record<TargetMode, string> = { first: 'First', last: 'Last', strongest: 'Strong', closest: 'Close' };
/** Branch hotkeys (1-5 are tower placement). */
export const BRANCH_KEYS: Record<TowerBranch, string> = { a: 'Z', b: 'X' };

export class TowerPanel {
  readonly el = h('div.tower-panel.panel.is-hidden', { role: 'dialog', 'aria-label': 'Tower' });
  private key = '';
  private tower: TowerSnapshot | null = null;
  private upBtn: HTMLButtonElement | null = null;
  private sellBtn: HTMLButtonElement | null = null;
  private sellLabel: TextSlot | null = null;
  private branchBtns = new Map<TowerBranch, HTMLButtonElement>();
  private modeBtns = new Map<TargetMode, HTMLButtonElement>();
  private armTimer = 0;
  private posDirty = true;

  constructor(private ui: Ui) {
    window.addEventListener('resize', () => (this.posDirty = true));
  }

  update(s: GameSnapshot): void {
    const id = this.ui.state.selected;
    const t = id === null ? undefined : s.towers.find((x) => x.id === id);
    if (!t) {
      if (this.tower) {
        this.tower = null;
        this.key = '';
        this.el.classList.add('is-hidden');
      }
      return;
    }
    this.tower = t;
    const key = `${t.id}:${t.level}:${t.branch ?? ''}`;
    if (key !== this.key) {
      this.posDirty = true;
      this.key = key;
      this.build(t);
      this.el.classList.remove('is-hidden');
    }
    // per-frame cheap diffs
    if (this.upBtn) setDisabled(this.upBtn, t.upgradeCost === null || s.gold < t.upgradeCost);
    if (t.branchOptions) {
      for (const [b, btn] of this.branchBtns) cls(btn, 'is-unaffordable', s.gold < t.branchOptions[b].cost);
    }
    for (const [m, b] of this.modeBtns) cls(b, 'is-active', t.targetMode === m);
    this.refreshSell(s);
    if (this.posDirty) {
      this.posDirty = false;
      this.position(t);
    }
  }

  private refreshSell(s: GameSnapshot = this.ui.snap()): void {
    const t = this.tower;
    if (!t || !this.sellBtn || !this.sellLabel) return;
    const noSell = s.modifiers.includes('nosell');
    setDisabled(this.sellBtn, noSell);
    const armed = this.ui.state.sellArmed === t.id;
    cls(this.sellBtn, 'is-armed', armed);
    this.sellLabel.set(noSell ? 'No refunds' : armed ? `Confirm +${t.sellValue}` : `Sell +${t.sellValue}`);
  }

  /** U: upgrade, or at L3 draw attention to the branch cards. */
  upgrade(): void {
    const t = this.tower;
    if (!t) return;
    if (t.level === 3 && t.branchOptions) {
      this.promptBranch();
      return;
    }
    if (t.upgradeCost === null) {
      this.ui.sfx('error');
      this.ui.toast('Already at max level', 'error');
      return;
    }
    // Success sound comes from the audio module's towerUpgraded handler.
    this.ui.run(() => this.ui.ctx.commands.upgradeTower(t.id));
  }

  /** True when the selected tower is waiting on a branch choice. */
  get choosingBranch(): boolean {
    return !!this.tower && this.tower.level === 3 && !!this.tower.branchOptions;
  }

  pickBranch(b: TowerBranch): void {
    const t = this.tower;
    if (!t || !this.choosingBranch) return;
    this.ui.run(() => this.ui.ctx.commands.upgradeTower(t.id, b));
  }

  private promptBranch(): void {
    this.ui.sfx('open');
    for (const btn of this.branchBtns.values()) {
      btn.classList.remove('is-prompt');
      void btn.offsetWidth;
      btn.classList.add('is-prompt');
    }
    this.branchBtns.get('a')?.focus({ preventScroll: true });
    this.ui.toast(`Choose a specialization: ${BRANCH_KEYS.a} or ${BRANCH_KEYS.b}`);
  }

  sell(): void {
    const t = this.tower;
    if (!t) return;
    if (this.ui.snap().modifiers.includes('nosell')) {
      this.ui.sfx('error');
      this.ui.toast('No Refunds: towers cannot be sold', 'error');
      return;
    }
    if (this.ui.state.sellArmed !== t.id) {
      this.ui.state.sellArmed = t.id;
      this.ui.sfx('click');
      window.clearTimeout(this.armTimer);
      this.armTimer = window.setTimeout(() => {
        if (this.ui.state.sellArmed === t.id) this.ui.state.sellArmed = null;
        this.refreshSell();
      }, 3000);
      this.refreshSell();
      return;
    }
    this.ui.state.sellArmed = null;
    const r = this.ui.run(() => this.ui.ctx.commands.sellTower(t.id));
    if (r.ok) this.ui.select(null);
  }

  cycleTarget(): void {
    const t = this.tower;
    if (!t) return;
    const next = TARGET_MODES[(TARGET_MODES.indexOf(t.targetMode) + 1) % TARGET_MODES.length]!;
    this.setMode(next);
  }

  private setMode(m: TargetMode): void {
    const t = this.tower;
    if (!t) return;
    const r = this.ui.run(() => this.ui.ctx.commands.setTargetMode(t.id, m));
    if (r.ok) this.ui.sfx('click');
  }

  private branchCard(t: TowerSnapshot, b: TowerBranch): HTMLButtonElement {
    const opt = t.branchOptions![b];
    const rows = statRows(t.kind, 4, b).filter((r) => r.label !== 'Hits');
    const card = button(
      [
        h('span.bc-key', null, BRANCH_KEYS[b]),
        h('span.bc-name', null, opt.name),
        h('span.bc-cost.cost', null, h('span.cost-icon', { html: coinIcon }), String(opt.cost)),
        h('span.bc-blurb', null, opt.blurb),
        h('dl.bc-stats', null, ...rows.flatMap((r) => [h('dt', null, r.label), h('dd', null, r.value)])),
      ],
      `branch-card branch-${b}`,
      () => this.pickBranch(b),
      { title: `Specialize: ${opt.name} (${BRANCH_KEYS[b]})`, 'aria-label': `${opt.name}, ${opt.cost} gold. ${opt.blurb}` },
    );
    this.branchBtns.set(b, card);
    return card;
  }

  private build(t: TowerSnapshot): void {
    const d = TOWERS[t.kind];
    const stars = h('span.level-stars', { 'aria-label': `Level ${t.level} of 4`, html: levelStars(t.level) });
    const branching = t.level === 3 && !!t.branchOptions;
    const next = t.level < 3 ? d.levels[(t.level + 1) as BaseLevel] : null;
    const name = towerDisplayName(t.kind, t.level, t.branch);
    const sub = t.level === 4 ? `${d.unitClass} · Lv 4` : `${d.name} · Lv ${t.level}`;

    this.branchBtns.clear();
    this.upBtn = null;
    if (!branching) {
      this.upBtn = button(
        next ? [h('span', null, 'Upgrade'), h('span.cost', null, h('span.cost-icon', { html: coinIcon }), String(t.upgradeCost ?? next.cost))] : 'Max level',
        'act-btn upgrade-btn',
        () => this.upgrade(),
        { title: 'Upgrade (U)' },
      );
    }
    const sellText = h('span');
    this.sellLabel = new TextSlot(sellText);
    this.sellBtn = button(sellText, 'act-btn sell-btn', () => this.sell(), { title: 'Sell (S) - click twice to confirm' });

    this.modeBtns.clear();
    const modes = h('div.mode-row', { role: 'group', 'aria-label': 'Targeting' });
    for (const m of TARGET_MODES) {
      const b = button(MODE_LABEL[m], 'mode-btn', () => this.setMode(m), { title: `Target ${m} (Tab cycles)` });
      this.modeBtns.set(m, b);
      modes.append(b);
    }

    let nextEl: HTMLElement;
    if (branching) {
      nextEl = h(
        'div.tp-branch',
        null,
        h('div.tp-branch-label', null, 'Choose a specialization'),
        h('div.branch-cards', null, ...TOWER_BRANCHES.map((b) => this.branchCard(t, b))),
      );
    } else if (next) {
      nextEl = h('div.tp-next', null, h('span.tp-next-label', null, `Lv ${t.level + 1}: `), next.blurb);
    } else if (t.level === 4) {
      const stats = d.branches[t.branch ?? 'a'].stats;
      nextEl = h('div.tp-next.is-max.is-gem', null, h('span.tp-next-label', null, 'Specialized: '), stats.blurb);
    } else {
      nextEl = h('div.tp-next.is-max', null, 'Fully upgraded.');
    }

    cls(this.el, 'is-branching', branching);
    cls(this.el, 'is-l4', t.level === 4);
    this.el.replaceChildren(
      button('×', 'close-btn', () => this.ui.select(null), { 'aria-label': 'Close', title: 'Close (Esc)' }),
      h(
        'div.tp-head',
        null,
        h('span.tp-icon', { html: towerIcon(t.kind) }),
        h('div.tp-title', null, h('div.tp-name', null, name), h('div.tp-sub', null, sub, stars)),
      ),
      h('dl.stat-grid', null, ...statRows(t.kind, t.level, t.branch).flatMap((r) => [h('dt', null, r.label), h('dd', null, r.value)])),
      nextEl,
      h('div.tp-actions', { class: branching ? 'is-single' : '' }, this.upBtn, this.sellBtn),
      h('div.tp-mode-label', null, 'Targeting'),
      modes,
      h('div.tp-keys', null, branching ? `${BRANCH_KEYS.a} / ${BRANCH_KEYS.b} specialize · S sell · Tab target` : 'U upgrade · S sell · Tab target'),
    );
  }

  private position(t: TowerSnapshot): void {
    const p = this.ui.ctx.view.worldToScreen(t.pos, 0.5);
    const r = this.el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 56;
    let x = p.x + gap;
    if (x + r.width > vw - 8) x = p.x - gap - r.width;
    x = Math.max(8, Math.min(vw - r.width - 8, x));
    const top = 70;
    // stay above the bottom bar when there's room; tall panels (branch choice) may overlap it on short screens
    const bottom = r.height <= vh - 120 - top ? vh - 120 : vh - 8;
    let y = p.y - r.height / 2;
    y = Math.max(top, Math.min(bottom - r.height, y));
    if (y < top) y = top;
    this.el.style.left = `${Math.round(x)}px`;
    this.el.style.top = `${Math.round(y)}px`;
  }
}
