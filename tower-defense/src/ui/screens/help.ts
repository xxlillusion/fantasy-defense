// Controls cheat-sheet overlay ("?" button / ? key).
import { button, h } from '../dom';
import type { Ui } from '../shared';

const GROUPS: [string, [string, string][]][] = [
  [
    'Build',
    [
      ['1 – 5', 'Place a tower (Shift+click to keep placing)'],
      ['U', 'Upgrade the selected tower'],
      ['Z / X', 'Pick specialization A / B (level 3)'],
      ['S', 'Sell (press twice)'],
      ['Tab', 'Cycle targeting'],
    ],
  ],
  [
    'Hero & spells',
    [
      ['H', 'Select Aldric, then click to rally'],
      ['Q', 'Meteor (click to aim)'],
      ['W', 'Frost Nova'],
      ['E', 'Gold Rush'],
      ['R', 'Blade Storm'],
    ],
  ],
  [
    'Game',
    [
      ['N / Enter', 'Send the next wave'],
      ['Space', 'Pause / resume'],
      ['F', 'Toggle 2× speed'],
      ['Esc', 'Cancel → deselect → menu'],
      ['Right-click', 'Cancel / deselect'],
      ['?', 'This sheet'],
    ],
  ],
];

export class HelpScreen {
  readonly el: HTMLElement;

  constructor(ui: Ui) {
    this.el = h(
      'div.screen.modal-screen.help-screen.is-hidden',
      null,
      h(
        'div.modal.panel.help-modal',
        { role: 'dialog', 'aria-label': 'Controls' },
        h('h2.screen-title', null, 'Controls'),
        h(
          'div.help-groups',
          null,
          ...GROUPS.map(([title, rows]) =>
            h('section.help-group', null, h('h3.help-title', null, title), h('dl.help-list', null, ...rows.flatMap(([k, v]) => [h('dt', null, ...k.split(' / ').flatMap((part, i) => [i ? ' / ' : '', h('kbd', null, part)])), h('dd', null, v)]))),
          ),
        ),
        h('div.modal-actions', null, button('Close', 'menu-btn small', () => ui.closeOverlay())),
        h('div.modal-hint', null, 'Esc or ? to close'),
      ),
    );
  }
}
