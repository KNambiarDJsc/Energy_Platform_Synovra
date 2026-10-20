'use client';
import { FileText, Search } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { DemoDataNotice } from '@/components/customer/Parts';
import { LinkButton } from '@/components/ui/Button';
import { chipClass } from '@/components/ui/buttonClass';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { ToolbarSearch, ToolbarSelect } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/Layout';
import { LoadingBlock, NoResults, QueryView } from '@/components/ui/States';
import { StatusBadge } from '@/components/ui/Status';
import { STATUS_LABELS, type BatteryStatus } from '@/domain/status';
import { useCustomerScope, useSiteData } from '@/lib/customer/hooks';
import { computeCoverage } from '@/lib/customer/model';
import { formatDate } from '@/lib/format';
import type { BatteryPassport } from '@/services/types';

const FILTERS: BatteryStatus[] = ['good', 'watching', 'attention', 'baseline', 'retired'];
const isStatus = (v: string | null): v is BatteryStatus => !!v && (FILTERS as string[]).includes(v);

function pctOfRated(p: BatteryPassport): number | null {
  const c = p.lastApprovedTest?.result.capacityAh;
  return c === null || c === undefined ? null : Math.round((c / p.family.ratedCapacityAh) * 100);
}

/**
 * The portfolio stays minimal: which battery, where, how it is doing, what to do. A clean list with the filters a
 * person reaches for first. The record behind each row is one click away.
 */
function Portfolio() {
  const params = useSearchParams();
  const scope = useCustomerScope();
  const siteIds = scope.site ? [scope.site.id] : (scope.customer?.sites.map((s) => s.id) ?? []);
  const data = useSiteData(siteIds);
  const [status, setStatus] = useState<BatteryStatus | ''>(() => (isStatus(params.get('status')) ? (params.get('status') as BatteryStatus) : ''));
  const [q, setQ] = useState(params.get('q') ?? '');
  const [family, setFamily] = useState('');
  // A search from the top bar or a link from home changes the address while this screen stays mounted: follow it.
  const [seen, setSeen] = useState(`${params.get('status') ?? ''}|${params.get('q') ?? ''}`);
  const now = `${params.get('status') ?? ''}|${params.get('q') ?? ''}`;
  if (seen !== now) {
    setSeen(now);
    setStatus(isStatus(params.get('status')) ? (params.get('status') as BatteryStatus) : '');
    setQ(params.get('q') ?? '');
  }

  const families = useMemo(() => [...new Set((data.data?.passports ?? []).map((p) => `${p.family.chemistry}, ${p.family.ratedVoltageV} V ${p.family.ratedCapacityAh} Ah`))].sort(), [data.data]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data.data?.passports ?? [])
      .filter((p) => !status || p.status.status === status)
      .filter((p) => !family || `${p.family.chemistry}, ${p.family.ratedVoltageV} V ${p.family.ratedCapacityAh} Ah` === family)
      .filter((p) => !needle || [p.battery.label, p.battery.manufacturerSerial ?? '', p.family.model, p.location.stringName ?? '', p.location.siteName ?? ''].join(' ').toLowerCase().includes(needle))
      .sort((a, b) => a.status.urgency - b.status.urgency || a.battery.label.localeCompare(b.battery.label, 'en', { numeric: true }));
  }, [data.data, status, q, family]);

  const columns: Column<BatteryPassport>[] = [
    {
      key: 'battery', header: 'Battery', mobile: 'title', sort: (p) => p.battery.label,
      cell: (p) => (
        <Link href={`/app/batteries/${p.battery.id}`} className="block">
          <span className="mono text-[15px] text-ink">{p.battery.label}</span>
          <span className="block text-xs text-muted">{p.family.chemistry}, {p.family.ratedVoltageV} V {p.family.ratedCapacityAh} Ah</span>
        </Link>
      ),
    },
    {
      key: 'site', header: 'Site', hideBelow: 'lg', sort: (p) => `${p.location.siteName ?? ''}${p.location.stringName ?? ''}${p.location.position ?? ''}`,
      cell: (p) => (p.location.siteName
        ? <span className="text-sm text-ink-2">{p.location.siteName}<span className="block text-xs text-muted">{p.location.stringName}, position {p.location.position}</span></span>
        : <span className="text-sm text-muted">{p.battery.physicalLocation}</span>),
    },
    { key: 'status', header: 'Condition', sort: (p) => p.status.urgency, cell: (p) => <StatusBadge status={p.status.status} /> },
    { key: 'next', header: 'What next', cell: (p) => <span className="text-sm text-ink">{p.status.nextStep}</span> },
    {
      key: 'test', header: 'Last approved test', hideBelow: 'xl', sort: (p) => p.lastApprovedTest?.reviewedAt ?? p.lastApprovedTest?.startedAt ?? null,
      cell: (p) => {
        const t = p.lastApprovedTest;
        const pct = pctOfRated(p);
        return t
          ? <span className="whitespace-nowrap text-sm">{formatDate(t.reviewedAt ?? t.startedAt)}<span className="block text-xs text-muted">{pct === null ? 'No capacity recorded' : `${pct}% of rated (calculated)`}</span></span>
          : <span className="text-sm text-muted">Baseline being established</span>;
      },
    },
  ];

  const siteName = scope.site?.name ?? `All ${scope.customer?.sites.length ?? 0} sites`;
  const reportHref = `/app/reports?${new URLSearchParams({ ...(scope.customer ? { customer: scope.customer.tenantId } : {}), ...(scope.site ? { site: scope.site.id } : {}) }).toString()}`;

  return (
    <div className="app-stagger">
      <PageHeader
        title="Your batteries"
        eyebrow={scope.customer ? `${scope.customer.name}, ${siteName}` : undefined}
        description="Which battery, where it is, how it is doing and what happens next. Open one to see inside it."
        actions={<LinkButton href={reportHref} variant="secondary" icon={<FileText className="h-4 w-4" aria-hidden />}>Report</LinkButton>}
      />
      <DemoDataNotice className="mb-5" />

      <QueryView query={scope.query} skeleton={<LoadingBlock label="Loading your sites" rows={3} />}>
        {() => (
          <QueryView query={data} skeleton={<LoadingBlock label="Loading battery records" rows={6} />}>
            {(d) => {
              const cov = computeCoverage(d.passports, d.snapshotAt);
              return (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                    <div role="group" aria-label="Show batteries by condition" className="flex flex-wrap gap-1.5">
                      <button type="button" aria-pressed={status === ''} className={chipClass(status === '')} onClick={() => setStatus('')}>All <span className="num opacity-70">{cov.batteries}</span></button>
                      {FILTERS.filter((s) => s !== 'retired' || cov.byStatus.retired > 0).map((s) => (
                        <button key={s} type="button" aria-pressed={status === s} className={chipClass(status === s)} onClick={() => setStatus(s)}>
                          {STATUS_LABELS[s]} <span className="num opacity-70">{cov.byStatus[s]}</span>
                        </button>
                      ))}
                    </div>
                    <div role="group" aria-label="Narrow the list" className="ml-auto flex flex-wrap items-center gap-2">
                      <ToolbarSelect label="Site" value={scope.site?.id ?? ''} onChange={(e) => scope.choose({ site: e.target.value || null })}>
                        <option value="">All sites ({scope.customer?.sites.length ?? 0})</option>
                        {scope.customer?.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </ToolbarSelect>
                      {families.length > 1 && (
                        <ToolbarSelect label="Battery type" value={family} onChange={(e) => setFamily(e.target.value)}>
                          <option value="">Any battery type</option>
                          {families.map((f) => <option key={f} value={f}>{f}</option>)}
                        </ToolbarSelect>
                      )}
                      <ToolbarSearch className="w-full sm:w-56" label="Find a battery" icon={<Search className="h-4 w-4" aria-hidden />} placeholder="Find a battery" value={q} onChange={(e) => setQ(e.target.value)} />
                    </div>
                  </div>

                  {rows.length === 0 ? <NoResults onClear={() => { setStatus(''); setQ(''); setFamily(''); }} /> : (
                    <div className="card p-2 md:p-3">
                      <DataTable columns={columns} rows={rows} rowKey={(p) => p.battery.id} caption="Batteries at your sites" rowHref={(p) => `/app/batteries/${p.battery.id}`} pageSize={12} />
                    </div>
                  )}

                  <p className="px-1 text-[13px] text-muted">
                    {cov.withApprovedTest} of {cov.batteries} have an approved capacity test. Records last changed {cov.lastUpdated ? formatDate(cov.lastUpdated) : 'never'}. A battery with nothing to judge by is “Baseline being established”, never shown as normal.
                  </p>

                  <details className="card p-5" data-testid="structure">
                    <summary className="cursor-pointer text-[15px] font-medium text-ink">Where batteries sit, by site, bank and string</summary>
                    <div className="mt-4 space-y-4">
                      {d.siteViews.map((v) => (
                        <div key={v.site.id}>
                          <p className="text-sm font-semibold text-ink">{v.site.name} <span className="font-normal text-muted">{v.site.city}, {v.occupied} of {v.capacity} positions filled</span></p>
                          <ul className="mt-2 space-y-2">
                            {v.strings.map((s) => (
                              <li key={s.string.id} className="rounded-xl bg-canvas px-3 py-2.5">
                                <p className="text-[13px] text-ink-2">{s.bank.name} / {s.string.name} <span className="text-muted">· {s.string.nominalVoltageV} V DC · {s.familyModel}</span></p>
                                <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label={`${s.string.name} positions`}>
                                  {s.slots.map((sl) => (sl.battery ? (
                                    <li key={sl.slot.id}><Link href={`/app/batteries/${sl.battery.id}`} className="mono inline-flex min-h-[32px] items-center rounded-full bg-white px-3 text-xs text-ink hover:bg-fill-2">{sl.battery.label}</Link></li>
                                  ) : <li key={sl.slot.id} className="mono inline-flex min-h-[32px] items-center rounded-full border border-dashed border-field px-3 text-xs text-muted">empty</li>))}
                                </ul>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              );
            }}
          </QueryView>
        )}
      </QueryView>
    </div>
  );
}

export default function BatteriesPage() {
  return <Suspense fallback={<LoadingBlock />}><Portfolio /></Suspense>;
}
