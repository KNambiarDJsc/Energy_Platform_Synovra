import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

/**
 * A row that scrolls sideways shows a soft fade on each edge that has more beyond it, so a person can see
 * there is more to reach. The fade disappears at the ends and when everything fits. Returns `[ref, style]`; attach both
 * to the scrolling element.
 */
export function useScrollFade<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [more, setMore] = useState({ start: false, end: false });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const start = el.scrollLeft > 4;
      const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
      setMore((m) => (m.start === start && m.end === end ? m : { start, end }));
    };
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild); // its content can grow without the box changing size
    return () => { el.removeEventListener('scroll', measure); ro.disconnect(); };
  }, []);

  const mask = `linear-gradient(to right, ${more.start ? 'transparent 0, #000 32px' : '#000 0'}, ${more.end ? '#000 calc(100% - 32px), transparent 100%' : '#000 100%'})`;
  const style: CSSProperties | undefined = more.start || more.end ? { maskImage: mask, WebkitMaskImage: mask } : undefined;
  return [ref, style] as const;
}
