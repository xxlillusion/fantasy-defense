// Ability bar: Q Meteor, W Frost Nova, E Gold Rush, R Blade Storm. Pixel icons, radial cooldown sweep,
// locked badge ("Wave 3"), active glow and tooltips.
import type { AbilityId, AbilitySnapshot, GameSnapshot } from '../core/types';
import { ABILITIES, ABILITY_IDS } from '../data';
import { cls, h, setStyle, show, TextSlot } from './dom';
import { abilityIcon } from './icons';
import { keyLabel, type Ui } from './shared';

interface Slot {
  btn: HTMLButtonElement;
  cdText: TextSlot;
  cdEl: HTMLElement;
  badge: TextSlot;
  badgeEl: HTMLElement;
  lastFrac: string;
}

export function abilityTooltip(id: AbilityId, a: AbilitySnapshot | undefined, heroDown: boolean): HTMLElement {
  const d = ABILITIES[id];
  const status = !a
    ? ''
    : !a.unlocked
      ? `Unlocks at wave ${a.unlockWave}`
      : id === 'bladeStorm' && heroDown
        ? 'Aldric is down'
        : a.activeRemaining > 0
          ? `Active: ${Math.ceil(a.activeRemaining)}s`
          : a.cooldown > 0
            ? `Ready in ${Math.ceil(a.cooldown)}s`
            : 'Ready';
  return h(
    'div.tt',
    null,
    h('div.tt-head', null, h('span.tt-title', null, d.name), h('span.tt-sub', null, id === 'bladeStorm' ? 'Hero skill' : 'Spell')),
    h('p.tt-desc', null, d.description),
    d.targeted ? h('p.tt-blurb', null, 'Click the map to aim. Right-click or Esc cancels.') : '',
    status ? h('div.tt-status', null, status) : '',
    h('div.tt-foot', null, h('span', null, `Cooldown ${d.cooldown}s`), h('span.key-hint', null, `Hotkey ${keyLabel(d.hotkey)}`)),
  );
}

export class AbilityBar {
  readonly el: HTMLElement;
  private slots = new Map<AbilityId, Slot>();
  private hovered: AbilityId | null = null;
  private tipKey = '';
  private flashUntil = new Map<AbilityId, number>();

  constructor(private ui: Ui) {
    this.el = h('div.ability-bar.panel', { role: 'group', 'aria-label': 'Abilities' });
    for (const id of ABILITY_IDS) {
      const d = ABILITIES[id];
      const cdEl = h('span.ab-cd');
      const badgeEl = h('span.ab-badge.is-hidden');
      const btn = h(
        'button.ui-btn.ab-slot',
        { type: 'button', 'aria-label': `${d.name}, hotkey ${keyLabel(d.hotkey)}` },
        h('span.ab-icon', { html: abilityIcon(id) }),
        h('span.ab-sweep'),
        cdEl,
        h('span.card-key', null, keyLabel(d.hotkey)),
        badgeEl,
      );
      btn.dataset['ability'] = id;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        ui.useAbility(id);
      });
      const showTip = () => {
        this.hovered = id;
        this.tipKey = '';
        this.refreshTip(ui.snap());
      };
      const hideTip = () => {
        if (this.hovered === id) this.hovered = null;
        ui.tooltip.hide(btn);
      };
      btn.addEventListener('pointerenter', showTip);
      btn.addEventListener('pointerleave', hideTip);
      btn.addEventListener('focus', showTip);
      btn.addEventListener('blur', hideTip);
      this.slots.set(id, { btn, cdText: new TextSlot(cdEl), cdEl, badge: new TextSlot(badgeEl), badgeEl, lastFrac: '' });
      this.el.append(btn);
    }
  }

  /** Brief highlight (e.g. just unlocked). */
  flash(id: AbilityId): void {
    this.flashUntil.set(id, performance.now() + 2400);
  }

  update(s: GameSnapshot): void {
    const heroDown = !s.hero || s.hero.state === 'down';
    const now = performance.now();
    for (const a of s.abilities) {
      const slot = this.slots.get(a.id);
      if (!slot) continue;
      const locked = !a.unlocked;
      const blocked = a.id === 'bladeStorm' && heroDown;
      const cooling = a.unlocked && a.cooldown > 0;
      const active = a.activeRemaining > 0;
      cls(slot.btn, 'is-locked', locked);
      cls(slot.btn, 'is-blocked', blocked && !locked);
      cls(slot.btn, 'is-cooling', cooling);
      cls(slot.btn, 'is-ready', a.unlocked && !cooling && !blocked);
      cls(slot.btn, 'is-active', active);
      cls(slot.btn, 'is-aiming', this.ui.state.targeting === a.id);
      cls(slot.btn, 'is-flash', (this.flashUntil.get(a.id) ?? 0) > now);

      const frac = cooling && a.cooldownMax > 0 ? Math.min(1, a.cooldown / a.cooldownMax) : 0;
      const f = frac.toFixed(3);
      if (f !== slot.lastFrac) {
        slot.lastFrac = f;
        setStyle(slot.btn, '--cd', f);
      }
      show(slot.cdEl, cooling);
      if (cooling) slot.cdText.set(String(Math.ceil(a.cooldown)));

      const badge = locked ? `Wave ${a.unlockWave}` : blocked ? 'Down' : active ? `${Math.ceil(a.activeRemaining)}s` : '';
      show(slot.badgeEl, badge !== '');
      if (badge) slot.badge.set(badge);
      cls(slot.badgeEl, 'is-active', active && !locked);
    }
    if (this.hovered) this.refreshTip(s);
  }

  private refreshTip(s: GameSnapshot): void {
    const id = this.hovered;
    if (!id) return;
    const slot = this.slots.get(id)!;
    const a = s.abilities.find((x) => x.id === id);
    const heroDown = !s.hero || s.hero.state === 'down';
    const key = `${id}|${a?.unlocked}|${Math.ceil(a?.cooldown ?? 0)}|${Math.ceil(a?.activeRemaining ?? 0)}|${heroDown}`;
    if (key === this.tipKey) return;
    this.tipKey = key;
    this.ui.tooltip.show(slot.btn, abilityTooltip(id, a, heroDown));
  }
}
