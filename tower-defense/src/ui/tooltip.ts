// The single shared tooltip. Only one is visible at a time.
import { h } from './dom';

export class Tooltip {
  readonly el = h('div.tooltip.panel.is-hidden', { role: 'tooltip' });
  private anchor: HTMLElement | null = null;

  show(anchor: HTMLElement, content: Node): void {
    this.anchor = anchor;
    this.el.replaceChildren(content);
    this.el.classList.remove('is-hidden');
    const a = anchor.getBoundingClientRect();
    const t = this.el.getBoundingClientRect();
    const margin = 8;
    let x = a.left + a.width / 2 - t.width / 2;
    x = Math.max(margin, Math.min(window.innerWidth - t.width - margin, x));
    let y = a.top - t.height - 10;
    if (y < margin) y = a.bottom + 10;
    this.el.style.left = `${Math.round(x)}px`;
    this.el.style.top = `${Math.round(y)}px`;
  }

  hide(anchor?: HTMLElement): void {
    if (anchor && anchor !== this.anchor) return;
    this.anchor = null;
    this.el.classList.add('is-hidden');
  }
}
