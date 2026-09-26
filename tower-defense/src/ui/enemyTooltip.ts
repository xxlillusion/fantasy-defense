// Enemy hover card: screen-space hit test against snapshot.enemies, throttled. Name, HP, armor, speed,
// traits and live status chips. Stealthed enemies that aren't revealed can't be inspected.
import type { EnemySnapshot, EntityId, GameSnapshot } from '../core/types';
import { ENEMIES, HERO, MODIFIER_FX, type EnemyDef } from '../data';
import { cls, fmtInt, h, setStyle, TextSlot } from './dom';
import { enemyIcon } from './icons';

const HIT_INTERVAL_MS = 80;

export function traitLines(d: EnemyDef): string[] {
  const out: string[] = [];
  const t = d.traits;
  if (d.flying) out.push('Flying');
  if (d.boss) out.push(`Boss · costs ${d.livesCost} lives`);
  if (d.slowResist > 0) out.push(`Resists slows ${Math.round(d.slowResist * 100)}%`);
  if (d.stunImmune) out.push('Stun immune');
  if (t?.heal) out.push(`Heals allies ${Math.round(t.heal.pct * 100)}%/s in ${t.heal.radius} tiles`);
  if (t?.shieldHits) out.push(`Shield absorbs ${t.shieldHits} hits`);
  if (t?.split) out.push(`Splits into ${t.split.count} ${ENEMIES[t.split.kind].name}s`);
  if (t?.stealth) out.push('Stealth');
  return out;
}

export function statusChips(e: EnemySnapshot): { text: string; kind: string }[] {
  const out: { text: string; kind: string }[] = [];
  if (e.stunned) out.push({ text: 'Stunned', kind: 'stun' });
  if (e.slow > 0.01) out.push({ text: `Slowed ${Math.round(e.slow * 100)}%`, kind: 'slow' });
  if (e.burning) out.push({ text: 'Burning', kind: 'burn' });
  if (e.vulnerable) out.push({ text: 'Vulnerable', kind: 'vuln' });
  if (e.shield > 0) out.push({ text: `Shield ×${e.shield}`, kind: 'shield' });
  if (e.stealthed && e.revealed) out.push({ text: 'Revealed', kind: 'reveal' });
  if (e.blockedByHero) out.push({ text: `Engaged by ${HERO.name}`, kind: 'hero' });
  return out;
}

export class EnemyTooltip {
  readonly el = h('div.enemy-tip.panel.is-hidden', { role: 'tooltip' });
  private pointer: { x: number; y: number } | null = null;
  private lastHit = 0;
  private enemyId: EntityId | null = null;
  private kind = '';
  private hp!: TextSlot;
  private hpFill!: HTMLElement;
  private speed!: TextSlot;
  private armor!: TextSlot;
  private chips!: HTMLElement;
  private chipsKey = '';
  private visible = false;

  constructor(private worldToScreen: (pos: EnemySnapshot['pos'], height: number) => { x: number; y: number; visible: boolean }) {}

  setPointer(p: { x: number; y: number } | null): void {
    this.pointer = p;
    this.lastHit = 0; // re-test on the next update
    if (!p) this.hide();
  }

  hide(): void {
    this.enemyId = null;
    if (this.visible) {
      this.visible = false;
      this.el.classList.add('is-hidden');
    }
  }

  /** Per frame; `enabled` = not placing/aiming and no overlay. */
  update(s: GameSnapshot, enabled: boolean): void {
    if (!enabled || !this.pointer) {
      this.hide();
      return;
    }
    const now = performance.now();
    if (now - this.lastHit < HIT_INTERVAL_MS) return;
    this.lastHit = now;
    const e = this.hitTest(s, this.pointer);
    if (!e) {
      this.hide();
      return;
    }
    if (e.id !== this.enemyId || e.kind !== this.kind) this.build(e);
    this.enemyId = e.id;
    this.fill(e, s);
    if (!this.visible) {
      this.visible = true;
      this.el.classList.remove('is-hidden');
    }
    this.position(this.pointer);
  }

  private hitTest(s: GameSnapshot, p: { x: number; y: number }): EnemySnapshot | null {
    let best: EnemySnapshot | null = null;
    let bestD = Infinity;
    for (const e of s.enemies) {
      if (e.stealthed && !e.revealed) continue;
      const sp = this.worldToScreen(e.pos, e.flying ? 1.5 : 0.6);
      if (!sp.visible) continue;
      const r = 16 + 12 * (ENEMIES[e.kind].size ?? 1);
      const d = Math.hypot(sp.x - p.x, sp.y - p.y);
      // prefer the currently shown enemy slightly, to avoid flicker between overlapping foes
      const score = e.id === this.enemyId ? d - 6 : d;
      if (d <= r && score < bestD) {
        bestD = score;
        best = e;
      }
    }
    return best;
  }

  private build(e: EnemySnapshot): void {
    const d = ENEMIES[e.kind];
    this.kind = e.kind;
    this.chipsKey = '';
    const hpEl = h('span.bar-num');
    const spEl = h('dd');
    const arEl = h('dd');
    this.hp = new TextSlot(hpEl);
    this.speed = new TextSlot(spEl);
    this.armor = new TextSlot(arEl);
    this.hpFill = h('span.bar-fill.enemy-hp-fill');
    this.chips = h('div.status-chips');
    const traits = traitLines(d);
    this.el.className = `enemy-tip panel${d.boss ? ' is-boss' : ''}`;
    this.el.replaceChildren(
      h('div.et-head', null, h('span.et-icon', { html: enemyIcon(e.kind) }), h('span.et-name', null, d.name)),
      h('div.et-hp', null, h('span.big-bar.enemy-hp', null, this.hpFill), hpEl),
      h('dl.stat-grid.et-stats', null, h('dt', null, 'Armor'), arEl, h('dt', null, 'Speed'), spEl),
      traits.length ? h('div.et-traits', null, ...traits.map((t) => h('span.trait', null, t))) : '',
      h('p.et-desc', null, d.description),
      this.chips,
    );
  }

  private fill(e: EnemySnapshot, s: GameSnapshot): void {
    const d = ENEMIES[e.kind];
    this.hp.set(`${fmtInt(Math.max(0, Math.ceil(e.hp)))}/${fmtInt(e.maxHp)}`);
    setStyle(this.hpFill, 'width', `${((e.hp / Math.max(1, e.maxHp)) * 100).toFixed(1)}%`);
    this.armor.set(String(e.armor));
    const base = d.speed * (s.modifiers.includes('swift') ? MODIFIER_FX.swiftSpeed : 1);
    const eff = e.stunned || e.blockedByHero ? 0 : base * (1 - e.slow);
    this.speed.set(Math.abs(eff - base) < 0.01 ? base.toFixed(1) : `${eff.toFixed(1)} / ${base.toFixed(1)}`);
    const chips = statusChips(e);
    const key = chips.map((c) => c.text).join('|');
    if (key !== this.chipsKey) {
      this.chipsKey = key;
      this.chips.replaceChildren(...chips.map((c) => h('span.status-chip', { class: `st-${c.kind}` }, c.text)));
      cls(this.chips, 'is-hidden', chips.length === 0);
    }
  }

  private position(p: { x: number; y: number }): void {
    const r = this.el.getBoundingClientRect();
    const m = 8;
    let x = p.x + 18;
    let y = p.y + 18;
    if (x + r.width > window.innerWidth - m) x = p.x - 18 - r.width;
    if (y + r.height > window.innerHeight - m) y = p.y - 18 - r.height;
    x = Math.max(m, x);
    y = Math.max(m, y);
    setStyle(this.el, 'transform', `translate(${Math.round(x)}px, ${Math.round(y)}px)`);
  }
}
