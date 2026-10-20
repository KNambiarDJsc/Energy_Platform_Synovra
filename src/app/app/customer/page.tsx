'use client';
import { ClipboardList, FileText, Search } from 'lucide-react';
import Link from 'next/link';
import { Suspense, useMemo, useState } from 'react';
import { BasisLegend, DemoDataNotice } from '@/components/customer/Parts';
import { Button, LinkButton } from '@/components/ui/Button';
import { chipClass } from '@/components/ui/buttonClass';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { ToolbarSearch, ToolbarSelect } from '@/components/ui/Field';
import { Notice, PageHeader, Section } from '@/components/ui/Layout';
import { LoadingBlock, NoResults, QueryView } from '@/components/ui/States';
import { StatusBadge, StatusRing, STATUS_STYLE } from '@/components/ui/Status';
import { STATUS_LABELS, type BatteryStatus } from '@/domain/status';
import { computeCoverage, lastUpdated } from '@/lib/customer/model';
import { useCustomerScope, useSiteData } from '@/lib/customer/hooks';
import { REQUEST_KIND_LABELS, REQUEST_WINDOW_LABELS, clearDemoRequests, useDemoRequests } from '@/lib/customer/requests';
import { formatDate, formatDateTime } from '@/lib/format';
import type { BatteryPassport } from '@/services/types';

const ORDER: Exclude<BatteryStatus, 'retired'>[] = ['good', 'watching', 'attention', 'baseline'];
const FILTERS: BatteryStatus[] = ['attention', 'watching', 'baseline', 'good', 'retired'];

function pctOfRated(p: BatteryPassport): number | null {
  const c = p.lastApprovedTest?.result.capacityAh;
  return c === null || c === undefined ? null : Math.round((c / p.family.ratedCapacityAh) * 100);
}

function Fleet() {
  const scope = useCustomerScope();
  const siteIds = scope.site ? [scope.site.id] : (scope.customer?.sites.map((s) => s.id) ?? []);
  const data = useSiteData(siteIds);
  const requests = useDemoRequests();
  const [status, setStatus] = useState<BatteryStatus | ''>('');
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data.data?.passports ?? [])
      .filter((p) => !status || p.status.status === status)
      .filter((p) => !needle || [p.battery.label, p.battery.manufacturerSerial ?? '', p.family.model, p.location.stringName ?? ''].join(' ').toLowerCase().includes(needle))
      .sort((a, b) => a.status.urgency - b.status.urgency || a.battery.label.localeCompare(b.battery.label, 'en', { numeric: true }));
  }, [data.data, status, q]);

  const columns: Column<BatteryPassport>[] = [
    {
      key: 'battery', header: 'Battery', mobile: 'title', sort: (p) => p.battery.label,
      cell: (p) => (
        <Link href={`/app/customer/batteries/${p.battery.id}`} className="block">
          <span className="mono text-[15px] text-ink">{p.battery.label}</span>
          <span className="block text-xs text-muted">{p.family.manufacturer} {p.family.model}</span>
        </Link>
      ),
    },
    { key: 'status', header: 'Condition', sort: (p) => p.status.urgency, cell: (p) => <StatusBadge status={p.status.status} /> },
    { key: 'why', header: 'Why', cell: (p) => <span className="text-sm text-ink">{p.status.headline}</span> },
    {
      key: 'where', header: 'Where', hideBelow: 'lg', sort: (p) => `${p.location.siteName ?? ''}${p.location.stringName ?? ''}${p.location.position ?? ''}`,
      cell: (p) => (p.location.siteName
        ? <span className="text-sm text-ink-2">{p.location.stringName}, position {p.location.position}<span className="block text-xs text-muted">{p.location.siteName}</span></span>
        : <span className="text-sm text-muted">{p.battery.physicalLocation}</span>),
    },
    {
      key: 'test', header: 'Last approved test', sort: (p) => p.lastApprovedTest?.reviewedAt ?? p.lastApprovedTest?.startedAt ?? null,
      cell: (p) => {
        const t = p.lastApprovedTest;
        const pct = pctOfRated(p);
        return t ? <span className="whitespace-nowrap text-sm">{formatDate(t.reviewedAt ?? t.startedAt)}<span className="block text-xs text-muted">{pct === null ? 'No capacity recorded' : `${pct}% of rated (calculated)`}</span></span>
          : <span className="text-sm text-muted">Baseline being established</span>;
      },
    },
    { key: 'updated', header: 'Record updated', hideBelow: 'xl', sort: (p) => lastUpdated(p), cell: (p) => <span className="whitespace-nowrap text-sm text-ink-2">{formatDate(lastUpdated(p))}</span> },
  ];

  const siteName = scope.site?.name ?? `All ${scope.customer?.sites.length ?? 0} sites`;
  const multiCustomer = scope.customers.length > 1;
  const reportHref = `/app/customer/report?${new URLSearchParams({ ...(scope.customer ? { customer: scope.customer.tenantId } : {}), ...(scope.site ? { site: scope.site.id } : {}) }).toString()}`;

  return (
    <div className="app-stagger">
      <PageHeader
        title="Your batteries"
        eyebrow={scope.customer ? `${scope.customer.name}, ${siteName}` : undefined}
        description="Every battery at your sites, how it is doing, why, and the evidence behind it. Open a battery for its full record."
        actions={<LinkButton href={reportHref} variant="secondary" icon={<FileText className="h-4 w-4" aria-hidden />}>Report preview</LinkButton>}
      />
      <DemoDataNotice className="mb-5" />

      <div className="mb-5 flex flex-wrap items-center gap-2" role="group" aria-label="Choose what to show">
        {multiCustomer ? (
          <ToolbarSelect label="Customer" value={scope.customer?.tenantId ?? ''} onChange={(e) => scope.choose({ customer: e.target.value })}>
            {scope.customers.map((c) => <option key={c.tenantId} value={c.tenantId}>{c.name}</option>)}
          </ToolbarSelect>
        ) : scope.customer ? <span className="rounded-full bg-fill px-4 py-2 text-sm font-medium text-ink">{scope.customer.name}</span> : null}
        <ToolbarSelect label="Site" value={scope.site?.id ?? ''} onChange={(e) => scope.choose({ site: e.target.value || null })}>
          <option value="">All sites ({scope.customer?.sites.length ?? 0})</option>
          {scope.customer?.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </ToolbarSelect>
      </div>

      <QueryView query={scope.query} skeleton={<LoadingBlock label="Loading your sites" rows={3} />}>
        {() => (
          <QueryView query={data} skeleton={<LoadingBlock label="Loading battery records" rows={6} />}>
            {(d) => {
              const cov = computeCoverage(d.passports, d.snapshotAt);
              const counts = Object.fromEntries(FILTERS.map((s) => [s, cov.byStatus[s]])) as Record<BatteryStatus, number>;
              return (
                <div className="space-y-5">
                  <section className="card p-6 md:p-8" aria-labelledby="fleet-h">
                    <div className="flex flex-col items-start gap-8 md:flex-row md:items-center md:gap-12">
                      <StatusRing
                        label={`${cov.inFleet} batteries: ${ORDER.map((s) => `${cov.byStatus[s]} ${STATUS_LABELS[s].toLowerCase()}`).join(', ')}.`}
                        parts={ORDER.map((s) => ({ status: s, count: cov.byStatus[s] }))}
                      >
                        <span className="font-display text-[56px] leading-none text-ink">{cov.inFleet}</span>
                        <span className="mt-1.5 text-sm text-muted">batteries</span>
                      </StatusRing>
                      <div className="min-w-0 flex-1">
                        <h2 id="fleet-h" className="font-display text-[28px] leading-9 text-ink">{siteName}</h2>
                        <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4" aria-label="Batteries by condition">
                          {ORDER.map((s) => (
                            <li key={s}>
                              <button type="button" onClick={() => setStatus(status === s ? '' : s)} className="group block w-full rounded-lg py-1 text-left" aria-pressed={status === s}>
                                <span className="flex items-center gap-2 text-[13px] text-ink-2 group-hover:text-ink">
                                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: STATUS_STYLE[s].stroke }} aria-hidden />{STATUS_LABELS[s]}
                                </span>
                                <span className="num mt-1 block text-[26px] font-semibold leading-8 text-ink">{cov.byStatus[s]}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </section>

                  <div className="grid gap-5 lg:grid-cols-2">
                    <Section title="Data coverage" description="What the records hold, so you know how far to trust the picture." id="coverage">
                      <dl className="space-y-3 text-sm">
                        {([
                          ['Approved capacity test on record', `${cov.withApprovedTest} of ${cov.batteries}`],
                          ['Of those, tested in the last 12 months', `${cov.testsCurrent} of ${cov.batteries}`],
                          ['Sensor attributed (simulated here)', `${cov.withSensor} of ${cov.batteries}`],
                          ['Customer-visible evidence files', `${cov.withCustomerEvidence} of ${cov.batteries} batteries`],
                          ['Newest change in these records', cov.lastUpdated ? formatDateTime(cov.lastUpdated) : 'None'],
                          ['Snapshot taken', formatDateTime(d.snapshotAt)],
                        ] as const).map(([k, v]) => (
                          <div key={k} className="flex items-baseline justify-between gap-4 border-b border-line pb-2 last:border-0 last:pb-0">
                            <dt className="text-ink-2">{k}</dt><dd className="num text-right font-medium text-ink">{v}</dd>
                          </div>
                        ))}
                      </dl>
                      <p className="mt-4 text-[13px] text-muted">These are sample records, not continuous monitoring. A battery with no recent reading is shown as a gap, never as normal.</p>
                    </Section>

                    <Section title="Where batteries sit" description="Site, then bank and string, then position." id="structure">
                      {d.siteViews.length === 0 ? <p className="text-sm text-muted">No site structure is recorded.</p> : (
                        <div className="space-y-4">
                          {d.siteViews.map((v) => (
                            <div key={v.site.id}>
                              <p className="text-sm font-semibold text-ink">{v.site.name} <span className="font-normal text-muted">{v.site.city}, {v.occupied} of {v.capacity} positions filled</span></p>
                              <ul className="mt-2 space-y-2">
                                {v.strings.map((s) => (
                                  <li key={s.string.id} className="rounded-xl bg-canvas px-3 py-2.5">
                                    <p className="text-[13px] text-ink-2">{s.bank.name} / {s.string.name} <span className="text-muted">· {s.string.nominalVoltageV} V DC · {s.familyModel}</span></p>
                                    <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label={`${s.string.name} positions`}>
                                      {s.slots.map((sl) => (sl.battery ? (
                                        <li key={sl.slot.id}><Link href={`/app/customer/batteries/${sl.battery.id}`} className="mono inline-flex min-h-[32px] items-center rounded-full bg-white px-3 text-xs text-ink hover:bg-fill-2">{sl.battery.label}</Link></li>
                                      ) : <li key={sl.slot.id} className="mono inline-flex min-h-[32px] items-center rounded-full border border-dashed border-field px-3 text-xs text-muted">empty</li>))}
                                    </ul>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      )}
                    </Section>
                  </div>

                  <section aria-labelledby="list-h">
                    <h2 id="list-h" className="sr-only">Battery list</h2>
                    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-3">
                      <div role="group" aria-label="Show batteries by condition" className="flex flex-wrap gap-1.5">
                        <button type="button" aria-pressed={status === ''} className={chipClass(status === '')} onClick={() => setStatus('')}>All <span className="num opacity-70">{cov.batteries}</span></button>
                        {FILTERS.map((s) => (
                          <button key={s} type="button" aria-pressed={status === s} className={chipClass(status === s)} onClick={() => setStatus(s)}>
                            {STATUS_LABELS[s]} <span className="num opacity-70">{counts[s]}</span>
                          </button>
                        ))}
                      </div>
                      <ToolbarSearch className="ml-auto w-full sm:w-64" label="Find a battery" icon={<Search className="h-4 w-4" aria-hidden />} placeholder="Find a battery" value={q} onChange={(e) => setQ(e.target.value)} />
                    </div>
                    {rows.length === 0 ? <NoResults onClear={() => { setStatus(''); setQ(''); }} /> : (
                      <div className="card p-2 md:p-3">
                        <DataTable columns={columns} rows={rows} rowKey={(p) => p.battery.id} caption="Batteries at your sites" rowHref={(p) => `/app/customer/batteries/${p.battery.id}`} pageSize={12} />
                      </div>
                    )}
                  </section>

                  <Section
                    title="Requests (demo)" id="requests"
                    description="Maintenance requests and replacement plans made from a battery’s record. They are kept in this browser only."
                    actions={requests.length > 0 ? <Button variant="ghost" size="sm" onClick={clearDemoRequests}>Clear demo requests</Button> : undefined}
                  >
                    {requests.length === 0 ? (
                      <p className="flex items-center gap-2 text-sm text-muted"><ClipboardList className="h-4 w-4" aria-hidden /> No requests yet. Open a battery and choose Request maintenance or Plan replacement.</p>
                    ) : (
                      <ul className="divide-y divide-line" aria-label="Demo requests">
                        {requests.map((r) => (
                          <li key={r.id} className="py-3 first:pt-0 last:pb-0" data-testid="demo-request">
                            <p className="text-sm text-ink"><span className="mono">{r.id}</span> · {REQUEST_KIND_LABELS[r.kind]} for <Link href={`/app/customer/batteries/${r.batteryId}`} className="font-medium text-copper-700 hover:underline">{r.batteryLabel}</Link>, {REQUEST_WINDOW_LABELS[r.window].toLowerCase()}</p>
                            <p className="mt-0.5 text-xs text-muted">{r.siteName} · {formatDateTime(r.createdAt)} · {r.status}{r.note && ` · “${r.note}”`}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </Section>

                  <Section title="What the labels mean" id="basis" description="Every value in a record says which of these it is.">
                    <BasisLegend />
                  </Section>
                  <Notice tone="info" title="Reading this page">Condition follows a fixed, versioned rule over the last approved test, sensor readings, open alerts and identity. It is not a model and no health score is shown.</Notice>
                </div>
              );
            }}
          </QueryView>
        )}
      </QueryView>
    </div>
  );
}

export default function CustomerPage() {
  return <Suspense fallback={<LoadingBlock />}><Fleet /></Suspense>;
}
