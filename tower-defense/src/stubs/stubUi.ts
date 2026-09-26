// Lead-owned STUB. Bare-bones debug UI so the game is playable. Stream D replaces with src/ui/.
import type { IUi, UiContext } from '../core/interfaces';
import type { EntityId, GameSnapshot, TowerKind } from '../core/types';
import { DEFAULT_MAP_ID, TOWER_KINDS, TOWERS } from '../data';

export function createStubUi(): IUi {
  let ctx: UiContext;
  let panel: HTMLDivElement;
  let hud: HTMLDivElement;
  let placing: TowerKind | null = null;
  let selected: EntityId | null = null;

  const btn = (label: string, onClick: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'margin:2px;padding:4px 8px;font:12px monospace;cursor:pointer';
    b.onclick = (e) => {
      e.stopPropagation();
      ctx.audio.unlock();
      onClick();
    };
    return b;
  };

  return {
    init(c) {
      ctx = c;
      panel = document.createElement('div');
      panel.style.cssText = 'position:absolute;left:8px;bottom:8px;background:#000a;color:#fff;padding:6px;font:12px monospace;pointer-events:auto';
      hud = document.createElement('div');
      hud.style.cssText = 'position:absolute;left:8px;top:8px;background:#000a;color:#fff;padding:6px;font:12px monospace;white-space:pre';
      c.root.append(panel, hud);

      for (const d of ['easy', 'normal', 'hard'] as const) panel.append(btn(`Start ${d}`, () => c.commands.startGame({ difficulty: d, mapId: DEFAULT_MAP_ID, mode: 'campaign', modifiers: [] })));
      panel.append(document.createElement('br'));
      for (const k of TOWER_KINDS) panel.append(btn(`${TOWERS[k].hotkey}:${TOWERS[k].name} ${TOWERS[k].levels[1].cost}g`, () => (placing = k)));
      panel.append(document.createElement('br'));
      panel.append(btn('Send wave', () => c.commands.sendWave()));
      panel.append(btn('Upgrade sel', () => selected !== null && c.commands.upgradeTower(selected)));
      panel.append(btn('Sell sel', () => {
        if (selected !== null) c.commands.sellTower(selected);
        selected = null;
      }));
      panel.append(btn('Speed', () => c.commands.setSpeed(c.getSnapshot().speed === 1 ? 2 : 1)));
      panel.append(btn('Pause', () => c.commands.setPaused(!c.getSnapshot().paused)));

      const canvas = c.view.canvas;
      canvas.addEventListener('mousemove', (e) => {
        if (!placing) return c.view.setPlacementGhost(null);
        const tile = c.view.pickTile(e.clientX, e.clientY);
        if (!tile) return c.view.setPlacementGhost(null);
        c.view.setPlacementGhost({ type: 'tower', kind: placing, tile, valid: c.commands.canPlaceTower(placing, tile).ok, range: TOWERS[placing].levels[1].range });
      });
      canvas.addEventListener('click', (e) => {
        c.audio.unlock();
        const tile = c.view.pickTile(e.clientX, e.clientY);
        if (!tile) return;
        if (placing) {
          c.commands.placeTower(placing, tile);
          placing = null;
          c.view.setPlacementGhost(null);
          return;
        }
        const t = c.getSnapshot().towers.find((x) => x.tile.col === tile.col && x.tile.row === tile.row);
        selected = t ? t.id : null;
      });
      window.addEventListener('keydown', (e) => {
        const k = TOWER_KINDS.find((k) => TOWERS[k].hotkey === e.key);
        if (k) placing = k;
        if (e.key === 'Escape') {
          placing = null;
          c.view.setPlacementGhost(null);
        }
      });
    },
    update(s: GameSnapshot) {
      const sel = s.towers.find((t) => t.id === selected);
      ctx.view.setSelection(sel ? { tile: sel.tile, range: sel.range } : null);
      hud.textContent = `[STUB UI] phase=${s.phase} wave=${s.wave}/${s.totalWaves} gold=${s.gold} lives=${s.lives}/${s.maxLives} speed=${s.speed}x${s.paused ? ' PAUSED' : ''}\nenemies=${s.enemies.length} towers=${s.towers.length}${sel ? `\nselected: ${sel.kind} L${sel.level} up=${sel.upgradeCost ?? '-'} sell=${sel.sellValue}` : ''}${placing ? `\nplacing: ${placing}` : ''}`;
    },
    dispose() {
      panel.remove();
      hud.remove();
    },
  };
}
