// Pause menu: Resume, Settings, Restart (same difficulty), Quit to title. Restart/Quit confirm on second click.
import { button, h } from '../dom';
import { gearGlyph } from '../icons';
import type { Ui } from '../shared';

export class PauseScreen {
  readonly el: HTMLElement;
  private restartBtn: HTMLButtonElement;
  private quitBtn: HTMLButtonElement;
  private armed: 'restart' | 'quit' | null = null;

  constructor(private ui: Ui) {
    this.restartBtn = button('Restart', 'menu-btn', () => this.confirm('restart'));
    this.quitBtn = button('Quit to Title', 'menu-btn', () => this.confirm('quit'));
    this.el = h(
      'div.screen.modal-screen.pause-screen.is-hidden',
      null,
      h(
        'div.modal.panel',
        { role: 'dialog', 'aria-label': 'Paused' },
        h('h2.screen-title', null, 'Paused'),
        h(
          'div.menu-col',
          null,
          button('Resume', 'menu-btn primary', () => ui.closeOverlay()),
          button([h('span.btn-glyph', { html: gearGlyph }), 'Settings'], 'menu-btn', () => {
            ui.sfx('open');
            ui.openSettings('pause');
          }),
          this.restartBtn,
          this.quitBtn,
        ),
        h('div.modal-hint', null, 'Esc to resume'),
      ),
    );
  }

  reset(): void {
    this.armed = null;
    this.restartBtn.textContent = 'Restart';
    this.quitBtn.textContent = 'Quit to Title';
    this.restartBtn.classList.remove('is-armed');
    this.quitBtn.classList.remove('is-armed');
  }

  private confirm(what: 'restart' | 'quit'): void {
    if (this.armed !== what) {
      this.reset();
      this.armed = what;
      const b = what === 'restart' ? this.restartBtn : this.quitBtn;
      b.textContent = what === 'restart' ? 'Restart? Click again' : 'Quit? Click again';
      b.classList.add('is-armed');
      this.ui.sfx('click');
      return;
    }
    this.reset();
    const s = this.ui.snap();
    this.ui.sfx(what === 'restart' ? 'click' : 'close');
    this.ui.closeOverlay();
    if (what === 'restart') this.ui.ctx.commands.startGame(s.difficulty, s.mapId);
    else this.ui.ctx.commands.returnToTitle();
  }
}
