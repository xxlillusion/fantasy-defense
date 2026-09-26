// Floating combat text: damage numbers and "+N" gold, pooled DOM nodes that drift up and fade.
import type { EntityId, Vec2 } from '../core/types';
import { h } from './dom';
import type { Ui } from './shared';

const POOL_SIZE = 48;
const MAX_SPAWNS_PER_FRAME = 14;
const LIFE = 0.9;
const RISE = 38;
/** Seconds during which new damage on the same enemy adds to the existing number. */
const MERGE_WINDOW = 0.35;

interface Item {
  el: HTMLElement;
  /** Enemy this damage number belongs to (for merging rapid ticks), or null for gold. */
  enemyId: EntityId | null;
  amount: number;
  crit: boolean;
  active: boolean;
  x: number;
  y: number;
  dx: number;
  age: number;
  life: number;
  born: number;
}

interface Pending {
  enemyId: EntityId | null;
  pos: Vec2;
  amount: number;
  crit: boolean;
  gold: boolean;
}

export class FloatingText {
  readonly el = h('div.float-layer', { 'aria-hidden': 'true' });
  private pool: Item[] = [];
  private pending = new Map<string, Pending>();
  private serial = 0;

  constructor(private ui: Ui) {
    for (let i = 0; i < POOL_SIZE; i++) {
      const el = h('span.float-text');
      el.style.display = 'none';
      this.el.append(el);
      this.pool.push({ el, enemyId: null, amount: 0, crit: false, active: false, x: 0, y: 0, dx: 0, age: 0, life: LIFE, born: 0 });
    }
  }

  damage(enemyId: EntityId, pos: Vec2, amount: number, crit: boolean): void {
    if (!this.ui.state.settings.showDamageNumbers || amount <= 0) return;
    // aggregate multiple hits on the same enemy within one frame
    const key = `d${enemyId}`;
    const p = this.pending.get(key);
    if (p) {
      p.amount += amount;
      p.crit ||= crit;
      p.pos = pos;
    } else this.pending.set(key, { enemyId, pos, amount, crit, gold: false });
  }

  gold(pos: Vec2, amount: number): void {
    if (amount <= 0) return;
    this.pending.set(`g${this.serial++}`, { enemyId: null, pos, amount, crit: false, gold: true });
  }

  clear(): void {
    this.pending.clear();
    for (const it of this.pool) this.kill(it);
  }

  update(dtReal: number, paused: boolean): void {
    if (this.pending.size) {
      let n = 0;
      // gold popups first so they are never starved by damage spam
      const list = [...this.pending.values()].sort((a, b) => Number(b.gold) - Number(a.gold) || Number(b.crit) - Number(a.crit));
      for (const p of list) {
        if (n++ >= MAX_SPAWNS_PER_FRAME) break;
        this.spawn(p);
      }
      this.pending.clear();
    }
    const dt = paused ? 0 : dtReal;
    for (const it of this.pool) {
      if (!it.active) continue;
      it.age += dt;
      const t = it.age / it.life;
      if (t >= 1) {
        this.kill(it);
        continue;
      }
      const ease = 1 - (1 - t) * (1 - t);
      const y = it.y - ease * RISE;
      const x = it.x + it.dx * ease;
      const alpha = t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45;
      const scale = t < 0.12 ? 0.6 + (t / 0.12) * 0.55 : t < 0.25 ? 1.15 - ((t - 0.12) / 0.13) * 0.15 : 1;
      it.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%) scale(${scale.toFixed(3)})`;
      it.el.style.opacity = alpha.toFixed(3);
    }
  }

  private spawn(p: Pending): void {
    // Merge rapid ticks (burn, chain, aura) into a recent number on the same enemy instead of stacking.
    if (!p.gold && p.enemyId !== null) {
      const recent = this.pool.find((x) => x.active && x.enemyId === p.enemyId && x.age < MERGE_WINDOW);
      if (recent) {
        recent.amount += p.amount;
        recent.crit ||= p.crit;
        recent.age = Math.min(recent.age, 0.1);
        this.paint(recent, false);
        return;
      }
    }
    const s = this.ui.ctx.view.worldToScreen(p.pos, p.gold ? 1.1 : 0.8);
    if (!s.visible) return;
    let it = this.pool.find((x) => !x.active);
    if (!it) {
      // recycle the oldest
      it = this.pool.reduce((a, b) => (a.born < b.born ? a : b));
    }
    it.active = true;
    it.age = 0;
    it.born = this.serial++;
    it.life = p.crit ? LIFE * 1.3 : p.gold ? LIFE * 1.2 : LIFE;
    it.x = s.x + (Math.random() - 0.5) * 14;
    it.y = s.y;
    it.dx = (Math.random() - 0.5) * 18;
    it.enemyId = p.gold ? null : p.enemyId;
    it.amount = p.amount;
    it.crit = p.crit;
    this.paint(it, p.gold);
    it.el.style.opacity = '0';
    it.el.style.display = '';
  }

  private paint(it: Item, gold: boolean): void {
    const n = Math.max(1, Math.round(it.amount));
    it.el.className = `float-text ${gold ? 'is-gold' : it.crit ? 'is-crit' : 'is-dmg'}`;
    it.el.textContent = gold ? `+${n}` : it.crit ? `${n}!` : String(n);
  }

  private kill(it: Item): void {
    it.active = false;
    it.enemyId = null;
    it.el.style.display = 'none';
  }
}
