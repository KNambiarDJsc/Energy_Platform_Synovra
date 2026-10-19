'use client';
import { useEffect } from 'react';

/**
 * Scroll-linked motion with no animation library: each `[data-scene]` gets a CSS variable `--p` from 0 to 1 and
 * the stylesheet decides what that moves. Four kinds of scene:
 *   data-scene="through"  0 when it enters at the bottom of the screen, 1 when it has left at the top
 *   data-scene="pin"      0 when its top reaches the top of the screen, 1 when its bottom reaches the bottom
 *   data-scene="leave"    0 while its top is at the top of the screen, 1 once it has scrolled fully away
 *   data-scene="enter"    0 when its top enters at the bottom of the screen, 1 once all of it is in view
 * It also publishes the height of the demonstration notice as --banner-h so fixed parts sit beneath it.
 * With reduced motion, or before this runs, `--p` stays at the stylesheet's resting value and nothing moves.
 */
export function Motion() {
  useEffect(() => {
    const scenes = Array.from(document.querySelectorAll<HTMLElement>('.lp [data-scene]'));
    const note = document.querySelector<HTMLElement>('.lp > [role="note"]');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const root = document.documentElement;
    let frame = 0;

    const measureNote = () => {
      if (note) root.style.setProperty('--banner-h', `${note.offsetHeight}px`);
    };
    const clamp = (n: number) => Math.min(1, Math.max(0, n));

    const update = () => {
      frame = 0;
      if (reduced.matches) return;
      const vh = window.innerHeight;
      for (const el of scenes) {
        const r = el.getBoundingClientRect();
        if (r.bottom < -vh || r.top > vh * 2) continue; // far from view: leave it where it was
        const kind = el.dataset.scene;
        const p = kind === 'pin' ? clamp(-r.top / Math.max(1, r.height - vh)) : kind === 'leave' ? clamp(-r.top / r.height) : kind === 'enter' ? clamp((vh - r.top) / r.height) : clamp((vh - r.top) / (vh + r.height));
        el.style.setProperty('--p', p.toFixed(4));
      }
      // The line of scroll depth, for the thin progress mark at the top of the page.
      const max = document.documentElement.scrollHeight - vh;
      root.style.setProperty('--page', max > 0 ? clamp(window.scrollY / max).toFixed(4) : '0');
    };
    const queue = () => { if (!frame) frame = requestAnimationFrame(update); };

    measureNote();
    update();
    window.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', () => { measureNote(); queue(); });
    const ro = note ? new ResizeObserver(measureNote) : null;
    if (note) ro?.observe(note);
    reduced.addEventListener('change', queue);
    return () => {
      window.removeEventListener('scroll', queue);
      ro?.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);
  return null;
}
