// Title flow: main menu (Play / Controls / Settings) → Map select (live 3D preview behind) →
// Mode, difficulty & modifiers → start. Translucent so the 3D diorama shows through.
import type { Difficulty, GameMode, GameOptions, ModifierId } from '../../core/types';
import { DEFAULT_MAP_ID, DIFFICULTIES, getMap, MAP_IDS, MAPS, MODIFIER_IDS, MODIFIERS, modifierScoreMultiplier } from '../../data';
import { button, cls, fmtInt, h, TextSlot } from '../dom';
import { gearGlyph, helpGlyph, modifierIcon, portalIcon, starSvg } from '../icons';
import type { Ui } from '../shared';

const FLAVOR: Record<Difficulty, string> = {
  easy: 'A gentle pilgrimage. Plenty of light to spare.',
  normal: 'The true trial of the shrine.',
  hard: 'For seasoned guardians. The portal flickers.',
};
const DIFFS = Object.keys(DIFFICULTIES) as Difficulty[];
const MODE_INFO: Record<GameMode, { name: string; desc: string }> = {
  campaign: { name: 'Campaign', desc: 'Survive 20 waves and earn up to 3 stars.' },
  endless: { name: 'Endless', desc: 'The 20 waves, then ever-stronger waves. How long can you hold?' },
};
const STORE_KEY = 'td.ui.setup.v2';
const PREVIEW_DELAY_MS = 140;

type View = 'main' | 'map' | 'mode';

function loadSetup(): GameOptions {
  const def: GameOptions = { mapId: DEFAULT_MAP_ID, difficulty: 'normal', mode: 'campaign', modifiers: [] };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return def;
    const v = JSON.parse(raw) as Partial<GameOptions>;
    return {
      mapId: typeof v.mapId === 'string' && MAPS[v.mapId] ? v.mapId : def.mapId,
      difficulty: v.difficulty && v.difficulty in DIFFICULTIES ? v.difficulty : def.difficulty,
      mode: v.mode === 'endless' ? 'endless' : 'campaign',
      modifiers: Array.isArray(v.modifiers) ? MODIFIER_IDS.filter((id) => v.modifiers!.includes(id)) : [],
    };
  } catch {
    return def;
  }
}

function saveSetup(o: GameOptions): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(o));
  } catch {
    /* storage unavailable */
  }
}

const fmtMult = (m: number): string => `×${(Math.round(m * 100) / 100).toFixed(2)}`;
const starsHtml = (n: number, cls = 'star'): string => [1, 2, 3].map((i) => starSvg(`${cls} ${i <= n ? 'is-on' : ''}`)).join('');

export class TitleScreen {
  readonly el: HTMLElement;
  private main: HTMLElement;
  private mapView: HTMLElement;
  private modeView: HTMLElement;
  private mapCards: HTMLElement;
  private modeBtns = new Map<GameMode, HTMLButtonElement>();
  private diffCards: HTMLElement;
  private diffBtns = new Map<Difficulty, HTMLButtonElement>();
  private modBtns = new Map<ModifierId, HTMLButtonElement>();
  private modeSub: TextSlot;
  private modeDesc: TextSlot;
  private multTotal: TextSlot;
  private multBreak: TextSlot;
  private view: View = 'main';
  private setup: GameOptions;
  private previewTimer = 0;
  private previewed: string | null = null;

  constructor(private ui: Ui) {
    this.setup = loadSetup();
    this.main = h(
      'div.title-main',
      null,
      h(
        'div.title-logo',
        null,
        h('div.title-kicker', null, 'A Tower Defense Tale'),
        h('h1.title-name', null, h('span.title-word', null, 'Waterfall'), ' ', h('span.title-word', null, 'Shrine')),
        h('div.title-ornament', { html: `<span></span>${portalIcon}<span></span>` }),
      ),
      h(
        'div.menu-col',
        null,
        button('Play', 'menu-btn primary', () => this.showMap()),
        button([h('span.btn-glyph', { html: helpGlyph }), 'Controls'], 'menu-btn', () => ui.openHelp()),
        button([h('span.btn-glyph', { html: gearGlyph }), 'Settings'], 'menu-btn', () => {
          ui.sfx('open');
          ui.openSettings('title');
        }),
      ),
      h('div.title-hint', null, 'Guard the spirit portal. Build towers, rally your hero, survive the waves.'),
    );

    // ---- map select
    this.mapCards = h('div.map-cards');
    this.mapView = h(
      'div.title-map.title-view.is-hidden',
      null,
      h('h2.screen-title', null, 'Choose a Battlefield'),
      h('div.screen-sub', null, 'Hover a map to preview it'),
      this.mapCards,
      button('Back', 'menu-btn small', () => this.showMain(true)),
    );

    // ---- mode, difficulty, modifiers
    const subEl = h('div.screen-sub');
    this.modeSub = new TextSlot(subEl);
    const modeDescEl = h('div.mode-desc');
    this.modeDesc = new TextSlot(modeDescEl);
    const modeRow = h('div.mode-toggle', { role: 'radiogroup', 'aria-label': 'Game mode' });
    for (const m of ['campaign', 'endless'] as GameMode[]) {
      const b = button(MODE_INFO[m].name, 'mode-choice', () => this.setMode(m), { role: 'radio' });
      this.modeBtns.set(m, b);
      modeRow.append(b);
    }
    this.diffCards = h('div.diff-cards', { role: 'radiogroup', 'aria-label': 'Difficulty' });
    const modGrid = h('div.mod-grid');
    for (const id of MODIFIER_IDS) {
      const m = MODIFIERS[id];
      const b = button(
        [
          h('span.mod-check'),
          h('span.mod-icon', { html: modifierIcon(id) }),
          h('span.mod-text', null, h('span.mod-name', null, m.name), h('span.mod-desc', null, m.description)),
          h('span.mod-mult', null, `×${m.scoreMultiplier}`),
        ],
        'mod-card',
        () => this.toggleMod(id),
        { role: 'checkbox' },
      );
      this.modBtns.set(id, b);
      modGrid.append(b);
    }
    const totalEl = h('span.mult-total');
    const breakEl = h('span.mult-break');
    this.multTotal = new TextSlot(totalEl);
    this.multBreak = new TextSlot(breakEl);

    this.modeView = h(
      'div.title-mode.title-view.is-hidden',
      null,
      h('h2.screen-title', null, 'Prepare for Battle'),
      subEl,
      h('div.mode-block', null, modeRow, modeDescEl),
      this.diffCards,
      h('div.mod-head', null, h('span', null, 'Modifiers'), h('span.mod-head-hint', null, 'Harder runs, bigger scores')),
      modGrid,
      h(
        'div.mode-foot',
        null,
        h('div.mult-box', { title: 'Score multiplier (difficulty × modifiers)' }, h('span.mult-label', null, 'Score'), totalEl, breakEl),
        h('div.mode-actions', null, button('Back', 'menu-btn small', () => this.showMap(true)), button('Start', 'menu-btn primary start-btn', () => this.start())),
      ),
    );

    this.el = h('div.screen.title-screen', null, h('div.title-vignette'), this.main, this.mapView, this.modeView);
  }

  get current(): View {
    return this.view;
  }

  /** Esc: step back through the flow. Returns false at the main menu. */
  back(): boolean {
    if (this.view === 'mode') this.showMap(true);
    else if (this.view === 'map') this.showMain(true);
    else return false;
    return true;
  }

  showMain(sound = false): void {
    if (sound) this.ui.sfx('close');
    this.setView('main');
    this.preview(null, true);
  }

  showMap(back = false): void {
    this.ui.sfx(back ? 'close' : 'open');
    this.renderMaps();
    this.setView('map');
    this.preview(this.setup.mapId, true);
    const card = this.mapCards.querySelector<HTMLElement>(`[data-map="${this.setup.mapId}"]`);
    card?.focus({ preventScroll: true });
  }

  private showMode(): void {
    this.ui.sfx('open');
    this.modeSub.set(getMap(this.setup.mapId).name);
    this.renderDiffs();
    this.syncMode();
    this.setView('mode');
    this.preview(this.setup.mapId, true);
  }

  private setView(v: View): void {
    this.view = v;
    cls(this.main, 'is-hidden', v !== 'main');
    cls(this.mapView, 'is-hidden', v !== 'map');
    cls(this.modeView, 'is-hidden', v !== 'mode');
  }

  /** Leaving the title flow (game started): drop the preview so the environment follows snapshot.mapId. */
  leave(): void {
    this.preview(null, true);
  }

  private preview(mapId: string | null, now = false): void {
    window.clearTimeout(this.previewTimer);
    const apply = () => {
      if (mapId === this.previewed) return;
      this.previewed = mapId;
      this.ui.ctx.view.setMapPreview(mapId);
    };
    if (now) apply();
    else this.previewTimer = window.setTimeout(apply, PREVIEW_DELAY_MS);
  }

  private renderMaps(): void {
    this.mapCards.replaceChildren(
      ...MAP_IDS.map((id) => {
        const m = getMap(id);
        const lanes = m.paths.length;
        const rows = DIFFS.map((d) => {
          const camp = this.ui.ctx.save.getBest(id, d, 'campaign');
          const endl = this.ui.ctx.save.getBest(id, d, 'endless');
          const score = Math.max(camp.score, endl.score);
          return h(
            'div.mb-row',
            null,
            h('span.mb-diff', null, DIFFICULTIES[d].name),
            h('span.mb-stars', { html: starsHtml(camp.stars) }),
            h('span.mb-score', { title: 'Best score' }, score > 0 ? fmtInt(score) : '–'),
            h('span.mb-wave', { title: 'Best endless wave' }, endl.wave > 0 ? `∞${endl.wave}` : ''),
          );
        });
        const card = h(
          'button.ui-btn.map-card',
          { type: 'button', class: `theme-${m.theme}${id === this.setup.mapId ? ' is-selected' : ''}`, 'data-map': id },
          h('span.map-band', null, h('span.map-lanes', null, `${lanes} lane${lanes === 1 ? '' : 's'}`)),
          h('span.map-name', null, m.name),
          h('span.map-desc', null, m.description),
          h('span.map-best', null, h('span.mb-head', null, 'Best'), ...rows),
        );
        card.addEventListener('pointerenter', () => this.preview(id));
        card.addEventListener('focus', () => this.preview(id));
        card.addEventListener('click', (e) => {
          e.stopPropagation();
          this.setup = { ...this.setup, mapId: id };
          saveSetup(this.setup);
          this.showMode();
        });
        return card;
      }),
    );
  }

  private renderDiffs(): void {
    this.diffBtns.clear();
    this.diffCards.replaceChildren(
      ...DIFFS.map((d) => {
        const def = DIFFICULTIES[d];
        const bestEl = h('div.diff-best');
        const card = h(
          'button.ui-btn.diff-card',
          { type: 'button', role: 'radio', class: `diff-${d}` },
          h('div.diff-name', null, def.name, h('span.diff-mult', null, fmtMult(def.scoreMultiplier))),
          h('div.diff-flavor', null, FLAVOR[d]),
          h('dl.stat-grid.diff-stats', null, h('dt', null, 'Lives'), h('dd', null, String(def.lives)), h('dt', null, 'Gold'), h('dd', null, String(def.startGold)), h('dt', null, 'Foe HP'), h('dd', null, `×${def.hpMultiplier.toFixed(2)}`)),
          bestEl,
        );
        card.addEventListener('click', (e) => {
          e.stopPropagation();
          this.ui.sfx('click');
          this.setup = { ...this.setup, difficulty: d };
          saveSetup(this.setup);
          this.syncMode();
        });
        this.diffBtns.set(d, card);
        return card;
      }),
    );
  }

  private setMode(m: GameMode): void {
    this.ui.sfx('click');
    this.setup = { ...this.setup, mode: m };
    saveSetup(this.setup);
    this.syncMode();
  }

  private toggleMod(id: ModifierId): void {
    this.ui.sfx('click');
    const has = this.setup.modifiers.includes(id);
    const next = has ? this.setup.modifiers.filter((x) => x !== id) : [...this.setup.modifiers, id];
    this.setup = { ...this.setup, modifiers: MODIFIER_IDS.filter((x) => next.includes(x)) };
    saveSetup(this.setup);
    this.syncMode();
  }

  /** Reflect the current setup in the mode view (selection states, bests, multiplier). */
  private syncMode(): void {
    const { mode, difficulty, modifiers, mapId } = this.setup;
    for (const [m, b] of this.modeBtns) {
      cls(b, 'is-active', m === mode);
      b.setAttribute('aria-checked', String(m === mode));
    }
    this.modeDesc.set(MODE_INFO[mode].desc);
    for (const [d, b] of this.diffBtns) {
      cls(b, 'is-selected', d === difficulty);
      b.setAttribute('aria-checked', String(d === difficulty));
      const best = this.ui.ctx.save.getBest(mapId, d, mode);
      const bestEl = b.querySelector('.diff-best') as HTMLElement;
      const key = `${mode}|${best.stars}|${best.score}|${best.wave}`;
      if (bestEl.dataset['key'] !== key) {
        bestEl.dataset['key'] = key;
        bestEl.replaceChildren(
          h('span.diff-best-label', null, 'Best'),
          mode === 'campaign'
            ? h('span.diff-stars', { 'aria-label': `Best: ${best.stars} of 3 stars`, html: starsHtml(best.stars) })
            : h('span.diff-best-val', null, best.wave > 0 ? `Wave ${best.wave}` : '–'),
          h('span.diff-best-val', null, best.score > 0 ? fmtInt(best.score) : ''),
        );
      }
    }
    for (const [id, b] of this.modBtns) {
      const on = modifiers.includes(id);
      cls(b, 'is-on', on);
      b.setAttribute('aria-checked', String(on));
    }
    const dm = DIFFICULTIES[difficulty].scoreMultiplier;
    const mm = modifierScoreMultiplier(modifiers);
    this.multTotal.set(fmtMult(dm * mm));
    this.multBreak.set(`${DIFFICULTIES[difficulty].name} ${fmtMult(dm)} · Modifiers ${fmtMult(mm)}`);
  }

  start(): void {
    if (this.view !== 'mode') return;
    this.ui.sfx('click');
    saveSetup(this.setup);
    this.ui.ctx.commands.startGame({ ...this.setup, modifiers: [...this.setup.modifiers] });
  }
}
