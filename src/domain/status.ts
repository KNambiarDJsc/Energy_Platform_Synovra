import { NEXT_STEP_BY_STATE } from './lifecycle';
import { TEMPERATURE_RULE } from './limits';
import type { DataQualityLevel, LifecycleState, Severity } from './types';

/**
 * What kind of number a value is. Every figure the customer sees carries one, so a measurement, a sum, a model's
 * estimate and a forecast never look alike. "Controlled" means connected hardware changed something; nothing in
 * this platform controls equipment, so no value is ever controlled.
 */
export type DataKind = 'measured' | 'calculated' | 'modelled' | 'predicted' | 'controlled' | 'rule';

export const DATA_KIND_LABELS: Record<DataKind, { label: string; meaning: string }> = {
  measured: { label: 'Measured', meaning: 'A sensor reading or a test result.' },
  calculated: { label: 'Calculated', meaning: 'Arithmetic on measurements, such as a percentage of rated capacity.' },
  modelled: { label: 'Modelled', meaning: 'Estimated from several signals by a model. None is validated yet.' },
  predicted: { label: 'Predicted', meaning: 'A forecast of what may happen. None is validated yet.' },
  controlled: { label: 'Controlled', meaning: 'Equipment acted. Nothing here controls equipment.' },
  rule: { label: 'Rule', meaning: 'A fixed, versioned rule applied to the values above.' },
};

/**
 * The customer's three words for how a battery is doing, plus the honest fourth: there is not enough evidence yet.
 * A status is the result of fixed rules over recorded evidence. It is never a health score and never a model output.
 */
export type BatteryStatus = 'good' | 'watching' | 'attention' | 'baseline' | 'retired';

export const STATUS_LABELS: Record<BatteryStatus, string> = {
  good: 'Good',
  watching: 'Watching',
  attention: 'Needs attention',
  baseline: 'Baseline being established',
  retired: 'Out of service',
};

/** Rule thresholds are placeholders until engineering sets real ones; the version travels with every status. */
export const STATUS_RULE = {
  name: 'battery-status',
  version: '0.1.0',
  placeholder: true,
  /** Below this percentage of rated capacity at the last approved test, the battery needs attention. Kept equal to the
   * demonstration qualification threshold (src/data/seed.ts); a unit test holds them together. */
  capacityThresholdPct: 85,
  /** A last approved test older than this is watched: the evidence is getting old. */
  staleTestDays: 365,
} as const;

export type FactorState = 'ok' | 'watch' | 'attention' | 'unknown';
export interface StatusFactor {
  key: 'capacity' | 'temperature' | 'connection' | 'alerts' | 'identity' | 'lifecycle';
  label: string;
  state: FactorState;
  /** One short line: what was found, in plain words. */
  detail: string;
  kind: DataKind;
}

export interface StatusAssessment {
  status: BatteryStatus;
  /** The single line to show beside the status. */
  headline: string;
  factors: StatusFactor[];
  /** What a person should do next, from the same evidence. Every screen shows this one, so none contradicts another. */
  nextStep: string;
  /** Lower is more urgent: orders lists of batteries that need attention. */
  urgency: number;
  rule: { name: string; version: string; placeholder: boolean };
}

export interface StatusInput {
  lifecycleState: LifecycleState;
  /** The last approved battery-level capacity test, as a percentage of rated. */
  lastTest: { pctOfRated: number | null; at: string } | null;
  /** A newer test waiting for an engineer. It does not count, but it explains a baseline. */
  pendingTest: boolean;
  /** Null when no sensor is attributed to the battery. */
  telemetry: { freshness: 'fresh' | 'stale'; temperatureC: number | null; lastReadingAt: string | null } | null;
  openAlerts: { severity: Severity; title: string; recommendedAction?: string }[];
  qualityLevel: DataQualityLevel;
  /** The time the evidence is judged against (the snapshot time in the demo). */
  now: string;
}

const RETIRED: LifecycleState[] = ['rejected', 'recycling_queue', 'recycled'];
const DAY = 86_400_000;
const RANK: Record<FactorState, number> = { attention: 3, watch: 2, unknown: 1, ok: 0 };

/** Applies the status rule. Pure: the same evidence always gives the same status. */
export function assessStatus(input: StatusInput): StatusAssessment {
  const rule = { name: STATUS_RULE.name, version: STATUS_RULE.version, placeholder: STATUS_RULE.placeholder };
  const factors: StatusFactor[] = [];

  // Capacity: the measured evidence of what the battery can deliver.
  const t = input.lastTest;
  if (!t || t.pctOfRated === null) {
    factors.push({
      key: 'capacity', label: 'Capacity', state: 'unknown', kind: 'measured',
      detail: input.pendingTest ? 'A test is waiting for an engineer’s review.' : 'No approved capacity test yet.',
    });
  } else {
    const ageDays = Math.floor((Date.parse(input.now) - Date.parse(t.at)) / DAY);
    const pct = Math.round(t.pctOfRated);
    if (t.pctOfRated < STATUS_RULE.capacityThresholdPct) {
      factors.push({ key: 'capacity', label: 'Capacity', state: 'attention', kind: 'calculated', detail: `${pct}% of rated at the last approved test, below ${STATUS_RULE.capacityThresholdPct}%.` });
    } else if (ageDays > STATUS_RULE.staleTestDays) {
      factors.push({ key: 'capacity', label: 'Capacity', state: 'watch', kind: 'calculated', detail: `${pct}% of rated, but the test is ${ageDays} days old.` });
    } else {
      factors.push({ key: 'capacity', label: 'Capacity', state: 'ok', kind: 'calculated', detail: `${pct}% of rated at the last approved test.` });
    }
  }

  // Temperature and connection: only where a sensor is attributed. No sensor is unknown, never normal.
  const tel = input.telemetry;
  if (tel) {
    const c = tel.temperatureC;
    if (c === null) {
      factors.push({ key: 'temperature', label: 'Temperature', state: 'unknown', kind: 'measured', detail: 'The sensor reports no temperature.' });
    } else if (c > TEMPERATURE_RULE.limitC) {
      factors.push({ key: 'temperature', label: 'Temperature', state: 'attention', kind: 'measured', detail: `${c.toFixed(1)} °C, above the ${TEMPERATURE_RULE.limitC} °C limit.` });
    } else if (c > TEMPERATURE_RULE.watchC) {
      factors.push({ key: 'temperature', label: 'Temperature', state: 'watch', kind: 'measured', detail: `${c.toFixed(1)} °C, above the preferred ${TEMPERATURE_RULE.watchC} °C.` });
    } else {
      factors.push({ key: 'temperature', label: 'Temperature', state: 'ok', kind: 'measured', detail: `${c.toFixed(1)} °C, within the preferred range.` });
    }
    if (tel.freshness === 'stale') {
      const hours = tel.lastReadingAt ? Math.round((Date.parse(input.now) - Date.parse(tel.lastReadingAt)) / 3_600_000) : null;
      factors.push({ key: 'connection', label: 'Connection', state: 'watch', kind: 'measured', detail: hours === null ? 'No recent reading.' : `Last reading ${hours} h ago. Values are not current.` });
    } else {
      factors.push({ key: 'connection', label: 'Connection', state: 'ok', kind: 'measured', detail: 'Reporting on schedule.' });
    }
  }

  // Open alerts were raised by their own versioned rules.
  const worst = input.openAlerts.reduce<Severity | null>((w, a) => (w === 'critical' || a.severity === 'critical' ? 'critical' : w === 'warning' || a.severity === 'warning' ? 'warning' : 'info'), null);
  if (worst) {
    const first = input.openAlerts.find((a) => a.severity === worst)!;
    const n = input.openAlerts.length;
    factors.push({
      key: 'alerts', label: 'Alerts', state: worst === 'info' ? 'watch' : 'attention', kind: 'rule',
      detail: n === 1 ? `Open: ${first.title.toLowerCase()}.` : `${n} open, including ${first.title.toLowerCase()}.`,
    });
  }

  if (input.qualityLevel === 'conflict') {
    factors.push({ key: 'identity', label: 'Identity', state: 'attention', kind: 'rule', detail: 'Another record shares its serial or alias.' });
  }
  if (input.lifecycleState === 'returned') {
    factors.push({ key: 'lifecycle', label: 'Service', state: 'attention', kind: 'rule', detail: 'Returned from service. Test again before any reuse.' });
  }

  const ordered = [...factors].sort((a, b) => RANK[b.state] - RANK[a.state]);
  const state = (key: StatusFactor['key']) => factors.find((f) => f.key === key)?.state;
  const alertOf = (s: Severity) => input.openAlerts.find((a) => a.severity === s);
  const urgent = alertOf('critical') ?? alertOf('warning');
  const deployed = input.lifecycleState === 'deployed';

  // Urgency: what could hurt someone or the battery first, paperwork last.
  const urgency = alertOf('critical') ? 0 : state('temperature') === 'attention' ? 1 : state('capacity') === 'attention' ? 2
    : alertOf('warning') ? 3 : input.lifecycleState === 'returned' ? 4 : input.qualityLevel === 'conflict' ? 5 : 9;

  const nextStep = (() => {
    if (RETIRED.includes(input.lifecycleState)) return NEXT_STEP_BY_STATE[input.lifecycleState];
    if (urgent) return urgent.recommendedAction || `Review the open alert: ${urgent.title.toLowerCase()}.`;
    if (state('temperature') === 'attention') return 'Check the battery’s temperature and ventilation on site.';
    if (input.qualityLevel === 'conflict') return 'Resolve the identity conflict first.';
    if (deployed && state('capacity') === 'attention') return 'Plan a capacity retest with engineering.';
    if (deployed && state('connection') === 'watch') return 'Readings are not current. Check the site gateway.';
    const info = alertOf('info');
    if (info) return info.recommendedAction || `Review the open alert: ${info.title.toLowerCase()}.`;
    if (deployed && state('capacity') === 'watch') return 'Schedule a fresh capacity test.';
    return NEXT_STEP_BY_STATE[input.lifecycleState];
  })();

  const result = (status: BatteryStatus, headline: string): StatusAssessment => ({ status, headline, factors: ordered, nextStep, urgency, rule });
  if (RETIRED.includes(input.lifecycleState)) return result('retired', 'Out of service. Its record stays.');
  const top = ordered[0];
  const capacityUnknown = state('capacity') === 'unknown';
  if (top?.state === 'attention') return result('attention', top.detail);
  if (capacityUnknown) return result('baseline', 'Baseline being established.');
  if (top?.state === 'watch') return result('watching', top.detail);
  return result('good', 'Every recorded check is within range.');
}
