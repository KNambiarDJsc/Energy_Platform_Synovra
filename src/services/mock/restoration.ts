import { RESTORATION_REASON_LABELS, notQualifiedReasons } from '@/domain/outcomes';
import { reasonSchema, restorationReasonCodeSchema } from '@/domain/schemas';
import { canTransition } from '@/domain/lifecycle';
import { ConflictError, NotFoundError, ValidationError, can } from '@/domain/permissions';
import type { RestorationAttempt, RestorationReasonCode } from '@/domain/types';
import {
  audit, canSeeBattery, db, familyOf, getBatteryOrThrow, latency, newEvidence, pushEvent, authorize, ruleCheck, setState, type Ctx,
} from '../core';
import type { AttemptView, BatchResults, EconomicsResult, EconomicsScenario, RestorationRepository } from '../types';
import { toTestView } from './tests';

/** Pure economics. Mirrors the blueprint's worked example so it can be unit tested. */
export function computeEconomics(i: {
  incoming: number; qualified: number; rejects: number; listedCosts: number;
  salesPerQualified: number; recoveryPerReject: number; unknownCostEntries?: number;
}): EconomicsResult {
  const sales = i.qualified * i.salesPerQualified;
  const recovery = i.rejects * i.recoveryPerReject;
  return {
    incoming: i.incoming, qualified: i.qualified, rejects: i.rejects,
    yieldPct: i.incoming > 0 ? Math.round((i.qualified / i.incoming) * 1000) / 10 : null,
    sales, recovery, listedCosts: i.listedCosts,
    contribution: sales + recovery - i.listedCosts,
    grossCostPerQualified: i.qualified > 0 ? Math.round((i.listedCosts / i.qualified) * 100) / 100 : null,
    netCostPerQualified: i.qualified > 0 ? Math.round(((i.listedCosts - recovery) / i.qualified) * 100) / 100 : null,
    unknownCostEntries: i.unknownCostEntries ?? 0,
  };
}

export function createRestorationRepository(ctx: Ctx): RestorationRepository {
  const attemptOrThrow = (id: string): RestorationAttempt => {
    const a = db(ctx).attempts.find((x) => x.id === id);
    if (!a) throw new NotFoundError('Restoration attempt');
    const b = db(ctx).batteries.find((x) => x.id === a.batteryId);
    if (!b || !canSeeBattery(ctx, b)) throw new NotFoundError('Restoration attempt');
    return a;
  };

  function batchStats(batchId: string) {
    const d = db(ctx);
    const members = d.batteries.filter((b) => b.restorationBatchId === batchId);
    const attempts = d.attempts.filter((a) => a.batchId === batchId);
    const latestByBattery = new Map<string, RestorationAttempt>();
    attempts.sort((x, y) => x.attemptNo - y.attemptNo).forEach((a) => latestByBattery.set(a.batteryId, a));
    const everApproved = new Set(attempts.filter((a) => a.status === 'approved').map((a) => a.batteryId));
    const latest = [...latestByBattery.values()];
    const qualified = everApproved.size;
    const rejected = latest.filter((a) => a.status === 'rejected' && !everApproved.has(a.batteryId)).length;
    const rework = latest.filter((a) => a.status === 'rework').length;
    const inProgress = latest.filter((a) => ['in_restoration', 'awaiting_review'].includes(a.status)).length;
    return { members, attempted: latestByBattery.size, qualified, rejected, rework, inProgress, reasons: notQualifiedReasons(attempts) };
  }

  function costsFor(batchId: string) {
    const d = db(ctx);
    const entries = d.costs.filter((c) => c.batchId === batchId);
    const sum = (f: (c: (typeof entries)[number]) => boolean) => entries.filter((c) => c.amountAed !== null && f(c)).reduce((s, c) => s + (c.amountAed ?? 0), 0);
    const provision = sum((c) => c.kind === 'warranty_provision');
    const known = sum((c) => c.kind !== 'warranty_provision');
    return {
      entries, known, provision,
      actual: sum((c) => c.kind !== 'warranty_provision' && c.allocation === 'direct'),
      allocated: sum((c) => c.kind !== 'warranty_provision' && c.allocation === 'allocated'),
      estimated: sum((c) => c.kind !== 'warranty_provision' && c.allocation === 'estimate'),
      unknown: entries.filter((c) => c.amountAed === null).length,
    };
  }

  function toView(a: RestorationAttempt): AttemptView {
    const d = db(ctx);
    const actor = ctx.actor();
    const b = d.batteries.find((x) => x.id === a.batteryId)!;
    const fam = familyOf(ctx, b);
    const t = (id: string | null) => {
      const x = id ? d.tests.find((y) => y.id === id) : null;
      return x ? toTestView(ctx, x) : null;
    };
    const process = can(actor.role, 'process.controlled');
    return {
      ...a, notes: process ? a.notes : [], lotRefs: process ? a.lotRefs : [],
      evidenceIds: process ? a.evidenceIds : a.evidenceIds.filter((i) => d.evidence.find((e) => e.id === i)?.classification !== 'controlled'),
      batteryLabel: b.label, batterySerial: b.manufacturerSerial, familyModel: `${fam.manufacturer.replace(' (fictional)', '')} ${fam.model}`,
      before: t(a.beforeTestId), after: t(a.afterTestId), confidentialHidden: !process,
    };
  }

  return {
    async batches() {
      await latency(ctx);
      authorize(ctx, 'restoration.read');
      return db(ctx).batches;
    },

    async batchResults(batchId): Promise<BatchResults> {
      await latency(ctx);
      const actor = authorize(ctx, 'restoration.read');
      const d = db(ctx);
      const batch = d.batches.find((b) => b.id === batchId);
      if (!batch) throw new NotFoundError('Restoration batch');
      const s = batchStats(batchId);
      const fam = d.families.find((f) => f.id === batch.familyId)!;
      const decided = s.qualified + s.rejected;
      const showCosts = can(actor.role, 'cost.read');
      const c = costsFor(batchId);
      return {
        batch, familyModel: `${fam.manufacturer.replace(' (fictional)', '')} ${fam.model}`,
        counts: { intake: s.members.length, attempted: s.attempted, qualified: s.qualified, rework: s.rework, rejected: s.rejected, inProgress: s.inProgress },
        yield: {
          qualifiedOverIntake: s.members.length ? Math.round((s.qualified / s.members.length) * 1000) / 10 : null,
          qualifiedOverDecided: decided ? Math.round((s.qualified / decided) * 1000) / 10 : null,
          decided,
        },
        notQualifiedReasons: s.reasons,
        costs: showCosts ? {
          knownTotalAed: c.known, unknownEntries: c.unknown, actualAed: c.actual, allocatedAed: c.allocated, estimatedAed: c.estimated,
          warrantyProvisionAed: c.provision,
          perQualifiedGrossAed: s.qualified ? Math.round(((c.known + c.provision) / s.qualified) * 100) / 100 : null,
          entries: c.entries,
        } : null,
      };
    },

    async economics(batchId, scenario: EconomicsScenario) {
      await latency(ctx);
      authorize(ctx, 'cost.read');
      if (scenario.salesPerQualifiedAed < 0 || scenario.recoveryPerRejectAed < 0) throw new ValidationError('Scenario inputs cannot be negative.');
      const s = batchStats(batchId);
      const c = costsFor(batchId);
      return computeEconomics({
        incoming: s.members.length, qualified: s.qualified, rejects: s.rejected,
        listedCosts: c.known + c.provision, salesPerQualified: scenario.salesPerQualifiedAed,
        recoveryPerReject: scenario.recoveryPerRejectAed, unknownCostEntries: c.unknown,
      });
    },

    async attempts(filter = {}) {
      await latency(ctx);
      authorize(ctx, 'restoration.read');
      return db(ctx).attempts
        .filter((a) => {
          const b = db(ctx).batteries.find((x) => x.id === a.batteryId);
          if (!b || !canSeeBattery(ctx, b)) return false;
          if (filter.batchId && a.batchId !== filter.batchId) return false;
          if (filter.batteryId && a.batteryId !== filter.batteryId) return false;
          if (filter.status && a.status !== filter.status) return false;
          return true;
        })
        .sort((x, y) => y.startedAt.localeCompare(x.startedAt))
        .map(toView);
    },

    async markCandidate(batteryId, reason) {
      await latency(ctx);
      authorize(ctx, 'restoration.review');
      const r = reasonSchema.safeParse(reason);
      if (!r.success) throw new ValidationError(r.error.issues[0].message);
      const b = getBatteryOrThrow(ctx, batteryId);
      if (!canTransition(b.lifecycleState, 'restoration_candidate')) throw new ConflictError(`A battery in state "${b.lifecycleState}" cannot become a restoration candidate.`);
      const hasTest = db(ctx).tests.some((t) => t.batteryId === b.id && t.status === 'approved' && ['initial', 'intake_inspection', 'periodic'].includes(t.kind));
      if (!hasTest) throw new ConflictError('An approved initial test is required before selecting a restoration candidate.');
      const prev = b.lifecycleState;
      setState(ctx, b, 'restoration_candidate');
      pushEvent(ctx, b.id, 'approval', 'Selected as restoration candidate', r.data, { previousState: prev, newState: 'restoration_candidate', approvalState: 'approved' });
      audit(ctx, 'restoration.candidate', 'battery', b.id, r.data);
      ctx.store.save();
      return b;
    },

    async createAttempt({ batteryId, batchId, lotRefs = [] }) {
      await latency(ctx);
      const actor = authorize(ctx, 'restoration.write');
      const d = db(ctx);
      const b = getBatteryOrThrow(ctx, batteryId);
      if (!['restoration_candidate', 'rework'].includes(b.lifecycleState)) throw new ConflictError('Only a restoration candidate or a battery in rework can start an attempt.');
      const batch = d.batches.find((x) => x.id === batchId);
      if (!batch) throw new NotFoundError('Restoration batch');
      if (batch.familyId !== b.familyId) throw new ConflictError('The batch is for a different battery family.');
      if (batch.status === 'closed') throw new ConflictError('This batch is closed.');
      const before = d.tests.filter((t) => t.batteryId === b.id && t.status === 'approved').sort((x, y) => y.startedAt.localeCompare(x.startedAt))[0];
      if (!before) throw new ConflictError('An approved before-test is required to open an attempt.');
      const no = d.attempts.filter((a) => a.batteryId === b.id).length + 1;
      const attempt: RestorationAttempt = {
        id: ctx.store.nextId('att'), batchId, batteryId: b.id, attemptNo: no, status: 'in_restoration',
        beforeTestId: before.id, afterTestId: null, notes: [], lotRefs: lotRefs.filter((l) => l.ref.trim()), evidenceIds: [],
        startedAt: ctx.store.now(), submittedAt: null, decidedAt: null, deciderName: null, decisionReason: null, decisionReasonCode: null,
      };
      d.attempts.push(attempt);
      b.restorationBatchId = batchId;
      const prev = b.lifecycleState;
      setState(ctx, b, 'in_restoration');
      pushEvent(ctx, b.id, 'restoration', `Restoration attempt ${no} started`, `Opened in ${batchId}. The battery keeps its permanent identity.`, { previousState: prev, newState: 'in_restoration', ref: { kind: 'attempt', id: attempt.id } });
      audit(ctx, 'restoration.attempt_create', 'attempt', attempt.id, `Attempt ${no} for ${b.label} by ${actor.name}`);
      ctx.store.save();
      return attempt;
    },

    async addNote(attemptId, text) {
      await latency(ctx);
      const actor = authorize(ctx, 'restoration.write');
      if (!can(actor.role, 'process.controlled')) throw new ConflictError('Process notes are controlled lab information.');
      const a = attemptOrThrow(attemptId);
      const t = text.trim();
      if (t.length < 3) throw new ValidationError('Note is too short.');
      if (!['in_restoration', 'rework'].includes(a.status)) throw new ConflictError('Notes can only be added while the attempt is open.');
      a.notes.push({ id: ctx.store.nextId('note'), at: ctx.store.now(), actorName: actor.name, text: t.slice(0, 1000) });
      audit(ctx, 'restoration.note', 'attempt', a.id, 'Process note added (content not logged)');
      ctx.store.save();
      return a;
    },

    async addEvidence(attemptId, fileName, sizeKb, stored) {
      await latency(ctx);
      authorize(ctx, 'restoration.write');
      const a = attemptOrThrow(attemptId);
      const ev = newEvidence(ctx, { batteryId: a.batteryId, kind: 'other', fileName, sizeKb, classification: 'controlled' }, stored);
      db(ctx).evidence.push(ev);
      a.evidenceIds.push(ev.id);
      audit(ctx, 'evidence.attach', 'attempt', a.id, stored ? `Attached ${fileName} (${stored.sizeKb} KB, SHA-256 ${stored.checksum.slice(0, 12)}…)` : `Attached ${fileName} (metadata only)`);
      ctx.store.save();
      return a;
    },

    async submitForReview(attemptId, afterTestId) {
      await latency(ctx);
      authorize(ctx, 'restoration.write');
      const a = attemptOrThrow(attemptId);
      const d = db(ctx);
      if (a.status !== 'in_restoration') throw new ConflictError('Only an attempt in restoration can be submitted.');
      const t = d.tests.find((x) => x.id === afterTestId && x.batteryId === a.batteryId);
      if (!t || t.kind !== 'final') throw new ValidationError('Select a final test recorded for this battery.');
      if (!['submitted', 'under_review', 'approved'].includes(t.status)) throw new ConflictError('Submit the after-test for review first.');
      const b = getBatteryOrThrow(ctx, a.batteryId);
      a.afterTestId = t.id;
      a.status = 'awaiting_review';
      a.submittedAt = ctx.store.now();
      t.attemptId = a.id;
      const prev = b.lifecycleState;
      setState(ctx, b, 'awaiting_review');
      pushEvent(ctx, b.id, 'restoration', 'Submitted for engineer review', 'Before and after tests attached. Awaiting a qualification decision.', { previousState: prev, newState: 'awaiting_review', approvalState: 'pending', ref: { kind: 'attempt', id: a.id } });
      audit(ctx, 'restoration.submit', 'attempt', a.id, 'Submitted for review');
      ctx.store.save();
      return a;
    },

    async decide(attemptId, decision, reason, reasonCode = null) {
      await latency(ctx);
      const actor = authorize(ctx, 'restoration.review');
      const r = reasonSchema.safeParse(reason);
      if (!r.success) throw new ValidationError(r.error.issues[0].message);
      // Rework and rejection are training labels, so they must say why; an approval needs no code.
      let code: RestorationReasonCode | null = null;
      if (decision === 'approve') {
        if (reasonCode !== null) throw new ValidationError('An approval takes no reason code.');
      } else {
        const c = restorationReasonCodeSchema.safeParse(reasonCode);
        if (!c.success) throw new ValidationError(c.error.issues[0].message);
        code = c.data;
      }
      const explained = code ? `${RESTORATION_REASON_LABELS[code]}. ${r.data}` : r.data;
      const a = attemptOrThrow(attemptId);
      const d = db(ctx);
      if (a.status !== 'awaiting_review') throw new ConflictError('Only an attempt awaiting review can be decided.');
      const b = getBatteryOrThrow(ctx, a.batteryId);
      const after = d.tests.find((t) => t.id === a.afterTestId);
      if (!after) throw new ConflictError('No after-test is linked to this attempt.');
      if (after.submittedById === actor.userId || after.operatorId === actor.userId) {
        throw new ConflictError('Separation of duties: the deciding engineer must differ from the person who recorded or submitted the test.');
      }
      const prev = b.lifecycleState;
      if (decision === 'approve') {
        if (after.status !== 'approved') throw new ConflictError('Approve the after-test record first, then decide on qualification.');
        const check = ruleCheck(after, familyOf(ctx, b));
        if (check.state !== 'meets') throw new ConflictError(`Cannot approve qualification: ${check.label}. Reject, or request rework. Exceptions are not supported in the demo.`);
        a.status = 'approved';
        setState(ctx, b, 'qualified');
        pushEvent(ctx, b.id, 'approval', 'Qualified by engineer', r.data, { previousState: prev, newState: 'qualified', approvalState: 'approved', ref: { kind: 'attempt', id: a.id }, evidenceIds: after.evidenceIds });
      } else if (decision === 'reject') {
        a.status = 'rejected';
        setState(ctx, b, 'rejected');
        pushEvent(ctx, b.id, 'rejection', 'Rejected by engineer', explained, { previousState: prev, newState: 'rejected', approvalState: 'rejected', ref: { kind: 'attempt', id: a.id } });
      } else {
        a.status = 'rework';
        setState(ctx, b, 'rework');
        pushEvent(ctx, b.id, 'rework', 'Rework requested', explained, { previousState: prev, newState: 'rework', approvalState: 'rejected', ref: { kind: 'attempt', id: a.id } });
      }
      a.decidedAt = ctx.store.now();
      a.deciderName = actor.name;
      a.decisionReason = r.data;
      a.decisionReasonCode = code;
      audit(ctx, `restoration.${decision}`, 'attempt', a.id, `${decision}${code ? ` [${code}]` : ''}: ${r.data}`);
      ctx.store.save();
      return a;
    },
  };
}
