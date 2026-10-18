'use client';
import * as RadixTabs from '@radix-ui/react-tabs';
import {
  Activity, ArrowLeft, ArrowRight, BatteryCharging, CalendarClock, Check, FileText, Gauge, History, LineChart, Thermometer, Wrench, Zap,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LifecycleBadge } from '@/components/ui/Badge';
import { buttonClass } from '@/components/ui/buttonClass';
import { QUALIFICATION_THRESHOLD_PCT } from '@/data/seed';
import { LIFECYCLE_LABELS } from '@/domain/lifecycle';
import { TEMPERATURE_RULE, TEMPERATURE_SCALE } from '@/domain/limits';
import type { Alert, LifecycleEvent, TestSession } from '@/domain/types';
import { cn, formatDate, formatNumber, formatShortDate, formatTime } from '@/lib/format';
import { useRuntime, useSession, useSvcQuery } from '@/lib/hooks';
import { getServices } from '@/services';
import type { BatteryPassport } from '@/services/types';
import { BatteryFigure, type Lens } from './BatteryFigure';
import { RouteCalculatorButton } from './RouteCalculator';
import { storyStages } from './PassportParts';

/* ------------------------------ provenance ------------------------------ */

/** Where a value came from. Shown beside every figure, in words; the dot only repeats it. */
type ProvKind = 'measured' | 'simulated' | 'stale' | 'tested' | 'inferred' | 'unavailable' | 'estimate' | 'rule';
interface Prov { kind: ProvKind; text: string }

const PROV_DOT: Record<ProvKind, string> = {
  measured: 'bg-approved',
  simulated: 'bg-amber',
  stale: 'border-2 border-amber bg-transparent',
  tested: 'bg-night',
  inferred: 'bg-amber',
  unavailable: 'border-2 border-field bg-transparent',
  estimate: 'border-2 border-amber bg-transparent',
  rule: 'bg-teal',
};

function ProvLine({ prov, className }: { prov: Prov; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[13px] leading-5 text-muted', className)}>
      <span className={cn('h-2 w-2 shrink-0 rounded-full', PROV_DOT[prov.kind])} aria-hidden />
      {prov.text}
    </span>
  );
}

/** "13 Oct, 08:50": enough to judge freshness at a glance. The full time is in the record. */
const stamp = (iso: string) => `${formatShortDate(iso)}, ${formatTime(iso).replace(' GST', '')}`;

/** A figure, or a dash when there is none; the provenance line beside it says why. */
const fig = (n: number | null | undefined, digits: number, unit: string) => (n === null || n === undefined ? '—' : formatNumber(n, digits, unit));

/** A number set large with its unit set small beside it, so the figure reads first and the unit second. */
function Num({ n, digits = 0, unit, signed = false }: { n: number | null | undefined; digits?: number; unit?: string; signed?: boolean }) {
  if (n === null || n === undefined || Number.isNaN(n)) return <>—</>;
  const body = formatNumber(Math.abs(n), digits);
  const sign = signed ? (n > 0 ? '+' : n < 0 ? '−' : '') : n < 0 ? '−' : '';
  return (
    <>
      {sign}{body}
      {unit && <span className="ml-[0.12em] text-[0.55em] tracking-normal">{unit}</span>}
    </>
  );
}

function telemetryProv(p: BatteryPassport, simulated: boolean): Prov {
  const t = p.telemetry;
  if (!t.available) return { kind: 'unavailable', text: 'No sensor reading' };
  const at = t.lastReadingAt ? stamp(t.lastReadingAt) : '';
  if (t.freshness === 'stale') return { kind: 'stale', text: `Stale · ${at}` };
  return simulated ? { kind: 'simulated', text: `Simulated · ${at}` } : { kind: 'measured', text: `Measured · ${at}` };
}

/* ------------------------------ small drawings ------------------------------ */

/** A line over time with optional limit lines. Gaps in the data stay gaps. */
function Spark({
  series, lines = [], height = 64, label, unit,
}: {
  series: { values: (number | null)[]; color: string; dashed?: boolean }[];
  lines?: { y: number; label: string; color: string }[];
  height?: number;
  label: string;
  unit: string;
}) {
  const w = 320;
  const all = [...series.flatMap((s) => s.values.filter((v): v is number => v !== null)), ...lines.map((l) => l.y)];
  if (all.length === 0) return null;
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const pad = (hi - lo) * 0.12 || 0.5;
  const y = (v: number) => height - 4 - ((v - (lo - pad)) / (hi + pad - (lo - pad))) * (height - 8);
  const path = (vals: (number | null)[]) => {
    let d = '';
    let pen = false;
    vals.forEach((v, i) => {
      const x = (i / Math.max(vals.length - 1, 1)) * w;
      if (v === null) { pen = false; return; }
      d += `${pen ? 'L' : 'M'}${x.toFixed(1)} ${y(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const first = series[0].values.find((v) => v !== null);
  const last = [...series[0].values].reverse().find((v) => v !== null);
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="block h-auto w-full overflow-visible" role="img"
      aria-label={`${label}: from ${formatNumber(first ?? null, 1, unit)} to ${formatNumber(last ?? null, 1, unit)}, ranging ${formatNumber(lo, 1, unit)} to ${formatNumber(hi, 1, unit)}.`}>
      {lines.map((l) => (
        <g key={l.label}>
          <line x1={0} x2={w} y1={y(l.y)} y2={y(l.y)} stroke={l.color} strokeWidth="1" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
        </g>
      ))}
      {series.map((s, i) => (
        <path key={i} d={path(s.values)} fill="none" stroke={s.color} strokeWidth="1.75" strokeDasharray={s.dashed ? '4 3' : undefined}
          strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" className="anim-reveal" />
      ))}
    </svg>
  );
}

/** The temperature scale: rated temperature, watch level and alert limit, last week's span and the current reading. */
function TemperatureScale({ value, low, high }: { value: number | null; low: number | null; high: number | null }) {
  const { minC, maxC } = TEMPERATURE_SCALE;
  const pct = (c: number) => `${Math.min(100, Math.max(0, ((c - minC) / (maxC - minC)) * 100))}%`;
  const over = value !== null && value > TEMPERATURE_RULE.limitC;
  const watch = value !== null && value > TEMPERATURE_RULE.watchC;
  return (
    <div className="pt-7">
      <div className="relative h-2 rounded-full bg-fill">
        {/* below the watch level */}
        <span className="absolute inset-y-0 left-0 rounded-l-full bg-approved-50" style={{ width: pct(TEMPERATURE_RULE.watchC) }} aria-hidden />
        {low !== null && high !== null && (
          <span className="absolute inset-y-0 rounded-full bg-copper-100" style={{ left: pct(low), width: `calc(${pct(high)} - ${pct(low)})` }} aria-hidden />
        )}
        {[TEMPERATURE_RULE.watchC, TEMPERATURE_RULE.limitC].map((c) => (
          <span key={c} className={cn('absolute -top-1.5 h-5 w-0.5 rounded-full', c === TEMPERATURE_RULE.limitC ? 'bg-heat' : 'bg-field')} style={{ left: pct(c) }} aria-hidden />
        ))}
        {value !== null && (
          <span className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-[left] duration-700 ease-out" style={{ left: pct(value) }}>
            <span className={cn('block h-4 w-4 rounded-full ring-4 ring-white', over ? 'bg-heat' : watch ? 'bg-copper' : 'bg-ink')} />
            <span className={cn('absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap text-[13px] font-semibold', over ? 'text-heat' : 'text-ink')}>
              {formatNumber(value, 1, '°C')}
            </span>
          </span>
        )}
      </div>
      <div className="mt-2 flex justify-between text-[12px] leading-4 text-muted">
        <span>{minC} °C</span>
        <span>{maxC} °C</span>
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] leading-5 text-ink-2">
        <li className="inline-flex items-center gap-1.5"><span className="h-3 w-0.5 rounded-full bg-field" aria-hidden />Watch level {TEMPERATURE_RULE.watchC} °C</li>
        <li className="inline-flex items-center gap-1.5"><span className="h-3 w-0.5 rounded-full bg-heat" aria-hidden />Alert limit {TEMPERATURE_RULE.limitC} °C</li>
        {low !== null && high !== null && (
          <li className="inline-flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-copper-100" aria-hidden />Last 7 days {formatNumber(low, 1)}–{formatNumber(high, 1)} °C</li>
        )}
      </ul>
    </div>
  );
}

const TEST_LABEL: Record<TestSession['kind'], string> = { intake_inspection: 'Inspection', initial: 'Initial', final: 'After restoration', periodic: 'Periodic' };

/** Approved capacity tests as columns against the rated capacity, with the demonstration threshold. */
function CapacityHistory({ tests, rated }: { tests: TestSession[]; rated: number }) {
  const rows = tests.filter((t) => t.result.capacityAh !== null).map((t) => ({ t, pct: (t.result.capacityAh! / rated) * 100 }));
  if (rows.length === 0) return <p className="text-sm text-muted">No approved capacity test.</p>;
  const top = 110;
  return (
    <figure>
      <div className="relative ml-24 flex h-32 items-end gap-3 border-b border-line pb-px" role="img"
        aria-label={`Approved capacity tests: ${rows.map((r) => `${TEST_LABEL[r.t.kind]} ${formatNumber(r.pct, 0)}% of rated`).join(', ')}. Demonstration threshold ${QUALIFICATION_THRESHOLD_PCT}%.`}>
        <span className="absolute inset-x-0 border-t border-dashed border-copper" style={{ bottom: `${(QUALIFICATION_THRESHOLD_PCT / top) * 100}%` }} aria-hidden>
          <span className="absolute -top-5 left-0 bg-white pr-1 text-[12px] text-copper-700">{QUALIFICATION_THRESHOLD_PCT}% demo threshold</span>
        </span>
        {rows.map((r, i) => (
          <div key={r.t.id} className="flex min-w-0 flex-1 flex-col items-center justify-end" style={{ height: '100%' }}>
            <span className="mb-1 text-[13px] font-semibold text-ink num">{formatNumber(r.pct, 0)}%</span>
            <span className={cn('anim-grow-up block w-full max-w-[44px] rounded-t-[4px]', i === rows.length - 1 ? 'bg-teal' : 'bg-teal-100')}
              style={{ height: `${(Math.min(r.pct, top) / top) * 100}%`, animationDelay: `${i * 90}ms` }} aria-hidden />
          </div>
        ))}
      </div>
      <figcaption className="ml-24 mt-2 flex gap-3 text-[12px] leading-4 text-muted">
        {rows.map((r) => (
          <span key={r.t.id} className="min-w-0 flex-1 text-center">{TEST_LABEL[r.t.kind]}<span className="block">{formatDate(r.t.startedAt)}</span></span>
        ))}
      </figcaption>
    </figure>
  );
}

/* ------------------------------ panels ------------------------------ */

function PanelHead({ icon: Icon, title, prov }: { icon: LucideIcon; title: string; prov?: Prov }) {
  return (
    <div>
      <h2 className="flex items-center gap-2.5 font-display text-[30px] leading-9 tracking-[-0.015em] text-ink">
        <Icon className="h-6 w-6 shrink-0 text-copper" strokeWidth={1.6} aria-hidden />
        {title}
      </h2>
      {prov && <ProvLine prov={prov} className="mt-1.5" />}
    </div>
  );
}

function Figure({ value, label, tone = 'ink', hint, compact = false }: { value: ReactNode; label: string; tone?: 'ink' | 'heat' | 'muted'; hint?: ReactNode; compact?: boolean }) {
  return (
    <div className="min-w-0">
      <p className={cn('whitespace-nowrap font-display tracking-[-0.02em]', compact ? 'text-[31px] leading-9' : 'text-[38px] leading-[42px]', { ink: 'text-ink', heat: 'text-heat', muted: 'text-muted' }[tone])}>{value}</p>
      <p className="mt-1 text-sm text-ink-2">{label}</p>
      {hint && <p className="mt-0.5 text-[13px] text-muted">{hint}</p>}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[13px] text-muted">{label}</dt>
      <dd className="mt-0.5 font-display text-[22px] leading-7 text-ink">{value}</dd>
    </div>
  );
}

function nextStep(p: BatteryPassport, alert: Alert | null): string {
  const s = p.battery.lifecycleState;
  if (alert) return `Review the open alert: ${alert.title.toLowerCase()}.`;
  if (s === 'received') return 'Record an intake inspection and an initial capacity test.';
  if (s === 'testing') return 'Submit the test for an engineer’s review.';
  if (s === 'restoration_candidate') return 'Open a restoration attempt in a batch for this family.';
  if (s === 'in_restoration') return 'Finish the attempt, then record and submit the after-test.';
  if (s === 'awaiting_review') return 'Waiting for an engineer’s qualification decision.';
  if (s === 'rework') return 'Start a further restoration attempt, or reject.';
  if (s === 'qualified') return 'Ready to reserve or deploy to a compatible slot.';
  if (s === 'reserved') return 'Install at the planned site and record the slot.';
  if (s === 'deployed' && p.telemetry.freshness === 'stale') return 'Telemetry is stale. Check the site gateway.';
  if (s === 'deployed') return 'In service. Nothing needs doing now.';
  if (s === 'returned') return 'Test it again before any reuse.';
  return 'Hand over to a licensed recycler and file the certificate.';
}

function OverviewPanel({ p, alert }: { p: BatteryPassport; alert: Alert | null }) {
  const test = p.lastApprovedTest;
  const pct = test?.result.capacityAh != null ? (test.result.capacityAh / p.family.ratedCapacityAh) * 100 : null;
  return (
    <div className="space-y-6">
      <PanelHead icon={Activity} title="Where it stands" />
      <div className="flex flex-wrap items-center gap-2">
        <LifecycleBadge state={p.battery.lifecycleState} />
        <span className="text-sm text-ink-2">{p.evidenceStatus.label}</span>
      </div>
      <p className="text-[15px] leading-6 text-ink">{p.evidenceStatus.detail}</p>
      <dl className="grid grid-cols-2 gap-5 border-t border-line pt-5">
        <Fact label="Last approved capacity" value={test ? formatNumber(test.result.capacityAh, 0, 'Ah') : 'None'} />
        <Fact label="Of rated" value={pct === null ? 'Unknown' : `${formatNumber(pct, 0)}%`} />
      </dl>
      <div className="rounded-xl bg-canvas p-4">
        <p className="text-[13px] font-medium text-muted">Next step</p>
        <p className="mt-1 text-[15px] leading-6 text-ink">{nextStep(p, alert)}</p>
        <ProvLine prov={{ kind: 'rule', text: 'Suggested by a fixed rule, not a model' }} className="mt-2" />
      </div>
    </div>
  );
}

function TemperaturePanel({ p, simulated, series }: { p: BatteryPassport; simulated: boolean; series: (number | null)[] }) {
  const t = p.telemetry;
  const value = t.temperatureC;
  const known = series.filter((v): v is number => v !== null);
  const low = known.length ? Math.min(...known) : null;
  const high = known.length ? Math.max(...known) : null;
  const toLimit = value === null ? null : value - TEMPERATURE_RULE.limitC;
  return (
    <div className="space-y-6">
      <PanelHead icon={Thermometer} title="Temperature" prov={telemetryProv(p, simulated)} />
      {!t.available ? (
        <p className="text-[15px] leading-6 text-ink">{t.reason} <span className="text-muted">Temperature is unknown, not normal.</span></p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4 divide-x divide-line [&>*:not(:first-child)]:pl-4">
            <Figure compact value={<Num n={value} digits={1} unit="°C" />} label="Battery" hint="Block sensor" tone={toLimit !== null && toLimit > 0 ? 'heat' : 'ink'} />
            <Figure compact value="—" label="Ambient" hint="Not measured" tone="muted" />
            <Figure
              compact
              value={<Num n={toLimit} digits={1} unit="°C" signed />}
              label={toLimit !== null && toLimit > 0 ? 'Above limit' : 'To the limit'}
              tone={toLimit !== null && toLimit > 0 ? 'heat' : 'ink'}
            />
          </div>
          <div>
            <p className="text-sm font-medium text-ink">Against the configured limits</p>
            <TemperatureScale value={value} low={low} high={high} />
          </div>
          <dl className="grid grid-cols-2 gap-5 border-t border-line pt-5">
            <Fact label={`Above ${TEMPERATURE_RULE.watchC} °C, last 30 days`} value={t.hoursAbove30C === null ? 'Unknown' : `${formatNumber(t.hoursAbove30C, 0)} h`} />
            <Fact label="Peak, last 7 days" value={high === null ? 'No readings' : formatNumber(high, 1, '°C')} />
          </dl>
          {known.length > 0 && (
            <div>
              <p className="mb-2 text-[13px] text-muted">Last 7 days, hourly</p>
              <Spark label="Temperature, last 7 days" unit="°C" series={[{ values: series, color: '#A34D1F' }]}
                lines={[{ y: TEMPERATURE_RULE.limitC, label: 'limit', color: '#B8401F' }]} />
            </div>
          )}
          <p className="text-[13px] leading-5 text-muted">
            Sustained heat speeds up ageing in lead-acid batteries. The watch level and limit are placeholders from rule {TEMPERATURE_RULE.name} {TEMPERATURE_RULE.version}; engineering sets the real values.
          </p>
        </>
      )}
    </div>
  );
}

function CapacityPanel({ p }: { p: BatteryPassport }) {
  const approved = p.tests.filter((t) => t.status === 'approved' && t.level === 'battery').sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  const last = p.lastApprovedTest;
  const pct = last?.result.capacityAh != null ? (last.result.capacityAh / p.family.ratedCapacityAh) * 100 : null;
  const irTests = approved.filter((t) => t.result.internalResistanceMOhm !== null);
  const firstIr = irTests[0]?.result.internalResistanceMOhm ?? null;
  const lastIr = irTests[irTests.length - 1]?.result.internalResistanceMOhm ?? null;
  return (
    <div className="space-y-6">
      <PanelHead icon={BatteryCharging} title="Capacity" prov={last ? { kind: 'tested', text: `Tested ${formatDate(last.startedAt)}` } : { kind: 'unavailable', text: 'No approved test' }} />
      {last ? (
        <div className="grid grid-cols-2 gap-4 divide-x divide-line [&>*:not(:first-child)]:pl-4">
          <Figure value={<Num n={last.result.capacityAh} unit="Ah" />} label="Measured capacity" hint={`${TEST_LABEL[last.kind]} test, approved by ${last.reviewerName ?? 'an engineer'}`} />
          <Figure value={<Num n={pct} unit="%" />} label={`Of rated ${p.family.ratedCapacityAh} Ah`} hint={p.family.ratingConditions.split(' at ')[0]} />
        </div>
      ) : (
        <p className="text-[15px] leading-6 text-ink">No approved test yet. Capacity is unknown.</p>
      )}
      <CapacityHistory tests={approved} rated={p.family.ratedCapacityAh} />
      <dl className="grid grid-cols-2 gap-5 border-t border-line pt-5">
        <Fact label="Internal resistance, first test" value={fig(firstIr, 1, 'mΩ')} />
        <Fact label="Internal resistance, latest test" value={fig(lastIr, 1, 'mΩ')} />
      </dl>
      <p className="text-[13px] leading-5 text-muted">
        Plate condition can’t be seen without opening the case, so there is no plate-health score. Capacity and resistance tests under stated conditions are the evidence.
      </p>
    </div>
  );
}

function VoltagePanel({ p, simulated, peers }: { p: BatteryPassport; simulated: boolean; peers: { own: number | null; peerMedian: number | null }[] }) {
  const t = p.telemetry;
  const lastPeer = [...peers].reverse().find((x) => x.own !== null && x.peerMedian !== null) ?? null;
  const dev = lastPeer ? lastPeer.own! - lastPeer.peerMedian! : null;
  const discharges = p.tests.filter((x) => x.status === 'approved' && x.result.capacityAh !== null).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return (
    <div className="space-y-6">
      <PanelHead icon={Zap} title="Charge & discharge" prov={telemetryProv(p, simulated)} />
      {t.available ? (
        <div className="grid grid-cols-2 gap-4 divide-x divide-line [&>*:not(:first-child)]:pl-4">
          <Figure value={<Num n={t.voltageV} digits={2} unit="V" />} label="Latest voltage" hint={p.family.unitType === '2V cell' ? 'Per cell' : 'Per block'} />
          <Figure value={<Num n={dev} digits={2} unit="V" signed />} label="Against the string median"
            hint={lastPeer ? `Median ${formatNumber(lastPeer.peerMedian, 2, 'V')}` : 'No string peers'} />
        </div>
      ) : (
        <p className="text-[15px] leading-6 text-ink">{t.reason}</p>
      )}
      {peers.some((x) => x.own !== null) && (
        <div>
          <p className="mb-2 flex flex-wrap gap-x-4 text-[13px] text-muted">
            <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 bg-teal" aria-hidden />This battery</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-0 w-4 border-t-2 border-dashed border-field" aria-hidden />String median</span>
            <span>Last 7 days</span>
          </p>
          <Spark label="Voltage against the string median, last 7 days" unit="V"
            series={[{ values: peers.map((x) => x.own), color: '#2C6B66' }, { values: peers.map((x) => x.peerMedian), color: '#A89E91', dashed: true }]} />
        </div>
      )}
      <div className="rounded-xl bg-canvas p-4 text-[15px] leading-6 text-ink">
        Current and state of charge are <strong className="font-semibold">not measured</strong>: this sensor reports voltage and temperature only.
      </div>
      <div>
        <p className="text-sm font-medium text-ink">Controlled discharges (capacity tests)</p>
        {discharges.length === 0 ? (
          <p className="mt-1 text-sm text-muted">None recorded.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {discharges.slice(0, 3).map((x) => (
              <li key={x.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                <span className="text-ink">{formatDate(x.startedAt)} <span className="text-muted">· {formatNumber(x.conditions.loadCurrentA, 0, 'A')} to {formatNumber(x.conditions.cutoffVoltageV, 2, 'V')}</span></span>
                <span className="num font-semibold text-ink">{formatNumber(x.result.capacityAh, 0, 'Ah')}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function OutlookPanel({ p, now, canRoute }: { p: BatteryPassport; now: string; canRoute: boolean }) {
  const w = p.warranty;
  const days = w?.endsOn ? Math.round((Date.parse(w.endsOn) - Date.parse(now)) / 86_400_000) : null;
  const ageYears = p.battery.manufacturedOn ? (Date.parse(now) - Date.parse(p.battery.manufacturedOn)) / (365.25 * 86_400_000) : null;
  return (
    <div className="space-y-6">
      <PanelHead icon={CalendarClock} title="Outlook" />
      <dl className="grid grid-cols-2 gap-5">
        <Fact label="Age" value={ageYears === null ? 'Unknown' : `${formatNumber(ageYears, 1)} years`} />
        <Fact label="Warranty ends" value={w?.endsOn ? formatDate(w.endsOn) : 'Not recorded'} />
      </dl>
      {ageYears === null && <p className="-mt-3 text-[13px] text-muted">Manufacture date is missing from the record.</p>}
      {days !== null && <p className="-mt-3 text-[13px] text-muted">{days >= 0 ? `${days} days left` : `Ended ${-days} days ago`}{w?.state === 'claim_open' ? ' · claim open' : ''}</p>}
      <div className="border-t border-line pt-5">
        <p className="text-sm font-medium text-ink">Model estimates</p>
        {p.predictions.length === 0 ? (
          <p className="mt-2 text-[15px] leading-6 text-ink">
            No estimate. Replacement timing is not predicted until a model passes the validation gate and an engineer signs it off.
          </p>
        ) : (
          <ul className="mt-2 space-y-3">
            {p.predictions.map((x) => (
              <li key={x.id} className="rounded-xl bg-canvas p-4">
                <p className="text-[13px] text-muted">{x.output.label}</p>
                <p className="mt-1 font-display text-[24px] leading-7 text-ink">{x.output.value}{x.output.range ? <span className="ml-2 font-sans text-sm text-muted">{x.output.range}</span> : null}</p>
                <ProvLine prov={{ kind: 'estimate', text: `${x.modelName} ${x.modelVersion} · shadow, not validated` }} className="mt-2" />
                <p className="mt-1 text-[13px] leading-5 text-muted">{x.uncertainty}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
      {canRoute && (
        <div className="border-t border-line pt-5">
          <p className="text-sm font-medium text-ink">Revive, test or recycle?</p>
          <p className="mt-1 text-[13px] leading-5 text-muted">Compare the routes with the chances and costs on record, and fill in what is missing, such as the sale price.</p>
          <div className="mt-3"><RouteCalculatorButton batteryId={p.battery.id} label={p.battery.label} /></div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------ attention ------------------------------ */

const SEVERITY_RANK = { critical: 0, warning: 1, info: 2 } as const;

function ask(prompt: string) {
  window.dispatchEvent(new CustomEvent('synovra:ask', { detail: prompt }));
}

function Attention({ alert, canAssistant }: { alert: Alert | null; canAssistant: boolean }) {
  if (!alert) {
    return (
      <div className="flex items-start gap-3 border-t border-line pt-5">
        <Check className="mt-1 h-5 w-5 shrink-0 text-approved" aria-hidden />
        <div>
          <p className="font-display text-[22px] leading-7 text-ink">Nothing needs attention</p>
          <p className="text-[13px] text-muted">No open alert for this battery. That is not proof of good condition.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="border-t border-line pt-5">
      <div className="flex items-start gap-3">
        <Wrench className="mt-1 h-5 w-5 shrink-0 text-copper" aria-hidden />
        <div className="min-w-0">
          <p className="font-display text-[22px] leading-7 text-ink">{alert.title}</p>
          <p className="text-[13px] text-muted">
            {alert.severity === 'critical' ? 'Critical' : alert.severity === 'warning' ? 'Warning' : 'Info'} · {alert.source.kind} {alert.source.name} {alert.source.version} · raised {formatDate(alert.createdAt)}
          </p>
          <p className="mt-2 text-[15px] leading-6 text-ink">{alert.recommendedAction}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link href={`/app/alerts?alert=${alert.id}`} className={buttonClass('primary', 'md', 'px-6')}>Open alert</Link>
        {canAssistant && (
          <button type="button" onClick={() => ask('Draft a service task for this battery')} className="inline-flex min-h-[44px] items-center gap-1 text-sm font-medium text-copper-700 hover:underline hover:underline-offset-4">
            Draft a service task <ArrowRight className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ since last visit ------------------------------ */

interface VisitSnap { at: string; events: number; eventIds: string[]; temperatureC: number | null; capacityPct: number | null; lifecycle: string; openAlerts: number }

function snapOf(p: BatteryPassport, openAlerts: number): VisitSnap {
  const t = p.lastApprovedTest;
  return {
    at: '', events: p.events.length, eventIds: p.events.map((e) => e.id).slice(-50),
    temperatureC: p.telemetry.temperatureC, capacityPct: t?.result.capacityAh != null ? Math.round((t.result.capacityAh / p.family.ratedCapacityAh) * 1000) / 10 : null,
    lifecycle: p.battery.lifecycleState, openAlerts,
  };
}

/** Per viewer, per device. Remembering a visit is a convenience; nothing depends on it. */
function useLastVisit(key: string | null, current: VisitSnap) {
  const [previous] = useState<VisitSnap | null>(() => {
    if (!key || typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as VisitSnap) : null;
    } catch {
      return null;
    }
  });
  // Written whenever what is on screen changes, stamped with the time it was seen.
  const seen = JSON.stringify({ ...current, at: '' });
  useEffect(() => {
    if (!key) return;
    try {
      window.localStorage.setItem(key, JSON.stringify({ ...(JSON.parse(seen) as VisitSnap), at: new Date().toISOString() }));
    } catch {
      /* storage blocked: the panel simply shows a first visit next time */
    }
  }, [key, seen]);
  return previous;
}

function since(iso: string): string {
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 2) return 'a moment ago';
  if (mins < 60) return `${mins} minutes ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h} hours ago`;
  return formatDate(iso);
}

function SinceLastVisit({ p, previous, current }: { p: BatteryPassport; previous: VisitSnap | null; current: VisitSnap }) {
  const items: { label: string; value: ReactNode; tone?: 'heat' }[] = [];
  if (previous) {
    const known = new Set(previous.eventIds);
    const fresh = p.events.filter((e) => !known.has(e.id));
    if (fresh.length) items.push({ label: `${fresh.length} new ${fresh.length === 1 ? 'event' : 'events'}`, value: fresh[fresh.length - 1].title });
    if (previous.lifecycle !== current.lifecycle) {
      items.push({ label: 'Lifecycle', value: `${LIFECYCLE_LABELS[previous.lifecycle as keyof typeof LIFECYCLE_LABELS] ?? previous.lifecycle} → ${LIFECYCLE_LABELS[p.battery.lifecycleState]}` });
    }
    if (previous.temperatureC !== null && current.temperatureC !== null && Math.abs(current.temperatureC - previous.temperatureC) >= 0.1) {
      const d = current.temperatureC - previous.temperatureC;
      items.push({ label: 'Temperature', value: `${d > 0 ? '+' : '−'}${formatNumber(Math.abs(d), 1, '°C')}`, tone: d > 0 ? 'heat' : undefined });
    }
    if (previous.capacityPct !== current.capacityPct && current.capacityPct !== null) {
      items.push({ label: 'Capacity, of rated', value: `${previous.capacityPct === null ? '—' : `${formatNumber(previous.capacityPct, 0)}%`} → ${formatNumber(current.capacityPct, 0)}%` });
    }
    if (previous.openAlerts !== current.openAlerts) items.push({ label: 'Open alerts', value: `${previous.openAlerts} → ${current.openAlerts}`, tone: current.openAlerts > previous.openAlerts ? 'heat' : undefined });
  }
  return (
    <section aria-labelledby="since-h" className="min-w-0">
      <h2 id="since-h" className="flex items-center gap-2 font-display text-[22px] leading-7 text-ink">
        <History className="h-5 w-5 text-copper" strokeWidth={1.75} aria-hidden /> Since your last visit
      </h2>
      {!previous ? (
        <p className="mt-3 text-[15px] leading-6 text-muted">First visit on this device. Changes to this record will be listed here next time.</p>
      ) : items.length === 0 ? (
        <p className="mt-3 text-[15px] leading-6 text-muted">Nothing has changed since you looked {since(previous.at)}.</p>
      ) : (
        <>
          <p className="mt-1 text-[13px] text-muted">You last looked {since(previous.at)}.</p>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            {items.map((i) => (
              <div key={i.label} className="min-w-0">
                <dt className="text-[13px] text-muted">{i.label}</dt>
                <dd className={cn('mt-0.5 text-[15px] font-medium leading-6', i.tone === 'heat' ? 'text-heat' : 'text-ink')}>{i.value}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </section>
  );
}

/* ------------------------------ recent activity ------------------------------ */

function RecentActivity({ events, now, onOpen }: { events: LifecycleEvent[]; now: string; onOpen: () => void }) {
  const recent = [...events].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 4);
  return (
    <section aria-labelledby="recent-h" className="min-w-0">
      <div className="flex items-center justify-between gap-3">
        <h2 id="recent-h" className="flex items-center gap-2 font-display text-[22px] leading-7 text-ink">
          <CalendarClock className="h-5 w-5 text-copper" strokeWidth={1.75} aria-hidden /> Recent activity
        </h2>
        <button type="button" onClick={onOpen} className="text-sm font-medium text-copper-700 hover:underline hover:underline-offset-4">Full timeline</button>
      </div>
      <ol className="relative mt-4 grid grid-cols-2 gap-x-4 gap-y-5 md:grid-cols-4">
        <span className="absolute left-1 right-0 top-[5px] hidden h-px bg-line md:block" aria-hidden />
        {recent.map((e) => {
          const fresh = Date.parse(now) - Date.parse(e.occurredAt) < 7 * 86_400_000;
          return (
            <li key={e.id} className="relative min-w-0">
              <span className={cn('relative block h-[11px] w-[11px] rounded-full ring-4 ring-canvas', fresh ? 'bg-copper' : 'bg-field')} aria-hidden />
              <p className={cn('mt-3 text-[13px]', fresh ? 'font-medium text-copper-700' : 'text-muted')}>{stamp(e.occurredAt)}</p>
              <p className="mt-0.5 text-[15px] font-medium leading-5 text-ink">{e.title}</p>
              <p className="mt-0.5 line-clamp-2 text-[13px] leading-[18px] text-muted">{e.reason}</p>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/* ------------------------------ the deep dive ------------------------------ */

const LENSES: { value: Lens; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'temperature', label: 'Temperature' },
  { value: 'capacity', label: 'Capacity' },
  { value: 'voltage', label: 'Charge & discharge' },
  { value: 'outlook', label: 'Outlook' },
];

function LensList() {
  const listRef = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const el = list.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
      if (el) setBar({ x: el.offsetLeft, w: el.offsetWidth });
    };
    measure();
    const mo = new MutationObserver(measure);
    mo.observe(list, { attributes: true, subtree: true, attributeFilter: ['data-state'] });
    const ro = new ResizeObserver(measure);
    ro.observe(list);
    return () => { mo.disconnect(); ro.disconnect(); };
  }, []);
  return (
    <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] md:mx-0 md:px-0 [&::-webkit-scrollbar]:hidden">
      <RadixTabs.List ref={listRef} aria-label="Battery lens" className="relative mx-auto flex w-max gap-1 md:gap-3">
        {bar && <span aria-hidden className="absolute bottom-0 left-0 h-[2px] rounded-full bg-copper transition-[transform,width] duration-300 ease-out" style={{ transform: `translateX(${bar.x}px)`, width: bar.w }} />}
        {LENSES.map((l) => (
          <RadixTabs.Trigger
            key={l.value}
            value={l.value}
            className="min-h-[44px] whitespace-nowrap rounded-md px-2.5 text-[15px] text-ink-2 transition-colors duration-200 hover:text-ink data-[state=active]:font-medium data-[state=active]:text-copper-700"
          >
            {l.label}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
    </div>
  );
}

function Vital({ value, label, prov, onClick }: { value: ReactNode; label: string; prov: Prov; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group min-w-0 rounded-lg p-2 -m-2 text-left transition-colors duration-150 hover:bg-white/70">
      <span className="block whitespace-nowrap font-display text-[30px] leading-9 tracking-[-0.015em] text-ink">{value}</span>
      <span className="mt-0.5 block text-sm text-ink-2 group-hover:text-ink">{label}</span>
      <ProvLine prov={prov} className="mt-1" />
    </button>
  );
}

function KeyStatus({ value, label, tone, href, onClick }: { value: string; label: string; tone?: 'heat' | 'ok'; href?: string; onClick?: () => void }) {
  const body = (
    <>
      <span className="min-w-0">
        <span className={cn('block font-display text-[22px] leading-7 tracking-[-0.01em]', tone === 'heat' ? 'text-heat' : 'text-ink')}>{value}</span>
        <span className="mt-0.5 block text-sm text-ink-2">{label}</span>
      </span>
      <ArrowRight className="mt-2 h-4 w-4 shrink-0 text-copper transition-transform duration-200 ease-out group-hover:translate-x-0.5" aria-hidden />
    </>
  );
  const cls = 'group -m-2 flex min-w-0 items-start justify-between gap-3 rounded-lg p-2 text-left transition-colors duration-150 hover:bg-white/70';
  return href ? <Link href={href} className={cls}>{body}</Link> : <button type="button" onClick={onClick} className={cls}>{body}</button>;
}

export function DeepDive({
  p, lens, onLens, onOpenSection, actions,
}: {
  p: BatteryPassport;
  lens: Lens;
  onLens: (lens: Lens) => void;
  /** Opens a section of the full record below and scrolls to it. */
  onOpenSection: (tab: string) => void;
  actions: ReactNode;
}) {
  const session = useSession();
  const runtime = useRuntime();
  const simulated = runtime.dataMode === 'demo';
  const canTelemetry = session.can('telemetry.read') && session.has('monitoring') && p.telemetry.available;
  const canAssistant = session.can('assistant.use') && session.has('assistant');
  const now = useMemo(() => getServices().telemetry.snapshotAt(), []);

  const series = useSvcQuery(['telemetry', 'series', p.battery.id, 7], (s) => s.telemetry.series(p.battery.id, 7), { enabled: canTelemetry });
  const peers = useSvcQuery(['telemetry', 'peers', p.battery.id, 7], (s) => s.telemetry.stringPeers(p.battery.id, 7), { enabled: canTelemetry });
  const temps = series.data?.points.map((x) => x.temperatureC) ?? [];
  const peerPoints = peers.data?.points ?? [];

  const openAlerts = p.alerts.filter((a) => a.state !== 'closed' && a.state !== 'resolved').sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  const topAlert = openAlerts[0] ?? null;
  const here = p.assignments.find((a) => !a.endAt);
  const test = p.lastApprovedTest;
  const pct = test?.result.capacityAh != null ? (test.result.capacityAh / p.family.ratedCapacityAh) * 100 : null;
  const tProv = telemetryProv(p, simulated);
  // Beside each vital, one word is enough: the Vitals heading carries the reading time.
  const tShort: Prov = { kind: tProv.kind, text: { measured: 'Measured', simulated: 'Simulated', stale: 'Stale', unavailable: 'No sensor', tested: '', inferred: '', estimate: '', rule: '' }[tProv.kind] || tProv.text };
  const testedShort = (iso: string): Prov => ({ kind: 'tested', text: `Tested ${formatShortDate(iso)}` });
  const sensorIr = p.telemetry.available && p.telemetry.resistanceMOhm !== null;
  const stages = storyStages(p);

  const current = snapOf(p, openAlerts.length);
  const previous = useLastVisit(session.user ? `synovra-visit:${session.user.id}:${p.battery.id}` : null, current);

  const status = !p.telemetry.available ? 'No sensor' : p.telemetry.freshness === 'stale' ? 'Telemetry stale' : simulated ? 'Simulated telemetry' : 'Live';
  const statusDot = !p.telemetry.available ? 'unavailable' : p.telemetry.freshness === 'stale' ? 'stale' : simulated ? 'simulated' : 'measured';

  return (
    <div className="space-y-12">
      <RadixTabs.Root value={lens} onValueChange={(v) => onLens(v as Lens)}>
        <div className="relative grid gap-x-8 gap-y-6 [grid-template-areas:'back'_'id'_'tabs'_'fig'_'panel'] lg:grid-cols-[230px_minmax(0,1fr)] lg:[grid-template-areas:'back_tabs'_'id_fig'_'panel_panel'] xl:grid-cols-[220px_minmax(0,1fr)_356px] xl:[grid-template-areas:'back_tabs_tabs'_'id_fig_panel']">
          {/* spotlight behind the battery */}
          <span aria-hidden className="pointer-events-none absolute inset-x-0 -top-10 bottom-0 -z-10 lg:-inset-x-8 bg-[radial-gradient(55%_50%_at_45%_45%,#FFFFFF_0%,rgba(255,255,255,0)_70%)]" />

          <Link href="/app/batteries" className="inline-flex min-h-[40px] items-center gap-2 self-center justify-self-start rounded-md text-[15px] text-ink-2 [grid-area:back] hover:text-ink">
            <ArrowLeft className="h-4 w-4" aria-hidden /> Batteries
          </Link>
          <div className="min-w-0 self-center [grid-area:tabs]"><LensList /></div>

          {/* identity */}
          <div className="min-w-0 [grid-area:id]">
            <h1 className="mono font-display text-[52px] font-normal leading-[54px] tracking-[-0.025em] text-ink">{p.battery.label}</h1>
            <p className="mt-3 text-[17px] leading-6 text-ink-2">
              {here ? <>{here.siteName}<span className="block text-[15px] text-muted">{here.bankName} / {here.stringName}, position {here.position}</span></> : p.battery.physicalLocation}
            </p>
            <p className="mt-3 text-[15px] leading-6 text-ink-2">
              {p.family.chemistry} · {p.family.ratedVoltageV} V · {p.family.ratedCapacityAh} Ah
              <span className="block text-muted">{p.family.manufacturer.replace(' (fictional)', '')} {p.family.model}</span>
            </p>
            <p className="mt-4">
              <ProvLine prov={{ kind: statusDot as ProvKind, text: p.telemetry.lastReadingAt ? `${status} · ${stamp(p.telemetry.lastReadingAt)}` : status }} />
            </p>
            <p className="mono mt-2 text-[13px] text-muted">{p.battery.publicRef}</p>
            <div className="mt-5 flex flex-wrap gap-2">{actions}</div>

            <ol className="mt-7 space-y-2.5" aria-label="Lifecycle progress">
              {stages.map((st) => (
                <li key={st.key} className="flex items-center gap-2.5 text-sm">
                  <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded-full',
                    st.state === 'done' ? 'bg-teal' : st.state === 'current' ? 'bg-copper' : st.state === 'problem' ? 'bg-critical' : 'border border-field')} aria-hidden>
                    {st.state === 'done' && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3.5} />}
                  </span>
                  <span className={cn(st.state === 'pending' || st.state === 'skipped' ? 'text-muted' : 'font-medium text-ink')}>{st.label}</span>
                  <span className="truncate text-[13px] text-muted">{st.detail}</span>
                  <span className="sr-only">, {st.state === 'done' ? 'done' : st.state === 'current' ? 'now' : st.state === 'problem' ? 'problem' : 'not yet'}.</span>
                </li>
              ))}
            </ol>
          </div>

          {/* the figure */}
          <div className="min-w-0 [grid-area:fig]">
            <BatteryFigure unitType={p.family.unitType} chemistry={p.family.chemistry} lens={lens} onLens={onLens} temperatureC={p.telemetry.temperatureC} label={p.battery.label} />
            <p className="mt-3 max-w-[56ch] text-[13px] leading-5 text-muted">
              {lens === 'temperature' && p.telemetry.available
                ? `Illustration. The tint follows the one block temperature the sensor measures (${formatNumber(p.telemetry.temperatureC, 1, '°C')}); temperatures inside individual cells are not measured.`
                : `Illustration of a ${p.family.unitType} ${p.family.chemistry} battery, not a photo or scan of ${p.battery.label}. Choose a point on it to look closer.`}
            </p>
          </div>

          {/* the lens panel */}
          <aside className="card min-w-0 p-6 [grid-area:panel] xl:self-start" aria-label="Lens details">
            {LENSES.map((l) => (
              <RadixTabs.Content key={l.value} value={l.value} className="lens-in focus-visible:outline-none">
                {l.value === 'overview' && <OverviewPanel p={p} alert={topAlert} />}
                {l.value === 'temperature' && <TemperaturePanel p={p} simulated={simulated} series={temps} />}
                {l.value === 'capacity' && <CapacityPanel p={p} />}
                {l.value === 'voltage' && <VoltagePanel p={p} simulated={simulated} peers={peerPoints} />}
                {l.value === 'outlook' && <OutlookPanel p={p} now={now} canRoute={session.can('prediction.read')} />}
              </RadixTabs.Content>
            ))}
            <div className="mt-6">
              <Attention alert={topAlert} canAssistant={canAssistant} />
              {canAssistant && (
                <button type="button" onClick={() => ask(topAlert ? 'Why is this battery flagged?' : 'Summarise this battery’s history')}
                  className="mt-3 inline-flex min-h-[40px] items-center gap-1 text-sm font-medium text-copper-700 hover:underline hover:underline-offset-4">
                  Ask the assistant <ArrowRight className="h-4 w-4" aria-hidden />
                </button>
              )}
            </div>
          </aside>
        </div>
      </RadixTabs.Root>

      {/* vitals and key status */}
      <div className="grid gap-10 border-t border-line pt-8 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section aria-labelledby="vitals-h" className="min-w-0">
          <h2 id="vitals-h" className="flex items-center gap-3 font-display text-[26px] leading-8 text-ink">
            Vitals <ProvLine prov={tProv.kind === 'unavailable' ? { kind: 'unavailable', text: 'No telemetry' } : tProv} />
          </h2>
          <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3 lg:grid-cols-5">
            <Vital value={<Num n={p.telemetry.voltageV} digits={2} unit="V" />} label="Voltage" prov={tShort} onClick={() => onLens('voltage')} />
            <Vital value={<Num n={p.telemetry.temperatureC} digits={1} unit="°C" />} label="Temperature" prov={tShort} onClick={() => onLens('temperature')} />
            <Vital
              value={<Num n={sensorIr ? p.telemetry.resistanceMOhm : (test?.result.internalResistanceMOhm ?? null)} digits={1} unit="mΩ" />}
              label="Resistance"
              prov={sensorIr ? { kind: p.telemetry.resistanceSource === 'inferred' ? 'inferred' : tShort.kind, text: p.telemetry.resistanceSource === 'inferred' ? 'Inferred' : tShort.text }
                : test ? testedShort(test.startedAt) : { kind: 'unavailable', text: 'Not measured' }}
              onClick={() => onLens('capacity')}
            />
            <Vital value={<Num n={pct} unit="%" />} label="Capacity"
              prov={test ? testedShort(test.startedAt) : { kind: 'unavailable', text: 'No test' }} onClick={() => onLens('capacity')} />
            <Vital value="—" label="State of charge" prov={{ kind: 'unavailable', text: 'Not measured' }} onClick={() => onLens('voltage')} />
          </div>
        </section>
        <section aria-labelledby="status-h" className="min-w-0 xl:border-l xl:border-line xl:pl-10">
          <h2 id="status-h" className="font-display text-[26px] leading-8 text-ink">Key status</h2>
          <div className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-3">
            <KeyStatus value={LIFECYCLE_LABELS[p.battery.lifecycleState]} label="Lifecycle" onClick={() => onOpenSection('timeline')} />
            <KeyStatus value={p.evidenceStatus.label} label="Evidence" onClick={() => onOpenSection('tests')} />
            <KeyStatus
              value={topAlert ? `${openAlerts.length} open` : 'None open'}
              label={topAlert ? `Alerts · ${topAlert.severity}` : 'Alerts'}
              tone={topAlert && topAlert.severity !== 'info' ? 'heat' : undefined}
              href={topAlert ? `/app/alerts?alert=${topAlert.id}` : '/app/alerts'}
            />
          </div>
        </section>
      </div>

      {/* what changed, and what happened */}
      <div className="grid gap-10 border-t border-line pt-8 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <SinceLastVisit p={p} previous={previous} current={current} />
        <div className="xl:border-l xl:border-line xl:pl-10">
          <RecentActivity events={p.events} now={now} onOpen={() => onOpenSection('timeline')} />
        </div>
      </div>

      {/* into the full record */}
      <nav aria-label="Full record" className="grid gap-4 border-t border-line pt-6 sm:grid-cols-3">
        {[
          { icon: FileText, title: 'Battery passport', text: 'Its story, start to finish', tab: 'overview' },
          { icon: Gauge, title: 'Technical data', text: 'Specification, tests and evidence', tab: 'tests' },
          { icon: LineChart, title: 'Trends', text: 'Voltage, temperature and resistance', tab: 'telemetry' },
        ].map((x) => (
          <button key={x.title} type="button" onClick={() => onOpenSection(x.tab)} className="group -m-2 flex items-start gap-3 rounded-lg p-2 text-left hover:bg-white/70">
            <x.icon className="mt-0.5 h-5 w-5 shrink-0 text-muted" strokeWidth={1.6} aria-hidden />
            <span>
              <span className="flex items-center gap-1 text-[15px] font-medium text-copper-700">{x.title} <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden /></span>
              <span className="block text-[13px] text-muted">{x.text}</span>
            </span>
          </button>
        ))}
      </nav>
    </div>
  );
}
