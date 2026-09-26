// Results modal: result, (animated) stars, score, wave reached, per-field "New best", modifiers used,
// stats, Retry (same options) / Title. Runs are recorded by main.ts; we only compare against the bests
// read at gameStarted.
import type { BestRecord } from '../../core/interfaces';
import type { GameSnapshot } from '../../core/types';
import { DIFFICULTIES, getMap, MODIFIERS, modifierScoreMultiplier } from '../../data';
import { button, fmtInt, h } from '../dom';
import { modifierIcon, starSvg } from '../icons';
import type { Ui } from '../shared';

export interface RunResult {
  score: number;
  wave: number;
}

export class GameOverScreen {
  readonly el: HTMLElement;
  private body: HTMLElement;

  constructor(private ui: Ui) {
    this.body = h('div.modal.panel.gameover-modal', { role: 'dialog' });
    this.el = h('div.screen.modal-screen.gameover-screen.is-hidden', null, this.body);
  }

  get visible(): boolean {
    return !this.el.classList.contains('is-hidden');
  }

  show(s: GameSnapshot, prev: BestRecord | null, run: RunResult | null): void {
    const victory = s.phase === 'victory';
    const endless = s.mode === 'endless';
    const stars = victory && !endless ? s.stars : 0;
    const score = run?.score ?? s.score;
    const wave = run?.wave ?? s.wave;
    const best = prev ?? { stars: 0, score: 0, wave: 0 };
    const newStars = !endless && victory && stars > best.stars;
    const newScore = score > best.score && score > 0;
    const newWave = wave > best.wave && wave > 0;

    const stat = (label: string, value: string) => [h('dt', null, label), h('dd', null, value)];
    const tag = (on: boolean) => (on ? h('span.best-tag', null, 'New best') : '');
    const map = getMap(s.mapId);

    let title: string;
    let kicker: string;
    if (endless) {
      title = `The portal fell at wave ${wave}`;
      kicker = `Endless · ${map.name}`;
    } else {
      title = victory ? 'Victory' : 'Defeat';
      kicker = victory ? 'The shrine endures' : 'The portal has gone dark';
    }

    const starRow = endless
      ? ''
      : h('div.result-stars', {
          'aria-label': `${stars} of 3 stars`,
          html: [1, 2, 3].map((i) => starSvg(`star big ${i <= stars ? 'is-on anim' : ''}`)).join(''),
        });
    if (starRow) [...starRow.children].forEach((el, i) => (el as SVGElement).style.setProperty('--d', `${0.35 + i * 0.35}s`));

    const mult = DIFFICULTIES[s.difficulty].scoreMultiplier * modifierScoreMultiplier(s.modifiers);
    const mods = s.modifiers.length
      ? h(
          'div.result-mods',
          null,
          ...s.modifiers.map((id) => h('span.result-mod', { title: MODIFIERS[id].description }, h('span.mod-icon', { html: modifierIcon(id) }), MODIFIERS[id].name)),
        )
      : h('div.result-mods.is-empty', null, 'No modifiers');

    this.body.className = `modal panel gameover-modal ${victory ? 'is-victory' : 'is-defeat'}${endless ? ' is-endless' : ''}`;
    this.body.setAttribute('aria-label', title);
    this.body.replaceChildren(
      h('div.result-kicker', null, kicker),
      h('h2.result-title', { class: endless ? 'is-long' : '' }, title),
      starRow,
      newStars ? h('div.new-best', null, 'New best!') : '',
      h(
        'div.result-score',
        null,
        h('div.rs-cell', null, h('span.rs-label', null, 'Score'), h('span.rs-value', null, fmtInt(score)), tag(newScore)),
        h('div.rs-cell', null, h('span.rs-label', null, 'Wave reached'), h('span.rs-value', null, s.totalWaves === null ? String(wave) : `${wave}/${s.totalWaves}`), tag(newWave)),
      ),
      h('div.result-meta', null, `${map.name} · ${DIFFICULTIES[s.difficulty].name} · ${endless ? 'Endless' : 'Campaign'} · Score ×${mult.toFixed(2)}`),
      mods,
      h(
        'dl.stat-grid.result-stats',
        null,
        ...stat('Enemies slain', fmtInt(s.stats.kills)),
        ...stat('Leaks', fmtInt(s.stats.leaks)),
        ...stat('Gold earned', fmtInt(s.stats.goldEarned)),
        ...stat('Towers built', fmtInt(s.stats.towersBuilt)),
        ...stat('Lives left', `${s.lives}/${s.maxLives}`),
        ...stat('Hero level', s.hero ? String(s.hero.level) : '–'),
      ),
      h(
        'div.modal-actions',
        null,
        button('Retry', 'menu-btn primary', () => this.retry()),
        button('Title', 'menu-btn', () => this.toTitle()),
      ),
      h('div.modal-hint', null, 'Enter / R retry · Esc title'),
    );
    this.el.classList.remove('is-hidden');
  }

  retry(): void {
    const s = this.ui.snap();
    this.ui.sfx('click');
    this.ui.ctx.commands.startGame({ difficulty: s.difficulty, mapId: s.mapId, mode: s.mode, modifiers: [...s.modifiers] });
  }

  toTitle(): void {
    this.ui.sfx('close');
    this.ui.ctx.commands.returnToTitle();
  }

  hide(): void {
    this.el.classList.add('is-hidden');
  }
}
