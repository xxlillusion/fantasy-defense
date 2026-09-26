// Toast stack (short messages) and the large centre banner ("Wave 5", "Wave cleared").
import { h } from './dom';
import type { ToastKind } from './shared';

const MAX_TOASTS = 4;
const TOAST_MS = 2600;

export class Toasts {
  readonly el = h('div.toast-stack', { role: 'status', 'aria-live': 'polite' });
  readonly bannerEl = h('div.banner.is-off', { 'aria-live': 'polite' });
  private lastText = '';
  private lastAt = 0;
  private bannerTimer = 0;

  toast(text: string, kind: ToastKind = 'info'): void {
    const now = performance.now();
    if (text === this.lastText && now - this.lastAt < 700) return;
    this.lastText = text;
    this.lastAt = now;
    const t = h(`div.toast`, { class: `toast-${kind}` }, text);
    this.el.append(t);
    while (this.el.childElementCount > MAX_TOASTS) this.el.firstElementChild!.remove();
    window.setTimeout(() => t.classList.add('is-leaving'), TOAST_MS - 350);
    window.setTimeout(() => t.remove(), TOAST_MS);
  }

  banner(title: string, sub = '', kind: 'wave' | 'clear' | 'boss' | 'warn' = 'wave', ms = 2200): void {
    window.clearTimeout(this.bannerTimer);
    this.bannerEl.className = `banner banner-${kind}`;
    this.bannerEl.replaceChildren(h('div.banner-rule'), h('div.banner-title', null, title), sub ? h('div.banner-sub', null, sub) : '', h('div.banner-rule'));
    // restart animation
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('is-showing');
    this.bannerTimer = window.setTimeout(() => this.bannerEl.classList.add('is-off'), ms);
  }

  clear(): void {
    this.el.replaceChildren();
    window.clearTimeout(this.bannerTimer);
    this.bannerEl.classList.add('is-off');
  }
}
