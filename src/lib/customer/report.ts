import { STATUS_LABELS, STATUS_RULE } from '@/domain/status';
import type { LifecycleState } from '@/domain/types';
import type { BatteryPassport } from '@/services/types';
import { frameworkOf, type FrameworkId, type SectionId } from './frameworks';
import { buildTimeline, computeCoverage, customerEvidence } from './model';

/**
 * An operational and ESG data report for a customer, built from the battery records the customer may see. It is a
 * data export, not a certificate: measured results, calculations and gaps are kept apart, and no figure is shown
 * that the records cannot support. Pure: the same records always produce the same report.
 */

export interface ReportTable { title?: string; columns: string[]; rows: string[][] }
export type SectionStatus = 'populated' | 'partial' | 'not_recorded';
export interface ReportSectionData {
  id: SectionId | 'scope';
  heading: string;
  status: SectionStatus;
  /** What kind of values the section holds, in a line. */
  basis: string;
  tables: ReportTable[];
  notes: string[];
  /** Inputs the section needs and the records do not hold. */
  missing: string[];
  /** The configured framework's candidate disclosure area for this section, if one is selected and mapped. */
  frameworkArea: string | null;
}
export interface CustomerReport {
  title: string;
  customerName: string;
  siteNames: string[];
  period: { from: string; to: string };
  generatedAt: string;
  snapshotAt: string;
  framework: { id: FrameworkId; name: string };
  batteryCount: number;
  sections: ReportSectionData[];
  limitations: string[];
}

export interface ReportInput {
  customerName: string;
  siteNames: string[];
  period: { from: string; to: string };
  generatedAt: string;
  snapshotAt: string;
  passports: BatteryPassport[];
  framework: FrameworkId;
}

const NOT_RECORDED = 'Not recorded';
const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : NOT_RECORDED);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const ACTIVE_ALERT = ['open', 'acknowledged', 'assigned', 'in_progress'];
const IN_SERVICE: LifecycleState[] = ['deployed'];
const AVAILABLE: LifecycleState[] = ['qualified', 'reserved'];
const DISPOSITION: LifecycleState[] = ['returned', 'rejected', 'recycling_queue'];

export const REPORT_LIMITATIONS = [
  'All records are synthetic demonstration data. There is no live customer, cloud or sensor connection.',
  'This is an operational data report. It is not a compliance certificate, an assurance statement or an ESG rating.',
  'Condition follows a fixed rule with placeholder thresholds. It is not a health score and no model produced it.',
  'No emissions figure is calculated, and nothing is claimed as saved or avoided: the records hold no energy, transport or emission-factor inputs.',
  'Framework pointers are candidate disclosure areas for a reporting lead to confirm. They do not assign any GHG Protocol scope.',
];

export function buildCustomerReport(input: ReportInput): CustomerReport {
  const { passports: ps, period } = input;
  const fw = frameworkOf(input.framework);
  const inPeriod = (iso: string | null | undefined) => !!iso && day(iso) >= period.from && day(iso) <= period.to;
  const cov = computeCoverage(ps, input.snapshotAt);
  const area = (id: SectionId) => fw.areas[id] ?? null;
  const sections: ReportSectionData[] = [];

  // 1. Scope and coverage
  sections.push({
    id: 'scope', heading: 'Scope, period and data coverage', status: ps.length ? 'populated' : 'not_recorded', basis: 'Facts about the report itself, and counts of what the records hold.',
    tables: [{ columns: ['Item', 'Value'], rows: [
      ['Customer', input.customerName],
      ['Sites', input.siteNames.join('; ') || NOT_RECORDED],
      ['Reporting period', `${period.from} to ${period.to}`],
      ['Report generated', day(input.generatedAt)],
      ['Records snapshot taken', day(input.snapshotAt)],
      ['Batteries in scope', String(ps.length)],
      ['Batteries with an approved capacity test', `${cov.withApprovedTest} of ${ps.length}`],
      ['Batteries with a sensor attributed', `${cov.withSensor} of ${ps.length}`],
      ['Data label', 'Synthetic demonstration data'],
    ] }],
    notes: ['Coverage counts what is on record. A battery with no sensor or no approved test is shown as a gap, not as normal.'],
    missing: [], frameworkArea: null,
  });

  // 2. Inventory
  const groups = new Map<string, { chemistry: string; model: string; n: number; v: number; ah: number }>();
  for (const p of ps) {
    const k = `${p.family.manufacturer}|${p.family.model}`;
    const g = groups.get(k) ?? { chemistry: p.family.chemistry, model: `${p.family.manufacturer} ${p.family.model}`, n: 0, v: p.family.ratedVoltageV, ah: p.family.ratedCapacityAh };
    g.n += 1;
    groups.set(k, g);
  }
  sections.push({
    id: 'inventory', heading: 'Battery inventory', status: ps.length ? 'populated' : 'not_recorded', basis: 'Identity and rating from the battery record. Ratings are the manufacturer’s.',
    tables: [
      { title: 'By model', columns: ['Chemistry / type', 'Model', 'Count', 'Rated voltage (V)', 'Rated capacity (Ah)'], rows: [...groups.values()].map((g) => [g.chemistry, g.model, String(g.n), String(g.v), String(g.ah)]) },
      { title: 'Each battery', columns: ['Battery', 'Chemistry / unit', 'Rated V', 'Rated Ah', 'Manufactured', 'In place since', 'Location'], rows: ps.map((p) => {
        const here = p.assignments.find((a) => a.endAt === null);
        const l = p.location;
        return [p.battery.label, `${p.family.chemistry}, ${p.family.unitType}`, String(p.family.ratedVoltageV), String(p.family.ratedCapacityAh), day(p.battery.manufacturedOn), here ? day(here.startAt) : NOT_RECORDED,
          l.siteName ? `${l.siteName} / ${l.bankName} / ${l.stringName} / position ${l.position}` : p.battery.physicalLocation];
      }) },
    ],
    notes: ['“Manufactured” is shown only where the record holds a date. Age is not estimated from anything else.'],
    missing: ps.some((p) => !p.battery.manufacturedOn) ? [`Manufacture date for ${plural(ps.filter((p) => !p.battery.manufacturedOn).length, 'battery', 'batteries')}`] : [],
    frameworkArea: area('inventory'),
  });

  // 3. Operations
  const alerts = ps.flatMap((p) => p.alerts.filter((a) => a.source.kind !== 'model').map((a) => ({ ...a, label: p.battery.label })));
  const raised = alerts.filter((a) => inPeriod(a.createdAt));
  const service = ps.flatMap((p) => buildTimeline(p).filter((i) => i.kind === 'service' && inPeriod(i.at)));
  const testsInPeriod = ps.flatMap((p) => p.tests.filter((t) => t.status === 'approved' && t.level === 'battery' && inPeriod(t.reviewedAt ?? t.startedAt)));
  const replacementUnits = ps.filter((p) => p.battery.replacesBatteryId);
  sections.push({
    id: 'operations', heading: 'Operational performance', status: 'partial', basis: 'Test results are measured. Percentages are calculated. Sensor readings are simulated in this build.',
    tables: [
      { title: 'Coverage', columns: ['Measure', 'Value'], rows: [
        ['Batteries with an approved test in the last 365 days', `${cov.testsCurrent} of ${ps.length}`],
        ['Batteries with a sensor attributed (simulated)', `${cov.withSensor} of ${ps.length}`],
        ['Of those, with a current reading', `${cov.freshReadings} of ${cov.withSensor}`],
        ['Newest record change or reading', cov.lastUpdated ? day(cov.lastUpdated) : NOT_RECORDED],
      ] },
      { title: 'Activity in the period', columns: ['Measure', 'Value'], rows: [
        ['Approved battery tests', String(testsInPeriod.length)],
        ['Service events recorded', String(service.length)],
        ['Alerts raised by rules', String(raised.length)],
        ['Of which critical', String(raised.filter((a) => a.severity === 'critical').length)],
        ['Replacement batteries recorded', String(replacementUnits.length)],
        ['Failures and outages', NOT_RECORDED],
      ] },
      { title: 'Each battery', columns: ['Battery', 'Condition', 'Last approved test', 'Capacity vs rating (calculated, %)', 'Last reading (simulated)', 'Open alerts'], rows: ps.map((p) => {
        const t = p.lastApprovedTest;
        const pct = t && t.result.capacityAh !== null ? String(Math.round((t.result.capacityAh / p.family.ratedCapacityAh) * 100)) : 'Baseline being established';
        return [p.battery.label, STATUS_LABELS[p.status.status], t ? day(t.reviewedAt ?? t.startedAt) : 'None approved', pct, p.telemetry.available ? day(p.telemetry.lastReadingAt) : 'No sensor',
          String(p.alerts.filter((a) => a.source.kind !== 'model' && ACTIVE_ALERT.includes(a.state)).length)];
      }) },
    ],
    notes: ['Capacity against rating compares one test with the rating. It is not a health score or a forecast.'],
    missing: ['Outage and failure log with start, end and cause', 'Continuous readings from real sensors (this build has none connected)'],
    frameworkArea: area('operations'),
  });

  // 4. Lifecycle and circularity
  const count = (states: LifecycleState[]) => ps.filter((p) => states.includes(p.battery.lifecycleState)).length;
  const serviceApproved = ps.filter((p) => p.events.some((e) => e.type === 'restoration' && e.approvalState === 'approved') && [...IN_SERVICE, ...AVAILABLE].includes(p.battery.lifecycleState));
  const replaced = new Set(ps.map((p) => p.battery.replacesBatteryId).filter((x): x is string => !!x));
  const recycling = ps.filter((p) => p.recycling);
  const massRecorded = recycling.filter((p) => p.recycling!.massKg !== null);
  const totalMass = massRecorded.reduce((n, p) => n + p.recycling!.massKg!, 0);
  sections.push({
    id: 'lifecycle', heading: 'Lifecycle and circularity', status: ps.length ? 'partial' : 'not_recorded', basis: 'Counts of recorded lifecycle states. Mass is the consigned mass on the recycler record.',
    tables: [
      { title: 'Where batteries are', columns: ['Outcome', 'Batteries'], rows: [
        ['In service', String(count(IN_SERVICE))],
        ['Available (qualified or reserved)', String(count(AVAILABLE))],
        ['Of which restored with engineer approval and in use or available', String(serviceApproved.length)],
        ['Replaced by another battery', String([...replaced].filter((id) => ps.some((p) => p.battery.id === id)).length)],
        ['Awaiting disposition (returned, rejected or queued for recycling)', String(count(DISPOSITION))],
        ['Recycled', String(count(['recycled']))],
        ['In testing or work', String(ps.length - count([...IN_SERVICE, ...AVAILABLE, ...DISPOSITION, 'recycled']))],
      ] },
      { title: 'Recycling records', columns: ['Battery', 'State', 'Recycler', 'Consignment', 'Consigned mass (kg)', 'Recycler certificate'], rows: recycling.map((p) => {
        const r = p.recycling!;
        return [p.battery.label, r.state, r.recyclerName || NOT_RECORDED, r.consignmentRef ?? NOT_RECORDED, r.massKg === null ? NOT_RECORDED : String(r.massKg), r.certificateState === 'received' ? `Received${r.certificateRef ? ` (${r.certificateRef})` : ''}` : 'Not received'];
      }) },
      { title: 'Totals', columns: ['Measure', 'Value'], rows: [
        ['Consigned mass recorded', massRecorded.length ? `${Math.round(totalMass * 10) / 10} kg across ${plural(massRecorded.length, 'battery', 'batteries')}` : NOT_RECORDED],
        ['Recovered material by type (kg)', NOT_RECORDED],
        ['Recycler certificates received', `${recycling.filter((p) => p.recycling!.certificateState === 'received').length} of ${recycling.length}`],
      ] },
    ],
    notes: ['Consigned mass is what was handed to the recycler. It is not the weight of material recovered.', 'Restored and reused counts include only batteries whose restoration an engineer approved.'],
    missing: ['Recovered material weights by type, from the recycler’s document', ...(recycling.some((p) => p.recycling!.certificateState !== 'received') ? ['Recycler certificates not yet received'] : [])],
    frameworkArea: area('lifecycle'),
  });

  // 5. Energy and emissions activity data
  sections.push({
    id: 'energy', heading: 'Energy and emissions activity data', status: 'not_recorded', basis: 'Nothing here is measured or calculated: the records hold no energy, transport or emission-factor inputs.',
    tables: [{ columns: ['Item', 'Value', 'What it needs'], rows: [
      ['Charging energy (kWh)', NOT_RECORDED, 'Metered energy per battery, string or batch'],
      ['Processing energy (kWh)', NOT_RECORDED, 'Metered energy for testing and service, per battery or batch'],
      ['Transport (distance, mass, mode)', NOT_RECORDED, 'Each leg with mode, distance and mass'],
      ['Emission factor', 'None selected', 'A named factor with source, version and year'],
      ['Emissions estimate', 'Not calculated', 'Activity data, a factor and a stated calculation boundary'],
      ['Avoided-manufacturing estimate', 'Not calculated', 'A comparison baseline and a lifecycle boundary, agreed with the customer'],
    ] }],
    notes: ['No emissions figure of any kind is shown. An estimate would need the inputs on the right and an agreed method.'],
    missing: ['Metered charging and processing energy', 'Transport legs', 'Emission factors with source and version', 'An agreed calculation boundary and method'],
    frameworkArea: area('energy'),
  });

  // 6. Social and safety
  const tempAlerts = raised.filter((a) => a.type === 'temperature_threshold');
  sections.push({
    id: 'social', heading: 'Social and safety information', status: tempAlerts.length ? 'partial' : 'not_recorded', basis: 'Aggregated counts only. No personal information is held or shown.',
    tables: [{ columns: ['Item', 'Value'], rows: [
      ['Temperature-limit alerts raised by rule in the period', String(tempAlerts.length)],
      ['Safety checks recorded', NOT_RECORDED],
      ['Incidents recorded', NOT_RECORDED],
    ] }],
    notes: ['A temperature alert is a rule firing on a reading. It is not an incident record.'],
    missing: ['An aggregated safety-check and incident register'],
    frameworkArea: area('social'),
  });

  // 7. Governance and evidence
  const files = ps.flatMap((p) => customerEvidence(p.evidence).map((f) => ({ ...f, label: p.battery.label })));
  const calibrations = [...new Set(ps.flatMap((p) => p.tests.filter((t) => t.status === 'approved').map((t) => t.calibrationRef)).filter(Boolean))];
  const corrections = ps.flatMap((p) => p.events.filter((e) => e.type === 'identity' && e.correction));
  const noTest = ps.filter((p) => !p.lastApprovedTest);
  sections.push({
    id: 'governance', heading: 'Governance and evidence', status: 'partial', basis: 'How the data was produced, who approved it, and what is missing.',
    tables: [
      { columns: ['Item', 'Value'], rows: [
        ['Source of records', 'Synthetic demonstration fixtures'],
        ['Status rule', `${STATUS_RULE.name} ${STATUS_RULE.version}${STATUS_RULE.placeholder ? ' (placeholder thresholds)' : ''}`],
        ['Battery tests approved by an authorised engineer', String(ps.reduce((n, p) => n + p.tests.filter((t) => t.status === 'approved' && t.level === 'battery').length, 0))],
        ['Instrument calibration references on approved tests', calibrations.length ? calibrations.join('; ') : NOT_RECORDED],
        ['Customer-visible evidence files', String(files.length)],
        ['Corrections to identity records', String(corrections.length)],
        ['Batteries with no approved test', noTest.length ? noTest.map((p) => p.battery.label).join(', ') : 'None'],
      ] },
      { title: 'Evidence files', columns: ['Battery', 'File', 'Kind', 'Uploaded', 'SHA-256 (first 16)'], rows: files.map((f) => [f.label, f.fileName, f.kind.replace(/_/g, ' '), day(f.uploadedAt), f.checksum.slice(0, 16)]) },
    ],
    notes: ['Internal evidence, process records and costs are not part of this report.'],
    missing: noTest.length ? [`Approved capacity test for ${plural(noTest.length, 'battery', 'batteries')}`] : [],
    frameworkArea: area('governance'),
  });

  return {
    title: `${input.customerName}: battery operations and ESG data report`, customerName: input.customerName, siteNames: input.siteNames, period, generatedAt: input.generatedAt,
    snapshotAt: input.snapshotAt, framework: { id: fw.id, name: fw.name }, batteryCount: ps.length, sections, limitations: REPORT_LIMITATIONS,
  };
}

/* ------------------------------ Export ------------------------------ */

const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const line = (cells: string[]) => cells.map(esc).join(',');

export function reportToCsv(r: CustomerReport): string {
  const out: string[] = [line([r.title]), line(['Period', `${r.period.from} to ${r.period.to}`]), line(['Generated', day(r.generatedAt)]), line(['Framework', r.framework.name]), line(['Label', 'Synthetic demonstration data. Not a compliance certificate.']), ''];
  for (const s of r.sections) {
    out.push(line([s.heading]), line(['Status', s.status.replace('_', ' ')]), line(['Basis', s.basis]));
    if (s.frameworkArea) out.push(line(['Candidate disclosure area (confirm)', s.frameworkArea]));
    for (const t of s.tables) {
      if (t.title) out.push(line([t.title]));
      out.push(line(t.columns), ...t.rows.map(line));
    }
    s.notes.forEach((n) => out.push(line(['Note', n])));
    s.missing.forEach((m) => out.push(line(['Missing input', m])));
    out.push('');
  }
  out.push(line(['Limitations']), ...r.limitations.map((l) => line([l])));
  return out.join('\n');
}

/** One battery's customer-safe record as CSV: identity, indicators with their basis, and history. */
export function batteryRecordCsv(p: BatteryPassport, rows: { label: string; value: string; basis: string; scope: string; at: string; source: string; freshness: string }[], history: { at: string; title: string; detail: string }[]): string {
  return [
    line([`Battery record ${p.battery.label}`, 'Synthetic demonstration data']),
    line(['Indicator', 'Value', 'Basis', 'Scope', 'Measured at', 'Source', 'Freshness']),
    ...rows.map((r) => line([r.label, r.value, r.basis, r.scope, r.at, r.source, r.freshness])),
    '',
    line(['Date', 'Event', 'Detail']),
    ...history.map((h) => line([h.at, h.title, h.detail])),
  ].join('\n');
}

/* ------------------------------ Value summary ------------------------------ */

export interface ValueLine { label: string; value: string; detail: string }

/** What the product shows this customer, from the same records. Counts, not savings. */
export function valueSummary(ps: BatteryPassport[], now: string): ValueLine[] {
  const cov = computeCoverage(ps, now);
  const events = ps.reduce((n, p) => n + buildTimeline(p).length, 0);
  const needAction = ps.filter((p) => p.status.status === 'attention' || p.status.status === 'watching');
  const replacementCandidates = ps.filter((p) => p.status.status === 'attention' && p.battery.lifecycleState === 'deployed');
  return [
    { label: 'Fleet visibility', value: `${cov.inFleet} batteries with a status`, detail: `${cov.byStatus.good} good, ${cov.byStatus.watching} watching, ${cov.byStatus.attention} need attention, ${cov.byStatus.baseline} establishing a baseline.` },
    { label: 'Traceable history', value: `${events} recorded events`, detail: `Across ${plural(ps.length, 'battery', 'batteries')}, each with its own timeline and evidence.` },
    { label: 'Planned maintenance', value: `${needAction.length} to plan`, detail: 'Batteries watched or needing attention, each with a next step from the same record.' },
    { label: 'Replacement planning', value: `${replacementCandidates.length} candidates`, detail: 'Installed batteries below the capacity threshold at their last approved test. A person decides.' },
    { label: 'Evidence for paperwork', value: `${cov.withCustomerEvidence} batteries with files`, detail: 'Customer-visible test reports and certificates, each with a checksum, ready to attach to internal or ESG records.' },
  ];
}

export interface Scenario { batteries: number; priceAed: number; deferredPct: number }
/** A what-if, never a result. The assumptions are the customer’s and are always shown beside the answer. */
export function scenarioValueAed(s: Scenario): number {
  if (![s.batteries, s.priceAed, s.deferredPct].every(Number.isFinite) || s.batteries < 0 || s.priceAed < 0) return 0;
  return Math.round(s.batteries * s.priceAed * (Math.min(Math.max(s.deferredPct, 0), 100) / 100));
}
