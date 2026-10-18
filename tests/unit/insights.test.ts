import { describe, expect, it } from 'vitest';
import { ForbiddenError } from '@/domain/permissions';
import { trainingStatus } from '@/services/mock/insights';
import { harness, rejects, USERS } from './helpers';

const goodTest = (batteryId: string, over: Record<string, unknown> = {}) => ({
  batteryId, kind: 'initial' as const, protocolId: 'proto_c10', voltageV: 12.4, resistanceMOhm: 4.1, temperatureC: 25,
  capacityAh: 140, ambientTempC: 25, loadCurrentA: 20, cutoffVoltageV: 10.8, durationH: 7, instrument: 'Bench DB-2',
  calibrationRef: 'CAL-DEMO', witnessName: null, evidenceFileName: 'report.pdf', notes: '', ...over,
});

describe('learning loop', () => {
  it('accounts for every attempt: eligible rows plus named exclusions', async () => {
    const h = harness(USERS.eng);
    const l = await h.svc.insights.learning();
    const stage = (k: string) => l.stages.find((s) => s.key === k)!.count;
    expect(stage('recorded')).toBe(h.store.db.attempts.length);
    expect(stage('decided')).toBeGreaterThanOrEqual(stage('labelled'));
    expect(stage('labelled')).toBeGreaterThanOrEqual(stage('eligible'));
    expect(stage('eligible') + l.exclusions.reduce((n, e) => n + e.count, 0)).toBe(stage('recorded'));
    expect(stage('trained')).toBe(0);
    expect(l.fingerprint).toBe((await h.svc.insights.learning()).fingerprint);
  });

  it('keeps an attempt out of training until it is decided with a reason, and never uses a later before-test', async () => {
    const h = harness(USERS.lab);
    const b = h.store.db.batteries.find((x) => x.lifecycleState === 'restoration_candidate' && x.familyId === 'f1')!;
    const attempt = await h.svc.restoration.createAttempt({ batteryId: b.id, batchId: 'RB-2026-09' });
    const a = () => h.store.db.attempts.find((x) => x.id === attempt.id)!;
    const ctx = { store: h.store, actor: () => h.svc.actor() };
    expect(trainingStatus(ctx, a())).toEqual({ eligible: false, reason: 'Not decided yet' });

    const after = await h.svc.tests.create(goodTest(b.id, { kind: 'final', capacityAh: 150 }));
    await h.svc.tests.submit(after.id);
    await h.svc.restoration.submitForReview(attempt.id, after.id);
    h.as(USERS.eng);
    await h.svc.tests.approve(after.id, 'Record matches bench log');
    await h.svc.restoration.decide(attempt.id, 'rework', 'Below threshold; repeat the step', 'below_capacity_threshold');
    expect(trainingStatus(ctx, a())).toEqual({ eligible: true, reason: null });

    // A rework decided before reason codes existed is kept, but cannot be a label.
    a().decisionReasonCode = null;
    expect(trainingStatus(ctx, a()).reason).toBe('Decided before reason codes existed');
    a().decisionReasonCode = 'below_capacity_threshold';

    // A before-test approved after the attempt started would leak later knowledge into the features.
    const before = h.store.db.tests.find((t) => t.id === a().beforeTestId)!;
    before.reviewedAt = new Date(Date.parse(a().startedAt) + 60_000).toISOString();
    expect(trainingStatus(ctx, a()).reason).toBe('Before-test approved after the attempt started');
  });
});

describe('recovery metrics', () => {
  it('shows costs only to roles that may see them, and never invents a contribution', async () => {
    const h = harness(USERS.fin);
    const fin = await h.svc.insights.recovery();
    const by = (list: typeof fin, k: string) => list.find((m) => m.key === k)!;
    expect(by(fin, 'cost_per_qualified').status).toBe('calculated');
    expect(by(fin, 'cost_per_qualified').basis).toMatch(/minimum/);
    expect(by(fin, 'contribution')).toMatchObject({ status: 'not_calculated', value: null });
    expect(by(fin, 'retest_pass').value).toMatch(/%$/);

    h.as(USERS.eng);
    const eng = await h.svc.insights.recovery();
    expect(by(eng, 'cost_per_qualified')).toMatchObject({ status: 'hidden', value: null });

    h.as(USERS.noc);
    expect(await rejects(h.svc.insights.recovery())).toBeInstanceOf(ForbiddenError);
  });
});

describe('data sources and agents', () => {
  it('says plainly which sources are simulated, not connected or reference only', async () => {
    const h = harness(USERS.eng);
    const { sources } = await h.svc.insights.dataSources();
    const by = (k: string) => sources.find((s) => s.key === k)!;
    expect(by('telemetry').status).toBe('simulated');
    expect(by('machines')).toMatchObject({ status: 'not_connected', records: null });
    expect(by('public')).toMatchObject({ status: 'reference_only', records: null });
    expect(by('intake').records).toBe(h.store.db.batteries.length);
  });

  it('runs read-only agents that cite records, list what is missing, and change nothing', async () => {
    const h = harness(USERS.eng);
    const before = JSON.stringify({ ...h.store.db, audit: [] });
    const b17 = h.store.db.batteries.find((b) => b.label === 'B-0017')!;
    const inv = await h.svc.insights.runAgent('battery_investigator', { batteryId: b17.id });
    expect(inv.findings[0].citations).toContainEqual(expect.objectContaining({ kind: 'battery', id: b17.id }));
    expect(inv.findings.some((f) => f.attention && f.citations.some((c) => c.kind === 'alert'))).toBe(true);
    expect(inv.missing).toContain('Current and state of charge: no sensor measures them.');

    const steward = await h.svc.insights.runAgent('data_steward');
    expect(steward.findings.length).toBeGreaterThan(0);
    expect(steward.findings.every((f) => f.text.endsWith('.'))).toBe(true);

    const analyst = await h.svc.insights.runAgent('recovery_analyst');
    expect(analyst.missing.join(' ')).toMatch(/sale price/);

    expect(JSON.stringify({ ...h.store.db, audit: [] })).toBe(before);

    h.as(USERS.lab);
    expect(await rejects(h.svc.insights.runAgent('data_steward'))).toBeInstanceOf(ForbiddenError);
  });
});

describe('data collection pipeline', () => {
  it('measures each capture step from the records, and never overstates completeness', async () => {
    const h = harness(USERS.eng);
    const c = await h.svc.insights.collection();
    const counts = c.chain.map((l) => l.count);
    expect(counts[0]).toBe(h.store.db.batteries.length);
    counts.slice(1).forEach((n, i) => expect(n, c.chain[i + 1].label).toBeLessThanOrEqual(counts[i]));
    expect(c.chain.at(-1)).toMatchObject({ key: 'value', count: 0 });
    for (const s of c.steps) {
      expect(s.complete, s.step).toBeLessThanOrEqual(s.applicable);
      s.fields.forEach((f) => expect(f.present, `${s.step}: ${f.field}`).toBeLessThanOrEqual(s.applicable));
    }
    expect(c.steps.find((s) => s.key === 'treatment')!.fields.find((f) => f.field === 'Process version')!.present).toBe(0);
    h.as(USERS.lab);
    expect(await rejects(h.svc.insights.collection())).toBeInstanceOf(ForbiddenError);
  });
});
