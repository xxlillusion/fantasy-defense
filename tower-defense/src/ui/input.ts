// Keyboard shortcuts. Game keys only act in build/wave with no overlay open.
//  1-5 towers · Q/W/E/R abilities · H hero · U upgrade · Z/X branch · S sell · Tab targeting
//  N/Enter send wave · Space pause · F speed · ? controls · Esc cancel → deselect → pause menu
import type { AbilityId, TowerKind } from '../core/types';
import { ABILITIES, ABILITY_IDS, TOWER_KINDS, TOWERS } from '../data';
import type { GameOverScreen } from './screens/gameOver';
import type { IntroCard } from './screens/intro';
import type { TitleScreen } from './screens/title';
import { inGame, type Ui } from './shared';
import type { TowerPanel } from './towerPanel';

function hotkeyTower(e: KeyboardEvent): TowerKind | undefined {
  const m = /^(?:Digit|Numpad)([1-5])$/.exec(e.code);
  const key = m ? m[1] : e.key;
  return TOWER_KINDS.find((k) => TOWERS[k].hotkey === key);
}

function hotkeyAbility(key: string): AbilityId | undefined {
  return ABILITY_IDS.find((id) => ABILITIES[id].hotkey === key);
}

export interface KeyTargets {
  panel: TowerPanel;
  title: TitleScreen;
  gameOver: GameOverScreen;
  intro: IntroCard;
}

export function installKeyboard(ui: Ui, t: KeyTargets): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    const inField = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');
    const onButton = !!target && target.tagName === 'BUTTON';
    const s = ui.snap();
    const handled = () => e.preventDefault();
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

    // --- overlays first
    const overlay = ui.state.overlay;
    if (overlay === 'intro') {
      if (key === 'Enter' || key === 'Escape' || key === ' ') {
        handled();
        if (!e.repeat) t.intro.dismiss();
      }
      return;
    }
    if (overlay !== 'none') {
      if (key === 'Escape' || (key === ' ' && overlay === 'pause' && !inField) || (key === '?' && overlay === 'help')) {
        handled();
        ui.sfx('close');
        ui.closeOverlay();
      }
      return;
    }

    if (s.phase === 'title') {
      if (key === 'Escape') {
        if (t.title.back()) handled();
      } else if (key === 'Enter' && t.title.current === 'mode' && !onButton) {
        handled();
        t.title.start();
      } else if (key === '?') {
        handled();
        ui.openHelp();
      }
      return;
    }

    if (s.phase === 'victory' || s.phase === 'defeat') {
      if (!t.gameOver.visible) return;
      if (key === 'Enter' || key === 'r') {
        handled();
        t.gameOver.retry();
      } else if (key === 'Escape') {
        handled();
        t.gameOver.toTitle();
      }
      return;
    }

    if (!inGame(s) || inField) return;

    const kind = hotkeyTower(e);
    if (kind) {
      handled();
      if (ui.state.placing === kind && !e.repeat) ui.cancelPlacing();
      else if (ui.state.placing !== kind) ui.startPlacing(kind);
      return;
    }
    const ability = hotkeyAbility(key);
    if (ability) {
      handled();
      if (!e.repeat) ui.useAbility(ability);
      return;
    }

    switch (key) {
      case 'Escape':
        handled();
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
        if (key === 'Enter' && onButton) break; // let the focused button (e.g. a branch card) activate
        handled();
        if (!e.repeat) ui.sendWave();
        break;
      case 'h':
        handled();
        if (!e.repeat) ui.selectHero(!ui.state.heroSelected);
        break;
      case '?':
        handled();
        ui.openHelp();
        break;
      case 'u':
        if (ui.state.selected !== null) {
          handled();
          if (!e.repeat) t.panel.upgrade();
        }
        break;
      case 'z':
      case 'x':
        if (ui.state.selected !== null && t.panel.choosingBranch) {
          handled();
          if (!e.repeat) t.panel.pickBranch(key === 'z' ? 'a' : 'b');
        }
        break;
      case 's':
        if (ui.state.selected !== null) {
          handled();
          if (!e.repeat) t.panel.sell();
        }
        break;
      case 'Tab':
        if (ui.state.selected !== null) {
          handled();
          t.panel.cycleTarget();
        }
        break;
    }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
