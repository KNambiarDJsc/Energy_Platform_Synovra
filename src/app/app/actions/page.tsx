'use client';
import { ArrowRight, CalendarCheck, CheckCircle2, Clock } from 'lucide-react';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { DemoDataNotice } from '@/components/customer/Parts';
import { RequestDialog } from '@/components/customer/RequestDialog';
import { Button } from '@/components/ui/Button';
import { PageHeader, Section } from '@/components/ui/Layout';
import { LoadingBlock, QueryView } from '@/components/ui/States';
import { StatusBadge } from '@/components/ui/Status';
import { useFleet } from '@/lib/customer/hooks';
import { buildTimeline } from '@/lib/customer/model';
import { REQUEST_KIND_LABELS, REQUEST_WINDOW_LABELS, clearDemoRequests, useDemoRequests, type RequestKind } from '@/lib/customer/requests';
import { formatDate, formatDateTime } from '@/lib/format';
import { useSession } from '@/lib/hooks';
import type { BatteryPassport } from '@/services/types';

function Count({ n, icon: Icon, label }: { n: number; icon: typeof Clock; label: ReactNode }) {
  return <span className="inline-flex items-center gap-2 text-[15px] text-ink-2"><Icon className="h-4 w-4" aria-hidden /><span className="num font-semibold text-ink">{n}</span> {label}</span>;
}

/**
 * Everything that needs action in one calm place: what to do now, what is planned, what is done. Requests made here
 * are a demonstration kept in this browser; nothing is sent to a service team.
 */
export default function ActionsPage() {
  const session = useSession();
  const { data } = useFleet();
  const requests = useDemoRequests();
  const [target, setTarget] = useState<{ p: BatteryPassport; kind: RequestKind } | null>(null);

  return (
    <div className="app-stagger">
      <PageHeader title="Actions" description="What needs doing now, what you have planned, and what has been done." />
      <DemoDataNotice className="mb-5" />
      <QueryView query={data} skeleton={<LoadingBlock label="Loading actions" rows={4} />}>
        {(d) => {
          const now = d.passports.filter((p) => p.status.status === 'attention').sort((a, b) => a.status.urgency - b.status.urgency);
          const completed = d.passports.flatMap((p) => buildTimeline(p).filter((t) => t.completed).map((t) => ({ p, t }))).sort((a, b) => b.t.at.localeCompare(a.t.at));
          return (
            <div className="space-y-5">
              <p className="flex flex-wrap gap-x-6 gap-y-2" data-testid="action-counts">
                <Count n={now.length} icon={Clock} label="now" />
                <Count n={requests.length} icon={CalendarCheck} label="scheduled (demo)" />
                <Count n={completed.length} icon={CheckCircle2} label="completed" />
              </p>

              <Section title="Now" id="now" description="Batteries whose recorded condition needs a person. Each has the next step from the same record.">
                {now.length === 0 ? (
                  <p className="flex items-center gap-2 text-[15px] text-ink"><CheckCircle2 className="h-5 w-5 text-approved" aria-hidden /> Nothing needs attention.</p>
                ) : (
                  <ul className="divide-y divide-line" aria-label="Needs attention now">
                    {now.map((p) => (
                      <li key={p.battery.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between" data-testid="action-now">
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                            <Link href={`/app/batteries/${p.battery.id}`} className="mono text-[17px] text-ink hover:underline">{p.battery.label}</Link>
                            <StatusBadge status={p.status.status} />
                            <span className="text-sm text-muted">{p.location.siteName}</span>
                          </p>
                          <p className="mt-1 text-[15px] text-ink">{p.status.headline}</p>
                          <p className="mt-1 flex items-start gap-1.5 text-sm text-copper-700"><ArrowRight className="mt-[3px] h-3.5 w-3.5 shrink-0" aria-hidden />{p.status.nextStep}</p>
                        </div>
                        <div className="no-print flex shrink-0 flex-wrap gap-2">
                          <Button size="sm" disabled={!p.location.siteId} onClick={() => setTarget({ p, kind: 'maintenance' })}>Request maintenance</Button>
                          <Button size="sm" variant="secondary" disabled={!p.location.siteId} onClick={() => setTarget({ p, kind: 'replacement' })}>Plan replacement</Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section
                title="Scheduled" id="scheduled"
                description="Requests and plans you have made here. They are kept in this browser only: no service request is created and no one is notified."
                actions={requests.length > 0 ? <Button variant="ghost" size="sm" onClick={clearDemoRequests}>Clear demo requests</Button> : undefined}
              >
                {requests.length === 0 ? (
                  <p className="text-sm text-muted">Nothing scheduled. Request maintenance or plan a replacement from a battery above or from its record.</p>
                ) : (
                  <ul className="divide-y divide-line" aria-label="Demo requests">
                    {requests.map((r) => (
                      <li key={r.id} className="py-3 first:pt-0 last:pb-0" data-testid="demo-request">
                        <p className="text-sm text-ink"><span className="mono">{r.id}</span> · {REQUEST_KIND_LABELS[r.kind]} for <Link href={`/app/batteries/${r.batteryId}`} className="font-medium text-copper-700 hover:underline">{r.batteryLabel}</Link>, {REQUEST_WINDOW_LABELS[r.window].toLowerCase()}</p>
                        <p className="mt-0.5 text-xs text-muted">{r.siteName} · {formatDateTime(r.createdAt)} · {r.status}{r.note && ` · “${r.note}”`}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section title="Completed" id="completed" description="Service work that an engineer approved, from your records. The method stays confidential.">
                {completed.length === 0 ? <p className="text-sm text-muted">No completed service work is recorded.</p> : (
                  <ul className="divide-y divide-line" aria-label="Completed service work">
                    {completed.map(({ p, t }) => (
                      <li key={t.id} className="py-3 first:pt-0 last:pb-0" data-testid="action-completed">
                        <p className="text-sm text-ink"><Link href={`/app/batteries/${p.battery.id}`} className="mono font-medium text-copper-700 hover:underline">{p.battery.label}</Link> · {t.title} · {formatDate(t.at)}</p>
                        <p className="mt-0.5 text-xs text-muted">{p.location.siteName ?? 'Not installed'} · {t.detail}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              {target && target.p.location.siteId && (
                <RequestDialog
                  open onOpenChange={(o) => { if (!o) setTarget(null); }} kind={target.kind} battery={{ id: target.p.battery.id, label: target.p.battery.label }}
                  site={{ id: target.p.location.siteId, name: target.p.location.siteName ?? target.p.location.siteId }} role={session.role} suggestion={target.p.status.nextStep}
                />
              )}
            </div>
          );
        }}
      </QueryView>
    </div>
  );
}
