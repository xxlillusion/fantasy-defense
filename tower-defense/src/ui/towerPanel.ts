// Selected-tower panel: class + level stars, current stats, next-level blurb, Upgrade / Sell / targeting.
import type { GameSnapshot, TargetMode, TowerSnapshot } from '../core/types';
import { TOWERS, type BaseLevel } from '../data';
import { button, cls, h, setDisabled, TextSlot } from './dom';
import { coinIcon, starSvg, towerIcon } from './icons';
import type { Ui } from './shared';
import { statRows } from './towerInfo';

export const TARGET_MODES: readonly TargetMode[] = ['first', 'last', 'strongest', 'closest'];
const MODE_LABEL: Record<TargetMode, string> = { first: 'First', last: 'Last', strongest: 'Strong', closest: 'Close' };

export class TowerPanel {
  readonly el = h('div.tower-panel.panel.is-hidden', { role: 'dialog', 'aria-label': 'Tower' });
  private key = '';
  private tower: TowerSnapshot | null = null;
  private upBtn: HTMLButtonElement | null = null;
  private sellBtn: HTMLButtonElement | null = null;
  private sellLabel: TextSlot | null = null;
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
    const key = `${t.id}:${t.level}`;
    if (key !== this.key) {
      this.posDirty = true;
      this.key = key;
      this.build(t);
      this.el.classList.remove('is-hidden');
    }
    // per-frame cheap diffs
    if (this.upBtn) setDisabled(this.upBtn, t.upgradeCost === null || s.gold < t.upgradeCost);
    for (const [m, b] of this.modeBtns) cls(b, 'is-active', t.targetMode === m);
    this.refreshSell();
    if (this.posDirty) {
      this.posDirty = false;
      this.position(t);
    }
  }

  private refreshSell(): void {
    const t = this.tower;
    if (!t || !this.sellBtn || !this.sellLabel) return;
    const armed = this.ui.state.sellArmed === t.id;
    cls(this.sellBtn, 'is-armed', armed);
    this.sellLabel.set(armed ? `Confirm +${t.sellValue}` : `Sell +${t.sellValue}`);
  }

  upgrade(): void {
    const t = this.tower;
    if (!t) return;
    if (t.upgradeCost === null) {
      this.ui.sfx('error');
      this.ui.toast('Already at max level', 'error');
      return;
    }
    // Success sound comes from the audio module's towerUpgraded handler.
    this.ui.run(() => this.ui.ctx.commands.upgradeTower(t.id));
  }

  sell(): void {
    const t = this.tower;
    if (!t) return;
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

  private build(t: TowerSnapshot): void {
    const d = TOWERS[t.kind];
    const stars = h('span.level-stars', { 'aria-label': `Level ${t.level} of 3` });
    for (let i = 1; i <= 3; i++) {
      const sp = h('span', { html: starSvg(`star ${i <= t.level ? 'is-on' : ''}`) });
      stars.append(sp.firstElementChild!);
    }
    const next = t.level < 3 ? d.levels[(t.level + 1) as BaseLevel] : null; // TODO(D): L3 -> L4 branch choice

    this.upBtn = button(
      next ? [h('span', null, 'Upgrade'), h('span.cost', null, h('span.cost-icon', { html: coinIcon }), String(t.upgradeCost ?? next.cost))] : 'Max level',
      'act-btn upgrade-btn',
      () => this.upgrade(),
      { title: 'Upgrade (U)' },
    );
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

    this.el.replaceChildren(
      button('×', 'close-btn', () => this.ui.select(null), { 'aria-label': 'Close', title: 'Close (Esc)' }),
      h(
        'div.tp-head',
        null,
        h('span.tp-icon', { html: towerIcon(t.kind) }),
        h('div.tp-title', null, h('div.tp-name', null, d.unitClass), h('div.tp-sub', null, `${d.name} · Lv ${t.level}`, stars)),
      ),
      h('dl.stat-grid', null, ...statRows(t.kind, t.level).flatMap((r) => [h('dt', null, r.label), h('dd', null, r.value)])),
      next ? h('div.tp-next', null, h('span.tp-next-label', null, `Lv ${t.level + 1}: `), next.blurb) : h('div.tp-next.is-max', null, 'Fully upgraded.'),
      h('div.tp-actions', null, this.upBtn, this.sellBtn),
      h('div.tp-mode-label', null, 'Targeting'),
      modes,
      h('div.tp-keys', null, 'U upgrade · S sell · Tab target'),
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
    let y = p.y - r.height / 2;
    const top = 70;
    const bottom = vh - 120;
    y = Math.max(top, Math.min(bottom - r.height, y));
    if (y < top) y = top;
    this.el.style.left = `${Math.round(x)}px`;
    this.el.style.top = `${Math.round(y)}px`;
  }
}
