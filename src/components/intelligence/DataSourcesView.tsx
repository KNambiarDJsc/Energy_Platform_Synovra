'use client';
import {
  BookOpen, Cable, CheckCircle2, FileSpreadsheet, FlaskConical, Inbox, Radio, Receipt, Recycle, Truck, Unplug, Wrench, type LucideIcon,
} from 'lucide-react';
import { Badge, type Tone } from '@/components/ui/Badge';
import { Section } from '@/components/ui/Layout';
import { LoadingBlock, QueryView } from '@/components/ui/States';
import { cn, formatDate, formatNumber } from '@/lib/format';
import { useSvcQuery } from '@/lib/hooks';
import type { DataSourceView, SourceStatus } from '@/services/types';

const STATUS: Record<SourceStatus, [Tone, LucideIcon, string]> = {
  in_use: ['green', CheckCircle2, 'In use'],
  simulated: ['amber', FlaskConical, 'Simulated'],
  not_connected: ['neutral', Unplug, 'Not connected'],
  reference_only: ['neutral', BookOpen, 'Reference only'],
};

const ICON: Record<string, LucideIcon> = {
  intake: Inbox, tests: FlaskConical, restoration: Wrench, telemetry: Radio, machines: Cable,
  commercial: Receipt, field: Truck, recycling: Recycle, public: FileSpreadsheet,
};

function SourceCard({ s }: { s: DataSourceView }) {
  const [tone, icon, label] = STATUS[s.status];
  const Icon = ICON[s.key] ?? FileSpreadsheet;
  const issues = s.issues.filter((i) => i.count > 0);
  return (
    <li className={cn('card flex flex-col p-5', s.status !== 'in_use' && 'bg-white/60')}>
      <div className="flex items-start justify-between gap-3">
        <Icon className="mt-1 h-5 w-5 shrink-0 text-copper" strokeWidth={1.7} aria-hidden />
        <Badge tone={tone} icon={icon}>{label}</Badge>
      </div>
      <h3 className="mt-3 font-display text-[22px] leading-7 text-ink">{s.name}</h3>
      <p className="mt-1 text-sm text-ink-2">{s.provides}</p>
      <p className="mt-3 text-[13px] text-muted">{s.channel}</p>
      <div className="mt-4 flex items-baseline gap-2 border-t border-line pt-4">
        <span className="font-display text-[28px] leading-8 text-ink">{s.records === null ? '—' : formatNumber(s.records)}</span>
        <span className="text-[13px] text-muted">{s.records === null ? 'No records: nothing connected' : `records${s.lastAt ? ` · latest ${formatDate(s.lastAt)}` : ''}`}</span>
      </div>
      {issues.length > 0 && (
        <ul className="mt-3 space-y-1 text-[13px]">
          {issues.map((i) => (
            <li key={i.label} className="flex justify-between gap-3">
              <span className="text-ink-2">{i.label}</span>
              <span className="num font-semibold text-amber-700">{i.count}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-auto pt-4 text-[13px] leading-5 text-muted">{s.statusNote}</p>
    </li>
  );
}

/**
 * What each source keeps for every value, as built today. The machine column is the requirement for a future
 * connector, not something that exists.
 */
const PROVENANCE: { field: string; cells: [string, string, string, string] }[] = [
  { field: 'Battery identity', cells: ['Assigned at intake', 'Required', 'Through the slot mapping', 'Required per channel'] },
  { field: 'Record ID', cells: ['Import job and row', 'Test ID', 'Not per reading', 'Required'] },
  { field: 'When it happened, and when entered', cells: ['Both', 'Started, submitted, reviewed', 'Reading time', 'Device time and receipt time'] },
  { field: 'Source or device', cells: ['Template and file hash', 'Instrument and calibration', 'Sensor serial', 'Device and register map version'] },
  { field: 'Raw value as received', cells: ['Original text kept', 'In the attached report', 'Not kept', 'Required'] },
  { field: 'Normalised value and unit', cells: ['Yes', 'Yes', 'Yes', 'Required'] },
  { field: 'Quality status', cells: ['Issues and quarantine', 'Review status', 'Measured, missing or stale', 'Range and freshness checks'] },
  { field: 'Test or process context', cells: ['—', 'Protocol and conditions', '—', 'Charger mode and step'] },
  { field: 'Correction history', cells: ['Updates fill gaps, logged as events', 'Values never edited after saving', 'Mapping changes are dated', 'Required'] },
];

const WEAK = new Set(['Not per reading', 'Not kept', '—']);

export function DataSourcesView() {
  const q = useSvcQuery(['insights', 'sources'], (s) => s.insights.dataSources());
  return (
    <QueryView query={q} skeleton={<LoadingBlock rows={4} />}>
      {({ sources, quality }) => (
        <div className="space-y-8">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-y border-line py-6 md:grid-cols-5">
            {[
              ['Battery records', formatNumber(quality.batteries)],
              ['Complete records', `${quality.batteries ? Math.round((quality.complete / quality.batteries) * 100) : 0}%`],
              ['Import rows quarantined', formatNumber(quality.quarantinedImportRows)],
              ['Corrections recorded', formatNumber(quality.corrections)],
              ['Cost amounts unknown', formatNumber(quality.unknownCosts)],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-[13px] text-muted">{k}</dt>
                <dd className="mt-1 font-display text-[30px] leading-9 text-ink">{v}</dd>
              </div>
            ))}
          </dl>

          <ul className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sources.map((s) => <SourceCard key={s.key} s={s} />)}
          </ul>

          <Section title="What every value keeps" description="A value is only useful for learning if it can be traced. This is what each source keeps today; the last column is what a machine connector must provide before it is switched on.">
            <div className="-mx-2 overflow-x-auto px-2">
              <table className="w-full min-w-[720px] text-left text-sm">
                <caption className="sr-only">Provenance kept by each data source</caption>
                <thead>
                  <tr className="text-[13px] text-muted">
                    <th scope="col" className="py-2 pr-4 font-medium">Kept for each value</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Spreadsheet import</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Test form</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Site monitor</th>
                    <th scope="col" className="py-2 font-medium">Machine link (required)</th>
                  </tr>
                </thead>
                <tbody>
                  {PROVENANCE.map((r) => (
                    <tr key={r.field} className="border-t border-line align-top">
                      <th scope="row" className="py-2.5 pr-4 font-medium text-ink">{r.field}</th>
                      {r.cells.map((c, i) => (
                        <td key={i} className={cn('py-2.5 pr-4', WEAK.has(c) ? 'text-amber-700' : i === 3 ? 'text-muted' : 'text-ink-2')}>{c}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </div>
      )}
    </QueryView>
  );
}
