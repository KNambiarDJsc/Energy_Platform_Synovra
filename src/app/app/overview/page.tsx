'use client';
import Link from 'next/link';
import { Badge, SeverityBadge, SyntheticTag } from '@/components/ui/Badge';
import { SimpleBarChart } from '@/components/ui/Charts';
import { PageHeader, Section, Stat } from '@/components/ui/Layout';
import { LoadingBlock, QueryView } from '@/components/ui/States';
import { LIFECYCLE_LABELS } from '@/domain/lifecycle';
import { formatDateTime, formatNumber, formatShortDate, titleCase } from '@/lib/format';
import { useSvcQuery } from '@/lib/hooks';

/** Service returns the week start as an ISO date or a MM-DD string; show "1 Sep". */
function weekLabel(w: string): string {
  const iso = /^\d{4}-\d{2}-\d{2}/.test(w) ? w : `2026-${w}`;
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? w : formatShortDate(d.toISOString());
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
        {(d) => (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <Stat label="Batteries on record" value={d.totals.batteries} href="/app/batteries" />
              <Stat label="Testing & restoration" value={d.totals.testing} href="/app/inventory" />
              <Stat label="Qualified, unassigned" value={d.totals.qualified} href="/app/inventory" tone="green" />
              <Stat label="Deployed" value={d.totals.deployed} href="/app/deployments" />
              <Stat label="Waiting for review" value={d.totals.needsReview} href="/app/tests" tone={d.totals.needsReview ? 'amber' : 'neutral'} />
              <Stat
                label="Active alerts"
                value={d.totals.activeAlerts}
                href="/app/alerts"
                tone={d.totals.criticalAlerts ? 'red' : d.totals.activeAlerts ? 'amber' : 'neutral'}
                hint={d.totals.criticalAlerts ? `${d.totals.criticalAlerts} critical` : 'None critical'}
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <Section
                title="Where batteries are in the lifecycle"
                description="Count of records by current state."
                className="lg:col-span-2"
              >
                <ul className="space-y-2.5">
                  {d.byState
                    .filter((s) => s.count > 0)
                    .map((s) => {
                      const pct = (s.count / d.totals.batteries) * 100;
                      return (
                        <li key={s.state} className="grid grid-cols-[150px_1fr_32px] items-center gap-3 text-sm sm:grid-cols-[180px_1fr_40px]">
                          <span className="text-ink">{LIFECYCLE_LABELS[s.state]}</span>
                          <span className="h-2.5 overflow-hidden rounded-full bg-[#DCE6EB]" aria-hidden>
                            <span className="block h-full rounded-full bg-teal" style={{ width: `${Math.max(pct, 2)}%` }} />
                          </span>
                          <span className="text-right font-semibold text-navy">{s.count}</span>
                        </li>
                      );
                    })}
                </ul>
              </Section>

              <Section title="Record completeness" description="Missing or conflicting data is listed per battery.">
                <p className="text-3xl font-semibold text-navy">{formatNumber(d.completeness.pctComplete, 0)}%</p>
                <p className="text-sm text-muted">of records have every required field and no conflicts</p>
                <ul className="mt-4 space-y-2 text-sm">
                  {(
                    [
                      ['complete', 'Complete', d.completeness.complete],
                      ['partial', 'One field missing', d.completeness.partial],
                      ['incomplete', 'Several fields missing', d.completeness.incomplete],
                      ['conflict', 'Identity conflict', d.completeness.conflict],
                    ] as const
                  ).map(([level, label, n]) => (
                    <li key={level} className="flex items-center justify-between">
                      <Link href={`/app/batteries?quality=${level}`} className="text-teal-800 underline underline-offset-2">
                        {label}
                      </Link>
                      <span className="font-semibold text-navy">{n}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              <Section
                title="Service tasks"
                description="Open work from alerts and the assistant."
                actions={<Link href="/app/alerts?tab=tasks" className="text-sm text-teal-800 underline underline-offset-2">View tasks</Link>}
              >
                {d.workload.length === 0 ? (
                  <p className="text-sm text-muted">No service tasks.</p>
                ) : (
                  <ul className="divide-y divide-line text-sm">
                    {d.workload.map((w) => (
                      <li key={w.status} className="flex items-center justify-between py-2">
                        <span>{titleCase(w.status)}</span>
                        <Badge tone={w.status === 'draft' ? 'amber' : 'teal'}>{w.count}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section title="Restoration decisions" description="Counts under the demonstration threshold. Not a performance claim.">
                <dl className="grid grid-cols-2 gap-3 text-center">
                  <div className="rounded-md border border-line p-3">
                    <dd className="text-2xl font-semibold text-navy">{d.restoration.attempted}</dd>
                    <dt className="text-xs text-muted">Attempts recorded</dt>
                  </div>
                  <div className="rounded-md border border-line p-3">
                    <dd className="text-2xl font-semibold text-navy">{d.restoration.qualified}</dd>
                    <dt className="text-xs text-muted">Approved by an engineer</dt>
                  </div>
                </dl>
                <p className="mt-4 flex items-start gap-2 text-xs text-muted">
                  <SyntheticTag />
                  <span>Invented batches. Real outcomes depend on the approved criterion, protocol and cell condition on arrival.</span>
                </p>
              </Section>

              <Section title="Activity by week" description="Week starting. Counts of batteries received, qualified and deployed.">
                <SimpleBarChart
                  data={d.trends.map((t) => ({ ...t, week: weekLabel(t.week) })) as unknown as Record<string, string | number>[]}
                  xKey="week"
                  label="Weekly intake, qualification and deployment counts"
                  summary={`Last ${d.trends.length} weeks of synthetic activity.`}
                  height={190}
                  bars={[
                    { key: 'received', name: 'Received', color: '#647985' },
                    { key: 'qualified', name: 'Qualified', color: '#007E83' },
                    { key: 'deployed', name: 'Deployed', color: '#112B40' },
                  ]}
                />
              </Section>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Section title="Site status" tone="flush">
                <ul className="divide-y divide-line">
                  {d.siteHealth.map((s) => (
                    <li key={s.siteId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 md:px-5">
                      <div>
                        <p className="font-medium text-navy">{s.siteName}</p>
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
                <ul className="divide-y divide-line">
                  {d.recent.map((e) => (
                    <li key={e.id} className="px-4 py-3 md:px-5">
                      <Link href={`/app/batteries/${e.batteryId}`} className="text-sm font-medium text-teal-800 underline-offset-2 hover:underline">
                        {e.title}
                      </Link>
                      <p className="text-xs text-muted">
                        {formatDateTime(e.occurredAt)} · {e.actorName}
                      </p>
                    </li>
                  ))}
                </ul>
              </Section>
            </div>
          </div>
        )}
      </QueryView>
    </>
  );
}
