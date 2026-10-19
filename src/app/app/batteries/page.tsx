'use client';
import { ArrowRight, Download, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { LifecycleBadge, QualityBadge, WarrantyBadge } from '@/components/ui/Badge';
import { Button, LinkButton } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { chipClass } from '@/components/ui/buttonClass';
import { Field, Input, Select, ToolbarSearch, ToolbarSelect } from '@/components/ui/Field';
import { PageHeader, TableCard } from '@/components/ui/Layout';
import { LoadingBlock, NoResults, QueryView } from '@/components/ui/States';
import { StatusBadge } from '@/components/ui/Status';
import { LIFECYCLE_LABELS, LIFECYCLE_ORDER } from '@/domain/lifecycle';
import { STATUS_LABELS, type BatteryStatus } from '@/domain/status';
import type { LifecycleState } from '@/domain/types';
import { cn, downloadText, formatDate, formatNumber } from '@/lib/format';
import { useAction, useSession, useSvcQuery } from '@/lib/hooks';
import type { BatteryFilters, BatteryListItem } from '@/services/types';

const STATUSES: BatteryStatus[] = ['good', 'watching', 'attention', 'baseline', 'retired'];
const STATUS_RANK: Record<BatteryStatus, number> = { attention: 0, watching: 1, baseline: 2, good: 3, retired: 4 };
/** The default view answers which battery, where, how it is doing, and what happens next. Everything else is one click away. */
const SIMPLE = ['label', 'status', 'location', 'test', 'next'];

const EMPTY: BatteryFilters = { q: '', manufacturer: '', siteId: '', state: '', chemistry: '', qualityLevel: '', updatedFrom: '', updatedTo: '' };

function BatteriesInner() {
  const params = useSearchParams();
  const router = useRouter();
  const session = useSession();
  const requested = params.get('status') as BatteryStatus | null;
  const [status, setStatus] = useState<BatteryStatus | ''>(requested && STATUSES.includes(requested) ? requested : '');
  const [view, setView] = useState<'simple' | 'detailed'>(params.get('view') === 'detailed' ? 'detailed' : 'simple');
  // Status and view live in the address too, so a filtered list can be shared and Back returns to it.
  const remember = (key: 'status' | 'view', value: string, fallback: string) => {
    const sp = new URLSearchParams(params.toString());
    if (value === fallback) sp.delete(key); else sp.set(key, value);
    router.replace(`/app/batteries${sp.toString() ? `?${sp.toString()}` : ''}`, { scroll: false });
  };
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

  const exportSelected = useAction<string[], { fileName: string; csv: string }>(
    (s, ids) => s.batteries.exportCsv(ids),
    { onSuccess: (r) => downloadText(r.fileName, r.csv), success: 'CSV export of the selected batteries downloaded. The export is recorded in the audit history.' },
  );
  // The status filter runs here, over the list the other filters returned, so each status can show its count.
  const shown = useMemo(() => (list.data ?? []).filter((b) => !status || b.status.code === status), [list.data, status]);
  const statusCounts = useMemo(() => {
    const c: Record<BatteryStatus, number> = { good: 0, watching: 0, attention: 0, baseline: 0, retired: 0 };
    for (const b of list.data ?? []) c[b.status.code] += 1;
    return c;
  }, [list.data]);
  // Chosen rows are kept by id, so they survive sorting and paging. Rows a filter hides are dropped from the choice.
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const chosen = useMemo(() => new Set(shown.filter((b) => picked.has(b.id)).map((b) => b.id)), [shown, picked]);

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
          <span className={cn('mt-0.5 hidden whitespace-normal text-xs font-normal text-muted md:block', view === 'detailed' && '2xl:hidden')}>{b.model}</span>
        </span>
      ),
    },
    {
      key: 'model', header: 'Model', sort: (b) => b.model, hideBelow: '2xl',
      cell: (b) => (
        <span className="whitespace-nowrap">
          {b.model}
          <span className="block text-xs text-muted">{b.chemistry} · {b.ratedVoltageV} V / {b.ratedCapacityAh} Ah</span>
        </span>
      ),
    },
    {
      key: 'status', header: 'Status', sort: (b) => STATUS_RANK[b.status.code],
      cell: (b) => (
        <span className="block max-w-[260px]">
          <StatusBadge status={b.status.code} />
          {b.status.code !== 'good' && b.status.code !== 'retired' && <span className="mt-1 line-clamp-2 block text-xs text-muted" title={b.status.headline}>{b.status.headline}</span>}
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
      key: 'next', header: 'Next step', hideBelow: 'xl',
      cell: (b) => (
        <span className={cn('flex max-w-[210px] items-start gap-1.5 text-sm', b.status.code === 'attention' ? 'font-medium text-copper-700' : 'text-ink-2')}>
          <ArrowRight className="mt-[3px] h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>{b.status.nextStep}</span>
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
          <span className="block max-w-[210px]">
            <QualityBadge level={b.quality.level} title={notes.join('; ')} />
            {notes.length > 0 && <span className="mt-1 block text-xs text-muted">{notes[0]}{notes.length > 1 ? ` (+${notes.length - 1} more, see the passport)` : ''}</span>}
          </span>
        );
      },
    },
    { key: 'warranty', header: 'Warranty', hideBelow: '2xl', cell: (b) => <WarrantyBadge state={b.warrantyState} /> },
    { key: 'updated', header: 'Updated', sort: (b) => b.updatedAt, hideBelow: '2xl', cell: (b) => formatDate(b.updatedAt) },
  ];

  const viewColumns = view === 'detailed'
    ? columns
    : columns.filter((c) => SIMPLE.includes(c.key)).sort((a, b) => SIMPLE.indexOf(a.key) - SIMPLE.indexOf(b.key)).map((c) => (c.key === 'next' ? { ...c, hideBelow: undefined } : c));

  return (
    <>
      <PageHeader
        title="Batteries"
        description="Every battery record visible to your role. Select a row to open its passport."
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

      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3">
        <div role="group" aria-label="Show batteries by status" className="flex flex-wrap gap-1.5">
          <button type="button" aria-pressed={status === ''} className={chipClass(status === '')} onClick={() => { setStatus(''); remember('status', '', ''); }}>
            All <span className="num opacity-70">{list.data?.length ?? ''}</span>
          </button>
          {STATUSES.map((st) => (
            <button key={st} type="button" aria-pressed={status === st} className={chipClass(status === st)} onClick={() => { setStatus(st); remember('status', st, ''); }}>
              {STATUS_LABELS[st]} <span className="num opacity-70">{list.data ? statusCounts[st] : ''}</span>
            </button>
          ))}
        </div>
        <div role="group" aria-label="Table view" className="ml-auto hidden rounded-full bg-fill p-0.5 md:flex">
          {(['simple', 'detailed'] as const).map((v) => (
            <button
              key={v} type="button" aria-pressed={view === v}
              onClick={() => { setView(v); remember('view', v, 'simple'); }}
              className={cn('min-h-[34px] rounded-full px-3.5 text-[13px] font-medium transition-colors duration-150', view === v ? 'bg-white text-ink shadow-[0_1px_2px_rgba(40,28,16,0.12)]' : 'text-ink-2 hover:text-ink')}
            >
              {v === 'simple' ? 'Simple' : 'Detailed'}
            </button>
          ))}
        </div>
      </div>

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
            {list.data ? `${shown.length} ${shown.length === 1 ? 'battery' : 'batteries'}` : ''}
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
        {() => shown.length === 0 ? (
          <NoResults onClear={() => { setStatus(''); remember('status', '', ''); }} />
        ) : (
          <>
            {chosen.size > 0 && (
              <div role="region" aria-label="Selected batteries" className="anim-row mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-copper-50 px-4 py-2.5">
                <p className="num text-sm font-semibold text-ink" aria-live="polite">{chosen.size} selected</p>
                <div className="flex flex-wrap items-center gap-2">
                  {session.can('battery.export') && (
                    <Button size="sm" variant="secondary" icon={<Download className="h-4 w-4" aria-hidden />} loading={exportSelected.isPending} onClick={() => exportSelected.mutate([...chosen])}>
                      Export selected
                    </Button>
                  )}
                  {chosen.size < shown.length && (
                    <Button size="sm" variant="ghost" onClick={() => setPicked(new Set(shown.map((b) => b.id)))}>Select all {shown.length}</Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>Clear selection</Button>
                </div>
              </div>
            )}
            <TableCard>
              <DataTable
                caption="Batteries"
                columns={viewColumns}
                rows={shown}
                rowKey={(b) => b.id}
                rowHref={(b) => `/app/batteries/${b.id}`}
                selection={{ selected: chosen, onChange: setPicked, label: (b) => b.label }}
                pageSize={15}
                initialSort={{ key: 'label', dir: 'asc' }}
              />
            </TableCard>
            <p className="mt-3 px-1 text-[13px] text-muted">Status and next step come from fixed, versioned rules over what is on record. Neither is a diagnosis, a model output or a health score.</p>
          </>
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
