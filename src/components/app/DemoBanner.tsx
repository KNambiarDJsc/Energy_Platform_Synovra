'use client';
import { FlaskConical, Info } from 'lucide-react';
import { DEMO_NOTICE } from '@/data/seed';
import { useRuntime } from '@/lib/hooks';

export const PILOT_NOTICE = 'Pilot environment. Records are entered by the pilot team. No live sensor or cloud connection.';

/**
 * Shown on every screen. The exact wording is part of the product's honesty contract:
 * synthetic data is always labelled; a pilot deployment says what it is and what it is not connected to.
 */
export function DemoBanner() {
  const runtime = useRuntime();
  const pilot = runtime.loaded && !runtime.error && runtime.dataMode === 'pilot';
  const Icon = pilot ? Info : FlaskConical;
  return (
    <div
      role="note"
      data-testid="demo-banner"
      className="no-print flex min-h-8 items-center justify-center gap-2 bg-amber-50 px-4 py-1 text-center text-[13px] font-medium leading-[18px] text-amber-700"
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{pilot ? PILOT_NOTICE : DEMO_NOTICE}</span>
    </div>
  );
}

export function DebugBanner() {
  const runtime = useRuntime();
  const pilot = runtime.loaded && !runtime.error && runtime.dataMode === 'pilot';
  const Icon = pilot ? Info : FlaskConical;
  return (
    <div
      role="note"
      data-testid="demo-banner"
      className="no-print flex min-h-8 items-center justify-center gap-2 bg-amber-50 px-4 py-1 text-center text-[13px] font-medium leading-[18px] text-amber-700"
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{pilot ? PILOT_NOTICE : DEMO_NOTICE}</span>
    </div>
  );
}

