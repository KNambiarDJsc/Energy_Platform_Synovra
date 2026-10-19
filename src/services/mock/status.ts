import type { QualityIndex } from '@/domain/lifecycle';
import { assessStatus, type StatusAssessment } from '@/domain/status';
import type { Battery } from '@/domain/types';
import { byBattery, db, familyOf, lastApprovedTest, pctOfRated, qualityOf, type Ctx } from '../core';
import { ACTIVE_ALERT_STATES } from './alerts';
import { telemetrySummaryFor } from './telemetry';

/**
 * A battery's status from what is on record: its last approved test, its sensor (if one is attributed), its open
 * alerts and its identity. The same function serves the list, the passport and the home screen, so all three
 * always agree. Alerts raised by a model are left out for everyone: shadow-mode output may be reviewed, but it
 * never changes a battery's status.
 */
export function statusFor(ctx: Ctx, b: Battery, index?: QualityIndex): StatusAssessment {
  const d = db(ctx);
  const test = lastApprovedTest(d, b.id);
  const tests = byBattery(d.tests).get(b.id) ?? [];
  const pendingTest = tests.some((t) => (t.status === 'submitted' || t.status === 'under_review') && (!test || t.startedAt > test.startedAt));
  const tel = telemetrySummaryFor(ctx, b);
  const openAlerts = (byBattery(d.alerts).get(b.id) ?? [])
    .filter((a) => ACTIVE_ALERT_STATES.includes(a.state) && a.source.kind !== 'model')
    .map((a) => ({ severity: a.severity, title: a.title, recommendedAction: a.recommendedAction }));
  return assessStatus({
    lifecycleState: b.lifecycleState,
    lastTest: test ? { pctOfRated: pctOfRated(test.result.capacityAh, familyOf(ctx, b).ratedCapacityAh), at: test.reviewedAt ?? test.startedAt } : null,
    pendingTest,
    telemetry: tel.available ? { freshness: tel.freshness === 'stale' ? 'stale' : 'fresh', temperatureC: tel.temperatureC, lastReadingAt: tel.lastReadingAt } : null,
    openAlerts,
    qualityLevel: qualityOf(ctx, b, index).level,
    now: ctx.store.snapshotAt,
  });
}
