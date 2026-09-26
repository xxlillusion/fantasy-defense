// Bottom tower bar: 5 cards (icon, name/class, cost, hotkey), greyed when unaffordable, with stat tooltips.
import type { GameSnapshot, TowerKind } from '../core/types';
import { TOWER_KINDS, TOWERS } from '../data';
import { cls, h } from './dom';
import { coinIcon, towerIcon } from './icons';
import type { Ui } from './shared';
import type { Tooltip } from './tooltip';
import { statRows } from './towerInfo';

export function towerTooltip(kind: TowerKind): HTMLElement {
  const d = TOWERS[kind];
  const l1 = d.levels[1];
  return h(
    'div.tt',
    null,
    h('div.tt-head', null, h('span.tt-title', null, d.unitClass), h('span.tt-sub', null, `${d.name} Tower`)),
    h('p.tt-desc', null, d.description),
    h('dl.stat-grid', null, ...statRows(kind, 1).flatMap((r) => [h('dt', null, r.label), h('dd', null, r.value)])),
    h('p.tt-blurb', null, l1.blurb),
    h('div.tt-foot', null, h('span.cost', null, h('span.cost-icon', { html: coinIcon }), String(l1.cost)), h('span.key-hint', null, `Hotkey ${d.hotkey}`)),
  );
}

export class TowerBar {
  readonly el: HTMLElement;
  private cards = new Map<TowerKind, HTMLButtonElement>();

  constructor(private ui: Ui, tooltip: Tooltip) {
    this.el = h('div.tower-bar.panel');
    for (const kind of TOWER_KINDS) {
      const d = TOWERS[kind];
      const card = h(
        'button.ui-btn.tower-card',
        { type: 'button', 'aria-label': `${d.unitClass} (${d.name}), ${d.levels[1].cost} gold, hotkey ${d.hotkey}` },
        h('span.card-key', null, d.hotkey),
        h('span.card-icon', { html: towerIcon(kind) }),
        h('span.card-name', null, d.unitClass),
        h('span.card-cost', null, h('span.cost-icon', { html: coinIcon }), String(d.levels[1].cost)),
      );
      card.dataset['kind'] = kind;
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.ui.state.placing === kind) this.ui.cancelPlacing();
        else this.ui.startPlacing(kind);
      });
      card.addEventListener('pointerenter', () => tooltip.show(card, towerTooltip(kind)));
      card.addEventListener('pointerleave', () => tooltip.hide(card));
      card.addEventListener('focus', () => tooltip.show(card, towerTooltip(kind)));
      card.addEventListener('blur', () => tooltip.hide(card));
      this.cards.set(kind, card);
      this.el.append(card);
    }
  }

  update(s: GameSnapshot): void {
    for (const [kind, card] of this.cards) {
      cls(card, 'is-unaffordable', s.gold < TOWERS[kind].levels[1].cost);
      cls(card, 'is-active', this.ui.state.placing === kind);
    }
  }
}
