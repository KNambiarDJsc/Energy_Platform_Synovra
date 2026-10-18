import { describe, expect, it } from 'vitest';
import { ForbiddenError, ConflictError } from '@/domain/permissions';
import { computeEconomics } from '@/services/mock/restoration';
import { parseCsv, parseDate } from '@/domain/csv';
import { SAMPLE_CSV } from '@/domain/csv';
import { harness, rejects, USERS } from './helpers';

const goodTest = (batteryId: string, over: Record<string, unknown> = {}) => ({
  batteryId, kind: 'initial' as const, protocolId: 'proto_c10', voltageV: 12.4, resistanceMOhm: 4.1, temperatureC: 25,
  capacityAh: 140, ambientTempC: 25, loadCurrentA: 20, cutoffVoltageV: 10.8, durationH: 7, instrument: 'Bench DB-2',
  calibrationRef: 'CAL-DEMO', witnessName: null, evidenceFileName: 'report.pdf', notes: '', ...over,
});

describe('battery creation and duplicate serials', () => {
  it('creates a battery with a permanent UUID, a separate QR reference and an intake event', async () => {
    const h = harness(USERS.lab);
    const fam = (await h.svc.batteries.families())[0];
    const { battery, warnings } = await h.svc.batteries.create({
      familyId: fam.id, manufacturerSerial: 'AV200-25-999001', manufacturedOn: '2024-02-01', physicalLocation: 'Receiving bay',
      legacyId: 'LAB-9001', acquisitionCostAed: null,
    });
    expect(battery.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(battery.publicRef).toMatch(/^SYN-/);
    expect(battery.id).not.toBe(battery.publicRef);
    expect(battery.lifecycleState).toBe('received');
    expect(warnings).toEqual([]);
    const passport = await h.svc.batteries.get(battery.id);
    expect(passport.events.map((e) => e.type)).toEqual(['intake']);
    // cost left blank stays unknown, never zero
    const cost = h.store.db.costs.find((c) => c.batteryId === battery.id)!;
    expect(cost.amountAed).toBeNull();
  });

  it('blocks a duplicate serial unless acknowledged, and never merges records', async () => {
    const h = harness(USERS.lab);
    const existing = h.store.db.batteries.find((b) => b.manufacturerSerial && b.familyId === 'f1')!;
    const before = h.store.db.batteries.length;
    const err = await rejects(h.svc.batteries.create({ familyId: 'f1', manufacturerSerial: existing.manufacturerSerial!.toLowerCase(), manufacturedOn: null, physicalLocation: 'Bay', legacyId: null, acquisitionCostAed: null }));
    expect(err).toBeInstanceOf(ConflictError);
    expect(h.store.db.batteries.length).toBe(before);
    const ok = await h.svc.batteries.create({ familyId: 'f1', manufacturerSerial: existing.manufacturerSerial!, manufacturedOn: null, physicalLocation: 'Bay', legacyId: null, acquisitionCostAed: null, acknowledgeDuplicate: true });
    expect(ok.battery.id).not.toBe(existing.id);
    expect(ok.warnings.join(' ')).toMatch(/identity review/);
    const passport = await h.svc.batteries.get(ok.battery.id);
    expect(passport.quality.level).toBe('conflict');
    expect(passport.relatedBatteries.some((r) => r.id === existing.id)).toBe(true);
  });

  it('keeps the permanent ID when a QR label is reissued, and resolves the retired reference', async () => {
    const h = harness(USERS.lab);
    const b = h.store.db.batteries[10];
    const old = b.publicRef;
    const { battery } = await h.svc.batteries.reissueLabel(b.id, 'Label damaged in handling');
    expect(battery.id).toBe(b.id);
    expect(battery.publicRef).not.toBe(old);
    const res = await h.svc.batteries.lookupByPublicRef(old);
    expect(res.status).toBe('retired');
    expect(res.batteryId).toBe(b.id);
    expect((await h.svc.batteries.lookupByPublicRef('SYN-NOPE-0000')).status).toBe('unknown');
  });

  it('records corrections with the previous value and reason', async () => {
    const h = harness(USERS.admin);
    const b = h.store.db.batteries.find((x) => x.manufacturerSerial)!;
    const prev = b.manufacturerSerial;
    await h.svc.batteries.correct({ batteryId: b.id, field: 'manufacturerSerial', newValue: 'AV200-25-CORR01', reason: 'Label mis-read at intake' });
    const ev = h.store.db.events.filter((e) => e.batteryId === b.id && e.type === 'identity').pop()!;
    expect(ev.correction).toEqual({ field: 'manufacturerSerial', previous: prev, next: 'AV200-25-CORR01' });
    expect(h.store.db.audit[0].action).toBe('battery.correct');
  });
});

describe('CSV import', () => {
  it('parses quotes and validates dates', () => {
    expect(parseCsv('a,b\n"x,1","y ""q"""\n').rows[0]).toEqual(['x,1', 'y "q"']);
    expect(parseDate('31/02/2024', new Date()).error).toMatch(/does not exist/);
    expect(parseDate('2040-01-01', new Date('2026-10-13')).error).toMatch(/future/);
    expect(parseDate('18/03/2024', new Date('2026-10-13')).iso).toBe('2024-03-18');
  });

  it('stages rows, flags duplicates/units/dates, and keeps original and normalised values', async () => {
    const h = harness(USERS.lab);
    const job = await h.svc.imports.preview({ fileName: 'intake.csv', text: SAMPLE_CSV, templateId: 'tpl_std' });
    expect(job.status).toBe('previewed');
    expect(job.counts).toEqual({ created: 5, updated: 0, skipped: 0, quarantined: 3 });
    const near = job.rows.find((r) => r.rowNumber === 5)!;
    expect(near.outcome).toBe('quarantine');
    expect(near.issues.some((i) => /in this file/.test(i.message))).toBe(true);
    const kwh = job.rows.find((r) => r.rowNumber === 8)!;
    expect(kwh.issues.some((i) => i.field === 'capacity' && i.severity === 'error')).toBe(true);
    const cost = job.rows.find((r) => r.rowNumber === 4)!;
    expect(cost.fields.acquisition_cost).toEqual({ original: '', normalized: null });
    expect(cost.fields.manufactured).toEqual({ original: '18/03/2024', normalized: '2024-03-18' });
    expect(job.fileName).toBe('intake.csv');
    expect(job.mappingVersion).toContain('v1.0');
    // preview must not write batteries
    expect(h.store.db.batteries.some((b) => b.manufacturerSerial === 'AV200-25-410021')).toBe(false);
  });

  it('commits valid rows, quarantines the rest, and is idempotent on re-import', async () => {
    const h = harness(USERS.lab);
    const before = h.store.db.batteries.length;
    const first = await h.svc.imports.commit((await h.svc.imports.preview({ fileName: 'intake.csv', text: SAMPLE_CSV, templateId: 'tpl_std' })).id);
    expect(first.counts).toEqual({ created: 5, updated: 0, skipped: 0, quarantined: 3 });
    expect(h.store.db.batteries.length).toBe(before + 5);
    // missing cost remains unknown, not zero
    const noCost = h.store.db.batteries.find((b) => b.manufacturerSerial === 'AV200-25-410023')!;
    expect(h.store.db.costs.find((c) => c.batteryId === noCost.id)!.amountAed).toBeNull();
    const eventsAfterFirst = h.store.db.events.length;

    const second = await h.svc.imports.preview({ fileName: 'intake.csv', text: SAMPLE_CSV, templateId: 'tpl_std' });
    expect(second.priorCommitAt).toBeTruthy();
    expect(second.counts).toEqual({ created: 0, updated: 0, skipped: 5, quarantined: 3 });
    const committed = await h.svc.imports.commit(second.id);
    expect(committed.counts.created).toBe(0);
    expect(h.store.db.batteries.length).toBe(before + 5);
    expect(h.store.db.events.length).toBe(eventsAfterFirst);
  });

  it('is restricted to roles with import permission', async () => {
    const h = harness(USERS.field1);
    expect(await rejects(h.svc.imports.preview({ fileName: 'x.csv', text: SAMPLE_CSV, templateId: 'tpl_std' }))).toBeInstanceOf(ForbiddenError);
  });
});

describe('test approval workflow', () => {
  it('lets a lab operator draft and submit, but only an engineer approve; the first test moves received -> testing', async () => {
    const h = harness(USERS.lab);
    const b = h.store.db.batteries.find((x) => x.lifecycleState === 'received')!;
    const t = await h.svc.tests.create(goodTest(b.id));
    expect(t.status).toBe('draft');
    await h.svc.tests.submit(t.id);
    expect(h.store.db.batteries.find((x) => x.id === b.id)!.lifecycleState).toBe('testing');
    expect(await rejects(h.svc.tests.approve(t.id, 'Looks right'))).toBeInstanceOf(ForbiddenError);
    h.as(USERS.admin);
    expect(await rejects(h.svc.tests.approve(t.id, 'Looks right'))).toBeInstanceOf(ForbiddenError);
    h.as(USERS.eng);
    const approved = await h.svc.tests.approve(t.id, 'Conditions per protocol');
    expect(approved.status).toBe('approved');
    expect(approved.reviewerName).toBe('Hamid Rahimi');
  });

  it('requires conditions with a capacity result and a reason for rejection', async () => {
    const h = harness(USERS.lab);
    const b = h.store.db.batteries[0];
    const err = await rejects(h.svc.tests.create(goodTest(b.id, { loadCurrentA: null, cutoffVoltageV: null })));
    expect(err.name).toBe('ValidationError');
    h.as(USERS.eng2);
    const t = await h.svc.tests.create(goodTest(b.id));
    await h.svc.tests.submit(t.id);
    h.as(USERS.eng);
    expect((await rejects(h.svc.tests.reject(t.id, 'no', 'data_entry_error'))).name).toBe('ValidationError');
  });

  it('records a reason code with every rejection or rework, and clears it on resubmission', async () => {
    const h = harness(USERS.eng2);
    const b = h.store.db.batteries[0];
    const t = await h.svc.tests.create(goodTest(b.id));
    await h.svc.tests.submit(t.id);
    h.as(USERS.eng);
    const missing = await rejects(h.svc.tests.requestRework(t.id, 'Cut-off voltage looks wrong', undefined as never));
    expect(missing.name).toBe('ValidationError');
    expect(missing.message).toMatch(/reason code/);
    expect((await rejects(h.svc.tests.reject(t.id, 'Cut-off voltage looks wrong', 'not_a_code' as never))).name).toBe('ValidationError');
    const sent = await h.svc.tests.requestRework(t.id, 'Cut-off voltage looks wrong', 'conditions_out_of_protocol');
    expect(sent).toMatchObject({ status: 'requires_rework', reviewReasonCode: 'conditions_out_of_protocol' });
    expect(h.store.db.audit[0].summary).toBe('Rework [conditions_out_of_protocol]: Cut-off voltage looks wrong');
    h.as(USERS.eng2);
    expect((await h.svc.tests.submit(t.id)).reviewReasonCode).toBeNull();
  });

  it('enforces separation of duties between submitter and reviewer', async () => {
    const h = harness(USERS.eng);
    const b = h.store.db.batteries.find((x) => x.lifecycleState === 'received')!;
    const t = await h.svc.tests.create(goodTest(b.id));
    await h.svc.tests.submit(t.id);
    expect(await rejects(h.svc.tests.approve(t.id, 'Self approval'))).toBeInstanceOf(ConflictError);
  });

  it('blocks the operator who recorded a test from approving it, even when someone else submitted it', async () => {
    const h = harness(USERS.eng);
    const b = h.store.db.batteries.find((x) => x.lifecycleState === 'received')!;
    const t = await h.svc.tests.create(goodTest(b.id));
    h.as(USERS.lab);
    await h.svc.tests.submit(t.id);
    h.as(USERS.eng);
    expect(await rejects(h.svc.tests.approve(t.id, 'Approving my own measurement'))).toBeInstanceOf(ConflictError);
    h.as(USERS.eng2);
    expect((await h.svc.tests.approve(t.id, 'Independent review')).status).toBe('approved');
  });
});

describe('restoration outcome labels', () => {
  async function awaitingReview(h: ReturnType<typeof harness>, capacityAh: number) {
    h.as(USERS.lab);
    const b = h.store.db.batteries.find((x) => x.lifecycleState === 'restoration_candidate' && x.familyId === 'f1')!;
    const attempt = await h.svc.restoration.createAttempt({ batteryId: b.id, batchId: 'RB-2026-09' });
    const after = await h.svc.tests.create(goodTest(b.id, { kind: 'final', capacityAh }));
    await h.svc.tests.submit(after.id);
    await h.svc.restoration.submitForReview(attempt.id, after.id);
    h.as(USERS.eng);
    await h.svc.tests.approve(after.id, 'Record matches bench log');
    return { b, attempt };
  }

  it('requires a reason code for rework and rejection, and refuses one on approval', async () => {
    const h = harness();
    const { attempt } = await awaitingReview(h, 190);
    expect((await rejects(h.svc.restoration.decide(attempt.id, 'reject', 'Case cracked on inspection'))).message).toMatch(/reason code/);
    expect((await rejects(h.svc.restoration.decide(attempt.id, 'rework', 'Repeat the step', 'nope' as never))).name).toBe('ValidationError');
    expect((await rejects(h.svc.restoration.decide(attempt.id, 'approve', 'Meets the threshold', 'other'))).message).toMatch(/no reason code/);
    const approved = await h.svc.restoration.decide(attempt.id, 'approve', 'Meets the demonstration threshold');
    expect(approved).toMatchObject({ status: 'approved', decisionReasonCode: null });
  });

  it('stores the code, writes it into the history and counts it in the batch results', async () => {
    const h = harness();
    const before = (await h.svc.restoration.batchResults('RB-2026-09')).notQualifiedReasons;
    const count = (code: string, list: typeof before) => list.find((x) => x.code === code)?.count ?? 0;
    const { b, attempt } = await awaitingReview(h, 150);
    const r = await h.svc.restoration.decide(attempt.id, 'reject', 'Case cracked on inspection', 'physical_damage');
    expect(r.decisionReasonCode).toBe('physical_damage');
    const passport = await h.svc.batteries.get(b.id);
    expect(passport.events.at(-1)).toMatchObject({ type: 'rejection', reason: 'Physical damage found. Case cracked on inspection' });
    const after = (await h.svc.restoration.batchResults('RB-2026-09')).notQualifiedReasons;
    expect(count('physical_damage', after)).toBe(count('physical_damage', before) + 1);
    expect(after.map((x) => x.count)).toEqual([...after.map((x) => x.count)].sort((x, y) => y - x));
  });
});

describe('restoration state transitions', () => {
  async function candidate(h: ReturnType<typeof harness>) {
    return h.store.db.batteries.find((b) => b.lifecycleState === 'restoration_candidate' && b.familyId === 'f1')!;
  }

  it('runs candidate -> attempt -> review -> qualified while preserving identity', async () => {
    const h = harness(USERS.lab);
    const b = await candidate(h);
    const id = b.id;
    const attempt = await h.svc.restoration.createAttempt({ batteryId: id, batchId: 'RB-2026-09', lotRefs: [{ kind: 'material', ref: 'LOT-REF-DEMO-1' }] });
    expect(b.lifecycleState).toBe('in_restoration');
    // cannot create a second concurrent attempt
    expect(await rejects(h.svc.restoration.createAttempt({ batteryId: id, batchId: 'RB-2026-09' }))).toBeInstanceOf(ConflictError);
    await h.svc.restoration.addNote(attempt.id, 'Step recorded in controlled system');
    const after = await h.svc.tests.create(goodTest(id, { kind: 'final', capacityAh: 180 }));
    await h.svc.tests.submit(after.id);
    await h.svc.restoration.submitForReview(attempt.id, after.id);
    expect(b.lifecycleState).toBe('awaiting_review');
    // lab operator cannot decide
    expect(await rejects(h.svc.restoration.decide(attempt.id, 'approve', 'Looks good enough'))).toBeInstanceOf(ForbiddenError);
    h.as(USERS.eng);
    // after-test record must be approved first
    expect(await rejects(h.svc.restoration.decide(attempt.id, 'approve', 'Meets threshold'))).toBeInstanceOf(ConflictError);
    await h.svc.tests.approve(after.id, 'Matches bench log');
    const done = await h.svc.restoration.decide(attempt.id, 'approve', 'Meets the demonstration threshold');
    expect(done.status).toBe('approved');
    expect(b.lifecycleState).toBe('qualified');
    expect(b.id).toBe(id);
  });

  it('refuses to approve qualification below the threshold, but allows rework or rejection', async () => {
    const h = harness(USERS.lab);
    const b = await candidate(h);
    const attempt = await h.svc.restoration.createAttempt({ batteryId: b.id, batchId: 'RB-2026-09' });
    const after = await h.svc.tests.create(goodTest(b.id, { kind: 'final', capacityAh: 150 })); // 75% of 200 Ah
    await h.svc.tests.submit(after.id);
    await h.svc.restoration.submitForReview(attempt.id, after.id);
    h.as(USERS.eng);
    await h.svc.tests.approve(after.id, 'Record matches bench log');
    expect(await rejects(h.svc.restoration.decide(attempt.id, 'approve', 'Try to approve anyway'))).toBeInstanceOf(ConflictError);
    const r = await h.svc.restoration.decide(attempt.id, 'rework', 'Below threshold; repeat the step', 'below_capacity_threshold');
    expect(r.status).toBe('rework');
    expect(b.lifecycleState).toBe('rework');
    // a second attempt keeps the same battery and increments the attempt number
    h.as(USERS.lab);
    const a2 = await h.svc.restoration.createAttempt({ batteryId: b.id, batchId: 'RB-2026-09' });
    expect(a2.attemptNo).toBe(2);
  });

  it('rejects illegal lifecycle jumps', async () => {
    const h = harness(USERS.eng);
    const received = h.store.db.batteries.find((b) => b.lifecycleState === 'received')!;
    expect(await rejects(h.svc.restoration.markCandidate(received.id, 'Skip ahead please'))).toBeInstanceOf(ConflictError);
    expect(await rejects(h.svc.restoration.createAttempt({ batteryId: received.id, batchId: 'RB-2026-09' }))).toBeInstanceOf(ConflictError);
  });
});

describe('deployment and assignment overlap', () => {
  it('moves a qualified battery to a vacant compatible slot and writes history', async () => {
    const h = harness(USERS.field1);
    const q = h.store.db.batteries.find((b) => b.lifecycleState === 'qualified' && b.familyId === 'f1')!;
    const v = await h.svc.deployments.validate(q.id, 'str2-p4');
    expect(v.ok).toBe(true);
    await h.svc.deployments.move({ batteryId: q.id, slotId: 'str2-p4', reason: 'Planned commissioning' });
    expect(q.lifecycleState).toBe('deployed');
    expect(q.siteId).toBe('s1');
    const ev = h.store.db.events.filter((e) => e.batteryId === q.id).pop()!;
    expect(ev.type).toBe('deployment');
    expect(ev.previousState).toBe('qualified');
  });

  it('prevents overlapping assignments and incompatible placements', async () => {
    const h = harness(USERS.field1);
    const q = h.store.db.batteries.find((b) => b.lifecycleState === 'qualified' && b.familyId === 'f1')!;
    // occupied slot
    expect(await rejects(h.svc.deployments.move({ batteryId: q.id, slotId: 'str1-p1', reason: 'Trying to overwrite' }))).toBeInstanceOf(ConflictError);
    // wrong family (str3 is gel)
    const v = await h.svc.deployments.validate(q.id, 'str3-p4');
    expect(v.ok).toBe(false);
    expect(v.checks.find((c) => c.id === 'family')!.status).toBe('fail');
    // unqualified battery (field staff cannot even see lab-pipeline stock, so check as an engineer)
    h.as(USERS.eng);
    const lab = h.store.db.batteries.find((b) => b.lifecycleState === 'awaiting_review' && b.familyId === 'f1')!;
    expect((await h.svc.deployments.validate(lab.id, 'str2-p4')).checks.find((c) => c.id === 'state')!.status).toBe('fail');
    // store-level guard
    expect(() => h.store.insertAssignment({ id: 'x', batteryId: q.id, slotId: 'str1-p1', startAt: h.store.now(), endAt: null, reason: 't', actorId: 'u' })).toThrow(/overlapping/);
  });

  it('keeps earlier assignments when a battery is moved between slots', async () => {
    const h = harness(USERS.field1);
    const b = h.store.db.batteries.find((x) => x.label === 'B-0004')!;
    const before = h.store.db.assignments.filter((a) => a.batteryId === b.id).length;
    await h.svc.deployments.move({ batteryId: b.id, slotId: 'str2-p4', reason: 'Rebalance string positions' });
    const asg = h.store.db.assignments.filter((a) => a.batteryId === b.id);
    expect(asg.length).toBe(before + 1);
    expect(asg.filter((a) => !a.endAt)).toHaveLength(1);
    expect(b.currentAssignmentId).toBe(asg.find((a) => !a.endAt)!.id);
  });

  it('keeps field technicians inside their site scope', async () => {
    const h = harness(USERS.field1); // s1, s2 only
    const q = h.store.db.batteries.find((b) => b.lifecycleState === 'qualified' && b.familyId === 'f1')!;
    const v = await h.svc.deployments.validate(q.id, 'str6-p2'); // site s5
    expect(v.checks.find((c) => c.id === 'scope')!.status).toBe('fail');
  });
});

describe('alerts and tasks', () => {
  it('acknowledges without changing battery state, and requires a reason to resolve', async () => {
    const h = harness(USERS.field1);
    const a = h.store.db.alerts.find((x) => x.state === 'open' && x.batteryId && ['s1', 's2'].includes(x.siteId)) ?? h.store.db.alerts.find((x) => x.state === 'open' && x.batteryId)!;
    h.as(USERS.noc);
    const b = h.store.db.batteries.find((x) => x.id === a.batteryId)!;
    const stateBefore = b.lifecycleState;
    const testsBefore = h.store.db.tests.length;
    const acked = await h.svc.alerts.acknowledge(a.id);
    expect(acked.state).toBe('acknowledged');
    expect(b.lifecycleState).toBe(stateBefore);
    expect(h.store.db.tests.length).toBe(testsBefore);
    expect((await rejects(h.svc.alerts.resolve(a.id, ''))).name).toBe('ValidationError');
    const assignee = ['s1', 's2'].includes(a.siteId) ? 'u_field1' : 'u_field2';
    const assigned = await h.svc.alerts.assign(a.id, assignee, 'Please inspect');
    expect(assigned.state).toBe('assigned');
    await h.svc.alerts.start(a.id);
    const resolved = await h.svc.alerts.resolve(a.id, 'Re-measured within band after charger fix');
    expect(resolved.resolutionReason).toMatch(/Re-measured/);
    expect(resolved.history.map((x) => x.to)).toEqual(['open', 'acknowledged', 'assigned', 'in_progress', 'resolved']);
    expect(await rejects(h.svc.alerts.acknowledge(a.id))).toBeInstanceOf(ConflictError);
  });

  it('does not let customers or finance act on alerts', async () => {
    const h = harness(USERS.cust);
    const list = await h.svc.alerts.list();
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((a) => ['s1', 's2'].includes(a.siteId))).toBe(true);
    expect(list.every((a) => a.source.kind !== 'model')).toBe(true);
    expect(await rejects(h.svc.alerts.acknowledge(list[0].id))).toBeInstanceOf(ForbiddenError);
    h.as(USERS.fin);
    expect(await rejects(h.svc.alerts.acknowledge(list[0].id))).toBeInstanceOf(ForbiddenError);
  });
});

describe('role restrictions and customer redaction', () => {
  it('limits the register and passport for a customer, and hides costs, process data and audit', async () => {
    const h = harness(USERS.cust);
    const list = await h.svc.batteries.list();
    expect(list.length).toBeGreaterThan(0);
    expect(list.length).toBeLessThan(h.store.db.batteries.length);
    const own = list.find((b) => b.lifecycleState === 'deployed')!;
    const p = await h.svc.batteries.get(own.id);
    expect(p.redacted).toBe(true);
    expect(p.costs).toBeNull();
    expect(p.attempts).toEqual([]);
    expect(p.audit).toBeNull();
    expect(p.predictions).toEqual([]);
    expect(p.battery.internalNotes).toBe('');
    expect(p.evidence.every((e) => e.classification === 'customer_visible')).toBe(true);
    expect(p.events.every((e) => e.evidence.every((x) => x.classification === 'customer_visible'))).toBe(true);
    expect(p.events.filter((e) => e.type === 'restoration').every((e) => /confidential/i.test(e.reason))).toBe(true);
    expect(p.tests.every((t) => t.status === 'approved')).toBe(true);
    expect(p.redactions.length).toBeGreaterThan(0);
  });

  it('hides other tenants’ batteries from a customer', async () => {
    const h = harness(USERS.cust);
    const other = h.store.db.batteries.find((b) => b.siteId === 's4')!; // Tenant B site
    const { NotFoundError } = await import('@/domain/permissions');
    expect(await rejects(h.svc.batteries.get(other.id))).toBeInstanceOf(NotFoundError);
    expect((await h.svc.batteries.lookupByPublicRef(other.publicRef)).status).toBe('forbidden');
  });

  it('shows costs to finance only, and internal report sections are stripped for customer audience', async () => {
    const h = harness(USERS.fin);
    const dep = h.store.db.batteries.find((b) => b.lifecycleState === 'deployed')!;
    expect((await h.svc.batteries.get(dep.id)).costs).not.toBeNull();
    h.as(USERS.eng);
    expect((await h.svc.batteries.get(dep.id)).costs).toBeNull();
    h.as(USERS.fin);
    const internal = await h.svc.reports.generate({ templateId: 'battery_passport', scopeId: dep.id, from: '2026-01-01', to: '2026-10-13', audience: 'internal' });
    expect(internal.sections.some((s) => s.visibility === 'internal')).toBe(true);
    const customer = await h.svc.reports.generate({ templateId: 'battery_passport', scopeId: dep.id, from: '2026-01-01', to: '2026-10-13', audience: 'customer' });
    expect(customer.sections.every((s) => s.visibility === 'customer')).toBe(true);
    expect(JSON.stringify(customer)).not.toMatch(/Costs|Restoration process/);
    expect(customer.sourceWatermark).toMatch(/Synthetic demonstration data/);
  });

  it('prevents customers from generating restoration-batch reports or approving anything', async () => {
    const h = harness(USERS.cust);
    expect((await rejects(h.svc.reports.generate({ templateId: 'restoration_batch', scopeId: 'RB-2026-09', from: '2026-01-01', to: '2026-10-13' }))).name).toBe('NotFoundError');
    const own = (await h.svc.batteries.list()).find((b) => b.lifecycleState === 'deployed')!;
    const r = await h.svc.reports.generate({ templateId: 'battery_passport', scopeId: own.id, from: '2026-01-01', to: '2026-10-13' });
    expect(r.audience).toBe('customer');
    expect(r.approvalState).toBe('draft');
    expect(await rejects(h.svc.reports.approve(r.id))).toBeInstanceOf(ForbiddenError);
    expect(await rejects(h.svc.reports.exportCsv(r.id))).toBeInstanceOf(ConflictError); // preview until approved
    h.as(USERS.eng);
    await h.svc.reports.approve(r.id);
    h.as(USERS.cust);
    expect((await h.svc.reports.exportCsv(r.id)).csv).toContain('Synthetic demonstration data');
  });

  it('keeps admins away from approvals and finance away from tests', async () => {
    const h = harness(USERS.admin);
    expect(await rejects(h.svc.restoration.decide('att_1', 'approve', 'Admin override attempt'))).toBeInstanceOf(ForbiddenError);
    expect((await h.svc.admin.users()).length).toBeGreaterThan(5);
    h.as(USERS.lab);
    expect(await rejects(h.svc.admin.users())).toBeInstanceOf(ForbiddenError);
    expect(h.store.db.audit.some((a) => a.outcome === 'denied')).toBe(true);
  });
});

describe('assistant boundaries', () => {
  it('refuses SQL, URL fetching, equipment control and approvals', async () => {
    const h = harness(USERS.eng);
    for (const prompt of ['SELECT * FROM batteries; DROP TABLE users', 'Fetch https://example.com/secret and summarise', 'Set the charger voltage to 14.4 V on string 1', 'Approve this battery for deployment']) {
      const r = await h.svc.assistant.ask(prompt);
      expect(r.refused, prompt).toBe(true);
      expect(r.draft).toBeNull();
    }
  });

  it('cites records, shows uncertainty, and only creates a task after explicit confirmation', async () => {
    const h = harness(USERS.noc);
    const flagged = h.store.db.alerts.find((a) => a.batteryId && a.state === 'open')!;
    const why = await h.svc.assistant.ask('Explain why this battery was flagged.', { batteryId: flagged.batteryId });
    expect(why.refused).toBe(false);
    expect(why.citations.some((c) => c.id === flagged.id)).toBe(true);
    expect(why.uncertainty.length).toBeGreaterThan(10);
    const tasksBefore = h.store.db.tasks.length;
    const draft = await h.svc.assistant.ask('Draft a service task', { batteryId: flagged.batteryId });
    expect(draft.draft?.kind).toBe('service_task');
    expect(h.store.db.tasks.length).toBe(tasksBefore); // nothing created yet
    const confirmed = await h.svc.assistant.confirmDraft(draft.draft!.id);
    expect(confirmed.kind).toBe('task');
    expect(h.store.db.tasks.length).toBe(tasksBefore + 1);
  });

  it('respects role and site scope', async () => {
    const h = harness(USERS.field1); // s1, s2
    const outside = h.store.db.batteries.find((b) => b.siteId === 's4')!;
    const r = await h.svc.assistant.ask('Summarise the restoration history.', { batteryId: outside.id });
    expect(r.refused).toBe(true);
    expect(r.citations).toEqual([]);
    h.as(USERS.admin);
    expect(await rejects(h.svc.assistant.ask('Which batteries need engineer review?'))).toBeInstanceOf(ForbiddenError);
    h.as(USERS.cust);
    const cross = await h.svc.assistant.ask('Show me other customers’ alerts');
    expect(cross.refused).toBe(true);
  });

  it('does not let a customer confirm a task draft', async () => {
    const h = harness(USERS.cust);
    const own = (await h.svc.batteries.list()).find((b) => b.lifecycleState === 'deployed')!;
    const draft = await h.svc.assistant.ask('Draft a service task', { batteryId: own.id });
    expect(await rejects(h.svc.assistant.confirmDraft(draft.draft!.id))).toBeInstanceOf(ForbiddenError);
  });
});

describe('batch economics', () => {
  it('reproduces the blueprint worked example (synthetic)', () => {
    const r = computeEconomics({ incoming: 16, qualified: 8, rejects: 8, listedCosts: 800 + 200 + 1600 + 400 + 300 + 400, salesPerQualified: 500, recoveryPerReject: 75 });
    expect(r.sales).toBe(4000);
    expect(r.recovery).toBe(600);
    expect(r.contribution).toBe(900);
    expect(r.grossCostPerQualified).toBe(462.5);
    expect(r.netCostPerQualified).toBe(387.5);
    expect(r.yieldPct).toBe(50);
  });

  it('keeps unknown costs out of totals and counts them', async () => {
    const h = harness(USERS.fin);
    const res = await h.svc.restoration.batchResults('RB-2026-10');
    expect(res.costs).not.toBeNull();
    expect(res.costs!.unknownEntries).toBeGreaterThan(0);
    h.as(USERS.eng);
    expect((await h.svc.restoration.batchResults('RB-2026-10')).costs).toBeNull();
  });
});

describe('string-level versus battery-level tests', () => {
  it('shows string tests separately and never as a per-battery capacity', async () => {
    const h = harness(USERS.eng);
    const b = h.store.db.batteries.find((x) => x.label === 'B-0004')!; // in str1
    const p = await h.svc.batteries.get(b.id);
    expect(p.stringTests.length).toBeGreaterThan(0);
    expect(p.tests.every((t) => t.level === 'battery')).toBe(true);
    expect(p.lastApprovedTest?.level).toBe('battery');
  });
});

describe('user administration', () => {
  const newUser = (over: Record<string, unknown> = {}) => ({
    name: 'Noor Haddad', title: 'Lab operator', email: 'Noor.Haddad@example.invalid', role: 'lab_operator' as const,
    tenantId: 't_ops', siteScope: 'all' as const, ...over,
  });

  it('lets an administrator add a user, with a normalised unique email, and audits it', async () => {
    const h = harness(USERS.admin);
    const u = await h.svc.admin.createUser(newUser());
    expect(u).toMatchObject({ email: 'noor.haddad@example.invalid', active: true, role: 'lab_operator' });
    expect(h.store.db.audit[0]).toMatchObject({ action: 'admin.user_create', entityId: u.id });
    expect(await rejects(h.svc.admin.createUser(newUser({ email: 'NOOR.haddad@example.invalid' })))).toBeInstanceOf(ConflictError);
  });

  it('refuses user management to everyone except administrators', async () => {
    const h = harness(USERS.eng);
    expect(await rejects(h.svc.admin.createUser(newUser()))).toBeInstanceOf(ForbiddenError);
    expect(await rejects(h.svc.admin.updateUser(USERS.lab, { role: 'battery_engineer' }))).toBeInstanceOf(ForbiddenError);
  });

  it('keeps role, tenant and site scope consistent', async () => {
    const h = harness(USERS.admin);
    // Internal roles belong to the operator tenant; customers to a customer tenant, scoped to their own sites.
    expect((await rejects(h.svc.admin.createUser(newUser({ tenantId: 't_custA' })))).message).toMatch(/operator tenant/);
    expect((await rejects(h.svc.admin.createUser(newUser({ role: 'customer_auditor' })))).message).toMatch(/customer tenant/);
    expect((await rejects(h.svc.admin.createUser(newUser({ role: 'customer_auditor', tenantId: 't_custA', siteScope: ['s3'] })))).message).toMatch(/does not belong/);
    expect((await rejects(h.svc.admin.createUser(newUser({ siteScope: ['nope'] })))).message).toMatch(/not found/);
    const c = await h.svc.admin.createUser(newUser({ email: 'auditor@example.invalid', role: 'customer_auditor', tenantId: 't_custA', siteScope: ['s1'] }));
    expect(c.siteScope).toEqual(['s1']);
  });

  it('changes role and scope with a before/after audit entry, and the change takes effect', async () => {
    const h = harness(USERS.admin);
    const u = await h.svc.admin.updateUser(USERS.lab2, { role: 'battery_engineer', siteScope: ['s1'] });
    expect(u).toMatchObject({ role: 'battery_engineer', siteScope: ['s1'] });
    expect(h.store.db.audit[0].summary).toMatch(/role: Lab operator → Battery engineer; site scope: all sites → 1 site\(s\)/);
    h.as(USERS.lab2);
    expect(h.svc.actor().role).toBe('battery_engineer');
  });

  it('protects against lock-out: administrators cannot change their own role or deactivate themselves', async () => {
    const h = harness(USERS.admin);
    expect((await rejects(h.svc.admin.updateUser(USERS.admin, { role: 'finance_owner' }))).message).toMatch(/own role/);
    expect((await rejects(h.svc.admin.setUserActive(USERS.admin, false))).message).toMatch(/own account/);
    const second = await h.svc.admin.createUser(newUser({ email: 'admin2@example.invalid', role: 'platform_admin' }));
    h.as(second.id);
    // A second administrator may change the first one's role, which takes effect immediately.
    await h.svc.admin.updateUser(USERS.admin, { role: 'finance_owner' });
    h.as(USERS.admin);
    expect(await rejects(h.svc.admin.setUserActive(second.id, false))).toBeInstanceOf(ForbiddenError);
  });
});
