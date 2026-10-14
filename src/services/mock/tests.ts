import { reasonSchema, testInputSchema } from '@/domain/schemas';
import { ConflictError, NotFoundError, ValidationError, can } from '@/domain/permissions';
import type { TestSession } from '@/domain/types';
import {
  audit, canSeeBattery, canSeeEvidence, canSeeSite, db, familyOf, latency, newEvidence, pctOfRated, pushEvent, authorize, ruleCheck, setState, type Ctx,
} from '../core';
import type { TestRepository, TestView } from '../types';

export function toTestView(ctx: Ctx, t: TestSession): TestView {
  const d = db(ctx);
  const b = t.batteryId ? d.batteries.find((x) => x.id === t.batteryId) : null;
  const fam = b ? familyOf(ctx, b) : null;
  const protocol = d.protocols.find((p) => p.id === t.protocolId);
  const actor = ctx.actor();
  const evidence = d.evidence.filter((e) => t.evidenceIds.includes(e.id) && canSeeEvidence(actor, e));
  const famForRule = fam ?? (t.stringId ? d.families.find((f) => f.id === d.strings.find((s) => s.id === t.stringId)?.familyId) ?? null : null);
  return {
    ...t,
    batteryLabel: b?.label ?? null,
    batterySerial: b?.manufacturerSerial ?? null,
    familyModel: fam ? `${fam.manufacturer.replace(' (fictional)', '')} ${fam.model}` : null,
    ratedCapacityAh: fam?.ratedCapacityAh ?? null,
    pctOfRated: fam ? pctOfRated(t.result.capacityAh, fam.ratedCapacityAh) : null,
    protocolName: protocol ? `${protocol.name} ${protocol.revision}` : t.protocolId,
    rule: famForRule && t.level === 'battery' ? ruleCheck(t, famForRule) : { state: 'unknown', pct: null, label: 'String-level result: not a per-battery capacity' },
    evidence,
  };
}

function testOrThrow(ctx: Ctx, id: string): TestSession {
  const t = db(ctx).tests.find((x) => x.id === id);
  if (!t) throw new NotFoundError('Test');
  if (t.batteryId) {
    const b = db(ctx).batteries.find((x) => x.id === t.batteryId);
    if (!b || !canSeeBattery(ctx, b)) throw new NotFoundError('Test');
  }
  return t;
}

export function createTestRepository(ctx: Ctx): TestRepository {
  const logTestEvent = (t: TestSession, title: string, reason: string, approval: 'pending' | 'approved' | 'rejected') => {
    if (!t.batteryId) return;
    pushEvent(ctx, t.batteryId, 'test', title, reason, { approvalState: approval, ref: { kind: 'test', id: t.id }, evidenceIds: t.evidenceIds });
  };

  return {
    async list(filter = {}) {
      await latency(ctx);
      const actor = authorize(ctx, 'test.read');
      const d = db(ctx);
      const seesDrafts = can(actor.role, 'test.create');
      return d.tests
        .filter((t) => {
          if (t.batteryId) {
            const b = d.batteries.find((x) => x.id === t.batteryId);
            if (!b || !canSeeBattery(ctx, b)) return false;
          } else {
            const str = d.strings.find((x) => x.id === t.stringId);
            const site = str ? d.sites.find((x) => x.id === str.siteId) : null;
            if (!site || !canSeeSite(ctx, site)) return false;
          }
          if (!seesDrafts && t.status !== 'approved') return false;
          if (filter.status && t.status !== filter.status) return false;
          if (filter.batteryId && t.batteryId !== filter.batteryId) return false;
          return true;
        })
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        .map((t) => toTestView(ctx, t));
    },

    async get(id) {
      await latency(ctx);
      authorize(ctx, 'test.read');
      return toTestView(ctx, testOrThrow(ctx, id));
    },

    async protocols() {
      await latency(ctx);
      authorize(ctx, 'test.read');
      return db(ctx).protocols;
    },

    async create(input) {
      await latency(ctx);
      const actor = authorize(ctx, 'test.create');
      const parsed = testInputSchema.safeParse(input);
      if (!parsed.success) throw new ValidationError('Test record is invalid', parsed.error.issues.map((i) => i.message));
      const v = parsed.data;
      const d = db(ctx);
      const b = d.batteries.find((x) => x.id === v.batteryId);
      if (!b || !canSeeBattery(ctx, b)) throw new NotFoundError('Battery');
      if (['recycled'].includes(b.lifecycleState)) throw new ValidationError('A recycled battery cannot be tested.');
      const protocol = d.protocols.find((p) => p.id === v.protocolId);
      if (!protocol) throw new NotFoundError('Protocol revision');
      const problems: string[] = [];
      if (v.capacityAh !== null) {
        if (v.loadCurrentA === null) problems.push('Load current is required when a capacity result is recorded.');
        if (v.cutoffVoltageV === null) problems.push('Cut-off voltage is required when a capacity result is recorded.');
        if (v.durationH === null) problems.push('Duration is required when a capacity result is recorded.');
      }
      if ([v.voltageV, v.resistanceMOhm, v.temperatureC, v.capacityAh].every((x) => x === null)) problems.push('Record at least one measured value.');
      if (v.kind === 'final' && !v.attemptId) {
        const open = d.attempts.filter((a) => a.batteryId === b.id && a.status === 'in_restoration').pop();
        if (!open) problems.push('A final test belongs to an open restoration attempt. Create the attempt first.');
        else v.attemptId = open.id;
      }
      if (problems.length) throw new ValidationError('Test cannot be saved', problems);

      let evidenceIds: string[] = [];
      if (v.evidenceFileName) {
        const ev = newEvidence(ctx, { batteryId: b.id, kind: 'test_report', fileName: v.evidenceFileName, sizeKb: 120, classification: 'internal' });
        d.evidence.push(ev);
        evidenceIds = [ev.id];
      }
      const t: TestSession = {
        id: ctx.store.nextId('test'), batteryId: b.id, stringId: null, level: 'battery', kind: v.kind, protocolId: v.protocolId,
        status: 'draft', operatorId: actor.userId, operatorName: actor.name, witnessName: v.witnessName ?? null,
        instrument: v.instrument, calibrationRef: v.calibrationRef,
        conditions: { ambientTempC: v.ambientTempC, loadCurrentA: v.loadCurrentA, cutoffVoltageV: v.cutoffVoltageV, durationH: v.durationH },
        result: { openCircuitVoltageV: v.voltageV, internalResistanceMOhm: v.resistanceMOhm, temperatureC: v.temperatureC, capacityAh: v.capacityAh, notes: v.notes ?? '' },
        evidenceIds, attemptId: v.attemptId ?? null, startedAt: ctx.store.now(), submittedAt: null, submittedById: null,
        reviewedAt: null, reviewerId: null, reviewerName: null, reviewReason: null,
      };
      d.tests.push(t);
      audit(ctx, 'test.create', 'test', t.id, `Draft ${v.kind} test for ${b.label}`);
      ctx.store.save();
      return t;
    },

    async submit(id) {
      await latency(ctx);
      const actor = authorize(ctx, 'test.create');
      const t = testOrThrow(ctx, id);
      if (!['draft', 'requires_rework'].includes(t.status)) throw new ConflictError(`A ${t.status.replace('_', ' ')} test cannot be submitted.`);
      t.status = 'submitted';
      t.submittedAt = ctx.store.now();
      t.submittedById = actor.userId;
      t.reviewReason = null;
      const b = db(ctx).batteries.find((x) => x.id === t.batteryId);
      if (b && b.lifecycleState === 'received') {
        const prev = b.lifecycleState;
        setState(ctx, b, 'testing');
        pushEvent(ctx, b.id, 'test', 'Test submitted for review', 'First test recorded; battery moved into testing.', { previousState: prev, newState: 'testing', approvalState: 'pending', ref: { kind: 'test', id: t.id }, evidenceIds: t.evidenceIds });
      } else logTestEvent(t, 'Test submitted for review', `${t.kind.replace('_', ' ')} test submitted.`, 'pending');
      audit(ctx, 'test.submit', 'test', t.id, 'Submitted for review');
      ctx.store.save();
      return t;
    },

    async startReview(id) {
      await latency(ctx);
      authorize(ctx, 'test.review');
      const t = testOrThrow(ctx, id);
      if (t.status !== 'submitted') throw new ConflictError('Only a submitted test can enter review.');
      t.status = 'under_review';
      audit(ctx, 'test.review_start', 'test', t.id, 'Review started');
      ctx.store.save();
      return t;
    },

    async approve(id, reason) {
      await latency(ctx);
      const actor = authorize(ctx, 'test.review');
      const r = reasonSchema.safeParse(reason);
      if (!r.success) throw new ValidationError(r.error.issues[0].message);
      const t = testOrThrow(ctx, id);
      if (!['submitted', 'under_review'].includes(t.status)) throw new ConflictError('Only a submitted test can be approved.');
      if (t.submittedById === actor.userId || t.operatorId === actor.userId) {
        throw new ConflictError('Separation of duties: the reviewer must be a different person from the operator and the submitter.');
      }
      t.status = 'approved';
      t.reviewedAt = ctx.store.now(); t.reviewerId = actor.userId; t.reviewerName = actor.name; t.reviewReason = r.data;
      // an approved report becomes customer-visible evidence
      db(ctx).evidence.forEach((e) => { if (t.evidenceIds.includes(e.id) && e.kind === 'test_report') e.classification = 'customer_visible'; });
      logTestEvent(t, 'Test approved', r.data, 'approved');
      audit(ctx, 'test.approve', 'test', t.id, `Approved: ${r.data}`);
      ctx.store.save();
      return t;
    },

    async reject(id, reason) {
      await latency(ctx);
      const actor = authorize(ctx, 'test.review');
      const r = reasonSchema.safeParse(reason);
      if (!r.success) throw new ValidationError(r.error.issues[0].message);
      const t = testOrThrow(ctx, id);
      if (!['submitted', 'under_review'].includes(t.status)) throw new ConflictError('Only a submitted test can be rejected.');
      t.status = 'rejected';
      t.reviewedAt = ctx.store.now(); t.reviewerId = actor.userId; t.reviewerName = actor.name; t.reviewReason = r.data;
      logTestEvent(t, 'Test rejected', r.data, 'rejected');
      audit(ctx, 'test.reject', 'test', t.id, `Rejected: ${r.data}`);
      ctx.store.save();
      return t;
    },

    async requestRework(id, reason) {
      await latency(ctx);
      const actor = authorize(ctx, 'test.review');
      const r = reasonSchema.safeParse(reason);
      if (!r.success) throw new ValidationError(r.error.issues[0].message);
      const t = testOrThrow(ctx, id);
      if (!['submitted', 'under_review'].includes(t.status)) throw new ConflictError('Only a submitted test can be sent back.');
      t.status = 'requires_rework';
      t.reviewedAt = ctx.store.now(); t.reviewerId = actor.userId; t.reviewerName = actor.name; t.reviewReason = r.data;
      logTestEvent(t, 'Test returned for rework', r.data, 'rejected');
      audit(ctx, 'test.rework', 'test', t.id, `Rework: ${r.data}`);
      ctx.store.save();
      return t;
    },

    async attachEvidence(id, fileName, sizeKb, stored) {
      await latency(ctx);
      authorize(ctx, 'test.create');
      const t = testOrThrow(ctx, id);
      if (!['draft', 'requires_rework', 'submitted'].includes(t.status)) throw new ConflictError('Evidence can only be attached before a decision.');
      const ev = newEvidence(ctx, { batteryId: t.batteryId, kind: 'test_report', fileName, sizeKb, classification: 'internal' }, stored);
      db(ctx).evidence.push(ev);
      t.evidenceIds.push(ev.id);
      audit(ctx, 'evidence.attach', 'test', t.id, stored
        ? `Attached ${fileName} (${stored.sizeKb} KB, SHA-256 ${stored.checksum.slice(0, 12)}…, ${stored.scanStatus === 'clean' ? 'malware scan clean' : 'not malware-scanned'})`
        : `Attached ${fileName} (metadata only; no file stored in the demo)`);
      ctx.store.save();
      return ev;
    },
  };
}
