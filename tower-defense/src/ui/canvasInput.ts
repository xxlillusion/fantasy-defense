// Canvas mouse handling: tower placement ghost, hero rally ghost, ability (Meteor) aiming,
// click-to-select towers / the hero, and the enemy hover tooltip.
import { sameTile } from '../core/grid';
import type { PlacementGhost } from '../core/interfaces';
import type { GameSnapshot, TileCoord, Vec2 } from '../core/types';
import { ABILITIES, TOWERS } from '../data';
import type { EnemyTooltip } from './enemyTooltip';
import { inGame, type Ui } from './shared';

/** Screen-space radius (px) for clicking the hero. */
const HERO_HIT_PX = 28;

export class CanvasInput {
  private pointer: { x: number; y: number } | null = null;
  private ghostKey = '';
  /** Tile / ground point under the pointer (camera is fixed, so only on pointer move). */
  private curTile: TileCoord | null = null;
  private curPoint: Vec2 | null = null;
  private cursor = '';
  private cleanup: (() => void)[] = [];

  constructor(
    private ui: Ui,
    private enemyTip: EnemyTooltip,
  ) {
    const canvas = ui.ctx.view.canvas;
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void) => {
      canvas.addEventListener(type, fn as EventListener);
      this.cleanup.push(() => canvas.removeEventListener(type, fn as EventListener));
    };
    on('pointermove', (e) => {
      this.pointer = { x: e.clientX, y: e.clientY };
      this.pick();
      this.refresh();
      this.enemyTip.setPointer(this.pointer);
    });
    on('pointerleave', () => {
      this.pointer = null;
      this.curTile = null;
      this.curPoint = null;
      this.clearGhost();
      this.enemyTip.setPointer(null);
    });
    on('click', (e) => this.onClick(e));
    on('contextmenu', (e) => {
      e.preventDefault();
      if (!this.active()) return;
      if (ui.state.placing) {
        ui.cancelPlacing();
        ui.sfx('close');
      } else if (ui.state.targeting) {
        ui.cancelTargeting();
        ui.sfx('close');
      } else if (ui.state.heroSelected) {
        ui.selectHero(false);
        ui.sfx('close');
      } else if (ui.state.selected !== null) {
        ui.select(null);
        ui.sfx('close');
      }
    });
  }

  dispose(): void {
    for (const c of this.cleanup) c();
    this.setCursor('');
  }

  /** Per frame: keep the ghost's validity in sync with gold / cooldowns even if the mouse is still. */
  update(s: GameSnapshot): void {
    this.refresh(s);
    const st = this.ui.state;
    const aiming = !!st.placing || !!st.targeting || st.heroSelected;
    this.setCursor(this.active() && aiming && this.pointer ? 'crosshair' : '');
    this.enemyTip.update(s, inGame(s) && st.overlay === 'none' && !aiming);
  }

  /** Forget the cached ghost so the next refresh redraws it. */
  invalidate(): void {
    this.ghostKey = '';
    this.pick();
  }

  /** Leaving a game: drop the ghost, cursor and enemy card. */
  reset(): void {
    this.clearGhost();
    this.setCursor('');
    this.enemyTip.hide();
  }

  clearGhost(): void {
    if (this.ghostKey === 'none') return;
    this.ghostKey = 'none';
    this.ui.ctx.view.setPlacementGhost(null);
  }

  private setCursor(c: string): void {
    if (c === this.cursor) return;
    this.cursor = c;
    this.ui.ctx.view.canvas.style.cursor = c;
  }

  private active(): boolean {
    return inGame(this.ui.snap()) && this.ui.state.overlay === 'none';
  }

  private pick(): void {
    const p = this.pointer;
    const st = this.ui.state;
    this.curTile = p && st.placing ? this.ui.ctx.view.pickTile(p.x, p.y) : null;
    this.curPoint = p && (st.targeting || st.heroSelected) ? this.ui.ctx.view.pickPoint(p.x, p.y) : null;
  }

  private refresh(s: GameSnapshot = this.ui.snap()): void {
    const st = this.ui.state;
    if (!this.active()) return this.clearGhost();
    const cmd = this.ui.ctx.commands;
    let key: string;
    let make: () => PlacementGhost;

    if (st.placing) {
      const kind = st.placing;
      const t = this.curTile;
      if (!t) return this.clearGhost();
      // cheap key: re-query only when tile, kind, gold or tower count changed
      key = `t|${kind}|${t.col},${t.row}|${s.gold}|${s.towers.length}|${s.phase}`;
      make = () => ({ type: 'tower', kind, tile: t, valid: this.ui.query(() => cmd.canPlaceTower(kind, t)).ok, range: TOWERS[kind].levels[1].range });
    } else if (st.targeting) {
      const id = st.targeting;
      const p = this.curPoint;
      if (!p) return this.clearGhost();
      const a = s.abilities.find((x) => x.id === id);
      const radius = a?.radius || ABILITIES[id].radius;
      key = `a|${id}|${p.x.toFixed(2)},${p.y.toFixed(2)}|${a?.cooldown === 0}|${s.phase}`;
      make = () => ({ type: 'ability', id, point: p, radius, valid: this.ui.query(() => cmd.canCastAbility(id, p)).ok });
    } else if (st.heroSelected && s.hero) {
      const p = this.curPoint;
      if (!p) return this.clearGhost();
      key = `r|${p.x.toFixed(2)},${p.y.toFixed(2)}|${s.hero.state === 'down'}|${s.phase}|${s.towers.length}`;
      make = () => ({ type: 'rally', point: p, valid: this.ui.query(() => cmd.canSetHeroRally(p)).ok });
    } else return this.clearGhost();

    if (key === this.ghostKey) return;
    this.ghostKey = key;
    this.ui.ctx.view.setPlacementGhost(make());
  }

  private heroUnder(s: GameSnapshot, x: number, y: number): boolean {
    if (!s.hero) return false;
    const p = this.ui.ctx.view.worldToScreen(s.hero.pos, 0.8);
    return p.visible && Math.hypot(p.x - x, p.y - y) <= HERO_HIT_PX;
  }

  private onClick(e: MouseEvent): void {
    if (e.button !== 0 || !this.active()) return;
    const ui = this.ui;
    const st = ui.state;
    const view = ui.ctx.view;
    const cmd = ui.ctx.commands;
    this.pointer = { x: e.clientX, y: e.clientY };
    const s = ui.snap();

    if (st.placing) {
      const kind = st.placing;
      const t = view.pickTile(e.clientX, e.clientY);
      if (!t) return;
      const r = ui.run(() => cmd.placeTower(kind, t));
      // Success sound comes from the audio module's towerPlaced handler.
      if (r.ok) {
        if (!e.shiftKey) ui.cancelPlacing();
        else this.invalidate();
      }
      return;
    }
    if (st.targeting) {
      const id = st.targeting;
      const p = view.pickPoint(e.clientX, e.clientY);
      if (!p) return;
      const r = ui.run(() => cmd.castAbility(id, p));
      if (r.ok) ui.cancelTargeting();
      return;
    }
    if (st.heroSelected) {
      if (this.heroUnder(s, e.clientX, e.clientY)) return; // clicking him again keeps him selected
      const p = view.pickPoint(e.clientX, e.clientY);
      if (!p) return;
      const r = ui.run(() => cmd.setHeroRally(p));
      if (r.ok) {
        ui.sfx('click');
        if (!e.shiftKey) ui.selectHero(false);
        else this.invalidate();
      }
      return;
    }

    if (this.heroUnder(s, e.clientX, e.clientY)) {
      ui.selectHero(true);
      return;
    }
    const t = view.pickTile(e.clientX, e.clientY);
    const tower = t ? s.towers.find((x) => sameTile(x.tile, t)) : undefined;
    if (tower) {
      if (st.selected !== tower.id) ui.sfx('open');
      ui.select(tower.id);
    } else if (st.selected !== null) {
      ui.select(null);
      ui.sfx('close');
    }
  }
}
