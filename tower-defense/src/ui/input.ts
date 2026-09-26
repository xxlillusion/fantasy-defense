// Keyboard shortcuts. Game keys only act in build/wave with no overlay open.
import type { TowerKind } from '../core/types';
import { TOWER_KINDS, TOWERS } from '../data';
import type { TitleScreen } from './screens/title';
import type { GameOverScreen } from './screens/gameOver';
import { inGame, type Ui } from './shared';
import type { TowerPanel } from './towerPanel';

function hotkeyTower(e: KeyboardEvent): TowerKind | undefined {
  const m = /^(?:Digit|Numpad)([1-5])$/.exec(e.code);
  const key = m ? m[1] : e.key;
  return TOWER_KINDS.find((k) => TOWERS[k].hotkey === key);
}

export function installKeyboard(ui: Ui, panel: TowerPanel, title: TitleScreen, gameOver: GameOverScreen): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    const inField = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');
    const s = ui.snap();
    const handled = () => e.preventDefault();

    // --- overlays first
    if (ui.state.overlay !== 'none') {
      if (e.key === 'Escape' || (e.key === ' ' && ui.state.overlay === 'pause' && !inField)) {
        handled();
        ui.sfx('close');
        ui.closeOverlay();
      }
      return;
    }

    if (s.phase === 'title') {
      if (e.key === 'Escape' && title.isDifficulty) {
        handled();
        title.showMain(true);
      }
      return;
    }

    if (s.phase === 'victory' || s.phase === 'defeat') {
      if (!gameOver.visible) return;
      if (e.key === 'Enter' || e.key === 'r' || e.key === 'R') {
        handled();
        gameOver.retry();
      } else if (e.key === 'Escape') {
        handled();
        gameOver.toTitle();
      }
      return;
    }

    if (!inGame(s) || inField) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

    const kind = hotkeyTower(e);
    if (kind) {
      handled();
      if (ui.state.placing === kind && !e.repeat) ui.cancelPlacing();
      else if (ui.state.placing !== kind) ui.startPlacing(kind);
      return;
    }

    switch (key) {
      case 'Escape':
        handled();
        if (ui.state.placing) {
          ui.cancelPlacing();
          ui.sfx('close');
        } else if (ui.state.selected !== null) {
          ui.select(null);
          ui.sfx('close');
        } else ui.openPause();
        break;
      case ' ':
        handled();
        if (!e.repeat) ui.togglePause();
        break;
      case 'f':
        handled();
        if (!e.repeat) ui.toggleSpeed();
        break;
      case 'n':
      case 'Enter':
        handled();
        if (!e.repeat) ui.sendWave();
        break;
      case 'u':
        if (ui.state.selected !== null) {
          handled();
          if (!e.repeat) panel.upgrade();
        }
        break;
      case 's':
        if (ui.state.selected !== null) {
          handled();
          if (!e.repeat) panel.sell();
        }
        break;
      case 'Tab':
        if (ui.state.selected !== null) {
          handled();
          panel.cycleTarget();
        }
        break;
    }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
