// Canvas mouse handling: placement ghost + click-to-place, and click-to-select towers.
import { sameTile } from '../core/grid';
import type { GameSnapshot, TileCoord } from '../core/types';
import { TOWERS } from '../data';
import { inGame, type Ui } from './shared';

export class Placement {
  private pointer: { x: number; y: number } | null = null;
  private ghostKey = '';
  /** Tile under the pointer (camera is fixed, so it only changes on pointer move). */
  private curTile: TileCoord | null = null;
  private cleanup: (() => void)[] = [];

  constructor(
    private ui: Ui,
    private query: <T>(fn: () => T) => T,
  ) {
    const canvas = ui.ctx.view.canvas;
    const on = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void) => {
      canvas.addEventListener(type, fn as EventListener);
      this.cleanup.push(() => canvas.removeEventListener(type, fn as EventListener));
    };
    on('pointermove', (e) => {
      this.pointer = { x: e.clientX, y: e.clientY };
      this.curTile = this.ui.state.placing ? this.tile() : null;
      this.refresh();
    });
    on('pointerleave', () => {
      this.pointer = null;
      this.curTile = null;
      this.clearGhost();
    });
    on('click', (e) => this.onClick(e));
    on('contextmenu', (e) => {
      e.preventDefault();
      if (!this.active()) return;
      if (ui.state.placing) {
        ui.cancelPlacing();
        ui.sfx('close');
      } else if (ui.state.selected !== null) {
        ui.select(null);
        ui.sfx('close');
      }
    });
  }

  dispose(): void {
    for (const c of this.cleanup) c();
  }

  /** Per frame: keep the ghost's validity in sync with gold / towers even if the mouse is still. */
  update(s: GameSnapshot): void {
    if (!this.ui.state.placing) {
      if (this.ghostKey) this.clearGhost();
      return;
    }
    this.refresh(s);
  }

  /** Forget the cached ghost so the next refresh redraws it. */
  invalidate(): void {
    this.ghostKey = '';
    this.curTile = this.tile();
  }

  clearGhost(): void {
    this.ghostKey = '';
    this.ui.ctx.view.setPlacementGhost(null);
  }

  private active(): boolean {
    return inGame(this.ui.snap()) && this.ui.state.overlay === 'none';
  }

  private tile(): TileCoord | null {
    return this.pointer ? this.ui.ctx.view.pickTile(this.pointer.x, this.pointer.y) : null;
  }

  private refresh(s: GameSnapshot = this.ui.snap()): void {
    const kind = this.ui.state.placing;
    if (!kind || !this.active()) {
      if (this.ghostKey) this.clearGhost();
      return;
    }
    const t = this.curTile;
    if (!t) {
      if (this.ghostKey) this.clearGhost();
      return;
    }
    // cheap key: re-query only when tile, kind, gold or tower count changed
    const key = `${kind}|${t.col},${t.row}|${s.gold}|${s.towers.length}|${s.phase}`;
    if (key === this.ghostKey) return;
    this.ghostKey = key;
    const valid = this.query(() => this.ui.ctx.commands.canPlaceTower(kind, t)).ok;
    this.ui.ctx.view.setPlacementGhost({ type: 'tower', kind, tile: t, valid, range: TOWERS[kind].levels[1].range });
  }

  private onClick(e: MouseEvent): void {
    if (e.button !== 0 || !this.active()) return;
    this.pointer = { x: e.clientX, y: e.clientY };
    const t = this.tile();
    const kind = this.ui.state.placing;
    if (kind) {
      if (!t) return;
      const r = this.ui.run(() => this.ui.ctx.commands.placeTower(kind, t));
      // Success sound comes from the audio module's towerPlaced handler.
      if (r.ok) {
        if (!e.shiftKey) this.ui.cancelPlacing();
        else this.invalidate();
      }
      return;
    }
    const s = this.ui.snap();
    const tower = t ? s.towers.find((x) => sameTile(x.tile, t)) : undefined;
    if (tower) {
      if (this.ui.state.selected !== tower.id) this.ui.sfx('open');
      this.ui.select(tower.id);
    } else if (this.ui.state.selected !== null) {
      this.ui.select(null);
      this.ui.sfx('close');
    }
  }
}
