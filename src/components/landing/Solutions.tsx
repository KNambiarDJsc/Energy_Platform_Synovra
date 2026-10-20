'use client';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Slot } from './Slot';

export interface Solution { key: string; n: string; title: string; text: string; href: string; slot: string; note: string; art?: ReactNode }

/**
 * The solutions row, after shift5's pull-up slider: cards in a row you can drag, scroll, or step with the arrows.
 * It snaps to a card, the progress mark follows, and each card keeps working with the keyboard (it is a list of
 * links). A drag never opens a card: movement past a few pixels cancels the click that ends it.
 */
export function Solutions({ items }: { items: Solution[] }) {
  const track = useRef<HTMLUListElement>(null);
  const [progress, setProgress] = useState({ at: 0, can: { back: false, next: true } });

  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setProgress({ at: max > 0 ? el.scrollLeft / max : 0, can: { back: el.scrollLeft > 4, next: el.scrollLeft < max - 4 } });
  }, []);

  useEffect(() => {
    const el = track.current;
    if (!el) return;
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);

    // drag to scroll, with a fine pointer only (touch already scrolls natively)
    let down = false, moved = 0, startX = 0, startLeft = 0;
    const onDown = (e: PointerEvent) => { if (e.pointerType === 'touch' || e.button !== 0) return; down = true; moved = 0; startX = e.clientX; startLeft = el.scrollLeft; };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      moved = Math.max(moved, Math.abs(e.clientX - startX));
      if (moved > 5) { el.classList.add('is-dragging'); el.scrollLeft = startLeft - (e.clientX - startX); }
    };
    const onUp = () => { down = false; el.classList.remove('is-dragging'); };
    const onClick = (e: MouseEvent) => { if (moved > 5) { e.preventDefault(); e.stopPropagation(); moved = 0; } };
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    el.addEventListener('click', onClick, true);
    return () => {
      el.removeEventListener('scroll', measure);
      ro.disconnect();
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      el.removeEventListener('click', onClick, true);
    };
  }, [measure]);

  const step = (dir: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    const card = el.querySelector<HTMLElement>('[data-card]');
    el.scrollBy({ left: dir * ((card?.offsetWidth ?? 360) + 16), behavior: 'smooth' });
  };

  return (
    <div className="lp-sol">
      <ul ref={track} data-fluid="x" className="lp-sol-track" aria-label="Solutions">
        {items.map((s) => (
          <li key={s.key} data-card className="lp-sol-card">
            <Link href={s.href} data-fluid-item draggable={false} className="lp-sol-link">
              <span className="lp-sol-n">{s.n}</span>
              <Slot name={s.slot} kind="illustration" ratio="4 / 3" note={s.note}>{s.art}</Slot>
              <span className="lp-sol-t">{s.title}</span>
              <span className="lp-sol-p">{s.text}</span>
              <span className="lp-sol-go">Explore <ArrowRight className="h-4 w-4" aria-hidden /></span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="lp-sol-bar">
        <span className="lp-sol-rail" aria-hidden><span style={{ transform: `scaleX(${Math.max(0.12, 0.12 + progress.at * 0.88)})` }} /></span>
        <div className="lp-sol-arrows">
          <button type="button" onClick={() => step(-1)} disabled={!progress.can.back} aria-label="Previous solutions"><ArrowLeft className="h-5 w-5" aria-hidden /></button>
          <button type="button" onClick={() => step(1)} disabled={!progress.can.next} aria-label="Next solutions"><ArrowRight className="h-5 w-5" aria-hidden /></button>
        </div>
      </div>
    </div>
  );
}
