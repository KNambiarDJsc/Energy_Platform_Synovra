'use client';
import Link from 'next/link';
import { Badge, FreshnessBadge, ValueKindBadge } from '@/components/ui/Badge';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Notice, PageHeader, Section, Stat } from '@/components/ui/Layout';
import { LoadingBlock, QueryView } from '@/components/ui/States';
import { formatDateTime, formatNumber } from '@/lib/format';
import { useSvcQuery } from '@/lib/hooks';
import type { GatewayView, SensorView } from '@/services/types';

export default function MonitoringPage() {
  const fleet = useSvcQuery(['monitoring', 'fleet'], (s) => s.telemetry.fleet());
  const gateways = useSvcQuery(['monitoring', 'gateways'], (s) => s.telemetry.gateways());
  const sensors = useSvcQuery(['monitoring', 'sensors'], (s) => s.telemetry.sensors());

  const gwCols: Column<GatewayView>[] = [
    { key: 'name', header: 'Gateway', mobile: 'title', sort: (g) => g.gateway.name, cell: (g) => g.gateway.name },
    { key: 'site', header: 'Site', sort: (g) => g.siteName, cell: (g) => g.siteName },
    {
      key: 'status', header: 'Status',
      cell: (g) => (
        <Badge tone={g.gateway.status === 'online' ? 'green' : g.gateway.status === 'degraded' ? 'amber' : 'red'}>
          {g.gateway.status === 'online' ? 'Online' : g.gateway.status === 'degraded' ? 'Degraded' : 'Offline'}
        </Badge>
      ),
    },
    { key: 'seen', header: 'Last seen', sort: (g) => g.gateway.lastSeenAt, cell: (g) => <span>{formatDateTime(g.gateway.lastSeenAt)}<span className="block text-xs text-muted">{g.ageHours < 1 ? 'Under 1 h before snapshot' : `${formatNumber(g.ageHours, 0)} h before snapshot`}</span></span> },
    { key: 'fresh', header: 'Freshness', cell: (g) => <FreshnessBadge freshness={g.freshness} /> },
    { key: 'sensors', header: 'Sensors', align: 'right', cell: (g) => g.sensors },
    { key: 'unmapped', header: 'Unmapped', align: 'right', cell: (g) => (g.unmapped > 0 ? <Badge tone="amber">{g.unmapped}</Badge> : '0') },
  ];

  const sCols: Column<SensorView>[] = [
    { key: 'serial', header: 'Sensor', mobile: 'title', sort: (s) => s.sensor.serial, cell: (s) => <span className="mono whitespace-nowrap">{s.sensor.serial}</span> },
    {
      key: 'battery', header: 'Battery', sort: (s) => s.batteryLabel,
      cell: (s) =>
        s.batteryId ? (
          <Link href={`/app/batteries/${s.batteryId}?tab=telemetry`} className="mono text-teal-800 underline underline-offset-2">{s.batteryLabel}</Link>
        ) : (
          <Badge tone="amber">Unmapped</Badge>
        ),
    },
    { key: 'slot', header: 'Slot', cell: (s) => <span>{s.slotLabel ?? '—'}<span className="block text-xs text-muted">{s.siteName}</span></span> },
    { key: 'last', header: 'Last reading', sort: (s) => s.lastReadingAt, cell: (s) => (s.lastReadingAt ? formatDateTime(s.lastReadingAt) : <span className="text-muted">No reading</span>) },
    { key: 'fresh', header: 'Freshness', cell: (s) => <FreshnessBadge freshness={s.freshness} /> },
    { key: 'comp', header: 'Completeness (30 d)', align: 'right', sort: (s) => s.completenessPct, cell: (s) => (s.completenessPct === null ? 'Unknown' : `${formatNumber(s.completenessPct, 0)}%`) },
    {
      key: 'res', header: 'Resistance',
      cell: (s) => <ValueKindBadge kind={s.sensor.resistanceSource === 'measured' ? 'measured' : s.sensor.resistanceSource === 'inferred' ? 'inferred' : 'unknown'} />,
    },
    {
      key: 'map', header: 'Mapping', mobile: 'hide',
      cell: (s) => (s.assignment ? <Badge tone={s.assignment.mappingQuality === 'verified' ? 'green' : 'amber'}>{s.assignment.mappingQuality === 'verified' ? 'Verified' : 'Unverified'}</Badge> : '—'),
    },
  ];

  return (
    <>
      <PageHeader title="Monitoring" description="Gateways, sensors and the freshness of what they report. Missing data is shown as missing, never as normal." />
      <Notice tone="synthetic" className="mb-6" title="No live connection">
        Telemetry is generated for this demonstration. Real gateways and sensors would connect through the telemetry service interface described in the integration notes.
      </Notice>

      <div className="space-y-6">
        <QueryView query={fleet} skeleton={<LoadingBlock rows={2} />}>
          {(f) => (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <Stat label="Deployed batteries" value={f.deployed} />
              <Stat label="With a mapped sensor" value={f.monitoredBatteries} />
              <Stat label="Without monitoring" value={f.unmonitored} tone={f.unmonitored ? 'amber' : 'neutral'} hint="Unknown, not healthy" />
              <Stat label="Average completeness" value={f.completenessPct === null ? 'Unknown' : `${formatNumber(f.completenessPct, 0)}%`} hint="Last 30 days" />
              <Stat label="Stale gateways" value={f.staleGateways} tone={f.staleGateways ? 'red' : 'green'} />
            </div>
          )}
        </QueryView>

        <Section title="Gateways" tone="flush">
          <div className="p-3 md:p-4">
            <QueryView query={gateways} skeleton={<LoadingBlock rows={3} />}>
              {(rows) => <DataTable caption="Gateways" columns={gwCols} rows={rows} rowKey={(g) => g.gateway.id} />}
            </QueryView>
          </div>
        </Section>

        <Section title="Sensors and mapping" description="A reading is attributed to a battery only through the sensor-to-slot mapping valid at that time." tone="flush">
          <div className="p-3 md:p-4">
            <QueryView query={sensors} skeleton={<LoadingBlock rows={4} />}>
              {(rows) => <DataTable caption="Sensors" columns={sCols} rows={rows} rowKey={(s) => s.sensor.id} pageSize={12} />}
            </QueryView>
          </div>
        </Section>
      </div>
    </>
  );
}
