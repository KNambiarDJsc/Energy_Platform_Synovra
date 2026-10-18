/**
 * The ML data contract: the point-in-time training view, the record of what each model version was
 * trained on, the review flags built from it, and the database role the ML service uses.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_NOW } from '../../src/data/seed';
import * as s from '../src/db/schema';
import { startServer, USERS, type Server } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any -- view rows are asserted column by column */
type Row = Record<string, any>;

let server: Server;
beforeAll(async () => { server = await startServer(); });
afterAll(async () => { await server?.close(); });

const db = () => server.handle.db;
const rows = async (query: ReturnType<typeof sql>) => {
  const r = (await db().execute(query)) as unknown as { rows: Row[] };
  return r.rows;
};
const features = () => rows(sql`SELECT * FROM ml_restoration_attempt_features ORDER BY attempt_id`);
const flags = (modelVersionId: string) => rows(sql`SELECT * FROM ml_model_review_flags WHERE model_version_id = ${modelVersionId} ORDER BY flag, source_record_id`);
const batteryByLabel = async (label: string) => (await db().select().from(s.batteries).where(eq(s.batteries.label, label)))[0];
const time = (v: unknown) => new Date(v as string).getTime();

describe('ml_restoration_attempt_features', () => {
  it('counts the same training rows as the platform’s learning loop', async () => {
    const [{ n }] = await rows(sql`SELECT count(*)::int AS n FROM ml_restoration_attempt_features
      WHERE label_outcome IS NOT NULL AND (label_outcome = 'approved' OR label_reason_code IS NOT NULL)
        AND before_test_id IS NOT NULL AND before_capacity_ah IS NOT NULL`);
    const eng = await server.as(USERS.eng);
    const loop = (await eng.get('/insights/learning')).body;
    expect(loop.stages.find((s: Row) => s.key === 'eligible').count).toBe(n);
  });

  it('carries the process version as a feature and value recovered as a label', async () => {
    const view = await features();
    expect(view.every((r) => typeof r.process_version === 'string' && r.process_version.length > 0)).toBe(true);
    expect(view.some((r) => r.label_value_aed !== null && Number(r.label_value_aed) > 0)).toBe(true);
    await expect(db().update(s.valueRecords).set({ note: 'edited' })).rejects.toThrow(/append-only/);
  });

  it('has one row per attempt, with labels only once an engineer has decided', async () => {
    const attempts = await db().select().from(s.restorationAttempts);
    const view = await features();
    expect(view).toHaveLength(attempts.length);
    for (const a of attempts) {
      const r = view.find((x) => x.attempt_id === a.id)!;
      const decided = ['approved', 'rejected', 'rework'].includes(a.status);
      expect(r.label_outcome, a.id).toBe(decided ? a.status : null);
      expect(r.label_reason_code, a.id).toBe(a.decisionReasonCode);
      if (!decided) expect(r.label_after_test_id, a.id).toBeNull();
    }
    const rework = view.find((x) => x.label_outcome === 'rework')!;
    expect(rework.label_reason_code).toBe('below_capacity_threshold');
    expect(Number(rework.label_after_capacity_pct_of_rated)).toBeGreaterThan(0);
  });

  it('builds features only from records that existed when the attempt started', async () => {
    const view = await features();
    const withBefore = view.filter((r) => r.before_test_id);
    expect(withBefore.length).toBe(view.length);
    for (const r of withBefore) {
      expect(time(r.before_tested_at), r.attempt_id).toBeLessThanOrEqual(time(r.features_as_of));
      expect(r.before_test_id, r.attempt_id).not.toBe(r.label_after_test_id);
      expect(r.prior_attempts).toBe(r.attempt_no - 1);
    }
    const sample = withBefore[0];
    const [t] = await db().select().from(s.tests).where(eq(s.tests.id, sample.before_test_id));
    expect(sample.before_capacity_ah).toBe(t.result.capacityAh);
  });

  it('drops a before-test that was approved only after the attempt started', async () => {
    const lab = await server.as(USERS.lab);
    const b = await batteryByLabel('B-0034');
    const attempt = (await lab.post('/restoration/attempts', { batteryId: b.id, batchId: 'RB-2026-09' })).body;
    let [r] = await rows(sql`SELECT * FROM ml_restoration_attempt_features WHERE attempt_id = ${attempt.id}`);
    expect(r.before_test_id).toBe(attempt.beforeTestId);
    expect(r.label_outcome).toBeNull();
    // Simulate a back-dated attempt: the before-test approval now postdates the attempt start.
    await db().update(s.tests).set({ reviewedAt: new Date(time(attempt.startedAt) + 60_000) }).where(eq(s.tests.id, attempt.beforeTestId));
    [r] = await rows(sql`SELECT * FROM ml_restoration_attempt_features WHERE attempt_id = ${attempt.id}`);
    expect(r.before_test_id).toBeNull();
    expect(r.before_capacity_ah).toBeNull();
  });
});

describe('model_training_records and ml_model_review_flags', () => {
  const MODEL = 'restoration-qualification@0.1.0-test';

  beforeAll(async () => {
    // What the ML service does after training: register the version and record the rows it used.
    await db().insert(s.modelVersions).values({
      id: MODEL, name: 'restoration-qualification', version: '0.1.0-test', status: 'shadow',
      baseline: 'Initial capacity cut-off', trainingCohort: 'Decided AGM 12V 200Ah attempts (family f1)',
      evaluationReportRef: null, registeredAt: new Date(DEMO_NOW),
    });
    const trained = (await features()).filter((r) => r.family_id === 'f1' && r.label_outcome);
    expect(trained.length).toBeGreaterThan(5);
    await db().insert(s.modelTrainingRecords).values(trained.map((r) => ({
      modelVersionId: MODEL, recordKind: 'restoration_attempt' as const, recordId: r.attempt_id, batteryId: r.battery_id,
    })));
  });

  it('flags nothing while the data the model learned from is unchanged', async () => {
    expect(await flags(MODEL)).toEqual([]);
  });

  it('flags a new attempt for a battery family the model never saw', async () => {
    const lab = await server.as(USERS.lab);
    const b = await batteryByLabel('B-0035');
    expect(b.familyId).toBe('f2');
    const attempt = (await lab.post('/restoration/attempts', { batteryId: b.id, batchId: 'RB-2026-10' })).body;
    const found = await flags(MODEL);
    expect(found).toEqual([expect.objectContaining({ flag: 'family_not_in_training', battery_id: b.id, source_record_id: attempt.id, detail: 'f2' })]);
  });

  it('flags the model when a battery it was trained on is corrected', async () => {
    const [rec] = await db().select().from(s.modelTrainingRecords).where(eq(s.modelTrainingRecords.modelVersionId, MODEL)).limit(1);
    const eng = await server.as(USERS.eng);
    const res = await eng.post(`/batteries/${rec.batteryId}/corrections`, { field: 'manufacturedOn', newValue: '2023-05-01', reason: 'Date code misread at intake' });
    expect(res.status).toBe(200);
    const corrected = (await flags(MODEL)).filter((f) => f.flag === 'training_record_corrected');
    expect(corrected).toEqual([expect.objectContaining({ battery_id: rec.batteryId, detail: 'manufacturedOn' })]);
    // The training record itself is untouched: the remedy is a retrained version, then retiring this one.
    expect(await db().select().from(s.modelTrainingRecords).where(and(eq(s.modelTrainingRecords.modelVersionId, MODEL), eq(s.modelTrainingRecords.recordId, rec.recordId)))).toHaveLength(1);
  });

  it('stops flagging a retired version', async () => {
    await db().update(s.modelVersions).set({ status: 'retired' }).where(eq(s.modelVersions.id, MODEL));
    expect(await flags(MODEL)).toEqual([]);
  });
});

describe('ML service database role (server/sql/ml_service_role.sql)', () => {
  /** Splits on semicolons outside dollar-quoted blocks; strips comment lines. */
  const statements = (text: string) => {
    const body = text.split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n');
    const out: string[] = [];
    let current = '';
    let inDollar = false;
    for (let i = 0; i < body.length; i += 1) {
      if (body.startsWith('$$', i)) { inDollar = !inDollar; current += '$$'; i += 1; continue; }
      if (body[i] === ';' && !inDollar) { if (current.trim()) out.push(current.trim()); current = ''; continue; }
      current += body[i];
    }
    if (current.trim()) out.push(current.trim());
    return out;
  };

  beforeAll(async () => {
    const script = readFileSync(path.resolve(process.cwd(), 'server/sql/ml_service_role.sql'), 'utf8');
    for (let run = 0; run < 2; run += 1) { // safe to run twice
      for (const stmt of statements(script)) await db().execute(sql.raw(stmt));
    }
  });

  const asMl = <T>(fn: (tx: Parameters<Parameters<ReturnType<typeof db>['transaction']>[0]>[0]) => Promise<T>) =>
    db().transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL ROLE synovra_ml`);
      return fn(tx);
    });
  const ROLLBACK = new Error('rollback');

  it('reads the ML views', async () => {
    const r = (await asMl((tx) => tx.execute(sql`SELECT count(*)::int AS n FROM ml_restoration_attempt_features`))) as unknown as { rows: Row[] };
    expect(r.rows[0].n).toBeGreaterThan(0);
    await asMl((tx) => tx.execute(sql`SELECT * FROM ml_model_review_flags`));
  });

  it('cannot read operational tables', async () => {
    for (const table of ['batteries', 'tests', 'users', 'cost_entries', 'audit_events']) {
      await expect(asMl((tx) => tx.execute(sql.raw(`SELECT 1 FROM ${table} LIMIT 1`))), table).rejects.toThrow(/permission denied/);
    }
  });

  it('can register a model version and its predictions, but never change one', async () => {
    const insert = asMl(async (tx) => {
      await tx.insert(s.modelVersions).values({
        id: 'role-check@0', name: 'role-check', version: '0', status: 'shadow', baseline: 'none', trainingCohort: 'none',
        evaluationReportRef: null, registeredAt: new Date(DEMO_NOW),
      });
      throw ROLLBACK;
    });
    await expect(insert).rejects.toBe(ROLLBACK);
    const [p] = await db().select().from(s.predictions).limit(1);
    await expect(asMl((tx) => tx.update(s.predictions).set({ reviewState: 'agreed' }).where(eq(s.predictions.id, p.id)))).rejects.toThrow(/permission denied/);
    await expect(asMl((tx) => tx.update(s.modelVersions).set({ status: 'validated', evaluationReportRef: 'self-signed' }).where(inArray(s.modelVersions.id, [p.modelVersionId])))).rejects.toThrow(/permission denied/);
    await expect(asMl((tx) => tx.delete(s.modelTrainingRecords))).rejects.toThrow(/permission denied/);
  });
});
