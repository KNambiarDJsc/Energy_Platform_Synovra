'use client';
import { AlertTriangle, BadgeCheck, ChevronRight, Hourglass, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { Badge, SeverityBadge, SyntheticTag } from '@/components/ui/Badge';
import { SimpleBarChart } from '@/components/ui/Charts';
import { PageHeader, Section } from '@/components/ui/Layout';
import { LoadingBlock, QueryView } from '@/components/ui/States';
import { LIFECYCLE_LABELS } from '@/domain/lifecycle';
import type { LifecycleState } from '@/domain/types';
import { cn, formatDateTime, formatNumber, formatShortDate, titleCase } from '@/lib/format';
import { useSvcQuery } from '@/lib/hooks';

/** Service returns the week start as an ISO date or a MM-DD string; show "1 Sep". */
function weekLabel(w: string): string {
  const iso = /^\d{4}-\d{2}-\d{2}/.test(w) ? w : `2026-${w}`;
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? w : formatShortDate(d.toISOString());
}

/**
 * The fleet in five ordered stages. Order carries meaning, so the colour is one patina-teal ramp,
 * light to dark (dataviz ordinal check: monotone lightness, light end 2.05:1 on white).
 */
const STAGES: { label: string; states: LifecycleState[]; color: string }[] = [
  { label: 'Received', states: ['received'], color: '#86BAB1' },
  { label: 'In the lab', states: ['testing', 'restoration_candidate', 'in_restoration', 'awaiting_review', 'rework'], color: '#4F8F87' },
  { label: 'Ready to deploy', states: ['qualified', 'reserved'], color: '#2C6B66' },
  { label: 'In service', states: ['deployed'], color: '#1F4F4B' },
  { label: 'Leaving the fleet', states: ['returned', 'rejected', 'recycling_queue', 'recycled'], color: '#14322F' },
];

/** Received, qualified and deployed are themselves ordered stages: three steps of the same ramp. */
const WEEK_BARS = [
  { key: 'received', name: 'Received', color: '#86BAB1' },
  { key: 'qualified', name: 'Qualified', color: '#2C6B66' },
  { key: 'deployed', name: 'Deployed', color: '#14322F' },
];

function FleetBar({ stages, total }: { stages: { label: string; count: number; color: string }[]; total: number }) {
  const shown = stages.filter((s) => s.count > 0);
  return (
    // The legend below carries every value in text; the bar is its picture, with a hover readout for pointers.
    <div className="anim-reveal mt-6 flex h-4 w-full gap-[2px]" aria-hidden>
      {shown.map((s, i) => (
        <span
          key={s.label}
          className={cn('group relative h-full transition-[filter] duration-150 hover:brightness-110', i === 0 && 'rounded-l-[4px]', i === shown.length - 1 && 'rounded-r-[4px]')}
          style={{ flexGrow: s.count, flexBasis: 0, minWidth: 6, background: s.color }}
        >
          <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-white px-3 py-2 text-xs opacity-0 shadow-pop transition-opacity duration-150 group-hover:opacity-100">
            <span className="block text-sm font-semibold text-ink">{s.count} of {total}</span>
            <span className="text-muted">{s.label}</span>
          </span>
        </span>
      ))}
    </div>
  );
}

/** A single ratio against its whole: a radial meter whose track is a lighter step of the same hue. */
function Ring({ pct }: { pct: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 132 132" className="h-[132px] w-[132px] shrink-0 -rotate-90" aria-hidden>
      <circle cx="66" cy="66" r={r} fill="none" stroke="#C9DED9" strokeWidth="14" />
      <circle
        cx="66"
        cy="66"
        r={r}
        fill="none"
        stroke="#2C6B66"
        strokeWidth="14"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.min(100, Math.max(0, pct)) / 100)}
        className="anim-ring"
        style={{ ['--ring-full' as string]: `${c}px` }}
      />
    </svg>
  );
}

function AttentionRow({ href, value, label, detail, icon: Icon, tone }: { href: string; value: number; label: string; detail?: string; icon: LucideIcon; tone: 'amber' | 'red' | 'green' | 'neutral' }) {
  const color = { amber: 'text-amber-700', red: 'text-critical-700', green: 'text-approved-700', neutral: 'text-ink' }[tone];
  return (
    <li>
      <Link href={href} className="group flex items-center gap-4 rounded-lg px-3 py-3 transition-colors duration-150 hover:bg-canvas active:bg-fill">
        <span className={cn('w-14 shrink-0 text-[34px] font-semibold leading-none tracking-[-0.022em]', value === 0 ? 'text-ink' : color)}>{value}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <Icon className={cn('h-4 w-4 shrink-0', value === 0 ? 'text-muted' : color)} aria-hidden />
            {label}
          </span>
          {detail && <span className="mt-0.5 block text-xs text-muted">{detail}</span>}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
      </Link>
    </li>
  );
}

export default function OverviewPage() {
  const q = useSvcQuery(['overview'], (s) => s.overview.get());

  return (
    <>
      <PageHeader
        title="Overview"
        description={
          q.data ? `Fleet position in the synthetic snapshot taken ${formatDateTime(q.data.snapshotAt)}.` : 'Fleet position, work waiting and data completeness.'
        }
      />
      <QueryView query={q} skeleton={<LoadingBlock label="Loading overview" rows={6} />}>
        {(d) => {
          const countOf = (states: LifecycleState[]) => d.byState.filter((s) => states.includes(s.state)).reduce((n, s) => n + s.count, 0);
          const stages = STAGES.map((s) => ({ ...s, count: countOf(s.states) }));
          const states = d.byState.filter((s) => s.count > 0);
          const maxState = Math.max(1, ...states.map((s) => s.count));
          return (
            <div className="app-stagger space-y-5">
              <div className="grid gap-5 lg:grid-cols-3">
                <section className="card p-6 md:p-8 lg:col-span-2" aria-labelledby="fleet-h">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h2 id="fleet-h" className="text-sm font-medium text-muted">Batteries on record</h2>
                      <p className="mt-2 text-[56px] font-semibold leading-none tracking-[-0.03em] text-ink">{d.totals.batteries}</p>
                    </div>
                    <Link href="/app/batteries" className="group inline-flex items-center gap-1 rounded-md text-sm font-medium text-copper-700 hover:underline hover:underline-offset-4">
                      All batteries
                      <ChevronRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
                    </Link>
                  </div>
                  <FleetBar stages={stages} total={d.totals.batteries} />
                  <ul className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 xl:grid-cols-5" aria-label="Batteries by lifecycle stage">
                    {stages.map((s) => (
                      <li key={s.label} className="min-w-0">
                        <span className="flex items-start gap-2 text-[13px] text-ink-2">
                          <span className="mt-[3.5px] h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: s.color }} aria-hidden />
                          <span className="leading-[17px]">{s.label}</span>
                        </span>
                        <span className="mt-1 block text-[22px] font-semibold leading-7 text-ink">{s.count}</span>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="card p-3 md:p-4" aria-labelledby="attention-h">
                  <h2 id="attention-h" className="px-3 pb-1 pt-2 text-lg font-semibold text-ink">Needs attention</h2>
                  <ul>
                    <AttentionRow href="/app/tests" value={d.totals.needsReview} label="Waiting for review" detail="Tests an engineer has not decided" icon={Hourglass} tone="amber" />
                    <AttentionRow
                      href="/app/alerts"
                      value={d.totals.activeAlerts}
                      label="Active alerts"
                      detail={d.totals.criticalAlerts ? `${d.totals.criticalAlerts} critical` : 'None critical'}
                      icon={AlertTriangle}
                      tone={d.totals.criticalAlerts ? 'red' : 'amber'}
                    />
                    <AttentionRow href="/app/inventory" value={d.totals.qualified} label="Qualified, unassigned" detail="Approved and ready to allocate" icon={BadgeCheck} tone="green" />
                  </ul>
                </section>
              </div>

              <div className="grid gap-5 lg:grid-cols-3">
                <Section title="Where batteries are in the lifecycle" description="Records by current state." className="lg:col-span-2">
                  <ul className="space-y-3">
                    {states.map((s) => (
                      <li key={s.state} className="grid grid-cols-[136px_1fr_32px] items-center gap-4 text-sm sm:grid-cols-[180px_1fr_40px]">
                        <span className="truncate text-ink">{LIFECYCLE_LABELS[s.state]}</span>
                        <span className="h-2 overflow-hidden rounded-[4px] bg-teal-50" aria-hidden>
                          <span className="anim-grow block h-full rounded-r-[4px] bg-teal" style={{ width: `${Math.max((s.count / maxState) * 100, 3)}%` }} />
                        </span>
                        <span className="num text-right font-semibold text-ink">{s.count}</span>
                      </li>
                    ))}
                  </ul>
                </Section>

                <Section title="Record completeness" description="Missing or conflicting data is listed per battery.">
                  <div className="flex items-center gap-5">
                    <div className="relative">
                      <Ring pct={d.completeness.pctComplete} />
                      <span className="absolute inset-0 flex items-center justify-center text-[26px] font-semibold tracking-[-0.02em] text-ink">
                        {formatNumber(d.completeness.pctComplete, 0)}%
                      </span>
                    </div>
                    <p className="text-sm text-ink-2">of records have every required field and no conflicts.</p>
                  </div>
                  <ul className="mt-5 space-y-0.5 text-sm">
                    {(
                      [
                        ['complete', 'Complete', d.completeness.complete],
                        ['partial', 'One field missing', d.completeness.partial],
                        ['incomplete', 'Several fields missing', d.completeness.incomplete],
                        ['conflict', 'Identity conflict', d.completeness.conflict],
                      ] as const
                    ).map(([level, label, n]) => (
                      <li key={level}>
                        <Link href={`/app/batteries?quality=${level}`} className="group -mx-2 flex items-center justify-between rounded-md px-2 py-2 transition-colors hover:bg-canvas">
                          <span className="font-medium text-copper-700">{label}</span>
                          <span className="flex items-center gap-1.5">
                            <span className="num font-semibold text-ink">{n}</span>
                            <ChevronRight className="h-4 w-4 text-muted" aria-hidden />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Section>
              </div>

              <div className="grid gap-5 lg:grid-cols-3">
                <Section title="Activity by week" description="Batteries received, qualified and deployed, by week starting." className="lg:col-span-2">
                  <SimpleBarChart
                    data={d.trends.map((t) => ({ ...t, week: weekLabel(t.week) })) as unknown as Record<string, string | number>[]}
                    xKey="week"
                    xLabel="Week starting"
                    label="Weekly intake, qualification and deployment counts"
                    summary={`Last ${d.trends.length} weeks of synthetic activity.`}
                    height={300}
                    bars={WEEK_BARS}
                  />
                </Section>

                <div className="space-y-5">
                  <Section title="Restoration decisions" description="Counts under the demonstration threshold. Not a performance claim.">
                    <dl className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-canvas p-4">
                        <dt className="text-xs text-muted">Attempts recorded</dt>
                        <dd className="mt-1 text-[28px] font-semibold leading-8 text-ink">{d.restoration.attempted}</dd>
                      </div>
                      <div className="rounded-lg bg-canvas p-4">
                        <dt className="text-xs text-muted">Approved by an engineer</dt>
                        <dd className="mt-1 text-[28px] font-semibold leading-8 text-ink">{d.restoration.qualified}</dd>
                      </div>
                    </dl>
                    <p className="mt-4 flex items-start gap-2 text-xs text-muted">
                      <SyntheticTag />
                      <span>Invented batches. Real outcomes depend on the approved criterion, protocol and cell condition on arrival.</span>
                    </p>
                  </Section>

                  <Section
                    title="Service tasks"
                    actions={<Link href="/app/alerts?tab=tasks" className="text-sm font-medium text-copper-700 hover:underline hover:underline-offset-4">View tasks</Link>}
                  >
                    {d.workload.length === 0 ? (
                      <p className="text-sm text-muted">No service tasks.</p>
                    ) : (
                      <ul className="space-y-2 text-sm">
                        {d.workload.map((w) => (
                          <li key={w.status} className="flex items-center justify-between">
                            <span className="text-ink">{titleCase(w.status)}</span>
                            <Badge tone={w.status === 'draft' ? 'amber' : 'teal'}>{w.count}</Badge>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Section>
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <Section title="Site status" tone="flush">
                  <ul>
                    {d.siteHealth.map((s) => (
                      <li key={s.siteId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-3">
                        <div className="min-w-0">
                          <p className="font-medium text-ink">{s.siteName}</p>
                          <p className="text-sm text-muted">
                            {s.batteries} batteries · gateway {s.gateway ?? 'not installed'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {s.worst ? <SeverityBadge severity={s.worst} /> : <Badge tone="green">No open alerts</Badge>}
                          {s.openAlerts > 0 && <span className="text-sm text-muted">{s.openAlerts} open</span>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </Section>

                <Section title="Recent activity" tone="flush">
                  <ul>
                    {d.recent.map((e) => (
                      <li key={e.id}>
                        <Link href={`/app/batteries/${e.batteryId}`} className="group block rounded-lg px-3 py-3 transition-colors duration-150 hover:bg-canvas">
                          <span className="block text-sm font-medium text-copper-700 group-hover:underline group-hover:underline-offset-4">{e.title}</span>
                          <span className="mt-0.5 block text-xs text-muted">
                            {formatDateTime(e.occurredAt)} · {e.actorName}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Section>
              </div>
            </div>
          );
        }}
      </QueryView>
    </>
  );
}
