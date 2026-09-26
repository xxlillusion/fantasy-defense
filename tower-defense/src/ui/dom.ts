// Tiny DOM helpers for the UI overlay. No framework: build once, then diff small values per frame.

type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | EventListener | null | undefined>;

/** Create an element: h('div.panel.gold#id', { title: 'x', onclick: fn }, child, ...). */
export function h<K extends keyof HTMLElementTagNameMap>(sel: K | `${K}.${string}` | `${K}#${string}`, attrs?: Attrs | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const m = /^([a-z0-9]+)((?:[.#][\w-]+)*)$/i.exec(sel);
  const tag = (m ? m[1] : sel) as K;
  const el = document.createElement(tag);
  if (m && m[2]) {
    for (const part of m[2].match(/[.#][\w-]+/g) ?? []) {
      if (part[0] === '.') el.classList.add(part.slice(1));
      else el.id = part.slice(1);
    }
  }
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
      else if (k === 'html') el.innerHTML = String(v);
      else if (k === 'class') el.className = `${el.className} ${v}`.trim();
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

export function append(el: HTMLElement, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** A text node wrapper that only touches the DOM when the value changes. */
export class TextSlot {
  private v: string | undefined;
  constructor(readonly el: HTMLElement) {}
  set(value: string | number): void {
    const s = String(value);
    if (s !== this.v) {
      this.v = s;
      this.el.textContent = s;
    }
  }
}

/** Toggle a class only when its state actually changes. */
export function cls(el: Element, name: string, on: boolean): void {
  if (el.classList.contains(name) !== on) el.classList.toggle(name, on);
}

/** Set an attribute/property-ish value only when changed (cached on the element). */
const styleCache = new WeakMap<HTMLElement, Map<string, string>>();
export function setStyle(el: HTMLElement, prop: string, value: string): void {
  let m = styleCache.get(el);
  if (!m) styleCache.set(el, (m = new Map()));
  if (m.get(prop) === value) return;
  m.set(prop, value);
  el.style.setProperty(prop, value);
}

export function setDisabled(el: HTMLButtonElement, disabled: boolean): void {
  if (el.disabled !== disabled) el.disabled = disabled;
}

export function show(el: HTMLElement, visible: boolean): void {
  cls(el, 'is-hidden', !visible);
}

/** A button that stops propagation and plays the click sound through the supplied callback. */
export function button(label: Child | Child[], className: string, onClick: (e: MouseEvent) => void, attrs?: Attrs): HTMLButtonElement {
  const b = h('button', { type: 'button', ...attrs });
  b.className = `ui-btn ${className}`.trim();
  append(b, Array.isArray(label) ? label : [label]);
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick(e);
  });
  return b;
}

export const fmtInt = (n: number): string => Math.floor(n).toLocaleString('en-US');
