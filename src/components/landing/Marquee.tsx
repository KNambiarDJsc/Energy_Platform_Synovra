'use client';
import { useEffect, useRef } from 'react';

/**
 * A line of large outlined type that drifts across the page. Scrolling speeds it up, scrolling back turns it round,
 * and resting the pointer on it slows it almost to a stop so a word can be read. It repeats words the page already
 * says, so it is hidden from assistive technology, and with reduced motion it simply stands still.
 */
export function Marquee({ words }: { words: string[] }) {
  const root = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = root.current;
    const el = track.current;
    if (!box || !el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let hovering = false;
    let visible = false;
    let rate = 1;
    let velocity = 0;
    let lastY = window.scrollY;
    let raf = 0;
    let anim: Animation | undefined;

    const tick = () => {
      raf = 0;
      anim ??= el.getAnimations()[0];
      const y = window.scrollY;
      // Pixels scrolled since the last frame, smoothed so a flick keeps its momentum and then eases away.
      velocity += (y - lastY - velocity) * 0.2;
      lastY = y;
      const push = Math.min(7, Math.abs(velocity) / 8);
      const target = hovering ? 0.08 : velocity < -1.5 ? -(1 + push) : 1 + push;
      rate += (target - rate) * 0.12;
      if (anim) anim.playbackRate = rate;
      if (visible) raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible && !raf) { lastY = window.scrollY; raf = requestAnimationFrame(tick); }
    });
    io.observe(box);
    const enter = () => { hovering = true; };
    const leave = () => { hovering = false; };
    box.addEventListener('pointerenter', enter);
    box.addEventListener('pointerleave', leave);
    return () => { io.disconnect(); box.removeEventListener('pointerenter', enter); box.removeEventListener('pointerleave', leave); cancelAnimationFrame(raf); };
  }, []);

  return (
    <div className="lp-marquee" ref={root} aria-hidden>
      <div className="lp-marquee-track" ref={track}>
        {[0, 1].map((half) => (
          <ul className="lp-marquee-list" key={half}>
            {words.map((w) => (
              <li key={w}><span>{w}</span><i /></li>
            ))}
          </ul>
        ))}
      </div>
    </div>
  );
}
