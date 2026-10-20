import { ChevronRight } from 'lucide-react';
import { SyntheticTag } from '@/components/ui/Badge';
import { cn, formatDateTime } from '@/lib/format';
import { BASIS_LABELS, SCOPE_LABELS, type Basis, type HierarchyLevel, type Indicator } from '@/lib/customer/model';

/** The basis of a value in small mono capitals, so a measurement, a calculation and a stand-in never look alike. */
export function BasisTag({ basis, className }: { basis: Basis; className?: string }) {
  return (
    <span title={BASIS_LABELS[basis].meaning} className={cn('font-mono text-[12px] uppercase tracking-[0.06em]', basis === 'demo_only' ? 'text-amber-700' : 'text-muted', className)}>
      {BASIS_LABELS[basis].label}
    </span>
  );
}

export function BasisLegend({ className }: { className?: string }) {
  return (
    <dl className={cn('grid gap-x-8 gap-y-3 sm:grid-cols-2', className)}>
      {(Object.keys(BASIS_LABELS) as Basis[]).map((b) => (
        <div key={b}>
          <dt><BasisTag basis={b} /></dt>
          <dd className="mt-0.5 text-[13px] leading-5 text-ink-2">{BASIS_LABELS[b].meaning}</dd>
        </div>
      ))}
    </dl>
  );
}

const FRESH_WORD = { current: 'Current', dated: 'Older than the freshness limit', none: 'No reading' } as const;

/**
 * Every indicator with its evidence beside it: the value, then what kind of value it is, what it describes, when it
 * was taken, where it came from and whether it is still current. A value the record cannot support says why.
 */
export function IndicatorList({ items }: { items: Indicator[] }) {
  return (
    <ul className="divide-y divide-line" aria-label="Condition indicators">
      {items.map((i) => (
        <li key={i.key} data-indicator={i.key} className="py-4 first:pt-0 last:pb-0">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
            <p className="text-[15px] font-medium text-ink">{i.label}</p>
            <p className="sm:text-right">
              {i.value !== null ? (
                <>
                  <span className="num text-[22px] font-semibold leading-7 text-ink">{i.value}</span>
                  {i.unit && <span className="ml-1.5 text-sm text-muted">{i.unit}</span>}
                </>
              ) : (
                <span className="text-[15px] font-medium text-ink-2">{i.absent === 'baseline' ? 'Baseline being established' : 'Data unavailable'}</span>
              )}
            </p>
          </div>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[12px] uppercase tracking-[0.05em] text-muted">
            <BasisTag basis={i.basis} />
            <span aria-hidden>·</span><span>{SCOPE_LABELS[i.scope]}</span>
            <span aria-hidden>·</span><span>{i.at ? formatDateTime(i.at) : 'No timestamp'}</span>
            <span aria-hidden>·</span><span className={cn(i.freshness === 'dated' && 'text-amber-700')}>{FRESH_WORD[i.freshness]}</span>
          </p>
          <p className="mt-1 text-[13px] leading-5 text-ink-2"><span className="text-muted">Source: </span>{i.source}</p>
          {i.note && <p className="mt-0.5 text-[13px] leading-5 text-muted">{i.note}</p>}
        </li>
      ))}
    </ul>
  );
}

/** Customer → site → system → bank/string → battery, in one line that wraps. */
export function HierarchyTrail({ levels }: { levels: HierarchyLevel[] }) {
  return (
    <nav aria-label="Where this battery sits" data-testid="hierarchy">
      <ol className="flex flex-wrap items-start gap-x-1.5 gap-y-2">
        {levels.map((l, i) => (
          <li key={l.level} className="flex items-start gap-1.5">
            <span className="rounded-xl bg-canvas px-3 py-2" title={l.note}>
              <span className="block font-mono text-[11px] uppercase tracking-[0.06em] text-muted">{l.level}</span>
              <span className="block text-sm text-ink">{l.name}</span>
            </span>
            {i < levels.length - 1 && <ChevronRight className="mt-4 h-4 w-4 shrink-0 text-muted" aria-hidden />}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Said once at the top of every customer screen. */
export function DemoDataNotice({ className }: { className?: string }) {
  return (
    <p className={cn('flex flex-wrap items-center gap-2 text-[13px] text-ink-2', className)} data-testid="customer-demo-label">
      <SyntheticTag />
      Demonstration records. No live sensors, no Performance Lab connection and no validated model. Nothing here is monitored continuously.
    </p>
  );
}
