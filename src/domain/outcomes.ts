import type { RestorationAttempt, RestorationReasonCode, TestReviewReasonCode } from './types';

/**
 * Reason codes for engineering decisions that do not approve: a test rejected or sent back, and a
 * restoration attempt rejected or sent to rework. The written reason is still required. The code
 * is what reports can count and what a model can learn from (docs/ML_PLAN.md): "not qualified"
 * only becomes a usable label once it says why.
 *
 * PLACEHOLDER LISTS. Synovra engineering owns the final codes. Adding a code is safe; renaming or
 * removing one is a data-contract change, because decided records keep the code they were given.
 */
export const RESTORATION_REASON_LABELS: Record<RestorationReasonCode, string> = {
  below_capacity_threshold: 'Capacity below threshold',
  high_internal_resistance: 'Internal resistance too high',
  physical_damage: 'Physical damage found',
  failed_inspection: 'Failed visual or safety inspection',
  after_test_not_valid: 'After-test not usable as evidence',
  other: 'Other (explain in the reason)',
};

export const TEST_REVIEW_REASON_LABELS: Record<TestReviewReasonCode, string> = {
  conditions_out_of_protocol: 'Conditions outside the protocol',
  instrument_or_calibration: 'Instrument or calibration problem',
  evidence_missing: 'Evidence missing or unreadable',
  data_entry_error: 'Values entered incorrectly',
  implausible_result: 'Result implausible for this battery',
  other: 'Other (explain in the reason)',
};

/**
 * Rework and rejection decisions counted by reason code, most frequent first. Earlier attempts of a
 * battery that later qualified still count: each decision is an outcome of one attempt.
 */
export function notQualifiedReasons(attempts: RestorationAttempt[]): { code: RestorationReasonCode | null; label: string; count: number }[] {
  const byCode = new Map<RestorationReasonCode | null, number>();
  attempts.filter((a) => a.status === 'rework' || a.status === 'rejected')
    .forEach((a) => byCode.set(a.decisionReasonCode, (byCode.get(a.decisionReasonCode) ?? 0) + 1));
  return [...byCode.entries()]
    .map(([code, count]) => ({ code, label: code ? RESTORATION_REASON_LABELS[code] : 'No reason code (decided before codes existed)', count }))
    .sort((x, y) => y.count - x.count || x.label.localeCompare(y.label));
}

/** Options for a select control, in the order above. */
export const codeOptions = <K extends string>(labels: Record<K, string>) =>
  (Object.entries(labels) as [K, string][]).map(([value, label]) => ({ value, label }));
