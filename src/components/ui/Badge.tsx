import {
  AlertOctagon, AlertTriangle, BadgeCheck, Bookmark, CheckCircle2, CircleDashed, Clock, Eye, FlaskConical, Gauge, GitMerge,
  HelpCircle, Inbox, Info, ListChecks, MapPin, Recycle, RotateCcw, Calculator, Undo2, Wrench, XCircle, CircleSlash, UserCheck, Hourglass,
  PlayCircle, Lock, ShieldCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/format';
import { LIFECYCLE_LABELS } from '@/domain/lifecycle';
import type { AlertState, ApprovalState, DataQualityLevel, LifecycleState, Severity, TestStatus, WarrantyRecord } from '@/domain/types';

export type Tone = 'neutral' | 'teal' | 'green' | 'amber' | 'red' | 'stone';

const toneClass: Record<Tone, string> = {
  neutral: 'bg-fill text-ink-2',
  teal: 'bg-teal-50 text-teal-800',
  green: 'bg-approved-50 text-approved-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-critical-50 text-critical-700',
  stone: 'bg-[#ECE5DA] text-night',
};

/** Every status is communicated by text and an icon, never colour alone. A tint, no outline. */
export function Badge({ tone = 'neutral', icon: Icon, children, className, title }: { tone?: Tone; icon?: LucideIcon; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[13px] font-medium leading-5', toneClass[tone], className)}>
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />}
      {children}
    </span>
  );
}

const lifecycle: Record<LifecycleState, [Tone, LucideIcon]> = {
  received: ['neutral', Inbox], testing: ['teal', FlaskConical], restoration_candidate: ['teal', ListChecks], in_restoration: ['teal', Wrench],
  awaiting_review: ['amber', Eye], rework: ['amber', RotateCcw], qualified: ['green', BadgeCheck], reserved: ['stone', Bookmark],
  deployed: ['stone', MapPin], returned: ['neutral', Undo2], rejected: ['red', XCircle], recycling_queue: ['neutral', Recycle], recycled: ['neutral', Recycle],
};
export function LifecycleBadge({ state }: { state: LifecycleState }) {
  const [tone, icon] = lifecycle[state];
  return <Badge tone={tone} icon={icon}>{LIFECYCLE_LABELS[state]}</Badge>;
}

const testStatus: Record<TestStatus, [Tone, LucideIcon, string]> = {
  draft: ['neutral', CircleDashed, 'Draft'], submitted: ['teal', Hourglass, 'Submitted'], under_review: ['amber', Eye, 'Under review'],
  approved: ['green', CheckCircle2, 'Approved'], rejected: ['red', XCircle, 'Rejected'], requires_rework: ['amber', RotateCcw, 'Requires rework'],
};
export function TestStatusBadge({ status }: { status: TestStatus }) {
  const [tone, icon, label] = testStatus[status];
  return <Badge tone={tone} icon={icon}>{label}</Badge>;
}

const approval: Record<ApprovalState, [Tone, LucideIcon, string]> = {
  not_required: ['neutral', CircleSlash, 'No approval needed'], pending: ['amber', Hourglass, 'Approval pending'],
  approved: ['green', CheckCircle2, 'Approved'], rejected: ['red', XCircle, 'Not approved'],
};
export function ApprovalBadge({ state }: { state: ApprovalState }) {
  const [tone, icon, label] = approval[state];
  return <Badge tone={tone} icon={icon}>{label}</Badge>;
}

const sev: Record<Severity, [Tone, LucideIcon, string]> = {
  critical: ['red', AlertOctagon, 'Critical'], warning: ['amber', AlertTriangle, 'Warning'], info: ['teal', Info, 'Info'],
};
export function SeverityBadge({ severity }: { severity: Severity }) {
  const [tone, icon, label] = sev[severity];
  return <Badge tone={tone} icon={icon}>{label}</Badge>;
}

const alertState: Record<AlertState, [Tone, LucideIcon, string]> = {
  open: ['amber', AlertTriangle, 'Open'], acknowledged: ['teal', UserCheck, 'Acknowledged'], assigned: ['teal', UserCheck, 'Assigned'],
  in_progress: ['teal', PlayCircle, 'In progress'], resolved: ['green', CheckCircle2, 'Resolved'], closed: ['neutral', Lock, 'Closed'],
};
export function AlertStateBadge({ state }: { state: AlertState }) {
  const [tone, icon, label] = alertState[state];
  return <Badge tone={tone} icon={icon}>{label}</Badge>;
}

const quality: Record<DataQualityLevel, [Tone, LucideIcon, string]> = {
  complete: ['green', CheckCircle2, 'Complete'], partial: ['amber', CircleDashed, 'Partial'],
  incomplete: ['amber', CircleDashed, 'Incomplete'], conflict: ['red', GitMerge, 'Identity conflict'],
};
export function QualityBadge({ level, title }: { level: DataQualityLevel; title?: string }) {
  const [tone, icon, label] = quality[level];
  return <Badge tone={tone} icon={icon} title={title}>{label}</Badge>;
}

const warranty: Record<WarrantyRecord['state'], [Tone, LucideIcon, string]> = {
  active: ['green', ShieldCheck, 'Active'], expiring: ['amber', Clock, 'Expiring'], expired: ['neutral', CircleSlash, 'Expired'],
  claim_open: ['amber', AlertTriangle, 'Claim open'], claim_closed: ['neutral', Lock, 'Claim closed'],
  not_applicable: ['neutral', CircleSlash, 'Not applicable'], unknown: ['amber', HelpCircle, 'Unknown'],
};
export function WarrantyBadge({ state }: { state: WarrantyRecord['state'] | null }) {
  if (!state) return <Badge tone="neutral" icon={CircleSlash}>None recorded</Badge>;
  const [tone, icon, label] = warranty[state];
  return <Badge tone={tone} icon={icon}>{label}</Badge>;
}

/** Tone, icon and words for a status, for places that show it without a pill (the passport card). */
export interface StatusMeta { tone: Tone; icon: LucideIcon; label: string }
export function lifecycleMeta(state: LifecycleState): StatusMeta {
  const [tone, icon] = lifecycle[state];
  return { tone, icon, label: LIFECYCLE_LABELS[state] };
}
export function qualityMeta(level: DataQualityLevel): StatusMeta {
  const [tone, icon, label] = quality[level];
  return { tone, icon, label };
}
export function warrantyMeta(state: WarrantyRecord['state'] | null): StatusMeta {
  if (!state) return { tone: 'neutral', icon: CircleSlash, label: 'None recorded' };
  const [tone, icon, label] = warranty[state];
  return { tone, icon, label };
}

export function FreshnessBadge({ freshness }: { freshness: 'fresh' | 'stale' | 'none' }) {
  if (freshness === 'fresh') return <Badge tone="green" icon={CheckCircle2}>Fresh</Badge>;
  if (freshness === 'stale') return <Badge tone="amber" icon={Clock}>Stale</Badge>;
  return <Badge tone="neutral" icon={HelpCircle}>No data</Badge>;
}

export type ValueKind = 'measured' | 'rule' | 'model' | 'unknown' | 'stale' | 'inferred';
const valueKind: Record<ValueKind, [Tone, LucideIcon, string]> = {
  measured: ['stone', Gauge, 'Measured'], rule: ['teal', ListChecks, 'Rule result'], model: ['amber', Calculator, 'Model estimate'],
  unknown: ['neutral', HelpCircle, 'Unknown'], stale: ['amber', Clock, 'Stale'], inferred: ['amber', Calculator, 'Inferred by sensor'],
};
export function ValueKindBadge({ kind }: { kind: ValueKind }) {
  const [tone, icon, label] = valueKind[kind];
  return <Badge tone={tone} icon={icon}>{label}</Badge>;
}

export function SyntheticTag({ className }: { className?: string }) {
  return <Badge tone="amber" icon={FlaskConical} className={className}>Synthetic</Badge>;
}
