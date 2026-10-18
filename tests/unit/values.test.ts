import { describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError } from '@/domain/permissions';
import { harness, rejects, USERS } from './helpers';

describe('value records', () => {
  it('lets finance record a sale on a qualified battery, keeps the amount out of the timeline, and hides it from other roles', async () => {
    const h = harness(USERS.fin);
    const b = h.store.db.batteries.find((x) => x.lifecycleState === 'qualified')!;
    const v = await h.svc.values.record({ batteryId: b.id, kind: 'sale', amountAed: 455, recordedOn: '2026-10-12', counterparty: 'Demo Telecom (fictional)', reference: 'INV-1' });
    expect(v).toMatchObject({ amountAed: 455, kind: 'sale', recordedByName: expect.any(String) });
    const ev = h.store.db.events.filter((e) => e.batteryId === b.id).at(-1)!;
    expect(ev).toMatchObject({ type: 'value', title: 'Sale recorded' });
    expect(ev.reason).not.toMatch(/455/);
    expect((await h.svc.batteries.get(b.id)).values!.some((x) => x.id === v.id)).toBe(true);

    h.as(USERS.eng);
    expect((await h.svc.batteries.get(b.id)).values).toBeNull();
    expect(await rejects(h.svc.values.record({ batteryId: b.id, kind: 'sale', amountAed: 1, recordedOn: '2026-10-12', counterparty: 'Anyone' }))).toBeInstanceOf(ForbiddenError);
  });

  it('refuses money that does not match an outcome, and never accepts a negative amount', async () => {
    const h = harness(USERS.fin);
    const received = h.store.db.batteries.find((x) => x.lifecycleState === 'received')!;
    expect(await rejects(h.svc.values.record({ batteryId: received.id, kind: 'sale', amountAed: 300, recordedOn: '2026-10-12', counterparty: 'Buyer' }))).toBeInstanceOf(ConflictError);
    expect(await rejects(h.svc.values.record({ batteryId: received.id, kind: 'recycling_settlement', amountAed: 90, recordedOn: '2026-10-12', counterparty: 'Recycler' }))).toBeInstanceOf(ConflictError);
    const qualified = h.store.db.batteries.find((x) => x.lifecycleState === 'qualified')!;
    expect((await rejects(h.svc.values.record({ batteryId: qualified.id, kind: 'sale', amountAed: -5, recordedOn: '2026-10-12', counterparty: 'Buyer' }))).name).toBe('ValidationError');
  });
});

describe('route decisions', () => {
  it('records the chosen route as an event and keeps the assumptions in the audit history', async () => {
    const h = harness(USERS.eng);
    const b = h.store.db.batteries.find((x) => x.label === 'B-0034')!;
    const e = await h.svc.insights.recordRoute({ batteryId: b.id, route: 'revive', reason: 'Initial capacity is high enough to try once', assumptions: 'chance 88% (n=17); sale AED 413' });
    expect(e).toMatchObject({ type: 'route_decision', title: 'Route chosen: revive', approvalState: 'approved' });
    expect(e.reason).not.toMatch(/413/);
    expect(h.store.db.audit[0]).toMatchObject({ action: 'route.decide', summary: expect.stringMatching(/sale AED 413/) });

    h.as(USERS.fin);
    expect(await rejects(h.svc.insights.recordRoute({ batteryId: b.id, route: 'recycle', reason: 'Finance cannot decide routes', assumptions: '' }))).toBeInstanceOf(ForbiddenError);
  });
});

describe('bench results import', () => {
  it('previews every row, quarantines doubtful ones with the reason, and submits the rest for review', async () => {
    const h = harness(USERS.lab);
    const text = h.svc.bench.sample();
    const before = h.store.db.tests.length;
    const p = await h.svc.bench.preview({ fileName: 'bench.csv', text });
    expect(p.counts).toEqual({ create: 3, skipped: 1, quarantined: 3 });
    expect(p.rows.find((r) => r.batteryLabel === 'B-0042')!.issues.join(' ')).toMatch(/mAh/);
    expect(p.rows.find((r) => r.batteryLabel === 'B-0043')!.issues.join(' ')).toMatch(/calibration/);
    expect(p.rows.find((r) => r.batteryLabel === 'B-0099')!.outcome).toBe('quarantine');
    expect(h.store.db.tests.length).toBe(before); // preview created nothing

    const r = await h.svc.bench.commit({ fileName: 'bench.csv', text });
    expect(r.created).toBe(3);
    const created = h.store.db.tests.filter((t) => r.testIds.includes(t.id));
    expect(created.every((t) => t.status === 'submitted' && t.evidenceIds.length === 1)).toBe(true);
    expect(created.find((t) => t.kind === 'final')!.attemptId).not.toBeNull();
    expect(h.store.db.batteries.find((b) => b.label === 'B-0001')!.lifecycleState).toBe('testing');

    const again = await h.svc.bench.commit({ fileName: 'bench-copy.csv', text });
    expect(again).toMatchObject({ created: 0, alreadyCommittedAt: expect.any(String) });
    expect(h.store.db.tests.length).toBe(before + 3);
  });
});
