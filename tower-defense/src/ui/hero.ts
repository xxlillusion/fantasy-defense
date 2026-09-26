// Hero UI: the HUD portrait button (face, level, HP/XP bars, respawn countdown) and the hero panel
// (stats, level bonuses, Blade Storm). Selecting the hero puts the canvas into rally mode.
import type { GameSnapshot, HeroSnapshot } from '../core/types';
import { ABILITIES, HERO } from '../data';
import { button, cls, fmtInt, h, setDisabled, setStyle, show, TextSlot } from './dom';
import { abilityIcon, heroFace } from './icons';
import type { Ui } from './shared';

const num = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function heroStats(level: number): { damage: number; range: number; rate: number } {
  const k = level - 1;
  return {
    damage: Math.round(HERO.damage * (1 + HERO.perLevel.damage * k)),
    range: Math.round((HERO.range + HERO.perLevel.range * k) * 10) / 10,
    rate: HERO.attackRate,
  };
}

function bonusText(level: number): string {
  const k = level - 1;
  if (k <= 0) return 'Base stats';
  const pct = (x: number) => `+${Math.round(x * k * 100)}%`;
  return `${pct(HERO.perLevel.damage)} damage · ${pct(HERO.perLevel.hp)} HP · +${num(Math.round(HERO.perLevel.range * k * 10) / 10)} range`;
}

const STATE_LABEL: Record<HeroSnapshot['state'], string> = {
  idle: 'Holding the line',
  moving: 'Marching',
  fighting: 'Fighting',
  storming: 'Blade Storm!',
  down: 'Fallen',
};

export class HeroPortrait {
  readonly el: HTMLButtonElement;
  private level: TextSlot;
  private hpFill: HTMLElement;
  private xpFill: HTMLElement;
  private respawn: TextSlot;
  private respawnEl: HTMLElement;

  constructor(private ui: Ui) {
    const lv = h('span.hp-level');
    const respawnEl = h('span.hp-respawn.is-hidden');
    this.level = new TextSlot(lv);
    this.respawn = new TextSlot(respawnEl);
    this.respawnEl = respawnEl;
    this.hpFill = h('span.bar-fill.hp-fill');
    this.xpFill = h('span.bar-fill.xp-fill');
    this.el = h(
      'button.ui-btn.hero-portrait',
      { type: 'button', 'aria-label': `${HERO.name}, hotkey H`, title: `${HERO.name} ${HERO.title} (H)` },
      h('span.hp-face', { html: heroFace }),
      respawnEl,
      lv,
      h('span.card-key', null, 'H'),
      h('span.hp-bars', null, h('span.mini-bar.hp-bar', null, this.hpFill), h('span.mini-bar.xp-bar', null, this.xpFill)),
    );
    this.el.addEventListener('click', (e) => {
      e.stopPropagation();
      ui.selectHero(!ui.state.heroSelected);
    });
  }

  update(s: GameSnapshot): void {
    const hero = s.hero;
    show(this.el, !!hero);
    if (!hero) return;
    this.level.set(`Lv${hero.level}`);
    setStyle(this.hpFill, 'width', `${((hero.hp / Math.max(1, hero.maxHp)) * 100).toFixed(1)}%`);
    setStyle(this.xpFill, 'width', `${(xpFrac(hero) * 100).toFixed(1)}%`);
    const down = hero.state === 'down';
    cls(this.el, 'is-down', down);
    cls(this.el, 'is-fighting', hero.state === 'fighting' || hero.state === 'storming');
    cls(this.el, 'is-active', this.ui.state.heroSelected);
    cls(this.el, 'is-hurt', !down && hero.hp / hero.maxHp < 0.35);
    show(this.respawnEl, down);
    if (down) this.respawn.set(`${Math.ceil(hero.respawnIn)}`);
  }
}

function xpFrac(hero: HeroSnapshot): number {
  if (hero.xpNext === null) return 1;
  const base = HERO.levelXp[hero.level - 1] ?? 0;
  const span = hero.xpNext - base;
  return span > 0 ? Math.max(0, Math.min(1, (hero.xp - base) / span)) : 1;
}

export class HeroPanel {
  readonly el = h('div.hero-panel.panel.is-hidden', { role: 'dialog', 'aria-label': HERO.name });
  private builtLevel = -1;
  private state!: TextSlot;
  private hpText!: TextSlot;
  private xpText!: TextSlot;
  private hpFill!: HTMLElement;
  private xpFill!: HTMLElement;
  private stormBtn!: HTMLButtonElement;
  private stormLabel!: TextSlot;
  private open = false;

  constructor(private ui: Ui) {}

  update(s: GameSnapshot): void {
    const hero = s.hero;
    const visible = this.ui.state.heroSelected && !!hero;
    if (visible !== this.open) {
      this.open = visible;
      show(this.el, visible);
    }
    if (!visible || !hero) return;
    if (hero.level !== this.builtLevel) this.build(hero);

    const down = hero.state === 'down';
    this.state.set(down ? `Fallen: back in ${Math.ceil(hero.respawnIn)}s` : hero.state === 'fighting' && hero.blocking.length ? `Fighting ${hero.blocking.length} foe${hero.blocking.length === 1 ? '' : 's'}` : STATE_LABEL[hero.state]);
    cls(this.el, 'is-down', down);
    this.hpText.set(`${fmtInt(Math.max(0, hero.hp))}/${fmtInt(hero.maxHp)}`);
    setStyle(this.hpFill, 'width', `${((hero.hp / Math.max(1, hero.maxHp)) * 100).toFixed(1)}%`);
    this.xpText.set(hero.xpNext === null ? 'Max level' : `${fmtInt(hero.xp)}/${fmtInt(hero.xpNext)}`);
    setStyle(this.xpFill, 'width', `${(xpFrac(hero) * 100).toFixed(1)}%`);

    const a = s.abilities.find((x) => x.id === 'bladeStorm');
    const cd = a?.cooldown ?? 0;
    const active = (a?.activeRemaining ?? 0) > 0;
    setDisabled(this.stormBtn, down || !a?.unlocked || cd > 0);
    cls(this.stormBtn, 'is-active', active);
    this.stormLabel.set(active ? 'Spinning!' : down ? 'Unavailable' : cd > 0 ? `Ready in ${Math.ceil(cd)}s` : 'Blade Storm');
  }

  private build(hero: HeroSnapshot): void {
    this.builtLevel = hero.level;
    const st = heroStats(hero.level);
    const stateEl = h('div.hero-state');
    const hpText = h('span.bar-num');
    const xpText = h('span.bar-num');
    this.state = new TextSlot(stateEl);
    this.hpText = new TextSlot(hpText);
    this.xpText = new TextSlot(xpText);
    this.hpFill = h('span.bar-fill.hp-fill');
    this.xpFill = h('span.bar-fill.xp-fill');
    const stormText = h('span');
    this.stormLabel = new TextSlot(stormText);
    this.stormBtn = button(
      [h('span.storm-icon', { html: abilityIcon('bladeStorm') }), stormText, h('span.key-chip', null, 'R')],
      'act-btn storm-btn',
      () => this.ui.useAbility('bladeStorm'),
      { title: `${ABILITIES.bladeStorm.description} (R)` },
    );
    const next = hero.level < hero.maxLevel ? `Lv ${hero.level + 1}: +${Math.round(HERO.perLevel.damage * 100)}% damage, +${Math.round(HERO.perLevel.hp * 100)}% HP, +${HERO.perLevel.range} range` : 'Max level reached.';
    const stat = (label: string, value: string) => [h('dt', null, label), h('dd', null, value)];

    this.el.replaceChildren(
      button('×', 'close-btn', () => this.ui.selectHero(false), { 'aria-label': 'Close', title: 'Close (Esc)' }),
      h(
        'div.tp-head',
        null,
        h('span.tp-icon.hero-icon', { html: heroFace }),
        h('div.tp-title', null, h('div.tp-name', null, HERO.name), h('div.tp-sub', null, `${HERO.title} · Lv ${hero.level}/${hero.maxLevel}`)),
      ),
      stateEl,
      h('div.hero-bars', null, h('span.bar-label', null, 'HP'), h('span.big-bar.hp-bar', null, this.hpFill), hpText, h('span.bar-label', null, 'XP'), h('span.big-bar.xp-bar', null, this.xpFill), xpText),
      h(
        'dl.stat-grid',
        null,
        ...stat('Damage', String(st.damage)),
        ...stat('Rate', `${num(st.rate)}/s`),
        ...stat('Reach', num(st.range)),
        ...stat('Blocks', `${HERO.blockCapacity} foes`),
        ...stat('Reveal', `${HERO.detection} r`),
        ...stat('Hits', 'Ground'),
      ),
      h('div.tp-next', null, h('span.tp-next-label', null, 'Level bonus: '), bonusText(hero.level)),
      h('div.hero-next', null, next),
      this.stormBtn,
      h('div.tp-keys', null, 'Click the ground to rally · Right-click / Esc cancel'),
    );
  }
}
