'use client';
import { Download, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { LifecycleBadge, QualityBadge, WarrantyBadge } from '@/components/ui/Badge';
import { Button, LinkButton } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { chipClass } from '@/components/ui/buttonClass';
import { Field, Input, Select, ToolbarSearch, ToolbarSelect } from '@/components/ui/Field';
import { PageHeader, TableCard } from '@/components/ui/Layout';
import { LoadingBlock, NoResults, QueryView } from '@/components/ui/States';
import { LIFECYCLE_LABELS, LIFECYCLE_ORDER } from '@/domain/lifecycle';
import type { LifecycleState } from '@/domain/types';
import { cn, downloadText, formatDate, formatNumber } from '@/lib/format';
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

  const [more, setMore] = useState(false);
  const facets = useSvcQuery(['batteries', 'facets'], (s) => s.batteries.facets());
  const list = useSvcQuery(['batteries', 'list', filters], (s) => s.batteries.list(filters));
  const exportCsv = useAction<void, { fileName: string; csv: string }>(
    (s) => s.batteries.exportCsv(list.data?.map((b) => b.id)),
    { onSuccess: (r) => downloadText(r.fileName, r.csv), success: 'CSV export downloaded. The export is recorded in the audit history.' },
  );

  const set = (patch: Partial<BatteryFilters>) => setFilters((f) => ({ ...f, ...patch }));
  const active = useMemo(() => Object.values(filters).some(Boolean), [filters]);
  const extraCount = [filters.siteId, filters.manufacturer, filters.chemistry, filters.updatedFrom || filters.updatedTo].filter(Boolean).length;

  const columns: Column<BatteryListItem>[] = [
    {
      key: 'label', header: 'Battery', sort: (b) => b.label, mobile: 'title',
      cell: (b) => (
        <span className="block whitespace-nowrap">
          <span className="mono">{b.label}</span>
          <span
            className={cn('mono block text-xs font-normal', b.duplicateWarning ? 'text-critical-700' : 'text-muted')}
            title={b.duplicateWarning ?? undefined}
          >
            {b.manufacturerSerial ?? 'No serial recorded'}
            {b.duplicateWarning && ' · duplicate'}
          </span>
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
          <span className="block max-w-[220px]">
            <QualityBadge level={b.quality.level} title={notes.join('; ')} />
            {notes.length > 0 && <span className="mt-1 line-clamp-2 text-xs text-muted">{notes[0]}{notes.length > 1 ? ` (+${notes.length - 1} more)` : ''}</span>}
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

      <form role="search" aria-label="Filter batteries" className="mb-5" onSubmit={(e) => e.preventDefault()}>
        <div className="flex flex-wrap items-center gap-2">
          <ToolbarSearch
            label="Search batteries"
            icon={<Search className="h-4 w-4" aria-hidden />}
            className="w-full sm:w-[300px]"
            value={filters.q ?? ''}
            onChange={(e) => set({ q: e.target.value })}
            placeholder="Label, serial or QR reference"
          />
          <ToolbarSelect label="Lifecycle state" value={filters.state ?? ''} onChange={(e) => set({ state: e.target.value as LifecycleState | '' })}>
            <option value="">All lifecycle states</option>
            {LIFECYCLE_ORDER.map((st) => (
              <option key={st} value={st}>{LIFECYCLE_LABELS[st]}</option>
            ))}
          </ToolbarSelect>
          <ToolbarSelect label="Data quality" value={filters.qualityLevel ?? ''} onChange={(e) => set({ qualityLevel: e.target.value })}>
            <option value="">Any data quality</option>
            <option value="complete">Complete</option>
            <option value="partial">One field missing</option>
            <option value="incomplete">Several fields missing</option>
            <option value="conflict">Identity conflict</option>
          </ToolbarSelect>
          <button type="button" aria-expanded={more} aria-controls="more-filters" className={chipClass(more, 'min-h-[40px]')} onClick={() => setMore((m) => !m)}>
            <SlidersHorizontal className="h-4 w-4" aria-hidden />
            More filters
            {extraCount > 0 && <span className="num">· {extraCount}</span>}
          </button>
          {active && (
            <Button variant="ghost" size="sm" className="!min-h-[40px]" onClick={() => setFilters(EMPTY)}>
              Clear all
            </Button>
          )}
          <p className="ml-auto text-sm text-muted" aria-live="polite">
            {list.data ? `${list.data.length} ${list.data.length === 1 ? 'battery' : 'batteries'}` : ''}
          </p>
        </div>
        <div id="more-filters" className={more ? 'card anim-row mt-3 grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4' : 'hidden'}>
          <Field label="Site">
            <Select value={filters.siteId ?? ''} onChange={(e) => set({ siteId: e.target.value })}>
              <option value="">All sites</option>
              {facets.data?.sites.map((st) => (
                <option key={st.id} value={st.id}>{st.name}</option>
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
      </form>

      <QueryView
        query={list}
        skeleton={<LoadingBlock label="Loading batteries" rows={7} />}
        isEmpty={(d) => d.length === 0}
        empty={<NoResults onClear={active ? () => setFilters(EMPTY) : undefined} />}
      >
        {(rows) => (
          <TableCard>
            <DataTable
              caption="Batteries"
              columns={columns}
              rows={rows}
              rowKey={(b) => b.id}
              rowHref={(b) => `/app/batteries/${b.id}`}
              pageSize={15}
              initialSort={{ key: 'label', dir: 'asc' }}
            />
          </TableCard>
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
