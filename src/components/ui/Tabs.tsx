'use client';
import * as RadixTabs from '@radix-ui/react-tabs';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useScrollFade } from '@/lib/useScrollFade';

export interface TabItem {
  value: string;
  label: string;
  /** Short count or marker shown beside the label. */
  badge?: ReactNode;
  content: ReactNode;
}

/**
 * Section switcher: the chosen section is an ink capsule that slides to it; the others are plain words.
 * No track, so ten passport sections can scroll sideways on narrow screens without a clipped container.
 */
export function Tabs({
  tabs, value, onValueChange, label,
}: { tabs: TabItem[]; value: string; onValueChange: (v: string) => void; label: string }) {
  const listRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [fadeRef, fadeStyle] = useScrollFade<HTMLDivElement>();

  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const el = list.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
      if (el) setThumb({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
    };
    measure();
    // Keep the chosen section in view inside the sideways track, without scrolling the page itself.
    const scroller = list.parentElement;
    const active = list.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
    if (scroller && active) {
      const left = active.offsetLeft - 16;
      const right = active.offsetLeft + active.offsetWidth + 32;
      if (left < scroller.scrollLeft) scroller.scrollLeft = left;
      else if (right > scroller.scrollLeft + scroller.clientWidth) scroller.scrollLeft = right - scroller.clientWidth;
    }
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    return () => ro.disconnect();
  }, [value, tabs.length]);

  return (
    <RadixTabs.Root value={value} onValueChange={onValueChange}>
      <div ref={fadeRef} style={fadeStyle} className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden">
        <RadixTabs.List ref={listRef} aria-label={label} className="relative inline-flex min-w-max gap-1 md:flex md:min-w-0 md:flex-wrap md:gap-0.5">
          {thumb && (
            <span
              aria-hidden
              className="absolute left-0 top-0 rounded-full bg-ink transition-[transform,width] duration-300 ease-out"
              style={{ transform: `translate(${thumb.x}px, ${thumb.y}px)`, width: thumb.w, height: thumb.h }}
            />
          )}
          {tabs.map((t) => (
            <RadixTabs.Trigger
              key={t.value}
              value={t.value}
              className="group relative z-10 flex min-h-[40px] items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-sm md:px-3 font-medium text-ink-2 transition-colors duration-200 hover:text-ink data-[state=inactive]:hover:bg-fill data-[state=active]:text-white"
            >
              {t.label}
              {t.badge}
            </RadixTabs.Trigger>
          ))}
        </RadixTabs.List>
      </div>
      {tabs.map((t) => (
        <RadixTabs.Content key={t.value} value={t.value} className="anim-row pt-6 focus-visible:outline-none">
          {t.content}
        </RadixTabs.Content>
      ))}
    </RadixTabs.Root>
  );
}

/** A count beside a tab label. Plain figures, not a second pill inside the pill. */
export function TabCount({ n }: { n: number }) {
  return <span className="num text-[13px] text-muted transition-colors duration-200 group-data-[state=active]:text-white/75">{n}</span>;
}
