import { CheckCircle2, CircleDashed, CircleSlash, Eye, AlertTriangle, type LucideIcon } from 'lucide-react';
import { DATA_KIND_LABELS, STATUS_LABELS, type BatteryStatus, type DataKind, type FactorState } from '@/domain/status';
import { cn } from '@/lib/format';
import { Badge, type Tone } from './Badge';

/** Colour means something only because most of the page is calm: green is good, amber watching, red needs attention. */
export const STATUS_STYLE: Record<BatteryStatus, { tone: Tone; icon: LucideIcon; stroke: string }> = {
  good: { tone: 'green', icon: CheckCircle2, stroke: '#2E7D5B' },
  watching: { tone: 'amber', icon: Eye, stroke: '#946718' },
  attention: { tone: 'red', icon: AlertTriangle, stroke: '#B54747' },
  baseline: { tone: 'teal', icon: CircleDashed, stroke: '#8FBDB5' },
  retired: { tone: 'neutral', icon: CircleSlash, stroke: '#8E8E93' },
};

export function StatusBadge({ status, className }: { status: BatteryStatus; className?: string }) {
  const s = STATUS_STYLE[status];
  return <Badge tone={s.tone} icon={s.icon} className={className}>{STATUS_LABELS[status]}</Badge>;
}

const FACTOR_DOT: Record<FactorState, string> = {
  ok: 'bg-approved',
  watch: 'bg-amber',
  attention: 'bg-critical',
  unknown: 'border-2 border-field bg-transparent',
};
export const FACTOR_WORD: Record<FactorState, string> = { ok: 'Within range', watch: 'Watching', attention: 'Needs attention', unknown: 'Unknown' };

export function FactorDot({ state }: { state: FactorState }) {
  return <span className={cn('inline-block h-2.5 w-2.5 shrink-0 rounded-full', FACTOR_DOT[state])} aria-hidden />;
}

/** The kind of number beside it, in small capitals of the mono face: measured, calculated, modelled, predicted. */
export function KindTag({ kind, className }: { kind: DataKind; className?: string }) {
  return (
    <span title={DATA_KIND_LABELS[kind].meaning} className={cn('font-mono text-[12px] uppercase tracking-[0.06em] text-muted', className)}>
      {DATA_KIND_LABELS[kind].label}
    </span>
  );
}

/**
 * Parts of a whole as one ring: each status takes its share of the circle, in a fixed order, with a small gap
 * between parts. The legend beside it carries every count in words; the ring is its picture.
 */
export function StatusRing({ parts, size = 196, stroke = 16, children, label }: {
  parts: { status: BatteryStatus; count: number }[];
  size?: number;
  stroke?: number;
  children?: React.ReactNode;
  label: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = parts.reduce((n, p) => n + p.count, 0);
  const shown = parts.filter((p) => p.count > 0);
  const gap = shown.length > 1 ? Math.min(6, c * 0.012) : 0;
  let offset = 0;
  return (
    <div className="anim-row relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="-rotate-90" role="img" aria-label={label}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(0, 0, 0,0.12)" strokeWidth={stroke} />
        {total > 0 && shown.map((p) => {
          const len = (p.count / total) * c;
          const seg = (
            <circle
              key={p.status}
              cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke={STATUS_STYLE[p.status].stroke} strokeWidth={stroke} strokeLinecap="butt"
              strokeDasharray={`${Math.max(0.5, len - gap)} ${c}`}
              strokeDashoffset={-offset}
            />
          );
          offset += len;
          return seg;
        })}
      </svg>
      {children && <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>}
    </div>
  );
}

/** What each kind of number means. Shown where numbers of different kinds sit side by side. */
export function DataKindLegend({ kinds = ['measured', 'calculated', 'modelled', 'predicted', 'controlled'], className }: { kinds?: DataKind[]; className?: string }) {
  return (
    <dl className={cn('grid gap-x-6 gap-y-2.5 text-[13px] leading-5 sm:grid-cols-2', className)}>
      {kinds.map((k) => (
        <div key={k} className="min-w-0">
          <dt><KindTag kind={k} className="text-ink-2" /></dt>
          <dd className="text-muted">{DATA_KIND_LABELS[k].meaning}</dd>
        </div>
      ))}
    </dl>
  );
}
