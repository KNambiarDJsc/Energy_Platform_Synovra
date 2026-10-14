'use client';
import { useState } from 'react';
import { LifecycleBadge, QualityBadge } from '@/components/ui/Badge';
import { LinkButton } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { PageHeader, Section } from '@/components/ui/Layout';
import { LoadingBlock, QueryView } from '@/components/ui/States';
import { INVENTORY_GROUP_HINTS, INVENTORY_GROUP_LABELS, type InventoryGroup } from '@/domain/lifecycle';
import { cn, formatDate, formatNumber } from '@/lib/format';
import { useSession, useSvcQuery } from '@/lib/hooks';
import type { BatteryListItem, InventoryOverview } from '@/services/types';

const ORDER: InventoryGroup[] = ['available', 'testing', 'qualified', 'reserved', 'deployed', 'returned', 'recycling_queue', 'closed'];

type FamilyRow = InventoryOverview['byFamily'][number];

export default function InventoryPage() {
  const session = useSession();
  const q = useSvcQuery(['inventory'], (s) => s.deployments.inventory());
  const [group, setGroup] = useState<InventoryGroup>('qualified');

  const cols: Column<BatteryListItem>[] = [
    { key: 'label', header: 'Battery', mobile: 'title', sort: (b) => b.label, cell: (b) => <span className="mono">{b.label}</span> },
    { key: 'model', header: 'Model', sort: (b) => b.model, cell: (b) => <span>{b.model}<span className="block text-xs text-muted">{b.ratedVoltageV} V / {b.ratedCapacityAh} Ah</span></span> },
    { key: 'state', header: 'State', cell: (b) => <LifecycleBadge state={b.lifecycleState} /> },
    { key: 'loc', header: 'Location', cell: (b) => (b.siteName ? `${b.siteName}, ${b.position}` : b.physicalLocation) },
    {
      key: 'test', header: 'Last approved test', align: 'right', sort: (b) => b.lastApprovedTest?.pctOfRated ?? null,
      cell: (b) => (b.lastApprovedTest ? `${formatNumber(b.lastApprovedTest.capacityAh, 0, 'Ah')} · ${formatNumber(b.lastApprovedTest.pctOfRated, 0)}%` : <span className="text-muted">None approved</span>),
    },
    { key: 'ev', header: 'Evidence status', cell: (b) => b.evidenceStatus.label },
    { key: 'q', header: 'Data quality', cell: (b) => <QualityBadge level={b.quality.level} /> },
    { key: 'up', header: 'Updated', sort: (b) => b.updatedAt, mobile: 'hide', cell: (b) => formatDate(b.updatedAt) },
  ];
  const famCols: Column<FamilyRow>[] = [
    { key: 'model', header: 'Family', mobile: 'title', cell: (f) => f.model },
    { key: 'q', header: 'Qualified, unassigned', align: 'right', cell: (f) => f.qualified },
    { key: 'd', header: 'Deployed', align: 'right', cell: (f) => f.deployed },
    { key: 't', header: 'All records', align: 'right', cell: (f) => f.total },
  ];

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Each battery is in exactly one group. Groups follow the lifecycle state, so nothing is counted twice."
        actions={session.can('deployment.write') ? <LinkButton href="/app/deployments" variant="secondary">Allocate to a site</LinkButton> : undefined}
      />
      <QueryView query={q} skeleton={<LoadingBlock rows={6} />}>
        {(inv) => {
          const rows = inv.groups[group] ?? [];
          return (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4" role="group" aria-label="Inventory group">
                {ORDER.map((g) => {
                  const active = g === group;
                  return (
                    <button
                      key={g}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setGroup(g)}
                      className={cn(
                        'rounded-lg border p-3 text-left transition-colors',
                        active ? 'border-navy bg-navy text-white' : 'border-line bg-white hover:border-teal',
                      )}
                    >
                      <span className={cn('block text-2xl font-semibold', active ? 'text-white' : 'text-navy')}>{inv.groups[g].length}</span>
                      <span className="block text-sm font-medium">{INVENTORY_GROUP_LABELS[g]}</span>
                      <span className={cn('mt-0.5 block text-xs', active ? 'text-white/80' : 'text-muted')}>{INVENTORY_GROUP_HINTS[g]}</span>
                    </button>
                  );
                })}
              </div>

              <Section title={INVENTORY_GROUP_LABELS[group]} description={INVENTORY_GROUP_HINTS[group]} tone="flush">
                <div className="p-3 md:p-4">
                  {rows.length === 0 ? (
                    <p className="p-3 text-sm text-muted">No batteries are in this group.</p>
                  ) : (
                    <DataTable caption={INVENTORY_GROUP_LABELS[group]} columns={cols} rows={rows} rowKey={(b) => b.id} rowHref={(b) => `/app/batteries/${b.id}`} pageSize={12} initialSort={{ key: 'label', dir: 'asc' }} />
                  )}
                </div>
              </Section>

              <Section title="Stock by battery family" tone="flush">
                <div className="p-3 md:p-4">
                  <DataTable caption="Stock by family" columns={famCols} rows={inv.byFamily} rowKey={(f) => f.familyId} pageSize={10} />
                </div>
              </Section>
            </div>
          );
        }}
      </QueryView>
    </>
  );
}
