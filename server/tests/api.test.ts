/**
 * The HTTP API against a real PostgreSQL engine (PGlite), with the demo seed.
 * Mirrors the behavioural spec in tests/unit/services.test.ts, then adds what only a server
 * can get wrong: persistence across requests, authentication, audit of refused requests,
 * database integrity rules and concurrent writers.
 */
import { and, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SAMPLE_CSV } from '../../src/domain/csv';
import * as s from '../src/db/schema';
import { goodTest, startServer, USERS, type Server } from './helpers';

let server: Server;
beforeAll(async () => { server = await startServer(); });
afterAll(async () => { await server?.close(); });

const db = () => server.handle.db;
const batteryWhere = async (where: SQL | undefined) => (await db().select().from(s.batteries).where(where).orderBy(s.batteries.seq))[0];

describe('authentication and the error contract', () => {
  it('requires a valid bearer token', async () => {
    const none = await server.raw('/api/v1/batteries');
    expect(none.status).toBe(401);
    expect((await none.json()).error.code).toBe('UNAUTHENTICATED');
    const bad = await server.raw('/api/v1/batteries', { headers: { Authorization: 'Bearer not-a-token' } });
    expect(bad.status).toBe(401);
  });

  it('refuses dev login for unknown users and exposes meta without auth', async () => {
    const res = await server.raw('/api/v1/dev/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: 'u_nobody' }) });
    expect(res.status).toBe(401);
    const meta = await (await server.raw('/api/v1/meta')).json();
    expect(meta).toMatchObject({ dataMode: 'demo', authMode: 'dev', features: { monitoring: false, alerts: false, assistant: false } });
    expect(meta.notice).toMatch(/Synthetic demonstration data/);
  });

  it('returns the signed-in actor from the users table', async () => {
    const me = await (await server.as(USERS.field1)).get('/me');
    expect(me.body.actor).toMatchObject({ userId: 'u_field1', role: 'field_technician', siteScope: ['s1', 's2'] });
  });

  it('maps domain errors to 403/404/409/422 with a stable body', async () => {
    const lab = await server.as(USERS.lab);
    const forbidden = await lab.get('/admin/users');
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error).toMatchObject({ code: 'FORBIDDEN', details: ['admin.read'] });
    expect((await lab.get('/batteries/does-not-exist/passport')).status).toBe(404);
    const invalid = await lab.post('/batteries', { familyId: 'f1' });
    expect(invalid.status).toBe(422);
    expect(invalid.body.error.code).toBe('VALIDATION');
    expect((await lab.get('/no/such/route')).status).toBe(404);
  });

  it('answers V2/V3 areas as disabled, not as empty data', async () => {
    const eng = await server.as(USERS.eng);
    for (const path of ['/alerts', '/telemetry/fleet', '/tasks', '/assistant/ask']) {
      const r = await eng.get(path);
      expect(r.status, path).toBe(404);
      expect(r.body.error.code).toBe('FEATURE_DISABLED');
    }
  });
});

describe('batteries', () => {
  it('creates a battery that persists across requests, with unknown cost kept as NULL', async () => {
    const lab = await server.as(USERS.lab);
    const created = await lab.post('/batteries', {
      familyId: 'f1', manufacturerSerial: 'AV200-25-999001', manufacturedOn: '2024-02-01', physicalLocation: 'Receiving bay',
      legacyId: 'LAB-9001', acquisitionCostAed: null,
    });
    expect(created.status).toBe(200);
    const { battery } = created.body;
    expect(battery.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(battery.publicRef).toMatch(/^SYN-/);
    expect(battery.sourceSystem).toBe('Manual entry (demo)');

    const passport = await (await server.as(USERS.eng)).get(`/batteries/${battery.id}/passport`);
    expect(passport.body.events.map((e: { type: string }) => e.type)).toEqual(['intake']);
    const [cost] = await db().select().from(s.costEntries).where(eq(s.costEntries.batteryId, battery.id));
    expect(cost.amountAed).toBeNull();
    const audit = await db().select().from(s.auditEvents).where(eq(s.auditEvents.entityId, battery.id));
    expect(audit.map((a) => a.action)).toContain('battery.create');
  });

  it('blocks a duplicate serial unless acknowledged, and never merges', async () => {
    const lab = await server.as(USERS.lab);
    const existing = await batteryWhere(and(eq(s.batteries.familyId, 'f1'), sql`${s.batteries.manufacturerSerial} IS NOT NULL`));
    const dup = await lab.post('/batteries', { familyId: 'f1', manufacturerSerial: existing.manufacturerSerial!.toLowerCase(), manufacturedOn: null, physicalLocation: 'Bay', legacyId: null, acquisitionCostAed: null });
    expect(dup.status).toBe(409);
    const ok = await lab.post('/batteries', { familyId: 'f1', manufacturerSerial: existing.manufacturerSerial, manufacturedOn: null, physicalLocation: 'Bay', legacyId: null, acquisitionCostAed: null, acknowledgeDuplicate: true });
    expect(ok.status).toBe(200);
    expect(ok.body.battery.id).not.toBe(existing.id);
    const p = await lab.get(`/batteries/${ok.body.battery.id}/passport`);
    expect(p.body.quality.level).toBe('conflict');
  });

  it('reissues a label without changing identity; the retired reference still resolves', async () => {
    const lab = await server.as(USERS.lab);
    const b = await batteryWhere(eq(s.batteries.label, 'B-0011'));
    const r = await lab.post(`/batteries/${b.id}/reissue-label`, { reason: 'Label damaged in handling' });
    expect(r.body.battery.id).toBe(b.id);
    expect((await lab.get(`/lookup?ref=${b.publicRef}`)).body).toMatchObject({ status: 'retired', batteryId: b.id });
    expect((await lab.get('/lookup?ref=SYN-NOPE-0000')).body.status).toBe('unknown');
  });

  it('records corrections as new events carrying the previous value', async () => {
    const admin = await server.as(USERS.admin);
    const b = await batteryWhere(eq(s.batteries.label, 'B-0012'));
    const r = await admin.post(`/batteries/${b.id}/corrections`, { field: 'manufacturerSerial', newValue: 'AV200-25-CORR01', reason: 'Label mis-read at intake' });
    expect(r.status).toBe(200);
    const events = await db().select().from(s.batteryEvents).where(and(eq(s.batteryEvents.batteryId, b.id), eq(s.batteryEvents.type, 'identity')));
    expect(events.at(-1)!.correction).toEqual({ field: 'manufacturerSerial', previous: b.manufacturerSerial, next: 'AV200-25-CORR01' });
  });
});

describe('CSV import', () => {
  it('previews without writing, commits, and is idempotent on re-import', async () => {
    const lab = await server.as(USERS.lab);
    const before = (await db().select({ n: sql<number>`count(*)::int` }).from(s.batteries))[0].n;
    const preview = await lab.post('/imports', { fileName: 'intake.csv', text: SAMPLE_CSV, templateId: 'tpl_std' });
    expect(preview.body.counts).toEqual({ created: 5, updated: 0, skipped: 0, quarantined: 3 });
    expect((await db().select({ n: sql<number>`count(*)::int` }).from(s.batteries))[0].n).toBe(before);

    const first = await lab.post(`/imports/${preview.body.id}/commit`);
    expect(first.body.counts).toEqual({ created: 5, updated: 0, skipped: 0, quarantined: 3 });
    expect((await db().select({ n: sql<number>`count(*)::int` }).from(s.batteries))[0].n).toBe(before + 5);
    expect((await lab.post(`/imports/${preview.body.id}/commit`)).status).toBe(422);

    const again = await lab.post('/imports', { fileName: 'intake.csv', text: SAMPLE_CSV, templateId: 'tpl_std' });
    expect(again.body.priorCommitAt).toBeTruthy();
    expect(again.body.counts).toEqual({ created: 0, updated: 0, skipped: 5, quarantined: 3 });
    expect((await lab.post(`/imports/${again.body.id}/commit`)).body.counts.created).toBe(0);
    expect((await db().select({ n: sql<number>`count(*)::int` }).from(s.batteries))[0].n).toBe(before + 5);
  });

  it('is restricted to roles with import permission, and the refusal is audited', async () => {
    const field = await server.as(USERS.field1);
    const r = await field.post('/imports', { fileName: 'x.csv', text: SAMPLE_CSV, templateId: 'tpl_std' });
    expect(r.status).toBe(403);
    const denied = await db().select().from(s.auditEvents).where(and(eq(s.auditEvents.actorId, 'u_field1'), eq(s.auditEvents.outcome, 'denied')));
    expect(denied.some((a) => a.entityId === 'battery.import')).toBe(true);
  });
});

describe('test review', () => {
  it('lab drafts and submits; only an engineer approves; received -> testing', async () => {
    const lab = await server.as(USERS.lab);
    const b = await batteryWhere(eq(s.batteries.lifecycleState, 'received'));
    const t = (await lab.post('/tests', goodTest(b.id))).body;
    expect(t.status).toBe('draft');
    await lab.post(`/tests/${t.id}/submit`);
    expect((await batteryWhere(eq(s.batteries.id, b.id))).lifecycleState).toBe('testing');
    expect((await lab.post(`/tests/${t.id}/approve`, { reason: 'Looks right' })).status).toBe(403);
    expect((await (await server.as(USERS.admin)).post(`/tests/${t.id}/approve`, { reason: 'Looks right' })).status).toBe(403);
    const ok = await (await server.as(USERS.eng)).post(`/tests/${t.id}/approve`, { reason: 'Conditions per protocol' });
    expect(ok.body).toMatchObject({ status: 'approved', reviewerName: 'Hamid Rahimi' });
  });

  it('blocks approval by the submitter or by the operator who recorded the test', async () => {
    const eng = await server.as(USERS.eng);
    const b = await batteryWhere(eq(s.batteries.lifecycleState, 'received'));
    const own = (await eng.post('/tests', goodTest(b.id))).body;
    await eng.post(`/tests/${own.id}/submit`);
    expect((await eng.post(`/tests/${own.id}/approve`, { reason: 'Self approval' })).status).toBe(409);

    // recorded by eng1, submitted by a lab operator: eng1 still may not approve it
    const t = (await eng.post('/tests', goodTest(b.id))).body;
    await (await server.as(USERS.lab)).post(`/tests/${t.id}/submit`);
    expect((await eng.post(`/tests/${t.id}/approve`, { reason: 'Operator approving own record' })).status).toBe(409);
    expect((await (await server.as(USERS.eng2)).post(`/tests/${t.id}/approve`, { reason: 'Independent review' })).status).toBe(200);
  });

  it('requires a reason to reject', async () => {
    const lab = await server.as(USERS.lab);
    const b = await batteryWhere(eq(s.batteries.lifecycleState, 'received'));
    const t = (await lab.post('/tests', goodTest(b.id))).body;
    await lab.post(`/tests/${t.id}/submit`);
    const eng = await server.as(USERS.eng);
    expect((await eng.post(`/tests/${t.id}/reject`, { reason: 'no' })).status).toBe(422);
    expect((await eng.post(`/tests/${t.id}/rework`, { reason: 'Cut-off voltage looks wrong' })).body.status).toBe('requires_rework');
  });
});

describe('restoration', () => {
  it('runs candidate -> attempt -> review -> qualified, preserving identity', async () => {
    const lab = await server.as(USERS.lab);
    const b = await batteryWhere(and(eq(s.batteries.lifecycleState, 'restoration_candidate'), eq(s.batteries.familyId, 'f1')));
    const attempt = (await lab.post('/restoration/attempts', { batteryId: b.id, batchId: 'RB-2026-09', lotRefs: [{ kind: 'material', ref: 'LOT-REF-DEMO-1' }] })).body;
    expect((await batteryWhere(eq(s.batteries.id, b.id))).lifecycleState).toBe('in_restoration');
    expect((await lab.post('/restoration/attempts', { batteryId: b.id, batchId: 'RB-2026-09' })).status).toBe(409);
    await lab.post(`/restoration/attempts/${attempt.id}/notes`, { text: 'Step recorded in controlled system' });
    const after = (await lab.post('/tests', goodTest(b.id, { kind: 'final', capacityAh: 180 }))).body;
    await lab.post(`/tests/${after.id}/submit`);
    await lab.post(`/restoration/attempts/${attempt.id}/submit`, { afterTestId: after.id });
    expect((await lab.post(`/restoration/attempts/${attempt.id}/decide`, { decision: 'approve', reason: 'Looks good enough' })).status).toBe(403);
    const eng = await server.as(USERS.eng);
    expect((await eng.post(`/restoration/attempts/${attempt.id}/decide`, { decision: 'approve', reason: 'Meets threshold' })).status).toBe(409);
    await eng.post(`/tests/${after.id}/approve`, { reason: 'Matches bench log' });
    const done = await eng.post(`/restoration/attempts/${attempt.id}/decide`, { decision: 'approve', reason: 'Meets the demonstration threshold' });
    expect(done.body.status).toBe('approved');
    const now = await batteryWhere(eq(s.batteries.id, b.id));
    expect(now.lifecycleState).toBe('qualified');
    expect(now.id).toBe(b.id);
  });

  it('refuses qualification below the threshold', async () => {
    const lab = await server.as(USERS.lab);
    const b = await batteryWhere(and(eq(s.batteries.lifecycleState, 'restoration_candidate'), eq(s.batteries.familyId, 'f1')));
    const attempt = (await lab.post('/restoration/attempts', { batteryId: b.id, batchId: 'RB-2026-09' })).body;
    const after = (await lab.post('/tests', goodTest(b.id, { kind: 'final', capacityAh: 150 }))).body;
    await lab.post(`/tests/${after.id}/submit`);
    await lab.post(`/restoration/attempts/${attempt.id}/submit`, { afterTestId: after.id });
    const eng = await server.as(USERS.eng);
    await eng.post(`/tests/${after.id}/approve`, { reason: 'Record matches bench log' });
    expect((await eng.post(`/restoration/attempts/${attempt.id}/decide`, { decision: 'approve', reason: 'Try anyway' })).status).toBe(409);
    expect((await eng.post(`/restoration/attempts/${attempt.id}/decide`, { decision: 'rework', reason: 'Below threshold; repeat' })).body.status).toBe('rework');
    expect((await lab.post('/restoration/attempts', { batteryId: b.id, batchId: 'RB-2026-09' })).body.attemptNo).toBe(2);
  });

  it('keeps unknown costs out of totals and shows costs to finance only', async () => {
    const fin = await server.as(USERS.fin);
    const r = await fin.get('/restoration/batches/RB-2026-10/results');
    expect(r.body.costs.unknownEntries).toBeGreaterThan(0);
    expect((await (await server.as(USERS.eng)).get('/restoration/batches/RB-2026-10/results')).body.costs).toBeNull();
    const econ = await fin.post('/restoration/batches/RB-2026-10/economics', { salesPerQualifiedAed: 500, recoveryPerRejectAed: 75 });
    expect(econ.status).toBe(200);
    expect(econ.body.unknownCostEntries).toBeGreaterThan(0);
  });
});

describe('deployments', () => {
  it('moves a qualified battery and prevents overlapping assignments', async () => {
    const field = await server.as(USERS.field1);
    const q = await batteryWhere(and(eq(s.batteries.lifecycleState, 'qualified'), eq(s.batteries.familyId, 'f1')));
    expect((await field.post('/assignments/validate', { batteryId: q.id, slotId: 'str2-p4' })).body.ok).toBe(true);
    expect((await field.post('/assignments', { batteryId: q.id, slotId: 'str1-p1', reason: 'Trying to overwrite' })).status).toBe(409);
    const moved = await field.post('/assignments', { batteryId: q.id, slotId: 'str2-p4', reason: 'Planned commissioning' });
    expect(moved.status).toBe(200);
    const now = await batteryWhere(eq(s.batteries.id, q.id));
    expect(now).toMatchObject({ lifecycleState: 'deployed', siteId: 's1' });
    const open = await db().select().from(s.assignments).where(and(eq(s.assignments.batteryId, q.id), isNull(s.assignments.endAt)));
    expect(open).toHaveLength(1);
  });

  it('serialises concurrent writers: two people racing for one slot, exactly one wins', async () => {
    const [a, b] = await db().select().from(s.batteries).where(and(eq(s.batteries.lifecycleState, 'qualified'), eq(s.batteries.familyId, 'f1'))).limit(2);
    expect(b).toBeDefined();
    const eng = await server.as(USERS.eng);
    const noc = await server.as(USERS.noc);
    const sites = (await eng.get('/sites')).body as { strings: { familyModel: string; string: { familyId: string }; slots: { slot: { id: string }; battery: unknown }[] }[] }[];
    const slotId = sites.flatMap((x) => x.strings).filter((st) => st.string.familyId === 'f1').flatMap((st) => st.slots).find((sl) => !sl.battery)!.slot.id;
    expect((await eng.post('/assignments/validate', { batteryId: a.id, slotId })).body.ok).toBe(true);
    const results = await Promise.all([
      eng.post('/assignments', { batteryId: a.id, slotId, reason: 'Race A' }),
      noc.post('/assignments', { batteryId: b.id, slotId, reason: 'Race B' }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const open = await db().select().from(s.assignments).where(and(eq(s.assignments.slotId, slotId), isNull(s.assignments.endAt)));
    expect(open).toHaveLength(1);
  });

  it('keeps field technicians inside their site scope', async () => {
    const field = await server.as(USERS.field1);
    const q = await batteryWhere(and(eq(s.batteries.lifecycleState, 'qualified'), eq(s.batteries.familyId, 'f1')));
    const v = await field.post('/assignments/validate', { batteryId: q.id, slotId: 'str6-p2' });
    expect(v.body.checks.find((c: { id: string }) => c.id === 'scope').status).toBe('fail');
  });
});

describe('customer redaction and tenant isolation', () => {
  it('limits the register and strips costs, process data and audit from the passport', async () => {
    const cust = await server.as(USERS.cust);
    const list = (await cust.get('/batteries')).body;
    const total = (await db().select({ n: sql<number>`count(*)::int` }).from(s.batteries))[0].n;
    expect(list.length).toBeGreaterThan(0);
    expect(list.length).toBeLessThan(total);
    const own = list.find((b: { lifecycleState: string }) => b.lifecycleState === 'deployed');
    const p = (await cust.get(`/batteries/${own.id}/passport`)).body;
    expect(p).toMatchObject({ redacted: true, costs: null, attempts: [], audit: null, predictions: [] });
    expect(p.battery.internalNotes).toBe('');
    expect(p.evidence.every((e: { classification: string }) => e.classification === 'customer_visible')).toBe(true);
  });

  it('hides other tenants’ batteries, and QR lookup does not grant access', async () => {
    const cust = await server.as(USERS.cust);
    const other = await batteryWhere(eq(s.batteries.siteId, 's4'));
    expect((await cust.get(`/batteries/${other.id}/passport`)).status).toBe(404);
    expect((await cust.get(`/lookup?ref=${other.publicRef}`)).body.status).toBe('forbidden');
    const denied = await db().select().from(s.auditEvents).where(and(eq(s.auditEvents.action, 'qr.denied'), eq(s.auditEvents.entityId, other.id)));
    expect(denied.length).toBeGreaterThan(0);
  });

  it('keeps customer reports to customer sections, previews until engineering approves', async () => {
    const cust = await server.as(USERS.cust);
    expect((await cust.post('/reports', { templateId: 'restoration_batch', scopeId: 'RB-2026-09', from: '2026-01-01', to: '2026-10-13' })).status).toBe(404);
    const own = (await cust.get('/batteries')).body.find((b: { lifecycleState: string }) => b.lifecycleState === 'deployed');
    const r = (await cust.post('/reports', { templateId: 'battery_passport', scopeId: own.id, from: '2026-01-01', to: '2026-10-13' })).body;
    expect(r).toMatchObject({ audience: 'customer', approvalState: 'draft' });
    expect(r.sections.every((x: { visibility: string }) => x.visibility === 'customer')).toBe(true);
    expect((await cust.post(`/reports/${r.id}/approve`)).status).toBe(403);
    expect((await cust.get(`/reports/${r.id}/export`)).status).toBe(409);
    await (await server.as(USERS.eng)).post(`/reports/${r.id}/approve`);
    expect((await cust.get(`/reports/${r.id}/export`)).body.csv).toContain('Synthetic demonstration data');
  });
});

describe('intelligence contract', () => {
  it('serves model output read-only, always labelled shadow, and records human review', async () => {
    const eng = await server.as(USERS.eng);
    const list = (await eng.get('/predictions')).body;
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((p: { status: string }) => p.status === 'shadow')).toBe(true);
    const r = await eng.post(`/predictions/${list[0].id}/review`, { outcome: 'disagreed' });
    expect(r.body).toMatchObject({ reviewState: 'disagreed', reviewedByName: 'Hamid Rahimi', status: 'shadow' });
    const [row] = await db().select().from(s.predictions).where(eq(s.predictions.id, list[0].id));
    expect(row.reviewState).toBe('disagreed');
    expect((await (await server.as(USERS.cust)).get('/predictions')).status).toBe(403);
  });
});

describe('administration', () => {
  it('keeps admins away from approvals and records denied attempts', async () => {
    const admin = await server.as(USERS.admin);
    expect((await admin.post('/restoration/attempts/att_1/decide', { decision: 'approve', reason: 'Admin override attempt' })).status).toBe(403);
    expect((await admin.get('/admin/users')).body.length).toBeGreaterThan(5);
    const denied = (await admin.get('/audit-events?outcome=denied')).body;
    expect(denied.some((a: { actorId: string }) => a.actorId === 'u_admin')).toBe(true);
  });

  it('blocks sign-in for a deactivated user', async () => {
    const admin = await server.as(USERS.admin);
    const lab2 = await server.as(USERS.lab2);
    expect((await admin.patch('/admin/users/u_lab2', { active: false })).body.active).toBe(false);
    expect((await lab2.get('/batteries')).status).toBe(403);
    await admin.patch('/admin/users/u_lab2', { active: true });
    expect((await lab2.get('/batteries')).status).toBe(200);
  });
});

describe('record cache', () => {
  it('serves a write made by another API instance (version bump) on the next request', async () => {
    const eng = await server.as(USERS.eng);
    const b = await batteryWhere(eq(s.batteries.label, 'B-0013'));
    expect((await eng.get(`/batteries/${b.id}/passport`)).body.battery.physicalLocation).not.toBe('Moved by instance 2');
    // what another instance's write transaction does: change records and bump the version together
    await db().transaction(async (tx) => {
      await tx.update(s.batteries).set({ physicalLocation: 'Moved by instance 2' }).where(eq(s.batteries.id, b.id));
      await tx.update(s.dataVersion).set({ version: sql`${s.dataVersion.version} + 1` });
    });
    expect((await eng.get(`/batteries/${b.id}/passport`)).body.battery.physicalLocation).toBe('Moved by instance 2');
  });

  it('does not let one request’s in-memory changes leak into the next', async () => {
    const lab = await server.as(USERS.lab);
    // a refused request mutates nothing persistent and must not poison the cache
    expect((await lab.post('/batteries', { familyId: 'f1', manufacturerSerial: '', physicalLocation: '' })).status).toBe(422);
    const before = (await lab.get('/batteries')).body.length;
    expect((await lab.get('/batteries')).body.length).toBe(before);
  });
});

describe('database integrity rules (second line of defence)', () => {
  it('rejects a second open assignment for a slot', async () => {
    const [open] = await db().select().from(s.assignments).where(isNull(s.assignments.endAt)).limit(1);
    const other = await batteryWhere(eq(s.batteries.lifecycleState, 'qualified'));
    await expect(db().insert(s.assignments).values({ id: 'x-overlap', batteryId: other.id, slotId: open.slotId, startAt: new Date(), reason: 't', actorId: 'u' }))
      .rejects.toMatchObject({ code: '23505' });
  });

  it('makes lifecycle events and audit append-only', async () => {
    const [ev] = await db().select().from(s.batteryEvents).limit(1);
    await expect(db().update(s.batteryEvents).set({ reason: 'rewritten' }).where(eq(s.batteryEvents.id, ev.id))).rejects.toThrow(/append-only/);
    await expect(db().delete(s.auditEvents)).rejects.toThrow(/append-only/);
  });

  it('rejects an approved test whose reviewer is its operator, and negative money', async () => {
    const [t] = await db().select().from(s.tests).where(eq(s.tests.status, 'approved')).limit(1);
    await expect(db().update(s.tests).set({ reviewerId: t.operatorId }).where(eq(s.tests.id, t.id))).rejects.toMatchObject({ code: '23514' });
    const [c] = await db().select().from(s.costEntries).limit(1);
    await expect(db().update(s.costEntries).set({ amountAed: '-1' }).where(eq(s.costEntries.id, c.id))).rejects.toMatchObject({ code: '23514' });
  });
});

describe('user administration over HTTP', () => {
  it('adds a user who can then sign in, and applies a role change on their next request', async () => {
    const admin = await server.as(USERS.admin);
    const created = await admin.post('/admin/users', {
      name: 'Noor Haddad', title: 'Lab operator', email: 'Noor.Haddad@example.invalid', role: 'lab_operator', tenantId: 't_ops', siteScope: 'all',
    });
    expect(created.status).toBe(200);
    const [row] = await db().select().from(s.users).where(eq(s.users.id, created.body.id));
    expect(row).toMatchObject({ email: 'noor.haddad@example.invalid', role: 'lab_operator', active: true, externalSubject: null });

    const noor = await server.as(created.body.id);
    expect((await noor.get('/me')).body.actor.role).toBe('lab_operator');
    expect((await noor.post('/tests/x/approve', { reason: 'Looks fine to me' })).status).toBe(403);

    const promoted = await admin.patch(`/admin/users/${created.body.id}`, { role: 'battery_engineer', siteScope: ['s1'] });
    expect(promoted.body).toMatchObject({ role: 'battery_engineer', siteScope: ['s1'] });
    expect((await noor.get('/me')).body.actor).toMatchObject({ role: 'battery_engineer', siteScope: ['s1'] });

    const dup = await admin.post('/admin/users', { name: 'Noor Two', title: 'Lab operator', email: 'NOOR.HADDAD@example.invalid', role: 'lab_operator', tenantId: 't_ops', siteScope: 'all' });
    expect(dup.status).toBe(409);
    const audit = await db().select().from(s.auditEvents).where(eq(s.auditEvents.entityId, created.body.id));
    expect(audit.map((a) => a.action).sort()).toEqual(['admin.user_create', 'admin.user_update']);
  });

  it('refuses invalid input and non-administrators, and a deactivated user loses access at once', async () => {
    const admin = await server.as(USERS.admin);
    const bad = await admin.post('/admin/users', { name: 'X', title: '', email: 'not-an-email', role: 'lab_operator', tenantId: 't_ops', siteScope: [] });
    expect(bad.status).toBe(422);
    expect(bad.body.error.details.length).toBeGreaterThan(1);
    expect((await (await server.as(USERS.eng)).patch(`/admin/users/${USERS.lab2}`, { role: 'platform_admin' })).status).toBe(403);

    const lab2 = await server.as(USERS.lab2);
    await admin.patch(`/admin/users/${USERS.lab2}`, { active: false });
    expect((await lab2.get('/me')).status).toBe(403);
    await admin.patch(`/admin/users/${USERS.lab2}`, { active: true });
    expect((await lab2.get('/me')).status).toBe(200);
  });
});
