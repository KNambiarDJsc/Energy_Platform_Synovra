import { describe, expect, it } from 'vitest';
import { QUALIFICATION_THRESHOLD_PCT } from '@/data/seed';
import { TEMPERATURE_RULE } from '@/domain/limits';
import { assessStatus, STATUS_RULE, type StatusInput } from '@/domain/status';
import { harness, USERS } from './helpers';

const NOW = '2026-10-13T05:00:00.000Z';
const base: StatusInput = {
  lifecycleState: 'deployed',
  lastTest: { pctOfRated: 92, at: '2026-09-01T00:00:00.000Z' },
  pendingTest: false,
  telemetry: { freshness: 'fresh', temperatureC: 26, lastReadingAt: '2026-10-13T04:45:00.000Z' },
  openAlerts: [],
  qualityLevel: 'complete',
  now: NOW,
};

describe('status rule', () => {
  it('uses the same capacity threshold as the demonstration qualification criterion', () => {
    expect(STATUS_RULE.capacityThresholdPct).toBe(QUALIFICATION_THRESHOLD_PCT);
  });

  it('is good only when every recorded check is within range', () => {
    const s = assessStatus(base);
    expect(s.status).toBe('good');
    expect(s.factors.map((f) => f.state)).toEqual(['ok', 'ok', 'ok']);
  });

  it('never invents a number: with no approved test the status is a baseline, not a score', () => {
    const s = assessStatus({ ...base, lifecycleState: 'received', lastTest: null, telemetry: null });
    expect(s.status).toBe('baseline');
    expect(s.headline).toBe('Baseline being established.');
    expect(JSON.stringify(s)).not.toMatch(/score|health \d/i);
    expect(assessStatus({ ...base, lastTest: null, pendingTest: true }).factors[0].detail).toMatch(/waiting for an engineer/);
  });

  it('needs attention below the capacity threshold, above the temperature limit, on a warning alert, a conflict or a return', () => {
    expect(assessStatus({ ...base, lastTest: { pctOfRated: 60, at: base.lastTest!.at } }).status).toBe('attention');
    expect(assessStatus({ ...base, telemetry: { ...base.telemetry!, temperatureC: TEMPERATURE_RULE.limitC + 0.5 } }).status).toBe('attention');
    expect(assessStatus({ ...base, openAlerts: [{ severity: 'warning', title: 'Float voltage low' }] }).status).toBe('attention');
    expect(assessStatus({ ...base, qualityLevel: 'conflict' }).status).toBe('attention');
    expect(assessStatus({ ...base, lifecycleState: 'returned' }).status).toBe('attention');
  });

  it('watches warm, stale, old or informational evidence', () => {
    expect(assessStatus({ ...base, telemetry: { ...base.telemetry!, temperatureC: TEMPERATURE_RULE.watchC + 1 } }).status).toBe('watching');
    expect(assessStatus({ ...base, telemetry: { ...base.telemetry!, freshness: 'stale', lastReadingAt: '2026-10-12T14:00:00.000Z' } }).headline).toMatch(/15 h ago/);
    expect(assessStatus({ ...base, lastTest: { pctOfRated: 92, at: '2025-01-01T00:00:00.000Z' } }).status).toBe('watching');
    expect(assessStatus({ ...base, openAlerts: [{ severity: 'info', title: 'Warranty ending' }] }).status).toBe('watching');
  });

  it('treats a missing sensor as unknown, never as normal, without inventing a problem', () => {
    const s = assessStatus({ ...base, telemetry: null });
    expect(s.status).toBe('good');
    expect(s.factors.some((f) => f.key === 'temperature')).toBe(false);
    expect(assessStatus({ ...base, telemetry: { ...base.telemetry!, temperatureC: null } }).factors.find((f) => f.key === 'temperature')!.state).toBe('unknown');
  });

  it('keeps out-of-service batteries on record but out of the fleet status', () => {
    for (const state of ['rejected', 'recycling_queue', 'recycled'] as const) expect(assessStatus({ ...base, lifecycleState: state }).status).toBe('retired');
  });

  it('labels every factor with the kind of number behind it, and the most serious factor comes first', () => {
    const s = assessStatus({ ...base, telemetry: { ...base.telemetry!, temperatureC: 31 }, openAlerts: [{ severity: 'critical', title: 'Cell temperature above limit' }] });
    expect(s.factors[0].key).toBe('alerts');
    for (const f of s.factors) expect(['measured', 'calculated', 'rule']).toContain(f.kind);
    expect(s.rule).toEqual({ name: 'battery-status', version: STATUS_RULE.version, placeholder: true });
  });
});

describe('next step', () => {
  it('follows the evidence: an urgent alert, a hot battery, a conflict, stale readings', () => {
    expect(assessStatus({ ...base, openAlerts: [{ severity: 'critical', title: 'Cell temperature above limit', recommendedAction: 'Inspect ventilation.' }] }).nextStep).toBe('Inspect ventilation.');
    expect(assessStatus({ ...base, telemetry: { ...base.telemetry!, temperatureC: TEMPERATURE_RULE.limitC + 2 } }).nextStep).toMatch(/temperature/);
    expect(assessStatus({ ...base, qualityLevel: 'conflict' }).nextStep).toBe('Resolve the identity conflict first.');
    expect(assessStatus({ ...base, telemetry: { ...base.telemetry!, freshness: 'stale' } }).nextStep).toMatch(/gateway/);
    expect(assessStatus({ ...base, lifecycleState: 'recycled' }).nextStep).toBe('Closed. Nothing more to do.');
  });

  it('orders urgency: a critical alert before a temperature problem before low capacity before paperwork', () => {
    const u = (i: Partial<StatusInput>) => assessStatus({ ...base, ...i }).urgency;
    const crit = u({ openAlerts: [{ severity: 'critical', title: 'x' }] });
    const hot = u({ telemetry: { ...base.telemetry!, temperatureC: 40 } });
    const low = u({ lastTest: { pctOfRated: 50, at: base.lastTest!.at } });
    const conflict = u({ qualityLevel: 'conflict' });
    expect(crit).toBeLessThan(hot);
    expect(hot).toBeLessThan(low);
    expect(low).toBeLessThan(conflict);
  });

  it('never tells a battery that needs attention, or is being watched, that nothing needs doing', async () => {
    const h = harness(USERS.eng);
    for (const b of await h.svc.batteries.list()) {
      if (b.status.code === 'attention' || b.status.code === 'watching') expect(b.status.nextStep, b.label).not.toMatch(/Nothing needs doing/);
    }
  });
});

describe('status in the services', () => {
  it('the list, the passport and home always agree', async () => {
    const h = harness(USERS.eng);
    const list = await h.svc.batteries.list();
    const home = await h.svc.overview.home();
    const count = (code: string) => list.filter((b) => b.status.code === code).length;
    expect(home.counts).toEqual({ good: count('good'), watching: count('watching'), attention: count('attention'), baseline: count('baseline') });
    expect(home.inFleet + home.retired).toBe(list.length);
    for (const b of list.slice(0, 12)) {
      const p = await h.svc.batteries.get(b.id);
      expect(p.status.status).toBe(b.status.code);
      expect(p.status.headline).toBe(b.status.headline);
    }
    expect(home.attention.every((i) => list.find((b) => b.id === i.id)?.status.code === 'attention')).toBe(true);
  });

  it('filters the list by status', async () => {
    const h = harness(USERS.eng);
    const watching = await h.svc.batteries.list({ status: 'watching' });
    expect(watching.length).toBeGreaterThan(0);
    expect(watching.every((b) => b.status.code === 'watching')).toBe(true);
  });

  it('a shadow-mode model alert never changes a battery’s status, for any reader', async () => {
    const h = harness(USERS.eng);
    const flagged = h.store.db.alerts.filter((a) => a.source.kind === 'model' && a.batteryId && !['resolved', 'closed'].includes(a.state));
    expect(flagged.length).toBeGreaterThan(0);
    for (const a of flagged) {
      const p = await h.svc.batteries.get(a.batteryId!);
      expect(p.status.factors.find((f) => f.key === 'alerts')?.detail ?? '').not.toMatch(new RegExp(a.title, 'i'));
    }
  });

  it('a customer sees only their batteries, and the same status as staff', async () => {
    const staff = harness(USERS.eng);
    const cust = harness(USERS.cust);
    const mine = await cust.svc.batteries.list();
    const all = new Map((await staff.svc.batteries.list()).map((b) => [b.id, b.status.code]));
    expect(mine.length).toBeGreaterThan(0);
    expect(mine.length).toBeLessThan(all.size);
    for (const b of mine) expect(b.status.code).toBe(all.get(b.id));
  });
});
