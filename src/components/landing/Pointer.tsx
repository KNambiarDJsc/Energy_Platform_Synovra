'use client';
import { useEffect, useRef } from 'react';

const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));

/**
 * Everything on the landing page that answers the mouse, in one place and one animation loop:
 *   a cursor that trails the pointer and swells over things you can press (the real cursor stays);
 *   [data-magnet]  pulls toward the pointer as it nears, then settles back;
 *   [data-spot]    a soft light and a bright edge that follow the pointer across the surface;
 *   [data-tilt]    leans a little toward the pointer, with a glare;
 *   [data-letters] its children lift and warm up as the pointer passes (--k, 0 to 1);
 *   a ripple where the hero is clicked.
 * It only runs for a fine pointer and when motion is welcome, never takes a click (every layer is pointer-events:
 * none), and the loop sleeps as soon as everything has settled. Nothing here carries information.
 */
export function Pointer() {
  const ring = useRef<HTMLDivElement>(null);
  const dot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fine = window.matchMedia('(pointer: fine)');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const root = document.querySelector<HTMLElement>('.lp');
    const ringEl = ring.current;
    const dotEl = dot.current;
    if (!fine.matches || reduced.matches || !root || !ringEl || !dotEl) return;
    root.classList.add('has-pointer');

    const magnets = Array.from(root.querySelectorAll<HTMLElement>('[data-magnet]')).map((el) => ({ el, x: 0, y: 0 }));
    const spots = Array.from(root.querySelectorAll<HTMLElement>('[data-spot]'));
    const tilts = Array.from(root.querySelectorAll<HTMLElement>('[data-tilt]')).map((el) => ({ el, rx: 0, ry: 0 }));
    const lettered = Array.from(root.querySelectorAll<HTMLElement>('[data-letters]')).map((el) => ({ el, spans: Array.from(el.children) as HTMLElement[], k: [] as number[] }));

    let px = -200, py = -200, rx = -200, ry = -200;
    let seen = false;
    let raf = 0;

    const frame = () => {
      raf = 0;
      let busy = false;
      const vh = window.innerHeight;

      // the cursor: the dot is the pointer, the ring trails it
      rx += (px - rx) * 0.2;
      ry += (py - ry) * 0.2;
      ringEl.style.transform = `translate3d(${rx.toFixed(1)}px, ${ry.toFixed(1)}px, 0)`;
      dotEl.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0)`;
      if (Math.hypot(px - rx, py - ry) > 0.2) busy = true;

      // magnets
      for (const m of magnets) {
        const r = m.el.getBoundingClientRect();
        if (r.bottom < -80 || r.top > vh + 80) continue;
        const cx = r.left + r.width / 2 - m.x;
        const cy = r.top + r.height / 2 - m.y;
        const dx = px - cx;
        const dy = py - cy;
        const reach = Math.max(r.width, r.height) * 0.8 + 36;
        const d = Math.hypot(dx, dy);
        let tx = 0;
        let ty = 0;
        if (d < reach) {
          const pull = 1 - d / reach;
          tx = clamp(dx * pull * 0.4, -12, 12);
          ty = clamp(dy * pull * 0.4, -9, 9);
        }
        m.x += (tx - m.x) * 0.16;
        m.y += (ty - m.y) * 0.16;
        if (Math.abs(m.x - tx) < 0.03 && Math.abs(m.y - ty) < 0.03) { m.x = tx; m.y = ty; } else busy = true;
        m.el.style.setProperty('--tx', `${m.x.toFixed(2)}px`);
        m.el.style.setProperty('--ty', `${m.y.toFixed(2)}px`);
      }

      // surfaces that light up where the pointer is
      for (const el of spots) {
        const r = el.getBoundingClientRect();
        const inside = px >= r.left && px <= r.right && py >= r.top && py <= r.bottom && r.bottom > 0 && r.top < vh;
        if (inside) {
          el.style.setProperty('--sx', `${(px - r.left).toFixed(0)}px`);
          el.style.setProperty('--sy', `${(py - r.top).toFixed(0)}px`);
          if (!el.hasAttribute('data-spot-on')) el.setAttribute('data-spot-on', '');
        } else if (el.hasAttribute('data-spot-on')) el.removeAttribute('data-spot-on');
      }

      // things that lean toward the pointer
      for (const t of tilts) {
        const r = t.el.getBoundingClientRect();
        const inside = px >= r.left && px <= r.right && py >= r.top && py <= r.bottom;
        const nx = inside ? (px - (r.left + r.width / 2)) / (r.width / 2) : 0;
        const ny = inside ? (py - (r.top + r.height / 2)) / (r.height / 2) : 0;
        const ty = nx * 5;
        const tx = -ny * 4;
        t.ry += (ty - t.ry) * 0.12;
        t.rx += (tx - t.rx) * 0.12;
        if (Math.abs(t.ry - ty) > 0.02 || Math.abs(t.rx - tx) > 0.02) busy = true;
        t.el.style.setProperty('--rx', `${t.rx.toFixed(2)}deg`);
        t.el.style.setProperty('--ry', `${t.ry.toFixed(2)}deg`);
        t.el.style.setProperty('--gx', `${((nx + 1) * 50).toFixed(0)}%`);
        t.el.style.setProperty('--gy', `${((ny + 1) * 50).toFixed(0)}%`);
        if (inside) t.el.setAttribute('data-tilt-on', ''); else t.el.removeAttribute('data-tilt-on');
      }

      // letters that rise and warm as the pointer passes
      for (const group of lettered) {
        const box = group.el.getBoundingClientRect();
        const near = box.bottom > 0 && box.top < vh;
        const reach = box.height * 0.95;
        group.spans.forEach((span, i) => {
          let target = 0;
          if (near) {
            const r = span.getBoundingClientRect();
            const d = Math.hypot(px - (r.left + r.width / 2), py - (r.top + r.height / 2));
            target = Math.pow(clamp(1 - d / reach), 1.6);
          }
          const cur = group.k[i] ?? 0;
          const next = cur + (target - cur) * 0.14;
          group.k[i] = Math.abs(next - target) < 0.005 ? target : next;
          if (group.k[i] !== target) busy = true;
          span.style.setProperty('--k', group.k[i].toFixed(3));
        });
      }

      if (busy) schedule();
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(frame); };

    const onMove = (e: PointerEvent) => {
      px = e.clientX;
      py = e.clientY;
      if (!seen) {
        seen = true;
        rx = px;
        ry = py;
        ringEl.classList.add('is-on');
        dotEl.classList.add('is-on');
      }
      schedule();
    };
    const onOver = (e: PointerEvent) => {
      const el = e.target as Element | null;
      if (!el?.closest) return;
      const field = el.closest('input:not([type=range]):not([type=checkbox]):not([type=radio]), textarea');
      const press = el.closest('a, button, [role="button"], summary, label, select, input[type=range], input[type=checkbox], input[type=radio]');
      ringEl.dataset.state = field ? 'text' : press ? 'press' : '';
    };
    const onDown = (e: PointerEvent) => {
      ringEl.dataset.down = '1';
      const hero = (e.target as Element | null)?.closest?.('[data-hero]') as HTMLElement | null;
      if (hero && !(e.target as Element).closest('a, button')) {
        const r = hero.getBoundingClientRect();
        const pulse = document.createElement('span');
        pulse.className = 'lp-pulse';
        pulse.style.left = `${e.clientX - r.left}px`;
        pulse.style.top = `${e.clientY - r.top}px`;
        hero.appendChild(pulse);
        pulse.addEventListener('animationend', () => pulse.remove());
        window.setTimeout(() => pulse.remove(), 1600);
      }
    };
    const onUp = () => { delete ringEl.dataset.down; };
    const onLeave = () => { ringEl.classList.remove('is-on'); dotEl.classList.remove('is-on'); seen = false; px = py = -200; schedule(); };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerover', onOver, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    window.addEventListener('scroll', schedule, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerover', onOver);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('scroll', schedule);
      document.documentElement.removeEventListener('pointerleave', onLeave);
      cancelAnimationFrame(raf);
      root.classList.remove('has-pointer');
    };
  }, []);

  return (
    <>
      <div className="lp-cursor-ring" ref={ring} aria-hidden />
      <div className="lp-cursor-dot" ref={dot} aria-hidden />
    </>
  );
}
