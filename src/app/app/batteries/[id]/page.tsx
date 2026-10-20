'use client';
import { ArrowDown, ArrowRight, ArrowUp, CalendarClock, Download, FileCheck2, MessageCircle, Minus, Wrench } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { BasisLegend, BasisTag, DemoDataNotice, HierarchyTrail, IndicatorList } from '@/components/customer/Parts';
import { RequestDialog } from '@/components/customer/RequestDialog';
import { BatteryFigure, type Lens } from '@/components/passport/BatteryFigure';
import { Button } from '@/components/ui/Button';
import { WarrantyBadge } from '@/components/ui/Badge';
import { Breadcrumbs, KeyValue, Notice, Section } from '@/components/ui/Layout';
import { LoadingBlock, QueryView } from '@/components/ui/States';
import { FACTOR_WORD, FactorDot, StatusBadge } from '@/components/ui/Status';
import { LIFECYCLE_LABELS } from '@/domain/lifecycle';
import { TEMPERATURE_RULE } from '@/domain/limits';
import { STATUS_LABELS } from '@/domain/status';
import { buildChange, buildOutlook, type Change } from '@/lib/customer/change';
import {
  BASIS_LABELS, SCOPE_LABELS, TIMELINE_KIND_LABELS, buildIndicators, buildTimeline, customerEvidence, customerName, hierarchyOf, lastUpdated,
} from '@/lib/customer/model';
import { batteryRecordCsv } from '@/lib/customer/report';
import type { RequestKind } from '@/lib/customer/requests';
import { cn, downloadText, formatDate, formatDateTime } from '@/lib/format';
import { useSession, useSvcQuery } from '@/lib/hooks';
import { since, useLastVisit } from '@/lib/useLastVisit';
import type { BatteryPassport } from '@/services/types';

const LENS_LABEL: Record<Lens, string> = { overview: 'Overview', temperature: 'Temperature', capacity: 'Capacity', voltage: 'Voltage', outlook: 'Outlook' };

/** The tile at a glance: one value large, one line under it. */
function Glance({ label, value, line, basis, testId }: { label: string; value: string; line: string; basis?: Parameters<typeof BasisTag>[0]['basis']; testId: string }) {
  return (
    <div className="rounded-2xl bg-white p-5" data-testid={testId}>
      <p className="text-[13px] text-muted">{label}</p>
      <p className="mt-1 font-display text-[30px] leading-9 text-ink">{value}</p>
      <p className="mt-1 text-[13px] leading-5 text-ink-2">{line}</p>
      {basis && <p className="mt-1"><BasisTag basis={basis} /></p>}
    </div>
  );
}

function Arrow({ d }: { d: Change['rows'][number]['direction'] }) {
  const cls = 'h-3.5 w-3.5 text-muted';
  if (d === 'up') return <ArrowUp className={cls} aria-label="up" />;
  if (d === 'down') return <ArrowDown className={cls} aria-label="down" />;
  return <Minus className={cls} aria-label={d === 'same' ? 'no change' : 'not comparable'} />;
}

/** What the open lens says. Every line is a recorded value or the plain absence of one. */
function LensPanel({ p, lens, now }: { p: BatteryPassport; lens: Lens; now: string }) {
  const t = p.lastApprovedTest;
  const tel = p.telemetry;
  const outlook = buildOutlook(p);
  const pct = t && t.result.capacityAh !== null ? Math.round((t.result.capacityAh / p.family.ratedCapacityAh) * 100) : null;
  if (lens === 'overview') {
    return <div><p className="text-[19px] leading-7 text-ink">{p.status.headline}</p><p className="mt-3 flex items-start gap-1.5 text-[15px] text-copper-700"><ArrowRight className="mt-1 h-4 w-4 shrink-0" aria-hidden />{p.status.nextStep}</p></div>;
  }
  if (lens === 'temperature') {
    const state = tel.temperatureC === null ? null : tel.temperatureC > TEMPERATURE_RULE.limitC ? 'Above the limit' : tel.temperatureC > TEMPERATURE_RULE.watchC ? 'Above the preferred range' : 'Within the preferred range';
    return (
      <div className="space-y-3 text-[15px]">
        {tel.available && tel.temperatureC !== null ? (
          <p><span className="font-display text-[34px] leading-10 text-ink">{tel.temperatureC.toFixed(1)} °C</span> <span className="text-ink-2">{state}</span><span className="block text-[13px] text-muted">Simulated reading, {tel.lastReadingAt ? formatDateTime(tel.lastReadingAt) : 'no timestamp'}. Preferred up to {TEMPERATURE_RULE.watchC} °C, limit {TEMPERATURE_RULE.limitC} °C (placeholders).</span></p>
        ) : <p className="text-ink-2">Data unavailable. {tel.reason}</p>}
        <p className="text-[13px] text-muted">Room temperature is not captured by the sensor, so the battery’s difference from its room is shown only for tests, in What changed.</p>
        {t && t.result.temperatureC !== null && (
          <p className="text-ink-2">At the last approved test: {t.result.temperatureC} °C{t.conditions.ambientTempC !== null ? ` in a ${t.conditions.ambientTempC} °C room (${t.result.temperatureC - t.conditions.ambientTempC >= 0 ? '+' : ''}${Math.round((t.result.temperatureC - t.conditions.ambientTempC) * 10) / 10} °C)` : ', room temperature not recorded'}. <BasisTag basis="measured" /></p>
        )}
      </div>
    );
  }
  if (lens === 'capacity') {
    return t && t.result.capacityAh !== null ? (
      <div className="space-y-2 text-[15px] text-ink-2">
        <p><span className="font-display text-[34px] leading-10 text-ink">{t.result.capacityAh} Ah</span> <span>of {p.family.ratedCapacityAh} Ah rated{pct !== null ? `, ${pct}%` : ''}</span></p>
        <p className="text-[13px] text-muted">Approved {formatDate(t.reviewedAt ?? t.startedAt)} by {t.reviewerName ?? 'an engineer'}. {t.instrument}, calibration {t.calibrationRef || 'not recorded'}. Discharge {t.conditions.loadCurrentA ?? '?'} A to {t.conditions.cutoffVoltageV ?? '?'} V. Not temperature-corrected. <BasisTag basis="measured" /></p>
        <p className="text-[13px] text-muted">The percentage compares one test with the rating. It is not a health score.</p>
      </div>
    ) : <p className="text-ink-2">Baseline being established. A capacity is shown once an engineer approves a test.</p>;
  }
  if (lens === 'voltage') {
    return (
      <div className="space-y-2 text-[15px] text-ink-2">
        {t && t.result.openCircuitVoltageV !== null ? <p>Open-circuit voltage at the last approved test: <strong className="text-ink">{t.result.openCircuitVoltageV} V</strong> <BasisTag basis="measured" /></p> : <p>No open-circuit voltage is recorded at a test.</p>}
        {tel.available && tel.voltageV !== null ? <p>Sensor voltage: <strong className="text-ink">{tel.voltageV.toFixed(2)} V</strong>, {tel.lastReadingAt ? formatDateTime(tel.lastReadingAt) : 'no timestamp'} <BasisTag basis="demo_only" /></p> : <p>No live voltage: {tel.reason || 'no sensor is attributed.'}</p>}
        <p className="text-[13px] text-muted">Rated {p.family.ratedVoltageV} V.</p>
      </div>
    );
  }
  return (
    <div className="space-y-2 text-[15px] text-ink-2" data-testid="outlook">
      <p><span className="font-display text-[30px] leading-9 text-ink">Not yet estimated</span></p>
      <p>Confidence: none. {outlook.reason}</p>
      <p className="text-[13px] text-muted">Known today: {outlook.basedOn.join('; ').toLowerCase()}. Snapshot {formatDate(now)}. <BasisTag basis="predicted" /></p>
    </div>
  );
}

type Snap = { status: string; pct: number | null; tempC: number | null; events: number; tests: number };

/** What changed since this person last opened this battery. Nothing is shown on a first visit. */
function BatterySince({ p, userId }: { p: BatteryPassport; userId: string }) {
  const t = p.lastApprovedTest;
  const current: Snap = {
    status: p.status.status, pct: t && t.result.capacityAh !== null ? Math.round((t.result.capacityAh / p.family.ratedCapacityAh) * 100) : null,
    tempC: p.telemetry.temperatureC === null ? null : Math.round(p.telemetry.temperatureC * 10) / 10,
    events: buildTimeline(p).length, tests: p.tests.filter((x) => x.status === 'approved').length,
  };
  const prev = useLastVisit<Snap>(`synovra-battery:${userId}:${p.battery.id}`, current);
  if (!prev) return null;
  const lines: string[] = [];
  if (prev.status !== current.status) lines.push(`Condition: ${STATUS_LABELS[prev.status as keyof typeof STATUS_LABELS] ?? prev.status} → ${STATUS_LABELS[current.status as keyof typeof STATUS_LABELS]}`);
  if (prev.pct !== current.pct && current.pct !== null) lines.push(`Capacity against rating: ${prev.pct ?? 'none'}${prev.pct === null ? '' : '%'} → ${current.pct}%`);
  if (prev.tempC !== null && current.tempC !== null && prev.tempC !== current.tempC) lines.push(`Temperature ${current.tempC < prev.tempC ? 'down' : 'up'}: ${prev.tempC} → ${current.tempC} °C (simulated)`);
  if (current.events > prev.events) lines.push(`${current.events - prev.events} new ${current.events - prev.events === 1 ? 'event' : 'events'} in the history`);
  return (
    <Section title="Since your last visit" id="since" description={`You last looked ${since(prev.at, formatDate)}.`}>
      <p className="text-[15px] text-ink" data-testid="battery-since">{lines.length === 0 ? 'No change.' : lines.join('. ') + '.'}</p>
    </Section>
  );
}

export default function BatteryPage() {
  const { id } = useParams<{ id: string }>();
  const session = useSession();
  const [request, setRequest] = useState<RequestKind | null>(null);
  const [lens, setLens] = useState<Lens>('overview');

  const q = useSvcQuery(['customer', 'battery', id], async (s) => {
    const [passport, sites, home] = await Promise.all([s.batteries.get(id), s.deployments.sites(), s.overview.home()]);
    return { passport, sites, snapshotAt: home.snapshotAt };
  });

  return (
    <QueryView query={q} skeleton={<LoadingBlock label="Loading battery record" rows={6} />}>
      {({ passport: p, sites, snapshotAt }) => {
        const loc = p.location;
        const siteView = sites.find((s) => s.site.id === loc.siteId);
        const stringView = siteView?.strings.find((s) => s.string.name === loc.stringName);
        // A battery record belongs to the operator's tenant. The customer is whoever owns the site it sits at.
        const customer = customerName(siteView?.site.tenantId ?? '');
        const levels = hierarchyOf(p, customer, siteView?.site.kind ?? null, stringView?.string.nominalVoltageV ?? null);
        const indicators = buildIndicators(p, snapshotAt);
        const timeline = buildTimeline(p);
        const change = buildChange(p);
        const outlook = buildOutlook(p);
        const files = customerEvidence(p.evidence);
        const updated = lastUpdated(p);
        const retired = p.status.status === 'retired';
        const canAct = !!loc.siteId && !retired;
        const tel = p.telemetry;
        const t = p.lastApprovedTest;
        const pct = t && t.result.capacityAh !== null ? Math.round((t.result.capacityAh / p.family.ratedCapacityAh) * 100) : null;

        const exportRecord = () => downloadText(`battery-record-${p.battery.label}.csv`, batteryRecordCsv(
          p,
          indicators.map((i) => ({ label: i.label, value: i.value === null ? (i.absent === 'baseline' ? 'Baseline being established' : 'Data unavailable') : `${i.value}${i.unit ? ` ${i.unit}` : ''}`, basis: BASIS_LABELS[i.basis].label, scope: SCOPE_LABELS[i.scope], at: i.at ?? '', source: i.source, freshness: i.freshness })),
          timeline.map((x) => ({ at: x.at.slice(0, 10), title: x.title, detail: x.detail })),
        ));

        return (
          <div className="app-stagger space-y-5">
            <Breadcrumbs items={[{ label: 'Your batteries', href: '/app/batteries' }, ...(loc.siteName ? [{ label: loc.siteName }] : []), { label: p.battery.label }]} />
            <DemoDataNotice />

            {/* Level 1: glance. The battery does most of the talking. */}
            <section className="card overflow-hidden p-5 md:p-8" aria-labelledby="bat-h">
              <div className="flex flex-wrap items-center gap-3">
                <h1 id="bat-h" className="mono text-[34px] leading-10 text-ink md:text-[40px]">{p.battery.label}</h1>
                <StatusBadge status={p.status.status} />
              </div>
              <p className="mt-1 text-sm text-muted">{p.family.manufacturer} {p.family.model} · {p.family.chemistry} · {LIFECYCLE_LABELS[p.battery.lifecycleState]} · record updated {formatDateTime(updated)}</p>

              <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-center">
                <div className="min-w-0">
                  <BatteryFigure unitType={p.family.unitType} chemistry={p.family.chemistry} lens={lens} onLens={setLens} temperatureC={tel.temperatureC} label={p.battery.label} />
                  <p className="mt-3 max-w-[60ch] text-[13px] leading-5 text-muted" data-testid="figure-caption">
                    Modelled illustration of a {p.family.unitType} {p.family.chemistry} battery, not a photograph or scan of {p.battery.label}.
                    {tel.available && tel.temperatureC !== null ? ` The warm tint follows the one block temperature the sensor reports (${tel.temperatureC.toFixed(1)} °C, simulated); temperatures inside cells are not measured.` : ' No temperature is on record, so nothing is tinted.'}
                  </p>
                </div>
                <div className="min-w-0">
                  <div role="group" aria-label="What to look at" className="mb-4 flex flex-wrap gap-1.5">
                    {(Object.keys(LENS_LABEL) as Lens[]).map((l) => (
                      <button key={l} type="button" aria-pressed={lens === l} onClick={() => setLens(l)} className={cn('min-h-[36px] rounded-full px-4 text-sm font-medium transition-colors', lens === l ? 'bg-ink text-white' : 'bg-fill text-ink hover:bg-fill-2')}>{LENS_LABEL[l]}</button>
                    ))}
                  </div>
                  <div className="min-h-[9rem]" aria-live="polite" data-testid="lens-panel"><LensPanel p={p} lens={lens} now={snapshotAt} /></div>
                  <div className="no-print mt-6 flex flex-wrap gap-2">
                    <Button icon={<Wrench className="h-4 w-4" aria-hidden />} disabled={!canAct} onClick={() => setRequest('maintenance')}>Request maintenance</Button>
                    <Button variant="secondary" icon={<CalendarClock className="h-4 w-4" aria-hidden />} disabled={!canAct} onClick={() => setRequest('replacement')}>Plan replacement</Button>
                    <Button variant="secondary" icon={<MessageCircle className="h-4 w-4" aria-hidden />} onClick={() => window.dispatchEvent(new CustomEvent('synovra:ask', { detail: 'Why does this battery have this status?' }))}>Ask</Button>
                  </div>
                </div>
              </div>

              <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Glance testId="glance-condition" label="Condition" value={STATUS_LABELS[p.status.status]} line={p.status.headline} basis="calculated" />
                <Glance testId="glance-temperature" label="Temperature" value={tel.available && tel.temperatureC !== null ? `${tel.temperatureC.toFixed(1)} °C` : 'Unavailable'} line={tel.available && tel.temperatureC !== null ? (tel.freshness === 'fresh' ? 'Current in this demonstration' : 'Older than the freshness limit') : 'No sensor reading on record'} basis="demo_only" />
                <Glance testId="glance-capacity" label="Capacity at last test" value={pct !== null ? `${pct}%` : 'Baseline'} line={pct !== null && t ? `of rated, ${formatDate(t.reviewedAt ?? t.startedAt)}` : 'being established'} basis={pct !== null ? 'calculated' : undefined} />
                <Glance testId="glance-outlook" label="Replacement window" value="Not yet estimated" line={`Confidence: ${outlook.confidence}`} basis="predicted" />
              </div>
              <div className="mt-6"><HierarchyTrail levels={levels} /></div>
            </section>

            {session.user && <BatterySince p={p} userId={session.user.id} />}

            {/* Level 2: understand. */}
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
              <div className="space-y-5">
                <Section title="Why it has this status" id="why" description={`Fixed rule ${p.status.rule.name} ${p.status.rule.version}${p.status.rule.placeholder ? ', placeholder thresholds' : ''}. Each line is the evidence behind it.`}>
                  {p.status.factors.length === 0 ? <p className="text-sm text-muted">No recorded checks yet.</p> : (
                    <ul className="space-y-3" aria-label="Checks behind the status">
                      {p.status.factors.map((f) => (
                        <li key={f.key} className="flex items-start gap-3" data-factor={f.key}>
                          <span className="mt-[7px]"><FactorDot state={f.state} /></span>
                          <span className="min-w-0 text-[15px] leading-6 text-ink"><span className="font-medium">{f.label}</span> <span className="text-muted">· {FACTOR_WORD[f.state]} · {BASIS_LABELS[f.kind === 'rule' ? 'calculated' : f.kind === 'controlled' ? 'demo_only' : f.kind].label}</span><span className="block text-ink-2">{f.detail}</span></span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>

                <Section title="What changed" id="changed" description="The last two approved tests, side by side, with the room each was taken in.">
                  {!change ? <p className="text-sm text-muted" data-testid="no-change">Fewer than two approved tests are on record, so there is no before and after to show yet.</p> : (
                    <div data-testid="change">
                      <div className="relative overflow-auto rounded-xl border border-line" tabIndex={0} role="region" aria-label="Before and after">
                        <table className="w-full min-w-[28rem] border-collapse text-left text-[14px]">
                          <thead className="bg-canvas"><tr><th scope="col" className="px-3 py-2 font-medium text-ink-2" /><th scope="col" className="px-3 py-2 font-medium text-ink-2">Before, {formatDate(change.beforeAt)}</th><th scope="col" className="px-3 py-2 font-medium text-ink-2">After, {formatDate(change.afterAt)}</th><th scope="col" className="px-3 py-2"><span className="sr-only">Direction</span></th></tr></thead>
                          <tbody>{change.rows.map((r) => (
                            <tr key={r.label} className="border-t border-line"><th scope="row" className="px-3 py-2 font-medium text-ink">{r.label}</th><td className="px-3 py-2 text-ink-2">{r.before}</td><td className="px-3 py-2 text-ink">{r.after}</td><td className="px-3 py-2"><Arrow d={r.direction} /></td></tr>
                          ))}</tbody>
                        </table>
                      </div>
                      <p className="mt-3 text-[13px] text-muted">{change.note} <BasisTag basis="measured" /></p>
                    </div>
                  )}
                </Section>

                <Section title="History" id="history" description="Tests, service, deployment and replacement, newest first. Internal process details are not shown.">
                  {timeline.length === 0 ? <p className="text-sm text-muted">No events are recorded.</p> : (
                    <ol className="relative space-y-5 border-l border-line pl-5" aria-label="History">
                      {timeline.map((x) => (
                        <li key={x.id} className="relative" data-testid="timeline-item">
                          <span className="absolute -left-[25px] top-2 h-2 w-2 rounded-full bg-ink" aria-hidden />
                          <p className="font-mono text-[12px] uppercase tracking-[0.05em] text-muted">{TIMELINE_KIND_LABELS[x.kind]} · {formatDate(x.at)}{x.approximate && ' (approximate date)'}</p>
                          <p className="mt-0.5 text-[15px] font-medium text-ink">{x.title}</p>
                          {x.detail && <p className="text-sm text-ink-2">{x.detail}</p>}
                          {x.evidence.length > 0 && <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted"><FileCheck2 className="h-3.5 w-3.5" aria-hidden />{x.evidence.map((e) => e.fileName).join(', ')}</p>}
                        </li>
                      ))}
                    </ol>
                  )}
                  {p.relatedBatteries.some((r) => /replac/i.test(r.relation)) && (
                    <Notice tone="info" className="mt-5" title="Replacement">{p.relatedBatteries.filter((r) => /replac/i.test(r.relation)).map((r) => <span key={r.id} className="block">{r.label}: {r.relation.toLowerCase()}</span>)}</Notice>
                  )}
                </Section>

                {/* Level 3: technical. Raw measurements, one click down. */}
                <details className="card p-5 md:p-6" data-testid="technical">
                  <summary className="cursor-pointer font-display text-[22px] leading-7 text-ink">Technical detail</summary>
                  <p className="mt-2 text-sm text-muted">Every indicator with its basis, scope, time and source, and each approved test.</p>
                  <div className="mt-5"><IndicatorList items={indicators} /></div>
                  <h3 className="mt-8 text-sm font-semibold text-ink">Approved tests</h3>
                  <div className="relative mt-2 overflow-auto rounded-xl border border-line" tabIndex={0} role="region" aria-label="Approved tests">
                    <table className="w-full min-w-[40rem] border-collapse text-left text-[13px]">
                      <thead className="bg-canvas"><tr>{['Approved', 'Kind', 'Capacity (Ah)', 'Open-circuit (V)', 'Resistance (mΩ)', 'Battery / room (°C)', 'Instrument'].map((c) => <th key={c} scope="col" className="px-3 py-2 font-medium text-ink-2">{c}</th>)}</tr></thead>
                      <tbody>{p.tests.filter((x) => x.status === 'approved').map((x) => (
                        <tr key={x.id} className="border-t border-line align-top"><td className="px-3 py-2">{formatDate(x.reviewedAt ?? x.startedAt)}</td><td className="px-3 py-2">{x.kind.replace('_', ' ')}{x.level === 'string' ? ' (string)' : ''}</td><td className="px-3 py-2">{x.result.capacityAh ?? 'Not recorded'}</td><td className="px-3 py-2">{x.result.openCircuitVoltageV ?? 'Not recorded'}</td><td className="px-3 py-2">{x.result.internalResistanceMOhm ?? 'Not recorded'}</td><td className="px-3 py-2">{x.result.temperatureC ?? '?'} / {x.conditions.ambientTempC ?? '?'}</td><td className="px-3 py-2">{x.instrument}, {x.calibrationRef || 'calibration not recorded'}</td></tr>
                      ))}</tbody>
                    </table>
                  </div>
                  <div className="no-print mt-5"><Button variant="secondary" size="sm" icon={<Download className="h-4 w-4" aria-hidden />} onClick={exportRecord}>Export this record (CSV)</Button></div>
                </details>
              </div>

              <div className="space-y-5">
                <Section title="Battery" id="identity">
                  <KeyValue columns={1} items={[
                    { label: 'Battery ID', value: <span className="mono break-all">{p.battery.id}</span>, hint: 'Permanent. Never reused.' },
                    { label: 'Chemistry and type', value: `${p.family.chemistry}, ${p.family.unitType}` },
                    { label: 'Rated voltage', value: `${p.family.ratedVoltageV} V` },
                    { label: 'Rated capacity', value: `${p.family.ratedCapacityAh} Ah`, hint: p.family.ratingConditions },
                    { label: 'Manufacturer serial', value: p.battery.manufacturerSerial ?? 'Not recorded' },
                    { label: 'Manufactured', value: p.battery.manufacturedOn ? formatDate(p.battery.manufacturedOn) : 'Not recorded' },
                    { label: 'Location', value: loc.siteName ? `${loc.siteName}, ${loc.bankName} / ${loc.stringName}, position ${loc.position}` : p.battery.physicalLocation },
                    ...(p.warranty ? [{ label: 'Warranty', value: <span className="flex flex-wrap items-center gap-2"><WarrantyBadge state={p.warranty.state} />{p.warranty.endsOn && <span className="text-muted">to {formatDate(p.warranty.endsOn)}</span>}</span> }] : []),
                  ]} />
                </Section>

                <Section title="Evidence" id="evidence" description="Files you may open. Each has a checksum so a later copy can be checked against it.">
                  {files.length === 0 ? <p className="text-sm text-muted">No customer-visible files are recorded.</p> : (
                    <ul className="divide-y divide-line">
                      {files.map((f) => (
                        <li key={f.id} className="py-2.5 first:pt-0 last:pb-0">
                          <p className="break-all text-sm text-ink">{f.fileName}</p>
                          <p className="text-xs text-muted">{f.kind.replace(/_/g, ' ')} · {formatDate(f.uploadedAt)}</p>
                          <p className="mono break-all text-[11px] text-muted">SHA-256 {f.checksum.slice(0, 24)}…</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>

                {p.recycling && (
                  <Section title="Recycling" id="recycling">
                    <KeyValue columns={1} items={[
                      { label: 'State', value: p.recycling.state },
                      { label: 'Recycler', value: p.recycling.recyclerName || 'Not recorded' },
                      { label: 'Consigned mass', value: p.recycling.massKg === null ? 'Not recorded' : `${p.recycling.massKg} kg`, hint: 'The mass handed over, not the weight of material recovered.' },
                      { label: 'Recycler certificate', value: p.recycling.certificateState === 'received' ? `Received${p.recycling.certificateRef ? `, ${p.recycling.certificateRef}` : ''}` : 'Not received' },
                    ]} />
                  </Section>
                )}

                <Section title="What the labels mean" id="basis"><BasisLegend className="sm:grid-cols-1" /></Section>
              </div>
            </div>

            {canAct && request && loc.siteId && (
              <RequestDialog
                open onOpenChange={(o) => { if (!o) setRequest(null); }} kind={request} battery={{ id: p.battery.id, label: p.battery.label }}
                site={{ id: loc.siteId, name: loc.siteName ?? loc.siteId }} role={session.role} suggestion={p.status.nextStep}
              />
            )}
          </div>
        );
      }}
    </QueryView>
  );
}
