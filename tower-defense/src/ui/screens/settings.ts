// Settings: master/music/sfx volume, mute, damage numbers, screen shake, new-enemy intros. Persists via save.saveSettings.
import type { AudioSettings } from '../../core/interfaces';
import { button, h } from '../dom';
import type { Ui } from '../shared';

type VolKey = 'master' | 'music' | 'sfx';

export class SettingsScreen {
  readonly el: HTMLElement;
  private sliders = new Map<VolKey, { input: HTMLInputElement; out: HTMLElement }>();
  private muted: HTMLInputElement;
  private dmg: HTMLInputElement;
  private shake: HTMLInputElement;
  private intros: HTMLInputElement;

  constructor(private ui: Ui) {
    const rows: HTMLElement[] = [];
    const vols: [VolKey, string][] = [
      ['master', 'Master'],
      ['music', 'Music'],
      ['sfx', 'Effects'],
    ];
    for (const [key, label] of vols) {
      const input = h('input.slider', { type: 'range', min: 0, max: 100, step: 1, 'aria-label': `${label} volume` });
      const out = h('output.slider-val');
      input.addEventListener('input', () => {
        out.textContent = input.value;
        input.style.setProperty('--fill', `${input.value}%`);
        this.applyAudio({ [key]: Number(input.value) / 100 });
      });
      input.addEventListener('change', () => {
        ui.saveSettings();
        ui.sfx('click');
      });
      this.sliders.set(key, { input, out });
      rows.push(h('label.set-row', null, h('span.set-label', null, label), input, out));
    }
    this.muted = h('input.toggle', { type: 'checkbox', role: 'switch' });
    this.muted.addEventListener('change', () => {
      this.applyAudio({ muted: this.muted.checked });
      ui.saveSettings();
      ui.sfx('click');
    });
    this.dmg = h('input.toggle', { type: 'checkbox', role: 'switch' });
    this.dmg.addEventListener('change', () => {
      ui.state.settings.showDamageNumbers = this.dmg.checked;
      ui.saveSettings();
      ui.sfx('click');
    });
    const toggle = (apply: (on: boolean) => void): HTMLInputElement => {
      const input = h('input.toggle', { type: 'checkbox', role: 'switch' });
      input.addEventListener('change', () => {
        apply(input.checked);
        ui.saveSettings();
        ui.sfx('click');
      });
      return input;
    };
    this.shake = toggle((on) => (ui.state.settings.screenShake = on));
    this.intros = toggle((on) => (ui.state.settings.enemyIntros = on));
    const row = (label: string, input: HTMLInputElement) => h('label.set-row', null, h('span.set-label', null, label), h('span.toggle-wrap', null, input, h('span.toggle-knob')));
    rows.push(row('Mute all', this.muted));
    rows.push(row('Damage numbers', this.dmg));
    rows.push(row('Screen shake', this.shake));
    rows.push(row('New-enemy intros', this.intros));

    this.el = h(
      'div.screen.modal-screen.settings-screen.is-hidden',
      null,
      h(
        'div.modal.panel',
        { role: 'dialog', 'aria-label': 'Settings' },
        h('h2.screen-title', null, 'Settings'),
        h('div.set-rows', null, ...rows),
        h('div.modal-actions', null, button('Back', 'menu-btn', () => ui.closeOverlay())),
      ),
    );
  }

  /** Refresh controls from the current settings (call when opening). */
  sync(): void {
    const a = this.ui.state.settings.audio;
    for (const [key, { input, out }] of this.sliders) {
      const v = String(Math.round(a[key] * 100));
      input.value = v;
      out.textContent = v;
      input.style.setProperty('--fill', `${v}%`);
    }
    this.muted.checked = a.muted;
    this.dmg.checked = this.ui.state.settings.showDamageNumbers;
    this.shake.checked = this.ui.state.settings.screenShake;
    this.intros.checked = this.ui.state.settings.enemyIntros;
  }

  private applyAudio(patch: Partial<AudioSettings>): void {
    const s = this.ui.state.settings;
    s.audio = { ...s.audio, ...patch };
    this.ui.ctx.audio.setSettings(patch);
  }
}
