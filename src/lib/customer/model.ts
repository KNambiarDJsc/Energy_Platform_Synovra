import { STATUS_LABELS, STATUS_RULE, type BatteryStatus } from '@/domain/status';
import type { EvidenceFile, LifecycleEvent, LifecycleEventType } from '@/domain/types';
import type { BatteryPassport } from '@/services/types';

/**
 * The customer's view of a battery, built only from what the passport already holds. Nothing here is invented:
 * a value the record cannot support is shown as "Baseline being established" or "Data unavailable".
 */

/** What kind of number it is. `demo_only` marks a stand-in for something that is not connected in this build. */
export type Basis = 'measured' | 'calculated' | 'estimated' | 'modelled' | 'predicted' | 'demo_only';

export const BASIS_LABELS: Record<Basis, { label: string; meaning: string }> = {
  measured: { label: 'Measured', meaning: 'A test result or sensor reading, as recorded.' },
  calculated: { label: 'Calculated', meaning: 'Arithmetic or a fixed rule applied to recorded values.' },
  estimated: { label: 'Estimated', meaning: 'Inferred from other readings. Not measured directly.' },
  modelled: { label: 'Modelled', meaning: 'Produced by a model. No Synovra model is validated yet.' },
  predicted: { label: 'Predicted', meaning: 'A forecast of what may happen. No forecast is validated yet.' },
  demo_only: { label: 'Demo only', meaning: 'Simulated for this demonstration. Nothing real is connected.' },
};

export type Scope = 'battery' | 'string' | 'bank' | 'site';
export const SCOPE_LABELS: Record<Scope, string> = { battery: 'This battery', string: 'Whole string', bank: 'Whole bank', site: 'Whole site' };

export type Freshness = 'current' | 'dated' | 'none';

export interface Indicator {
  key: string;
  label: string;
  /** Null when the record cannot support a value. */
  value: string | null;
  unit?: string;
  basis: Basis;
  scope: Scope;
  /** When the underlying measurement was taken. */
  at: string | null;
  source: string;
  freshness: Freshness;
  /** Why there is no value: still establishing a baseline, or the data does not exist. */
  absent?: 'baseline' | 'unavailable';
  note?: string;
}

const DAY = 86_400_000;
const ageDays = (iso: string, now: string) => Math.floor((Date.parse(now) - Date.parse(iso)) / DAY);

/** Indicators for one battery. Never a health percentage, a remaining life or a failure date. */
export function buildIndicators(p: BatteryPassport, now: string): Indicator[] {
  const out: Indicator[] = [];
  const test = p.lastApprovedTest;
  const testAt = test ? (test.reviewedAt ?? test.startedAt) : null;
  const testFresh: Freshness = testAt ? (ageDays(testAt, now) > STATUS_RULE.staleTestDays ? 'dated' : 'current') : 'none';
  const testSource = test ? `${test.instrument}, protocol ${test.protocolId}, calibration ${test.calibrationRef || 'not recorded'}` : 'No approved test on record';
  const rated = p.family.ratedCapacityAh;

  out.push({
    key: 'condition', label: 'Condition', value: STATUS_LABELS[p.status.status], basis: 'calculated', scope: 'battery', at: now,
    source: `Status rule ${p.status.rule.name} ${p.status.rule.version}`, freshness: 'current',
    note: `${p.status.headline}${p.status.rule.placeholder ? ' Thresholds are placeholders until engineering sets them.' : ''}`,
  });

  if (test && test.result.capacityAh !== null) {
    const c = test.conditions;
    const cond = `${c.loadCurrentA ?? '?'} A to ${c.cutoffVoltageV ?? '?'} V at ${c.ambientTempC ?? '?'} °C`;
    out.push({
      key: 'capacity', label: 'Capacity at last approved test', value: String(test.result.capacityAh), unit: 'Ah', basis: 'measured', scope: 'battery',
      at: testAt, source: testSource, freshness: testFresh, note: `Discharge ${cond}. Not temperature-corrected.`,
    });
    out.push({
      key: 'capacity_pct', label: 'Capacity against rating', value: String(Math.round((test.result.capacityAh / rated) * 100)), unit: '% of rated', basis: 'calculated',
      scope: 'battery', at: testAt, source: `Measured capacity divided by rated ${rated} Ah (${p.family.ratingConditions})`, freshness: testFresh,
      note: 'A comparison with the rating at one test. It is not a health score.',
    });
    if (test.result.openCircuitVoltageV !== null) {
      out.push({ key: 'ocv', label: 'Open-circuit voltage at test', value: String(test.result.openCircuitVoltageV), unit: 'V', basis: 'measured', scope: 'battery', at: testAt, source: testSource, freshness: testFresh });
    }
    if (test.result.internalResistanceMOhm !== null) {
      out.push({ key: 'ir', label: 'Internal resistance at test', value: String(test.result.internalResistanceMOhm), unit: 'mΩ', basis: 'measured', scope: 'battery', at: testAt, source: testSource, freshness: testFresh });
    }
  } else {
    out.push({
      key: 'capacity', label: 'Capacity at last approved test', value: null, basis: 'measured', scope: 'battery', at: null, source: testSource, freshness: 'none', absent: 'baseline',
      note: 'Baseline being established. A capacity is shown once an engineer approves a test.',
    });
  }

  // A test of the whole string says something about the string. It is never this battery's capacity.
  const st = p.stringTests.filter((t) => t.status === 'approved' && t.result.capacityAh !== null).sort((a, b) => (b.reviewedAt ?? b.startedAt).localeCompare(a.reviewedAt ?? a.startedAt))[0];
  if (st) {
    const at = st.reviewedAt ?? st.startedAt;
    out.push({
      key: 'string_capacity', label: 'String capacity at last approved test', value: String(st.result.capacityAh), unit: 'Ah', basis: 'measured', scope: 'string', at,
      source: `${st.instrument}, ${st.stringName}`, freshness: ageDays(at, now) > STATUS_RULE.staleTestDays ? 'dated' : 'current', note: 'A whole-string result. It does not describe one battery.',
    });
  }

  const t = p.telemetry;
  if (t.available) {
    const tFresh: Freshness = t.freshness === 'fresh' ? 'current' : t.freshness === 'stale' ? 'dated' : 'none';
    const src = `Sensor ${t.sensorSerial ?? 'unknown'} (simulated)`;
    const sim = 'Simulated by the demonstration. No sensor is connected.';
    if (t.voltageV !== null) out.push({ key: 'voltage', label: 'Voltage', value: t.voltageV.toFixed(2), unit: 'V', basis: 'demo_only', scope: 'battery', at: t.lastReadingAt, source: src, freshness: tFresh, note: sim });
    if (t.temperatureC !== null) out.push({ key: 'temperature', label: 'Temperature', value: t.temperatureC.toFixed(1), unit: '°C', basis: 'demo_only', scope: 'battery', at: t.lastReadingAt, source: src, freshness: tFresh, note: sim });
    if (t.resistanceMOhm !== null && t.resistanceSource !== 'unavailable') {
      out.push({
        key: 'resistance', label: 'Internal resistance (sensor)', value: t.resistanceMOhm.toFixed(1), unit: 'mΩ', basis: t.resistanceSource === 'inferred' ? 'estimated' : 'demo_only', scope: 'battery',
        at: t.lastReadingAt, source: src, freshness: tFresh, note: t.resistanceSource === 'inferred' ? 'Inferred from other readings, not measured directly.' : sim,
      });
    }
    if (t.completenessPct !== null) {
      out.push({ key: 'completeness', label: 'Reading completeness', value: String(Math.round(t.completenessPct)), unit: '% of expected readings', basis: 'calculated', scope: 'battery', at: t.lastReadingAt, source: src, freshness: tFresh, note: 'Last 30 days. Readings received divided by readings expected.' });
    }
  } else {
    out.push({ key: 'readings', label: 'Live readings', value: null, basis: 'demo_only', scope: 'battery', at: null, source: 'No sensor attributed', freshness: 'none', absent: 'unavailable', note: t.reason });
  }

  out.push({
    key: 'remaining_life', label: 'Remaining useful life and failure date', value: null, basis: 'predicted', scope: 'battery', at: null, source: 'No validated prediction model exists', freshness: 'none', absent: 'unavailable',
    note: 'Data unavailable. Synovra shows no forecast until a model is validated against real outcomes.',
  });
  return out;
}

/* ------------------------------ Timeline ------------------------------ */

export type TimelineKind = 'intake' | 'test' | 'service' | 'deployment' | 'alert' | 'recycling' | 'replacement';
export interface TimelineItem {
  id: string;
  at: string;
  kind: TimelineKind;
  title: string;
  detail: string;
  approximate: boolean;
  /** Service work an engineer approved. Only this counts as completed. */
  completed?: boolean;
  evidence: { id: string; fileName: string }[];
}

const KIND_OF: Partial<Record<LifecycleEventType, TimelineKind>> = {
  intake: 'intake', test: 'test', approval: 'test', movement: 'deployment', deployment: 'deployment', alert: 'alert', service: 'service', return: 'service', recycling: 'recycling',
};
export const TIMELINE_KIND_LABELS: Record<TimelineKind, string> = {
  intake: 'Intake', test: 'Test', service: 'Service', deployment: 'Deployment', alert: 'Alert', recycling: 'Recycling', replacement: 'Replacement',
};

/**
 * Staff words made plain for a customer: the internal store, qualification and restoration vocabulary describes the
 * lab's workflow, not what happened to their battery. Each rule keeps the fact and drops the jargon.
 */
const PLAIN: [RegExp, string][] = [
  [/Post-restoration/g, 'Follow-up'],
  [/post-restoration/g, 'follow-up'],
  [/Qualified by engineer/g, 'Approved by an engineer'],
  [/Qualification approved against the demonstration threshold\./g, 'An engineer approved the test result against the placeholder threshold.'],
  [/Left qualified store for site/g, 'Left the store for site'],
  [/from the qualified store to site/g, 'to site'],
  [/\bqualified store\b/gi, 'store'],
  [/\brestoration\b/gi, 'service work'],
  [/\bqualif(y|ied|ication)\b/gi, 'approved'],
];
export const plain = (text: string): string => PLAIN.reduce((t, [re, to]) => t.replace(re, to), text);

/** Files a customer may open. Internal and controlled files never appear in the customer view, whoever is looking. */
export const customerEvidence = (files: EvidenceFile[]) => files.filter((f) => f.classification === 'customer_visible');

/**
 * Events a customer may see. Process events (rework, rejection, route decisions, values, identity corrections) are
 * left out. Restoration shows only as a completed, engineer-approved service, with the process kept confidential.
 */
export function buildTimeline(p: BatteryPassport): TimelineItem[] {
  const items: TimelineItem[] = [];
  for (const e of p.events as (LifecycleEvent & { evidence?: EvidenceFile[] })[]) {
    const evidence = customerEvidence(e.evidence ?? []).map((f) => ({ id: f.id, fileName: f.fileName }));
    if (e.type === 'restoration') {
      if (e.approvalState !== 'approved') continue;
      items.push({ id: e.id, at: e.occurredAt, kind: 'service', title: 'Service work completed', detail: 'Approved by an engineer. The method is confidential and is not part of the customer record.', approximate: e.dateCertainty === 'approximate', completed: true, evidence });
      continue;
    }
    const kind = KIND_OF[e.type];
    if (!kind) continue;
    // Choosing a battery for restoration is an internal workflow step. The customer sees completed, approved work only.
    if (/restoration candidate/i.test(e.title)) continue;
    items.push({ id: e.id, at: e.occurredAt, kind, title: plain(e.title), detail: plain(e.reason), approximate: e.dateCertainty === 'approximate', evidence });
  }
  if (p.recycling && p.recycling.consignedOn && !items.some((i) => i.kind === 'recycling')) {
    items.push({ id: `rec_${p.recycling.id}`, at: `${p.recycling.consignedOn}T00:00:00.000Z`, kind: 'recycling', title: 'Consigned for recycling', detail: p.recycling.certificateState === 'received' ? 'Recycler certificate received.' : 'Recycler certificate not yet received.', approximate: false, evidence: [] });
  }
  return items.sort((a, b) => b.at.localeCompare(a.at));
}

/** The most recent thing the record says, so a person can see how old the picture is. */
export function lastUpdated(p: BatteryPassport): string {
  const times = [p.battery.updatedAt, p.telemetry.lastReadingAt, ...p.events.map((e) => e.recordedAt), ...p.tests.map((t) => t.reviewedAt)].filter((x): x is string => !!x);
  return times.sort().at(-1) ?? p.battery.updatedAt;
}

/* ------------------------------ Hierarchy ------------------------------ */

export interface HierarchyLevel { level: 'Customer' | 'Site' | 'System' | 'Bank / string' | 'Battery'; name: string; note?: string }

/**
 * Customer → Site → System → Bank/String → Battery. The data model has no system entity, so the system is named
 * from the string's nominal voltage and the site kind, and the data map lists it as a gap.
 */
export function hierarchyOf(p: BatteryPassport, customerName: string, siteKind: string | null, nominalVoltageV: number | null): HierarchyLevel[] {
  const loc = p.location;
  const system = nominalVoltageV !== null ? `${nominalVoltageV} V DC power system${siteKind ? `, ${siteKind.toLowerCase()}` : ''}` : 'Not recorded';
  return [
    { level: 'Customer', name: customerName },
    { level: 'Site', name: loc.siteName ?? 'Not installed at a site' },
    { level: 'System', name: system, note: nominalVoltageV !== null ? 'Named from the string voltage. The data model has no system record yet.' : undefined },
    { level: 'Bank / string', name: loc.bankName && loc.stringName ? `${loc.bankName} / ${loc.stringName}` : 'Not in a string' },
    { level: 'Battery', name: loc.position !== null ? `${p.battery.label}, position ${loc.position}` : `${p.battery.label}, ${p.battery.physicalLocation}` },
  ];
}

/* ------------------------------ Fleet coverage ------------------------------ */

export interface Coverage {
  batteries: number;
  inFleet: number;
  byStatus: Record<BatteryStatus, number>;
  withApprovedTest: number;
  testsCurrent: number;
  withSensor: number;
  freshReadings: number;
  withCustomerEvidence: number;
  /** Newest reading, test or record change across the fleet. */
  lastUpdated: string | null;
}

export function computeCoverage(ps: BatteryPassport[], now: string): Coverage {
  const byStatus: Record<BatteryStatus, number> = { good: 0, watching: 0, attention: 0, baseline: 0, retired: 0 };
  let withApprovedTest = 0, testsCurrent = 0, withSensor = 0, freshReadings = 0, withCustomerEvidence = 0;
  const stamps: string[] = [];
  for (const p of ps) {
    byStatus[p.status.status] += 1;
    const t = p.lastApprovedTest;
    if (t) {
      withApprovedTest += 1;
      if (ageDays(t.reviewedAt ?? t.startedAt, now) <= STATUS_RULE.staleTestDays) testsCurrent += 1;
    }
    if (p.telemetry.available) { withSensor += 1; if (p.telemetry.freshness === 'fresh') freshReadings += 1; }
    if (customerEvidence(p.evidence).length > 0) withCustomerEvidence += 1;
    stamps.push(lastUpdated(p));
  }
  return {
    batteries: ps.length, inFleet: ps.length - byStatus.retired, byStatus, withApprovedTest, testsCurrent, withSensor, freshReadings, withCustomerEvidence,
    lastUpdated: stamps.sort().at(-1) ?? null,
  };
}

/** The demonstration's customers, by tenant. Tenants are not readable by customer roles, so the names live here. */
export const DEMO_CUSTOMERS: Record<string, string> = { t_custA: 'Demo Customer A', t_custB: 'Demo Customer B' };
export const customerName = (tenantId: string) => DEMO_CUSTOMERS[tenantId] ?? 'Demo customer';
