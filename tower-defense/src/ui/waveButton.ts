// Send Wave button with the next-wave preview, auto-send countdown and early-send bonus.
import type { GameSnapshot, WaveGroupPreview } from '../core/types';
import { ENEMIES } from '../data';
import { cls, h, setDisabled, TextSlot } from './dom';
import { coinIcon, enemyIcon } from './icons';
import type { Ui } from './shared';

export class WaveButton {
  readonly el: HTMLElement;
  private btn: HTMLButtonElement;
  private title: TextSlot;
  private sub: TextSlot;
  private bonus: TextSlot;
  private bonusEl: HTMLElement;
  private preview: HTMLElement;
  private previewHead: TextSlot;
  private lastWaveRef: readonly WaveGroupPreview[] | null | undefined = undefined;

  constructor(ui: Ui) {
    const titleEl = h('span.wave-title');
    const subEl = h('span.wave-sub');
    const bonusVal = h('span');
    this.title = new TextSlot(titleEl);
    this.sub = new TextSlot(subEl);
    this.bonus = new TextSlot(bonusVal);
    this.bonusEl = h('span.wave-bonus.is-hidden', null, h('span.cost-icon', { html: coinIcon }), bonusVal);
    this.btn = h('button.ui-btn.wave-btn', { type: 'button', title: 'Send the next wave (N / Enter)' }, h('span.wave-main', null, titleEl, subEl), this.bonusEl);
    this.btn.addEventListener('click', (e) => {
      e.stopPropagation();
      ui.sendWave();
    });
    const headEl = h('div.preview-head');
    this.previewHead = new TextSlot(headEl);
    this.preview = h('div.preview-list');
    this.el = h('div.wave-box.panel', null, headEl, this.preview, this.btn);
  }

  update(s: GameSnapshot): void {
    const build = s.phase === 'build';
    const nextNo = s.wave + 1;
    const hasNext = s.nextWave !== null && s.wave < s.totalWaves;
    setDisabled(this.btn, !build || !hasNext);
    cls(this.el, 'is-wave', s.phase === 'wave');

    if (build) {
      this.title.set(hasNext ? `Send Wave ${nextNo}` : 'No more waves');
      this.sub.set(s.buildCountdown !== null ? `Auto in ${Math.ceil(s.buildCountdown)}s` : 'When you are ready');
    } else {
      this.title.set(`Wave ${s.wave} in progress`);
      this.sub.set(`${s.enemies.length} foe${s.enemies.length === 1 ? '' : 's'} on the field`);
    }
    const showBonus = build && s.earlySendBonus > 0;
    cls(this.bonusEl, 'is-hidden', !showBonus);
    if (showBonus) this.bonus.set(`+${s.earlySendBonus}`);
    cls(this.btn, 'is-urgent', build && s.buildCountdown !== null && s.buildCountdown <= 5);

    this.previewHead.set(hasNext ? `Next: Wave ${nextNo}${nextNo === s.totalWaves ? ' (final)' : ''}` : 'Final wave');
    if (s.nextWave !== this.lastWaveRef) {
      this.lastWaveRef = s.nextWave;
      this.buildPreview(s.nextWave);
    }
  }

  private buildPreview(groups: readonly WaveGroupPreview[] | null): void {
    // merge repeated enemy kinds
    const merged = new Map<WaveGroupPreview['enemy'], number>();
    for (const g of groups ?? []) merged.set(g.enemy, (merged.get(g.enemy) ?? 0) + g.count);
    const key = [...merged].map(([k, n]) => `${k}${n}`).join(',');
    if (this.preview.dataset['key'] === key) return;
    this.preview.dataset['key'] = key;
    this.preview.replaceChildren(
      ...[...merged].map(([kind, count]) => {
        const e = ENEMIES[kind];
        return h(
          'span.enemy-chip',
          { class: kind === 'boss' ? 'is-boss' : e.flying ? 'is-flying' : '', title: `${e.name}: ${e.description}` },
          h('span.chip-icon', { html: enemyIcon(kind) }),
          h('span.chip-name', null, e.name),
          h('span.chip-count', null, `×${count}`),
        );
      }),
    );
  }
}
