'use client';
import { useEffect } from 'react';

/**
 * Fluid hover, after fluidfunctionalism.com: motion is information. In any `[data-fluid]` list, a single highlight
 * glides to the item NEAREST the pointer, before the pointer is over it, so the target is known before the click.
 * The highlight is one element moved by transitions, so reversing mid-move simply redirects it (it is interruptible).
 * Arrow keys move between items and the highlight follows focus. With reduced motion it jumps instead of gliding.
 *
 *   <ul data-fluid="y">  <li><a data-fluid-item href="...">…</a></li> …  </ul>      data-fluid="x" for a row
 *
 * It only moves a highlight; it never changes what a control does, and without script every control still works.
 */
export function attachFluid(list: HTMLElement): () => void {
    const axis = list.dataset.fluid === 'x' ? 'x' : 'y';
    if (getComputedStyle(list).position === 'static') list.style.position = 'relative';
    const pill = document.createElement('span');
    pill.className = 'fl-pill';
    pill.setAttribute('aria-hidden', 'true');
    list.prepend(pill);
    const items = () => Array.from(list.querySelectorAll<HTMLElement>('[data-fluid-item]'));
    let current: HTMLElement | null = null;

    /** Position of an element inside the list's own scrolling box. */
    const place = (el: HTMLElement) => {
      let x = 0, y = 0;
      let node: HTMLElement | null = el;
      while (node && node !== list) { x += node.offsetLeft; y += node.offsetTop; node = node.offsetParent as HTMLElement | null; }
      return { x, y, w: el.offsetWidth, h: el.offsetHeight };
    };
    const show = (el: HTMLElement | null) => {
      if (el === current) return;
      current?.removeAttribute('data-near');
      current = el;
      if (!el) { list.removeAttribute('data-fluid-on'); return; }
      el.setAttribute('data-near', '');
      const p = place(el);
      pill.style.transform = `translate(${p.x}px, ${p.y}px)`;
      pill.style.width = `${p.w}px`;
      pill.style.height = `${p.h}px`;
      list.setAttribute('data-fluid-on', '');
    };
    const nearest = (e: PointerEvent) => {
      let best: HTMLElement | null = null;
      let bestD = Infinity;
      for (const el of items()) {
        const r = el.getBoundingClientRect();
        const dx = e.clientX < r.left ? r.left - e.clientX : e.clientX > r.right ? e.clientX - r.right : 0;
        const dy = e.clientY < r.top ? r.top - e.clientY : e.clientY > r.bottom ? e.clientY - r.bottom : 0;
        // Along the list's own axis distance counts in full; across it, a little less, so the near row wins over a far column.
        const d = axis === 'y' ? dy * 1.0 + dx * 0.15 : dx * 1.0 + dy * 0.15;
        if (d < bestD) { bestD = d; best = el; }
      }
      return best;
    };
    const onMove = (e: PointerEvent) => { if (e.pointerType !== 'touch') show(nearest(e)); };
    const onLeave = () => { if (!list.contains(document.activeElement) || !(document.activeElement as HTMLElement).matches('[data-fluid-item]')) show(null); else show(document.activeElement as HTMLElement); };
    const onFocus = (e: FocusEvent) => { const t = (e.target as HTMLElement).closest<HTMLElement>('[data-fluid-item]'); if (t && list.contains(t)) show(t); };
    const onKey = (e: KeyboardEvent) => {
      const forward = axis === 'y' ? 'ArrowDown' : 'ArrowRight';
      const back = axis === 'y' ? 'ArrowUp' : 'ArrowLeft';
      if (e.key !== forward && e.key !== back) return;
      const all = items();
      const at = all.indexOf((e.target as HTMLElement).closest<HTMLElement>('[data-fluid-item]') as HTMLElement);
      if (at < 0) return;
      e.preventDefault();
      all[(at + (e.key === forward ? 1 : all.length - 1)) % all.length].focus();
    };
    const onResize = () => { if (current) { const el = current; current = null; show(el); } };

    list.addEventListener('pointermove', onMove);
    list.addEventListener('pointerleave', onLeave);
    list.addEventListener('focusin', onFocus);
    list.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      list.removeEventListener('pointermove', onMove);
      list.removeEventListener('pointerleave', onLeave);
      list.removeEventListener('focusin', onFocus);
      list.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      pill.remove();
    };
}

export function FluidHover() {
  useEffect(() => {
    const cleanups = Array.from(document.querySelectorAll<HTMLElement>('.lp [data-fluid]')).map(attachFluid);
    return () => cleanups.forEach((fn) => fn());
  }, []);
  return null;
}
