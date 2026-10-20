'use client';
import * as Dialog from '@radix-ui/react-dialog';
import Link from 'next/link';
import { useCallback, useRef, useState } from 'react';
import { attachFluid } from './FluidHover';

const LINKS: { href: string; label: string; note: string }[] = [
  { href: '#platform', label: 'Platform', note: 'One record per battery' },
  { href: '#solutions', label: 'What you get', note: 'Fleet, record, actions, report' },
  { href: '#enforces', label: 'How it is kept', note: 'What the record enforces' },
  { href: '#questions', label: 'Questions', note: 'What the record answers' },
  { href: '#honesty', label: 'What is real', note: 'And what is not' },
];

/**
 * The full-screen menu: every destination in one place, set large, with fluid hover between the rows.
 * It is a dialog, so focus is held inside it, Escape closes it, and the page behind is inert while it is open.
 */
export function Menu() {
  const [open, setOpen] = useState(false);
  // The list exists only while the menu is open, so it joins the fluid-hover system as it mounts.
  const detach = useRef<(() => void) | null>(null);
  const fluid = useCallback((el: HTMLUListElement | null) => {
    detach.current?.();
    detach.current = el ? attachFluid(el) : null;
  }, []);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button type="button" className="lp-menu-btn" data-magnet>
          <span className="lp-menu-bars" aria-hidden><i /><i /></span>
          <span>Menu</span>
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Content className="lp lp-menu" aria-describedby={undefined}>
          <Dialog.Title className="lp-menu-title">Menu</Dialog.Title>
          <Dialog.Close asChild>
            <button type="button" className="lp-menu-btn lp-menu-close"><span className="lp-menu-bars is-x" aria-hidden><i /><i /></span><span>Close</span></button>
          </Dialog.Close>
          <nav aria-label="Menu" className="lp-menu-nav">
            <ul ref={fluid} data-fluid="y" className="lp-menu-list">
              {LINKS.map((l, i) => (
                <li key={l.href}>
                  <a data-fluid-item href={l.href} onClick={() => setOpen(false)}>
                    <span className="lp-menu-n">0{i + 1}</span>
                    <span className="lp-menu-l">{l.label}</span>
                    <span className="lp-menu-d">{l.note}</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="lp-menu-foot">
            <Link className="lp-btn" href="/signin" onClick={() => setOpen(false)}>Open the demo</Link>
            <p>Synthetic data only. No live customer, cloud or sensor connection.</p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
