'use client';
import { Download, Plus, Search } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { Badge, LifecycleBadge, QualityBadge, WarrantyBadge } from '@/components/ui/Badge';
import { Button, LinkButton } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Field, Input, Select } from '@/components/ui/Field';
import { PageHeader } from '@/components/ui/Layout';
import { LoadingBlock, NoResults, QueryView } from '@/components/ui/States';
import { LIFECYCLE_LABELS, LIFECYCLE_ORDER } from '@/domain/lifecycle';
import type { LifecycleState } from '@/domain/types';
import { downloadText, formatDate, formatNumber } from '@/lib/format';
import { useAction, useSession, useSvcQuery } from '@/lib/hooks';
import type { BatteryFilters, BatteryListItem } from '@/services/types';

const EMPTY: BatteryFilters = { q: '', manufacturer: '', siteId: '', state: '', chemistry: '', qualityLevel: '', updatedFrom: '', updatedTo: '' };

function BatteriesInner() {
  const params = useSearchParams();
  const session = useSession();
  const [filters, setFilters] = useState<BatteryFilters>({
    ...EMPTY,
    q: params.get('q') ?? '',
    qualityLevel: params.get('quality') ?? '',
    state: (params.get('state') as LifecycleState | null) ?? '',
  });

  const facets = useSvcQuery(['batteries', 'facets'], (s) => s.batteries.facets());
  const list = useSvcQuery(['batteries', 'list', filters], (s) => s.batteries.list(filters));
  const exportCsv = useAction<void, { fileName: string; csv: string }>(
    (s) => s.batteries.exportCsv(list.data?.map((b) => b.id)),
    { onSuccess: (r) => downloadText(r.fileName, r.csv), success: 'CSV export downloaded. The export is recorded in the audit history.' },
  );

  const set = (patch: Partial<BatteryFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const active = useMemo(() => Object.values(filters).some(Boolean), [filters]);

  const columns: Column<BatteryListItem>[] = [
    {
      key: 'label', header: 'Battery', sort: (b) => b.label, mobile: 'title',
      cell: (b) => <span className="mono">{b.label}</span>,
    },
    {
      key: 'serial', header: 'Manufacturer serial', sort: (b) => b.manufacturerSerial,
      cell: (b) => (
        <span>
          {b.manufacturerSerial ? <span className="mono whitespace-nowrap text-xs">{b.manufacturerSerial}</span> : <span className="text-muted">Not recorded</span>}
          {b.duplicateWarning && (
            <span className="mt-1 block">
              <Badge tone="red" title={b.duplicateWarning}>Duplicate serial</Badge>
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'model', header: 'Model', sort: (b) => b.model,
      cell: (b) => (
        <span className="whitespace-nowrap">
          {b.model}
          <span className="block text-xs text-muted">{b.chemistry} · {b.ratedVoltageV} V / {b.ratedCapacityAh} Ah</span>
        </span>
      ),
    },
    {
      key: 'state', header: 'State and evidence', sort: (b) => LIFECYCLE_ORDER.indexOf(b.lifecycleState),
      cell: (b) => (
        <span>
          <LifecycleBadge state={b.lifecycleState} />
          <span className="mt-1 block text-xs text-muted">{b.evidenceStatus.label}</span>
        </span>
      ),
    },
    {
      key: 'location', header: 'Location', sort: (b) => b.siteName ?? b.physicalLocation,
      cell: (b) => (b.siteName ? <span>{b.siteName.replace(/^Demo /, '')}<span className="block text-xs text-muted">{b.position}</span></span> : <span>{b.physicalLocation}</span>),
    },
    {
      key: 'test', header: 'Last approved test', sort: (b) => b.lastApprovedTest?.pctOfRated ?? null, align: 'right',
      cell: (b) =>
        b.lastApprovedTest ? (
          <span className="whitespace-nowrap">
            {formatNumber(b.lastApprovedTest.capacityAh, 0, 'Ah')}
            <span className="block text-xs text-muted">
              {b.lastApprovedTest.pctOfRated === null ? 'Rated unknown' : `${formatNumber(b.lastApprovedTest.pctOfRated, 0)}% of rated`}
            </span>
            <span className="block text-xs text-muted">{formatDate(b.lastApprovedTest.at)}</span>
          </span>
        ) : (
          <span className="text-muted">None approved</span>
        ),
    },
    {
      key: 'quality', header: 'Data quality',
      cell: (b) => {
        const notes = [...b.quality.conflicts, ...b.quality.missing.map((m) => `Missing: ${m}`)];
        return (
          <span className="block max-w-[200px]">
            <QualityBadge level={b.quality.level} title={notes.join('; ')} />
            {notes.length > 0 && <span className="mt-1 block text-xs text-muted">{notes[0]}{notes.length > 1 ? ` (+${notes.length - 1} more)` : ''}</span>}
          </span>
        );
      },
    },
    { key: 'warranty', header: 'Warranty', hideBelow: '2xl', cell: (b) => <WarrantyBadge state={b.warrantyState} /> },
    { key: 'updated', header: 'Updated', sort: (b) => b.updatedAt, hideBelow: '2xl', cell: (b) => formatDate(b.updatedAt) },
  ];

  return (
    <>
      <PageHeader
        title="Batteries"
        description="Every battery record visible to your role. Open a record to see its passport."
        actions={
          <>
            {session.can('battery.export') && (
              <Button variant="secondary" icon={<Download className="h-4 w-4" aria-hidden />} loading={exportCsv.isPending} onClick={() => exportCsv.mutate()}>
                Export CSV
              </Button>
            )}
            {session.can('battery.create') && (
              <LinkButton href="/app/intake" icon={<Plus className="h-4 w-4" aria-hidden />}>
                Register battery
              </LinkButton>
            )}
          </>
        }
      />

      <form role="search" aria-label="Filter batteries" className="card mb-5 p-4" onSubmit={(e) => e.preventDefault()}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Search" className="sm:col-span-2" hint="Label, manufacturer serial, QR reference or alias">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <Input className="pl-9" value={filters.q ?? ''} onChange={(e) => set({ q: e.target.value })} placeholder="B-0002, AV200-…, SYN-…" />
            </div>
          </Field>
          <Field label="Lifecycle state">
            <Select value={filters.state ?? ''} onChange={(e) => set({ state: e.target.value as LifecycleState | '' })}>
              <option value="">All states</option>
              {LIFECYCLE_ORDER.map((s) => (
                <option key={s} value={s}>{LIFECYCLE_LABELS[s]}</option>
              ))}
            </Select>
          </Field>
          <Field label="Data quality">
            <Select value={filters.qualityLevel ?? ''} onChange={(e) => set({ qualityLevel: e.target.value })}>
              <option value="">Any</option>
              <option value="complete">Complete</option>
              <option value="partial">One field missing</option>
              <option value="incomplete">Several fields missing</option>
              <option value="conflict">Identity conflict</option>
            </Select>
          </Field>
        </div>
        <details className="mt-3" open={Boolean(filters.siteId || filters.manufacturer || filters.chemistry || filters.updatedFrom || filters.updatedTo)}>
          <summary className="cursor-pointer text-sm font-medium text-teal-800 underline-offset-2 hover:underline">More filters</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Site">
              <Select value={filters.siteId ?? ''} onChange={(e) => set({ siteId: e.target.value })}>
                <option value="">All sites</option>
                {facets.data?.sites.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Manufacturer">
              <Select value={filters.manufacturer ?? ''} onChange={(e) => set({ manufacturer: e.target.value })}>
                <option value="">All manufacturers</option>
                {facets.data?.manufacturers.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </Select>
            </Field>
            <Field label="Chemistry">
              <Select value={filters.chemistry ?? ''} onChange={(e) => set({ chemistry: e.target.value })}>
                <option value="">All chemistries</option>
                {facets.data?.chemistries.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Updated from">
                <Input type="date" value={filters.updatedFrom ?? ''} onChange={(e) => set({ updatedFrom: e.target.value })} />
              </Field>
              <Field label="Updated to">
                <Input type="date" value={filters.updatedTo ?? ''} onChange={(e) => set({ updatedTo: e.target.value })} />
              </Field>
            </div>
          </div>
        </details>
        {active && (
          <div className="mt-3">
            <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY)}>
              Clear all filters
            </Button>
          </div>
        )}
      </form>

      <QueryView
        query={list}
        skeleton={<LoadingBlock label="Loading batteries" rows={7} />}
        isEmpty={(d) => d.length === 0}
        empty={<NoResults onClear={active ? () => setFilters(EMPTY) : undefined} />}
      >
        {(rows) => (
          <div className="card p-0 md:p-1">
            <p className="px-4 pt-3 text-sm text-muted md:px-3" aria-live="polite">
              {rows.length} {rows.length === 1 ? 'battery' : 'batteries'}
            </p>
            <div className="p-3 md:p-2">
              <DataTable
                caption="Batteries"
                columns={columns}
                rows={rows}
                rowKey={(b) => b.id}
                rowHref={(b) => `/app/batteries/${b.id}`}
                pageSize={15}
                initialSort={{ key: 'label', dir: 'asc' }}
              />
            </div>
          </div>
        )}
      </QueryView>
    </>
  );
}

export default function BatteriesPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <BatteriesInner />
    </Suspense>
  );
}
