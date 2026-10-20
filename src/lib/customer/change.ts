import type { BatteryPassport } from '@/services/types';

/* ------------------------------ What changed ------------------------------ */

export interface ChangeRow { label: string; before: string; after: string; direction: 'up' | 'down' | 'same' | 'unknown' }
export interface Change {
  /** What separates the two tests: service work an engineer approved, or simply time. */
  between: 'service' | 'time';
  beforeAt: string;
  afterAt: string;
  rows: ChangeRow[];
  note: string;
}

const dir = (a: number | null, b: number | null): ChangeRow['direction'] => (a === null || b === null ? 'unknown' : b > a ? 'up' : b < a ? 'down' : 'same');
const fmt = (n: number | null, unit: string) => (n === null ? 'Not recorded' : `${Math.round(n * 10) / 10} ${unit}`.trim());

/**
 * The last two approved battery-level tests side by side. Temperature is shown against the room it was taken in:
 * a battery that reads 4 °C cooler in a room that is 6 °C cooler has not improved. Null when there are fewer than
 * two approved tests, so no change is implied from one reading.
 */
export function buildChange(p: BatteryPassport): Change | null {
  const approved = p.tests.filter((t) => t.status === 'approved' && t.level === 'battery' && t.result.capacityAh !== null)
    .sort((a, b) => (a.reviewedAt ?? a.startedAt).localeCompare(b.reviewedAt ?? b.startedAt));
  if (approved.length < 2) return null;
  const before = approved.at(-2)!;
  const after = approved.at(-1)!;
  const beforeAt = before.reviewedAt ?? before.startedAt;
  const afterAt = after.reviewedAt ?? after.startedAt;
  const service = p.events.some((e) => e.type === 'restoration' && e.approvalState === 'approved' && e.occurredAt >= beforeAt && e.occurredAt <= afterAt);
  const rated = p.family.ratedCapacityAh;
  const bC = before.result.capacityAh!;
  const aC = after.result.capacityAh!;
  const over = (t: typeof before) => (t.result.temperatureC !== null && t.conditions.ambientTempC !== null ? t.result.temperatureC - t.conditions.ambientTempC : null);
  const bo = over(before);
  const ao = over(after);
  const signed = (n: number | null) => (n === null ? 'Not recorded' : `${n >= 0 ? '+' : ''}${Math.round(n * 10) / 10} °C`);
  const rows: ChangeRow[] = [
    { label: 'Capacity', before: `${fmt(bC, 'Ah')} (${Math.round((bC / rated) * 100)}% of rated)`, after: `${fmt(aC, 'Ah')} (${Math.round((aC / rated) * 100)}% of rated)`, direction: dir(bC, aC) },
    { label: 'Internal resistance', before: fmt(before.result.internalResistanceMOhm, 'mΩ'), after: fmt(after.result.internalResistanceMOhm, 'mΩ'), direction: dir(before.result.internalResistanceMOhm, after.result.internalResistanceMOhm) },
    { label: 'Battery temperature', before: fmt(before.result.temperatureC, '°C'), after: fmt(after.result.temperatureC, '°C'), direction: dir(before.result.temperatureC, after.result.temperatureC) },
    { label: 'Room temperature', before: fmt(before.conditions.ambientTempC, '°C'), after: fmt(after.conditions.ambientTempC, '°C'), direction: dir(before.conditions.ambientTempC, after.conditions.ambientTempC) },
    { label: 'Battery above room', before: signed(bo), after: signed(ao), direction: dir(bo, ao) },
  ];
  return {
    between: service ? 'service' : 'time', beforeAt, afterAt, rows,
    note: `Based on two approved tests${service ? ' with engineer-approved service work between them' : ''}. A difference between two tests is a measured change, not proof of its cause.`,
  };
}

/* ------------------------------ Outlook ------------------------------ */

/**
 * When replacement is likely. No validated forecast exists, so there is never a window: only what is known and what
 * would be needed. Confidence is none, and says why.
 */
export interface Outlook { window: null; confidence: 'none'; reason: string; basedOn: string[] }

export function buildOutlook(p: BatteryPassport): Outlook {
  const tests = p.tests.filter((t) => t.status === 'approved' && t.level === 'battery').length;
  return {
    window: null,
    confidence: 'none',
    reason: 'No forecast model has been validated against real outcomes, so no replacement window is shown. When one exists it will show a range with its confidence.',
    basedOn: [
      tests === 0 ? 'No approved capacity test yet' : `${tests} approved capacity ${tests === 1 ? 'test' : 'tests'} on record`,
      p.telemetry.available ? 'A simulated sensor in this demonstration' : 'No sensor attributed',
    ],
  };
}
