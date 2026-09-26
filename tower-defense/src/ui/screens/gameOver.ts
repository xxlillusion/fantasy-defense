// Victory / Defeat modal: result, (animated) stars, stats, "New best!", Retry / Title.
import type { GameSnapshot, Stars } from '../../core/types';
import { button, fmtInt, h } from '../dom';
import { starSvg } from '../icons';
import type { Ui } from '../shared';

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

  show(s: GameSnapshot, prevBest: Stars): void {
    const victory = s.phase === 'victory';
    const stars = victory ? s.stars : 0;
    const newBest = victory && stars > prevBest;
    const survived = victory ? s.totalWaves : Math.max(0, s.wave - 1);
    const starRow = h('div.result-stars', {
      'aria-label': `${stars} of 3 stars`,
      html: [1, 2, 3].map((i) => starSvg(`star big ${i <= stars ? 'is-on anim' : ''}`)).join(''),
    });
    [...starRow.children].forEach((el, i) => (el as SVGElement).style.setProperty('--d', `${0.35 + i * 0.35}s`));

    const stat = (label: string, value: string) => [h('dt', null, label), h('dd', null, value)];
    this.body.className = `modal panel gameover-modal ${victory ? 'is-victory' : 'is-defeat'}`;
    this.body.setAttribute('aria-label', victory ? 'Victory' : 'Defeat');
    this.body.replaceChildren(
      h('div.result-kicker', null, victory ? 'The shrine endures' : 'The portal has gone dark'),
      h('h2.result-title', null, victory ? 'Victory' : 'Defeat'),
      starRow,
      newBest ? h('div.new-best', null, 'New best!') : '',
      h(
        'dl.stat-grid.result-stats',
        null,
        ...stat('Waves survived', `${survived}/${s.totalWaves}`),
        ...stat('Enemies slain', fmtInt(s.stats.kills)),
        ...stat('Leaks', fmtInt(s.stats.leaks)),
        ...stat('Gold earned', fmtInt(s.stats.goldEarned)),
        ...stat('Towers built', fmtInt(s.stats.towersBuilt)),
        ...stat('Lives left', `${s.lives}/${s.maxLives}`),
      ),
      h(
        'div.modal-actions',
        null,
        button('Retry', 'menu-btn primary', () => this.retry()),
        button('Title', 'menu-btn', () => this.toTitle()),
      ),
    );
    this.el.classList.remove('is-hidden');
  }

  retry(): void {
    const s = this.ui.snap();
    this.ui.sfx('click');
    this.ui.ctx.commands.startGame({ difficulty: s.difficulty, mapId: s.mapId, mode: s.mode, modifiers: s.modifiers });
  }

  toTitle(): void {
    this.ui.sfx('close');
    this.ui.ctx.commands.returnToTitle();
  }

  hide(): void {
    this.el.classList.add('is-hidden');
  }
}
