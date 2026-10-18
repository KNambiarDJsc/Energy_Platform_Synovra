import { describe, expect, it } from 'vitest';
import { buildSeed, buildTelemetry, QUALIFICATION_THRESHOLD_PCT } from '@/data/seed';
import { canTransition, inventoryGroupOf } from '@/domain/lifecycle';

const db = buildSeed();

describe('seed data', () => {
  it('meets the minimum volumes in the brief', () => {
    expect(db.batteries.length).toBeGreaterThanOrEqual(30);
    expect(db.sites).toHaveLength(5);
    expect(db.families).toHaveLength(3);
    expect(db.batches).toHaveLength(4);
    expect(db.alerts.length).toBeGreaterThanOrEqual(12);
    expect(db.tasks.length).toBeGreaterThanOrEqual(10);
    expect(db.strings.filter((s) => db.assignments.some((a) => !a.endAt && db.slots.find((x) => x.id === a.slotId)?.stringId === s.id))).toHaveLength(5);
    expect(db.warranties.length).toBeGreaterThan(5);
    expect(db.recycling.length).toBeGreaterThan(3);
    expect(db.predictions.every((p) => p.status === 'shadow')).toBe(true);
  });

  it('gives every rework and rejection decision a reason code, and none to approvals', () => {
    const notQualified = db.attempts.filter((a) => a.status === 'rework' || a.status === 'rejected');
    expect(notQualified.length).toBeGreaterThan(0);
    notQualified.forEach((a) => expect(a.decisionReasonCode, a.id).not.toBeNull());
    db.attempts.filter((a) => a.status === 'approved').forEach((a) => expect(a.decisionReasonCode, a.id).toBeNull());
    db.tests.filter((t) => t.status === 'rejected' || t.status === 'requires_rework').forEach((t) => expect(t.reviewReasonCode, t.id).not.toBeNull());
  });

  it('is deterministic', () => {
    expect(JSON.stringify(buildSeed().batteries.map((b) => b.id))).toBe(JSON.stringify(db.batteries.map((b) => b.id)));
  });

  it('keeps identity fields separate and unique', () => {
    const ids = new Set(db.batteries.map((b) => b.id));
    const refs = new Set(db.batteries.map((b) => b.publicRef));
    expect(ids.size).toBe(db.batteries.length);
    expect(refs.size).toBe(db.batteries.length);
    db.batteries.forEach((b) => {
      expect(b.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(b.publicRef).toMatch(/^SYN-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      expect(b.id).not.toContain(b.manufacturerSerial ?? '#none#');
    });
  });

  it('has no overlapping assignments for a slot or a battery', () => {
    const open = db.assignments.filter((a) => !a.endAt);
    expect(new Set(open.map((a) => a.slotId)).size).toBe(open.length);
    expect(new Set(open.map((a) => a.batteryId)).size).toBe(open.length);
    for (const a of db.assignments) {
      for (const o of db.assignments) {
        if (a === o) continue;
        if (a.slotId !== o.slotId && a.batteryId !== o.batteryId) continue;
        const aEnd = a.endAt ? Date.parse(a.endAt) : Infinity;
        const oEnd = o.endAt ? Date.parse(o.endAt) : Infinity;
        expect(Date.parse(a.startAt) < oEnd && Date.parse(o.startAt) < aEnd).toBe(false);
      }
    }
  });

  it('contains deliberate conflicts and incomplete records', () => {
    expect(db.batteries.some((b) => !b.manufacturerSerial)).toBe(true);
    expect(db.batteries.some((b) => !b.manufacturedOn)).toBe(true);
    const serials = db.batteries.map((b) => b.manufacturerSerial).filter(Boolean);
    expect(new Set(serials).size).toBeLessThan(serials.length);
    expect(db.costs.some((c) => c.amountAed === null)).toBe(true);
  });

  it('records state history consistently with the lifecycle state machine', () => {
    for (const b of db.batteries) {
      const evs = db.events.filter((e) => e.batteryId === b.id && e.newState);
      const last = evs[evs.length - 1];
      if (last) expect(last.newState).toBe(b.lifecycleState);
      for (const e of evs) {
        if (e.previousState && e.newState && e.previousState !== e.newState) {
          expect(canTransition(e.previousState, e.newState), `${b.label}: ${e.previousState} -> ${e.newState}`).toBe(true);
        }
      }
    }
  });

  it('only qualifies batteries whose approved final test meets the demonstration threshold', () => {
    for (const b of db.batteries.filter((x) => ['qualified', 'reserved', 'deployed'].includes(x.lifecycleState))) {
      const fam = db.families.find((f) => f.id === b.familyId)!;
      const t = db.tests.find((x) => x.batteryId === b.id && x.kind === 'final' && x.status === 'approved')!;
      expect(t, b.label).toBeTruthy();
      expect((t.result.capacityAh! / fam.ratedCapacityAh) * 100).toBeGreaterThanOrEqual(QUALIFICATION_THRESHOLD_PCT);
    }
  });

  it('reproduces the blueprint walkthrough scenarios', () => {
    const byLabel = (l: string) => db.batteries.find((b) => b.label === l)!;
    expect(byLabel('B-0001').lifecycleState).toBe('received');
    expect(db.tests.some((t) => t.batteryId === byLabel('B-0001').id)).toBe(false);
    const b2 = byLabel('B-0002');
    const caps = db.tests.filter((t) => t.batteryId === b2.id).map((t) => t.result.capacityAh);
    expect(caps).toEqual([120, 174]);
    expect(byLabel('B-0003').lifecycleState).toBe('rejected');
    expect(db.warranties.find((w) => w.batteryId === byLabel('B-0005').id)?.state).toBe('claim_open');
    expect(byLabel('B-0006').lifecycleState).toBe('recycled');
  });

  it('keeps inventory groups mutually exclusive', () => {
    for (const b of db.batteries) expect(inventoryGroupOf(b.lifecycleState)).toBeTruthy();
  });

  it('generates 30 days of 15-minute telemetry, with a stale gateway and unavailable resistance', () => {
    const t = buildTelemetry(db);
    expect(t.length).toBeGreaterThan(20_000);
    expect(db.gateways.some((g) => g.status === 'offline')).toBe(true);
    expect(db.gateways.some((g) => g.status === 'degraded')).toBe(true);
    const unavailable = new Set(db.sensors.filter((s) => s.resistanceSource === 'unavailable').map((s) => s.id));
    expect(unavailable.size).toBeGreaterThan(0);
    expect(t.filter((o) => unavailable.has(o.sensorId)).every((o) => o.resistanceMOhm === null)).toBe(true);
  });
});
