// Title screen (Play / Settings) and difficulty select. Translucent so the 3D shrine shows through.
import type { Difficulty } from '../../core/types';
import { DEFAULT_MAP_ID, DIFFICULTIES, getMap } from '../../data';
import { button, h } from '../dom';
import { gearGlyph, portalIcon, starSvg } from '../icons';
import type { Ui } from '../shared';

const FLAVOR: Record<Difficulty, string> = {
  easy: 'A gentle pilgrimage. Plenty of light to spare.',
  normal: 'The true trial of the shrine.',
  hard: 'For seasoned guardians. The portal flickers.',
};

export class TitleScreen {
  readonly el: HTMLElement;
  private main: HTMLElement;
  private diff: HTMLElement;
  private diffCards: HTMLElement;
  private view: 'main' | 'difficulty' = 'main';

  constructor(private ui: Ui) {
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
        button('Play', 'menu-btn primary', () => this.showDifficulty()),
        button([h('span.btn-glyph', { html: gearGlyph }), 'Settings'], 'menu-btn', () => {
          ui.sfx('open');
          ui.openSettings('title');
        }),
      ),
      h('div.title-hint', null, 'Guard the spirit portal. Build towers, send waves, survive all 20.'),
    );

    this.diffCards = h('div.diff-cards');
    this.diff = h(
      'div.title-diff.is-hidden',
      null,
      h('h2.screen-title', null, 'Choose Difficulty'),
      h('div.screen-sub', null, getMap(DEFAULT_MAP_ID).name),
      this.diffCards,
      button('Back', 'menu-btn small', () => this.showMain(true)),
    );

    this.el = h('div.screen.title-screen', null, h('div.title-vignette'), this.main, this.diff);
  }

  get isDifficulty(): boolean {
    return this.view === 'difficulty';
  }

  showMain(sound = false): void {
    if (sound) this.ui.sfx('close');
    this.view = 'main';
    this.main.classList.remove('is-hidden');
    this.diff.classList.add('is-hidden');
  }

  showDifficulty(): void {
    this.ui.sfx('open');
    this.view = 'difficulty';
    this.renderCards();
    this.main.classList.add('is-hidden');
    this.diff.classList.remove('is-hidden');
  }

  private renderCards(): void {
    const mapId = DEFAULT_MAP_ID;
    this.diffCards.replaceChildren(
      ...(Object.keys(DIFFICULTIES) as Difficulty[]).map((d) => {
        const def = DIFFICULTIES[d];
        const best = this.ui.ctx.save.getBestStars(mapId, d);
        const stars = h('div.diff-stars', { 'aria-label': `Best: ${best} of 3 stars`, html: [1, 2, 3].map((i) => starSvg(`star ${i <= best ? 'is-on' : ''}`)).join('') });
        const card = h(
          'button.ui-btn.diff-card',
          { type: 'button', class: `diff-${d}` },
          h('div.diff-name', null, def.name),
          h('div.diff-flavor', null, FLAVOR[d]),
          h(
            'dl.stat-grid.diff-stats',
            null,
            h('dt', null, 'Lives'),
            h('dd', null, String(def.lives)),
            h('dt', null, 'Gold'),
            h('dd', null, String(def.startGold)),
            h('dt', null, 'Foe HP'),
            h('dd', null, `×${def.hpMultiplier.toFixed(2)}`),
          ),
          h('div.diff-best', null, h('span.diff-best-label', null, 'Best'), stars),
        );
        card.addEventListener('click', (e) => {
          e.stopPropagation();
          this.ui.sfx('click');
          this.ui.ctx.commands.startGame(d, mapId);
        });
        return card;
      }),
    );
  }
}
