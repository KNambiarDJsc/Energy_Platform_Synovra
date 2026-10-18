import { LIFECYCLE_LABELS } from '@/domain/lifecycle';
import { RESTORATION_REASON_LABELS } from '@/domain/outcomes';
import { THIN_COHORT, routeEconomics, type RouteInputs } from '@/domain/routeEconomics';
import { NotFoundError, can } from '@/domain/permissions';
import type { Battery, CostEntry, RestorationAttempt, RestorationReasonCode } from '@/domain/types';
import {
  audit, authorize, canSeeBattery, db, evidenceStatus, familyOf, hashText, lastApprovedTest, latency, qualityOf, type Ctx,
} from '../core';
import type {
  AgentFinding, AgentKind, AgentReport, AnalystAnswer, AnalystToolCall, AssistantCitation, CollectionPipeline, CollectionStep,
  DataSourceView, InsightsRepository,
  LearningLoopView, RecoveryMetric, RouteInputsView,
} from '../types';
import { telemetrySummaryFor } from './telemetry';

const DECIDED = ['approved', 'rejected', 'rework'] as const;
type Decided = (typeof DECIDED)[number];
const isDecided = (a: RestorationAttempt): a is RestorationAttempt & { status: Decided } => (DECIDED as readonly string[]).includes(a.status);

const latest = (isos: (string | null | undefined)[]) => isos.filter((x): x is string => !!x).sort().at(-1) ?? null;
const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 1000) / 10}%` : null);
const cite = (kind: string, id: string, label: string): AssistantCitation => ({ kind, id, label });
const DAY = 86_400_000;

/** 95% Wilson interval for a proportion, as whole percentages. Honest about small samples. */
export function wilson(k: number, n: number): [number, number] | null {
  if (n === 0) return null;
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = p + (z * z) / (2 * n);
  const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [Math.max(0, Math.round(((c - m) / d) * 100)), Math.min(100, Math.round(((c + m) / d) * 100))];
}

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null);

/** Which capability a question belongs to. Fixed rules, in order; no model decides the routing. */
function route(q: string): { kind: AgentKind | null; because: string; costVsValue: boolean } {
  const s = q.toLowerCase();
  if (/exceed|more than (the )?value|loss|unprofitable|lost money/.test(s)) return { kind: 'recovery_decision', because: 'asks whether cost exceeded value recovered', costVsValue: true };
  if (/missing|incomplete|quality|duplicate|gap|unit|calibrat|before we can compare/.test(s)) return { kind: 'data_steward', because: 'asks about missing or inconsistent records', costVsValue: false };
  if (/revive|recycle|route|worth|should we|next step|economic/.test(s)) return { kind: 'recovery_decision', because: 'asks what to do with a battery and what it is worth', costVsValue: false };
  if (/yield|compare|cohort|batch|process|famil|type|best|outcome|differ/.test(s)) return { kind: 'recovery_analyst', because: 'asks how outcomes compare across groups', costVsValue: false };
  if (/history|summar|passport|what happened|evidence|explain|tell me about|b-\d{4}/.test(s)) return { kind: 'battery_investigator', because: 'asks about one battery’s record', costVsValue: false };
  return { kind: null, because: 'did not match a supported question', costVsValue: false };
}

/**
 * Why an attempt is or is not a training row. The same rules as the database view
 * ml_restoration_attempt_features (server/drizzle/0005_ml_views.sql): decided, labelled with a reason when not
 * approved, and built only from a before-test that was approved before the attempt started.
 */
export function trainingStatus(ctx: Ctx, a: RestorationAttempt): { eligible: boolean; reason: string | null } {
  const d = db(ctx);
  if (!isDecided(a)) return { eligible: false, reason: 'Not decided yet' };
  if (a.status !== 'approved' && !a.decisionReasonCode) return { eligible: false, reason: 'Decided before reason codes existed' };
  const before = d.tests.find((t) => t.id === a.beforeTestId);
  if (!before || before.status !== 'approved' || !before.reviewedAt) return { eligible: false, reason: 'No approved before-test' };
  if (before.reviewedAt > a.startedAt) return { eligible: false, reason: 'Before-test approved after the attempt started' };
  if (before.result.capacityAh === null) return { eligible: false, reason: 'Before-test has no capacity value' };
  return { eligible: true, reason: null };
}

export function createInsightsRepository(ctx: Ctx): InsightsRepository {
  const visibleBatteries = () => db(ctx).batteries.filter((b) => canSeeBattery(ctx, b));

  /** Decided attempts of a family: the observed rate behind "chance of reaching saleable grade". */
  function familyCohort(familyId: string) {
    const d = db(ctx);
    const ids = new Set(visibleBatteries().filter((b) => b.familyId === familyId).map((b) => b.id));
    const decided = d.attempts.filter((a) => ids.has(a.batteryId)).filter(isDecided);
    const qualified = decided.filter((a) => a.status === 'approved').length;
    return { decided, qualified, n: decided.length };
  }

  /** Known battery-level costs of some kinds, averaged per battery of a family. */
  function avgCost(familyId: string, kinds: CostEntry['kind'][]) {
    const d = db(ctx);
    const ids = new Set(visibleBatteries().filter((b) => b.familyId === familyId).map((b) => b.id));
    const per = new Map<string, number>();
    d.costs.filter((c) => c.batteryId && ids.has(c.batteryId) && kinds.includes(c.kind) && c.amountAed !== null)
      .forEach((c) => per.set(c.batteryId!, (per.get(c.batteryId!) ?? 0) + (c.amountAed ?? 0)));
    return { value: avg([...per.values()]), n: per.size };
  }

  function routeFieldsFor(b: Battery): RouteInputsView {
    const d = db(ctx);
    const fam = familyOf(ctx, b);
    const showCosts = can(ctx.actor().role, 'cost.read');
    const c = familyCohort(b.familyId);
    const treat = avgCost(b.familyId, ['testing', 'restoration_inputs']);
    const logistics = avgCost(b.familyId, ['logistics']);
    const testOnly = avgCost(b.familyId, ['testing']);
    const famBatches = d.batches.filter((x) => x.familyId === b.familyId);
    const provision = d.costs.filter((x) => x.kind === 'warranty_provision' && x.batchId && famBatches.some((fb) => fb.id === x.batchId) && x.amountAed !== null)
      .reduce((s, x) => s + (x.amountAed ?? 0), 0);
    const qualifiedInBatches = d.attempts.filter((a) => a.status === 'approved' && famBatches.some((fb) => fb.id === a.batchId)).length;
    const hidden = { value: null, source: 'Costs are not shown to your role. Enter a value.' };
    const fromCost = (x: { value: number | null; n: number }, what: string) => (!showCosts ? hidden
      : x.value === null ? { value: null, source: `No known ${what} recorded for this family. Enter a value.` }
        : { value: x.value, source: `Average of known ${what} on ${x.n} ${fam.model} batteries` });
    const spent = showCosts ? d.costs.filter((x) => x.batteryId === b.id && x.amountAed !== null).reduce((s, x) => s + (x.amountAed ?? 0), 0) : null;
    const fields: Record<keyof RouteInputs, { value: number | null; source: string }> = {
      pSaleable: c.n
        ? { value: Math.round((c.qualified / c.n) * 1000) / 1000, source: `Observed: ${c.qualified} of ${c.n} decided ${fam.model} attempts qualified. Synthetic data; not a model.` }
        : { value: null, source: `No decided ${fam.model} attempts yet. Enter an estimate and say where it came from.` },
      cohortN: { value: c.n || null, source: 'Decided attempts behind the chance above' },
      salePriceAed: { value: null, source: 'No sale price is recorded for any battery. Enter the price you expect.' },
      recyclingValueAed: { value: null, source: 'Recycling value depends on mass and the current lead price; neither is recorded for this battery. Enter a value.' },
      treatmentCostAed: fromCost(treat, 'testing and restoration-input costs'),
      reviveLogisticsAed: fromCost(logistics, 'logistics costs'),
      recycleLogisticsAed: { value: null, source: 'Not recorded separately. Enter a value.' },
      warrantyAllowanceAed: !showCosts ? hidden
        : qualifiedInBatches ? { value: Math.round((provision / qualifiedInBatches) * 100) / 100, source: `Warranty provision in ${fam.model} batches ÷ ${qualifiedInBatches} qualified batteries (an estimate, not settled cost)` }
          : { value: null, source: 'No warranty provision recorded for this family. Enter a value.' },
      furtherTestCostAed: fromCost(testOnly, 'testing costs'),
    };
    return {
      batteryId: b.id, batteryLabel: b.label, familyModel: fam.model, lifecycleState: b.lifecycleState,
      fields, sunkCostsAed: spent, costsHidden: !showCosts,
    };
  }

  const repo: InsightsRepository = {
    async collection(): Promise<CollectionPipeline> {
      await latency(ctx);
      authorize(ctx, 'prediction.read');
      const d = db(ctx);
      const bats = visibleBatteries();
      const ids = new Set(bats.map((b) => b.id));
      const tests = d.tests.filter((t) => t.batteryId && ids.has(t.batteryId));
      const approvedInitial = tests.filter((t) => t.status === 'approved' && (t.kind === 'initial' || t.kind === 'intake_inspection'));
      const attempts = d.attempts.filter((a) => ids.has(a.batteryId));
      const decided = attempts.filter(isDecided);
      const notApproved = decided.filter((a) => a.status !== 'approved');
      const afterTests = decided.map((a) => d.tests.find((t) => t.id === a.afterTestId)).filter((t): t is NonNullable<typeof t> => !!t);
      const leftLab = bats.filter((b) => ['deployed', 'reserved', 'returned', 'recycling_queue', 'recycled'].includes(b.lifecycleState) || d.assignments.some((x) => x.batteryId === b.id));
      const costs = d.costs.filter((c) => (c.batteryId ? ids.has(c.batteryId) : true));
      const count = <T,>(xs: T[], f: (x: T) => boolean) => xs.filter(f).length;
      const testFields = (list: typeof tests) => [
        { field: 'Capacity (Ah)', present: count(list, (t) => t.result.capacityAh !== null) },
        { field: 'Internal resistance', present: count(list, (t) => t.result.internalResistanceMOhm !== null) },
        { field: 'Instrument and calibration', present: count(list, (t) => !!t.instrument.trim() && !!t.calibrationRef.trim()) },
        { field: 'Load, cut-off and temperature', present: count(list, (t) => t.conditions.loadCurrentA !== null && t.conditions.cutoffVoltageV !== null && t.conditions.ambientTempC !== null) },
        { field: 'Report attached', present: count(list, (t) => t.evidenceIds.length > 0) },
      ];
      const step = (o: Omit<CollectionStep, 'complete'>): CollectionStep => ({
        ...o, complete: o.fields.length ? Math.min(...o.fields.map((f) => f.present)) : 0,
      });

      // The chain a battery needs before its outcome can teach anything, in the order it is collected.
      const withInitial = new Set(approvedInitial.map((t) => t.batteryId));
      const withAttempt = new Set(attempts.map((a) => a.batteryId));
      const labelled = new Set(decided.filter((a) => a.status === 'approved' || a.decisionReasonCode).filter((a) => {
        const t = d.tests.find((x) => x.id === a.afterTestId);
        return t?.status === 'approved' && t.result.capacityAh !== null;
      }).map((a) => a.batteryId));
      const withOutcome = new Set(leftLab.map((b) => b.id));
      const chainSets = [withInitial, withAttempt, labelled, withOutcome];
      const through = (k: number) => bats.filter((b) => chainSets.slice(0, k).every((set) => set.has(b.id))).length;

      return {
        chain: [
          { key: 'registered', label: 'Registered with an ID', count: bats.length },
          { key: 'initial', label: 'Approved intake test', count: through(1) },
          { key: 'treated', label: 'Restoration attempted', count: through(2) },
          { key: 'labelled', label: 'Retested and decided, with a reason', count: through(3) },
          { key: 'outcome', label: 'Outcome recorded (deployed, returned or recycled)', count: through(4) },
          { key: 'value', label: 'Sale price or recovered value recorded', count: 0 },
        ],
        steps: [
          step({
            key: 'intake', step: 'Intake and identity', capturedIn: 'Intake form or CSV import', href: '/app/intake', applicable: bats.length,
            fields: [
              { field: 'Family and rating', present: count(bats, (b) => d.families.some((f) => f.id === b.familyId)) },
              { field: 'Manufacturer serial', present: count(bats, (b) => !!b.manufacturerSerial) },
              { field: 'Manufacture date', present: count(bats, (b) => !!b.manufacturedOn) },
              { field: 'Source system', present: count(bats, (b) => !!b.sourceSystem) },
            ],
          }),
          step({
            key: 'initial', step: 'Intake test', capturedIn: 'Tests, reviewed by an engineer', href: '/app/tests', applicable: approvedInitial.length,
            fields: testFields(approvedInitial),
          }),
          step({
            key: 'treatment', step: 'Treatment', capturedIn: 'Restoration attempt in a batch', href: '/app/restoration', applicable: attempts.length,
            fields: [
              { field: 'Batch', present: count(attempts, (a) => !!a.batchId) },
              { field: 'Material and solvent lot references', present: count(attempts, (a) => a.lotRefs.length > 0) },
              { field: 'Before-test linked', present: count(attempts, (a) => !!a.beforeTestId) },
              { field: 'Process version', present: 0 },
            ],
          }),
          step({
            key: 'retest', step: 'Retest after treatment', capturedIn: 'Final test linked to the attempt', href: '/app/tests', applicable: decided.length,
            fields: [{ field: 'After-test linked', present: afterTests.length }, ...testFields(afterTests)],
          }),
          step({
            key: 'decision', step: 'Engineering decision', capturedIn: 'Qualify, rework or reject', href: '/app/restoration', applicable: decided.length,
            fields: [
              { field: 'Decision with written reason', present: count(decided, (a) => !!a.decisionReason) },
              { field: 'Reason code when not qualified', present: decided.length - notApproved.length + count(notApproved, (a) => !!a.decisionReasonCode) },
            ],
          }),
          step({
            key: 'outcome', step: 'Outcome and value', capturedIn: 'Deployment, return, warranty, recycling', href: '/app/deployments', applicable: leftLab.length,
            fields: [
              { field: 'Where it went, with dates', present: count(leftLab, (b) => d.assignments.some((x) => x.batteryId === b.id) || d.recycling.some((r) => r.batteryId === b.id)) },
              { field: 'Warranty terms', present: count(leftLab, (b) => d.warranties.some((w) => w.batteryId === b.id && !!w.termsRef)) },
              { field: 'Sale price or recovered value', present: 0 },
            ],
          }),
          step({
            key: 'cost', step: 'Costs', capturedIn: 'Cost entries per battery and batch', href: '/app/restoration', applicable: costs.length,
            fields: [
              { field: 'Amount known', present: count(costs, (c) => c.amountAed !== null) },
              { field: 'Allocation basis for shared costs', present: count(costs, (c) => c.allocation !== 'allocated' || !!c.allocationBasis) },
            ],
          }),
        ],
        held: [
          { label: 'Import rows in quarantine', count: (d.imports.filter((j) => j.status === 'committed').flatMap((j) => j.rows).filter((r) => r.outcome === 'quarantine').length) },
          { label: 'Tests rejected or sent back', count: count(tests, (t) => t.status === 'rejected' || t.status === 'requires_rework') },
          { label: 'Tests waiting for review', count: count(tests, (t) => t.status === 'submitted' || t.status === 'under_review') },
          { label: 'Sensor readings with no battery', count: d.sensors.filter((x) => !d.sensorAssignments.some((a) => a.sensorId === x.id && a.slotId && !a.endAt)).length },
        ],
      };
    },

    async dataSources() {
      await latency(ctx);
      authorize(ctx, 'prediction.read');
      const d = db(ctx);
      const bats = visibleBatteries();
      const ids = new Set(bats.map((b) => b.id));
      const tests = d.tests.filter((t) => (t.batteryId ? ids.has(t.batteryId) : true));
      const attempts = d.attempts.filter((a) => ids.has(a.batteryId));
      const costs = d.costs.filter((c) => (c.batteryId ? ids.has(c.batteryId) : true));
      const quarantined = d.imports.filter((j) => j.status === 'committed').flatMap((j) => j.rows).filter((r) => r.outcome === 'quarantine').length;
      const qualities = bats.map((b) => qualityOf(ctx, b));
      const simulatedTelemetry = ctx.store.mode === 'demo' && ctx.store.telemetry.length > 0;
      const unmappedSensors = d.sensors.filter((s) => !d.sensorAssignments.some((x) => x.sensorId === s.id && x.slotId && !x.endAt)).length;
      const imported = bats.filter((b) => /import/i.test(b.sourceSystem)).length;

      const sources: DataSourceView[] = [
        {
          key: 'intake', name: 'Intake and identity', channel: 'Intake form and CSV import', status: 'in_use',
          provides: 'Battery identity, family, source, condition on arrival and location.',
          statusNote: `${imported} of ${bats.length} records arrived by spreadsheet import; the rest were registered on the intake form.`,
          records: bats.length, lastAt: latest(bats.map((b) => b.createdAt)),
          issues: [
            { label: 'Manufacture date missing', count: bats.filter((b) => !b.manufacturedOn).length },
            { label: 'Serial missing', count: bats.filter((b) => !b.manufacturerSerial).length },
            { label: 'Possible duplicate identity', count: qualities.filter((q) => q.level === 'conflict').length },
            { label: 'Import rows quarantined', count: quarantined },
          ],
        },
        {
          key: 'tests', name: 'Test benches', channel: 'Test form, with the report attached as evidence', status: 'in_use',
          provides: 'Capacity, internal resistance and voltage under stated conditions, with instrument and calibration.',
          statusNote: 'Values are entered from the bench’s report. No bench is connected directly.',
          records: tests.length, lastAt: latest(tests.map((t) => t.startedAt)),
          issues: [
            { label: 'No calibration reference', count: tests.filter((t) => !t.calibrationRef.trim()).length },
            { label: 'No evidence file', count: tests.filter((t) => t.evidenceIds.length === 0).length },
            { label: 'Rejected or sent back', count: tests.filter((t) => t.status === 'rejected' || t.status === 'requires_rework').length },
          ],
        },
        {
          key: 'restoration', name: 'Restoration records', channel: 'Restoration attempts and batches', status: 'in_use',
          provides: 'Which batch and lots an attempt used, its before- and after-tests, and the engineer’s decision with a reason code.',
          statusNote: 'Procedures and recipes stay in the controlled lab system; only references are kept here.',
          records: attempts.length, lastAt: latest(attempts.map((a) => a.startedAt)),
          issues: [
            { label: 'Decision without reason code', count: attempts.filter((a) => (a.status === 'rejected' || a.status === 'rework') && !a.decisionReasonCode).length },
            { label: 'No lot reference', count: attempts.filter((a) => a.lotRefs.length === 0).length },
          ],
        },
        {
          key: 'telemetry', name: 'Site monitors', channel: 'Block sensors through a site gateway',
          status: simulatedTelemetry ? 'simulated' : 'not_connected',
          provides: 'Voltage and temperature per battery position, every 15 minutes. Some sensors estimate resistance.',
          statusNote: simulatedTelemetry
            ? 'Synthetic readings generated for this demonstration. No gateway is connected.'
            : 'Not connected. Needs the gateway contract and a verified sensor-to-slot mapping.',
          records: simulatedTelemetry ? ctx.store.telemetry.length : null,
          lastAt: simulatedTelemetry ? latest([ctx.store.telemetry.at(-1)?.t]) : null,
          issues: simulatedTelemetry ? [
            { label: 'Sensors not mapped to a slot', count: unmappedSensors },
            { label: 'Mapping not verified', count: d.sensorAssignments.filter((x) => !x.endAt && x.mappingQuality === 'unverified').length },
          ] : [],
        },
        {
          key: 'machines', name: 'Chargers and test machines', channel: 'Modbus RTU or TCP, vendor API, or file export', status: 'not_connected',
          provides: 'Charge and discharge readings straight from the equipment, without retyping.',
          statusNote: 'Not connected. A working link needs authorised access, the connection settings and the manufacturer’s register map.',
          records: null, lastAt: null, issues: [],
        },
        {
          key: 'commercial', name: 'Costs and sales', channel: 'Cost entries per battery and per batch', status: 'in_use',
          provides: 'Acquisition, collection, testing, process inputs, logistics and warranty provision.',
          statusNote: 'A sale price per battery is not recorded yet, so contribution per battery cannot be calculated.',
          records: costs.length, lastAt: latest(costs.map((c) => c.recordedOn)),
          issues: [{ label: 'Amount unknown', count: costs.filter((c) => c.amountAed === null).length }],
        },
        {
          key: 'field', name: 'Deployment, service and warranty', channel: 'Assignments, service tasks and claims', status: 'in_use',
          provides: 'Where each battery served, what was done to it, and whether it came back.',
          statusNote: 'The follow-up that later tells whether a restored battery lasted.',
          records: d.assignments.filter((a) => ids.has(a.batteryId)).length + d.warranties.filter((w) => ids.has(w.batteryId)).length,
          lastAt: latest(d.assignments.filter((a) => ids.has(a.batteryId)).map((a) => a.startAt)),
          issues: [{ label: 'Warranty terms not recorded', count: d.warranties.filter((w) => ids.has(w.batteryId) && !w.termsRef).length }],
        },
        {
          key: 'recycling', name: 'Recycler handoff', channel: 'Consignment records and certificates', status: 'in_use',
          provides: 'Consignment, mass and the recycler’s certificate for each battery that leaves the fleet.',
          statusNote: 'Evidence for chain of custody. It does not create an EPR credit by itself.',
          records: d.recycling.filter((r) => ids.has(r.batteryId)).length, lastAt: latest(d.recycling.map((r) => r.consignedOn)),
          issues: [
            { label: 'Certificate not received', count: d.recycling.filter((r) => ids.has(r.batteryId) && r.state === 'recycled' && r.certificateState !== 'received').length },
            { label: 'Mass unknown', count: d.recycling.filter((r) => ids.has(r.batteryId) && r.massKg === null).length },
          ],
        },
        {
          key: 'public', name: 'Public research datasets', channel: 'Downloaded files, offline', status: 'reference_only',
          provides: 'Ways to test the import pipeline and try methods.',
          statusNote: 'Reference only. Other fleets and duty cycles are not Synovra’s outcomes, so they are never used as training data here.',
          records: null, lastAt: null, issues: [],
        },
      ];
      return {
        sources,
        quality: {
          batteries: bats.length,
          complete: qualities.filter((q) => q.level === 'complete').length,
          partial: qualities.filter((q) => q.level === 'partial').length,
          incomplete: qualities.filter((q) => q.level === 'incomplete').length,
          conflict: qualities.filter((q) => q.level === 'conflict').length,
          quarantinedImportRows: quarantined,
          corrections: d.events.filter((e) => ids.has(e.batteryId) && e.correction).length,
          unknownCosts: costs.filter((c) => c.amountAed === null).length,
        },
      };
    },

    async learning(): Promise<LearningLoopView> {
      await latency(ctx);
      authorize(ctx, 'prediction.read');
      const d = db(ctx);
      const ids = new Set(visibleBatteries().map((b) => b.id));
      const attempts = d.attempts.filter((a) => ids.has(a.batteryId));
      const decided = attempts.filter(isDecided);
      const labelled = decided.filter((a) => a.status === 'approved' || a.decisionReasonCode);
      const status = attempts.map((a) => ({ a, s: trainingStatus(ctx, a) }));
      const eligible = status.filter((x) => x.s.eligible).map((x) => x.a);
      const exclusions = new Map<string, number>();
      status.filter((x) => !x.s.eligible).forEach((x) => exclusions.set(x.s.reason!, (exclusions.get(x.s.reason!) ?? 0) + 1));
      const mix = new Map<string, { outcome: Decided; code: RestorationReasonCode | null; count: number }>();
      decided.forEach((a) => {
        const key = `${a.status}:${a.decisionReasonCode ?? ''}`;
        const cur = mix.get(key) ?? { outcome: a.status, code: a.decisionReasonCode, count: 0 };
        cur.count += 1;
        mix.set(key, cur);
      });
      const corrections = d.events.filter((e) => ids.has(e.batteryId) && e.correction);
      const versions = new Set(d.predictions.map((p) => `${p.modelName}@${p.modelVersion}`));
      return {
        stages: [
          { key: 'recorded', label: 'Attempts recorded', count: attempts.length, note: 'Every restoration attempt, kept under the battery’s permanent identity.' },
          { key: 'decided', label: 'Decided by an engineer', count: decided.length, note: 'Approved, rejected or sent to rework, with separation of duties.' },
          { key: 'labelled', label: 'Labelled with a reason', count: labelled.length, note: 'Rework and rejection carry a reason code, so the outcome says why.' },
          { key: 'eligible', label: 'Eligible training rows', count: eligible.length, note: 'Built only from what was known when the attempt started.' },
          { key: 'trained', label: 'Model versions trained', count: 0, note: 'None yet. A model is trained only when there are enough labelled rows per family.' },
        ],
        exclusions: [...exclusions.entries()].map(([reason, count]) => ({ reason, count })).sort((x, y) => y.count - x.count),
        labelMix: [...mix.values()]
          .map((m) => ({
            ...m,
            label: m.outcome === 'approved' ? 'Qualified'
              : `${m.outcome === 'rework' ? 'Rework' : 'Rejected'}: ${m.code ? RESTORATION_REASON_LABELS[m.code].toLowerCase() : 'no reason code'}`,
          }))
          .sort((x, y) => y.count - x.count),
        fingerprint: hashText(eligible.map((a) => a.id).sort().join('|')),
        models: { registered: versions.size, withTrainingRecords: 0, validated: 0 },
        reviews: {
          agreed: d.predictions.filter((p) => p.reviewState === 'agreed').length,
          disagreed: d.predictions.filter((p) => p.reviewState === 'disagreed').length,
          unreviewed: d.predictions.filter((p) => p.reviewState === 'unreviewed').length,
        },
        corrections: { events: corrections.length, batteries: new Set(corrections.map((e) => e.batteryId)).size },
        quarantinedImportRows: d.imports.filter((j) => j.status === 'committed').flatMap((j) => j.rows).filter((r) => r.outcome === 'quarantine').length,
      };
    },

    async recovery(): Promise<RecoveryMetric[]> {
      await latency(ctx);
      const actor = authorize(ctx, 'report.internal');
      const d = db(ctx);
      const bats = visibleBatteries();
      const ids = new Set(bats.map((b) => b.id));
      const decided = d.attempts.filter((a) => ids.has(a.batteryId)).filter(isDecided);
      const approved = decided.filter((a) => a.status === 'approved');
      const qualifiedBatteries = new Set(approved.map((a) => a.batteryId)).size;
      const everDeployed = new Set(d.assignments.filter((a) => ids.has(a.batteryId)).map((a) => a.batteryId)).size;
      const claims = d.warranties.filter((w) => ids.has(w.batteryId)).reduce((n, w) => n + w.claims.length, 0);
      const returned = bats.filter((b) => b.lifecycleState === 'returned').length;
      const complete = bats.filter((b) => qualityOf(ctx, b).level === 'complete').length;
      const recycled = d.recycling.filter((r) => ids.has(r.batteryId) && r.state === 'recycled');
      const showCosts = can(actor.role, 'cost.read');
      const costs = d.costs.filter((c) => c.kind !== 'warranty_provision' && (c.batteryId ? ids.has(c.batteryId) : true));
      const known = costs.filter((c) => c.amountAed !== null).reduce((s, c) => s + (c.amountAed ?? 0), 0);
      const unknown = costs.filter((c) => c.amountAed === null).length;
      return [
        {
          key: 'retest_pass', label: 'Retest pass rate', value: pct(approved.length, decided.length), status: decided.length ? 'calculated' : 'not_calculated',
          basis: decided.length ? `${approved.length} of ${decided.length} decided restoration attempts qualified.` : 'No decided attempts yet.',
        },
        showCosts
          ? {
            key: 'cost_per_qualified', label: 'Cost per qualified battery',
            value: qualifiedBatteries ? `AED ${Math.round(known / qualifiedBatteries).toLocaleString('en-GB')}` : null,
            status: qualifiedBatteries ? 'calculated' : 'not_calculated',
            basis: `${qualifiedBatteries} qualified batteries; known costs only, excluding warranty provision.${unknown ? ` ${unknown} entries are unknown, so this is a minimum.` : ''}`,
          }
          : { key: 'cost_per_qualified', label: 'Cost per qualified battery', value: null, status: 'hidden', basis: 'Costs are not shown to your role.' },
        {
          key: 'contribution', label: 'Recovery contribution per battery', value: null, status: 'not_calculated',
          basis: 'A sale price per battery is not recorded. Batch scenarios on the Restoration page use prices you enter.',
        },
        {
          key: 'return_rate', label: 'Warranty claims per deployed battery', value: pct(claims, everDeployed), status: everDeployed ? 'calculated' : 'not_calculated',
          basis: `${claims} claims across ${everDeployed} batteries ever deployed; ${returned} currently returned. Follow-up periods differ, so this is not yet a failure rate.`,
        },
        {
          key: 'traceability', label: 'Records complete', value: pct(complete, bats.length), status: bats.length ? 'calculated' : 'not_calculated',
          basis: `${complete} of ${bats.length} batteries have every required field and an approved test.`,
        },
        {
          key: 'recycling_evidence', label: 'Recycling certificates on file', value: pct(recycled.filter((r) => r.certificateState === 'received').length, recycled.length),
          status: recycled.length ? 'calculated' : 'not_calculated',
          basis: recycled.length ? `${recycled.filter((r) => r.certificateState === 'received').length} of ${recycled.length} recycled batteries.` : 'No battery has been recycled yet.',
        },
      ];
    },

    async runAgent(kind: AgentKind, input = {}): Promise<AgentReport> {
      await latency(ctx);
      const actor = authorize(ctx, 'prediction.read');
      const d = db(ctx);
      const now = ctx.store.now();
      const bats = visibleBatteries();

      if (kind === 'data_steward') {
        const findings: AgentFinding[] = [];
        const incomplete = bats.map((b) => ({ b, q: qualityOf(ctx, b) })).filter((x) => x.q.level !== 'complete');
        const conflicted = incomplete.filter((x) => x.q.conflicts.length > 0);
        if (conflicted.length) {
          findings.push({
            text: `${conflicted.length} ${conflicted.length === 1 ? 'battery shares' : 'batteries share'} an identifier with another record. An engineer should confirm which physical battery each record describes; nothing is merged automatically.`,
            attention: true, citations: conflicted.map((x) => cite('battery', x.b.id, x.b.label)),
          });
        }
        const byField = new Map<string, typeof incomplete>();
        incomplete.forEach((x) => x.q.missing.forEach((m) => byField.set(m, [...(byField.get(m) ?? []), x])));
        [...byField.entries()].sort((a, b) => b[1].length - a[1].length).forEach(([field, list]) => findings.push({
          text: `${list.length} ${list.length === 1 ? 'battery has' : 'batteries have'} no ${field.toLowerCase()}.`,
          attention: false,
          citations: list.slice(0, 8).map((x) => cite('battery', x.b.id, x.b.label)),
        }));
        const noCode = d.attempts.filter((a) => (a.status === 'rejected' || a.status === 'rework') && !a.decisionReasonCode && bats.some((b) => b.id === a.batteryId));
        if (noCode.length) findings.push({ text: `${noCode.length} rework or rejection decisions have no reason code, so they cannot be used as training labels.`, attention: true, citations: noCode.map((a) => cite('attempt', a.id, `Attempt ${a.attemptNo}`)) });
        const unknownCosts = d.costs.filter((c) => c.amountAed === null);
        if (unknownCosts.length && can(actor.role, 'cost.read')) findings.push({ text: `${unknownCosts.length} cost entries have no amount. Totals that include them are minimums.`, attention: false, citations: [] });
        const unmapped = d.sensors.filter((s) => !d.sensorAssignments.some((x) => x.sensorId === s.id && x.slotId && !x.endAt));
        if (unmapped.length) findings.push({ text: `${unmapped.length} ${unmapped.length === 1 ? 'sensor reports' : 'sensors report'} readings that cannot be attributed to any battery.`, attention: true, citations: [] });
        return {
          kind, title: 'Data steward', generatedAt: now, findings,
          missing: findings.length ? [] : ['No gaps found in the records you can see.'],
          scope: `Read ${bats.length} battery records you are allowed to see, their tests, attempts and sensor mappings. Changed nothing.`,
        };
      }

      if (kind === 'battery_investigator') {
        const b = bats.find((x) => x.id === input.batteryId);
        if (!b) {
          return { kind, title: 'Battery investigator', generatedAt: now, findings: [], missing: ['Choose a battery you are allowed to see.'], scope: 'Nothing was read.' };
        }
        const fam = familyOf(ctx, b);
        const tests = d.tests.filter((t) => t.batteryId === b.id).sort((x, y) => x.startedAt.localeCompare(y.startedAt));
        const attempts = d.attempts.filter((a) => a.batteryId === b.id);
        const alerts = d.alerts.filter((a) => a.batteryId === b.id && a.state !== 'closed' && a.state !== 'resolved');
        const preds = d.predictions.filter((p) => p.batteryId === b.id);
        const last = lastApprovedTest(d, b.id);
        const tel = telemetrySummaryFor(ctx, b);
        const ev = evidenceStatus(d, b);
        const findings: AgentFinding[] = [
          { text: `${b.label} is a ${fam.chemistry} ${fam.unitType}, rated ${fam.ratedCapacityAh} Ah, now ${LIFECYCLE_LABELS[b.lifecycleState].toLowerCase()}. Evidence status: ${ev.label.toLowerCase()}.`, attention: false, citations: [cite('battery', b.id, b.label)] },
        ];
        if (last) {
          findings.push({
            text: `The latest approved test measured ${last.result.capacityAh} Ah, ${Math.round(((last.result.capacityAh ?? 0) / fam.ratedCapacityAh) * 100)}% of rated, on ${last.startedAt.slice(0, 10)}.`,
            attention: false, citations: tests.filter((t) => t.status === 'approved').map((t) => cite('test', t.id, `${t.kind} test`)),
          });
        }
        if (attempts.length && can(actor.role, 'restoration.read')) {
          findings.push({
            text: `${attempts.length} restoration ${attempts.length === 1 ? 'attempt' : 'attempts'}: ${attempts.map((a) => `#${a.attemptNo} ${a.status.replace('_', ' ')}${a.decisionReasonCode ? ` (${RESTORATION_REASON_LABELS[a.decisionReasonCode].toLowerCase()})` : ''}`).join(', ')}.`,
            attention: attempts.some((a) => a.status === 'rejected' || a.status === 'rework'), citations: attempts.map((a) => cite('attempt', a.id, `Attempt ${a.attemptNo}`)),
          });
        }
        alerts.forEach((a) => findings.push({ text: `Open ${a.severity} alert from ${a.source.kind} ${a.source.name} ${a.source.version}: ${a.title.toLowerCase()}.`, attention: a.severity !== 'info', citations: [cite('alert', a.id, a.id)] }));
        if (tel.available) findings.push({ text: `Latest reading ${tel.voltageV} V and ${tel.temperatureC} °C${tel.freshness === 'stale' ? ', stale' : ''}${ctx.store.mode === 'demo' ? ' (synthetic)' : ''}.`, attention: tel.freshness === 'stale', citations: [] });
        preds.forEach((p) => findings.push({ text: `Shadow model ${p.modelName} ${p.modelVersion} reports “${p.output.value}” for ${p.output.label.toLowerCase()}. Not validated.`, attention: false, citations: [cite('prediction', p.id, p.id)] }));
        const missing = [
          ...(!b.manufacturedOn ? ['Manufacture date, so age is unknown.'] : []),
          ...(!b.manufacturerSerial ? ['Manufacturer serial.'] : []),
          ...(!last ? ['An approved capacity test, so capacity is unknown.'] : []),
          ...(!tel.available ? [`Telemetry: ${tel.reason}`] : []),
          'Current and state of charge: no sensor measures them.',
        ];
        return { kind, title: 'Battery investigator', generatedAt: now, findings, missing, scope: `Read the passport of ${b.label}: tests, attempts, alerts, telemetry summary and model outputs. Changed nothing.` };
      }

      if (kind === 'recovery_decision') {
        const b = bats.find((x) => x.id === input.batteryId);
        if (!b) return { kind, title: 'Recovery decision', generatedAt: now, findings: [], missing: ['Choose a battery you are allowed to see.'], scope: 'Nothing was read.' };
        const view = routeFieldsFor(b);
        const values = Object.fromEntries(Object.entries(view.fields).map(([k, f]) => [k, f.value])) as unknown as RouteInputs;
        const r = routeEconomics(values);
        const findings: AgentFinding[] = [];
        const c = familyCohort(b.familyId);
        const ci = wilson(c.qualified, c.n);
        findings.push({
          text: c.n
            ? `${view.familyModel}: ${c.qualified} of ${c.n} decided attempts reached the qualifying grade (95% interval ${ci![0]}–${ci![1]}%).${c.n < THIN_COHORT ? ' Too few to rely on.' : ''} This is an observed rate in synthetic data, not a prediction for ${b.label}.`
            : `No decided ${view.familyModel} attempts, so there is no observed rate for this family.`,
          attention: c.n < THIN_COHORT, citations: [cite('battery', b.id, b.label), ...[...new Set(c.decided.map((a) => a.batchId))].map((id) => cite('batch', id, id))],
        });
        if (b.lifecycleState === 'qualified' || b.lifecycleState === 'deployed' || b.lifecycleState === 'reserved') {
          findings.push({ text: `${b.label} is already ${LIFECYCLE_LABELS[b.lifecycleState].toLowerCase()}; the route decision was made. The calculation below is for comparison only.`, attention: false, citations: [] });
        }
        if (view.sunkCostsAed !== null) findings.push({ text: `AED ${view.sunkCostsAed} is already recorded as spent on ${b.label}. Spent money is the same on every route, so it is left out of the comparison.`, attention: false, citations: [] });
        if (r.suggestion) {
          findings.push({ text: `Suggested route: ${r.suggestion}. ${r.why} A person decides.`, attention: true, citations: [] });
        } else {
          findings.push({ text: `No route is suggested. ${r.why}`, attention: true, citations: [] });
        }
        return {
          kind, title: 'Recovery decision', generatedAt: now, findings,
          missing: [...r.missing.map((m) => `${m}.`), 'A validated prediction model: none exists, so only the transparent calculation is used.'],
          scope: `Read ${b.label}, its family's decided attempts and recorded costs, then ran the route calculation. Open the route calculator on the battery to enter the missing values. Changed nothing.`,
        };
      }

      // process learning: outcomes by family and by batch, with sample sizes, from verified decisions only
      const since = input.periodDays ? Date.parse(now) - input.periodDays * DAY : null;
      const findings: AgentFinding[] = [];
      for (const fam of d.families) {
        const fBats = bats.filter((b) => b.familyId === fam.id);
        const decided = d.attempts.filter((a) => fBats.some((b) => b.id === a.batteryId)).filter(isDecided)
          .filter((a) => since === null || (a.decidedAt !== null && Date.parse(a.decidedAt) >= since));
        if (!decided.length) continue;
        const ok = decided.filter((a) => a.status === 'approved').length;
        const ci = wilson(ok, decided.length)!;
        const reasons = new Map<string, number>();
        decided.filter((a) => a.status !== 'approved').forEach((a) => {
          const k = a.decisionReasonCode ? RESTORATION_REASON_LABELS[a.decisionReasonCode].toLowerCase() : 'no reason code';
          reasons.set(k, (reasons.get(k) ?? 0) + 1);
        });
        const why = [...reasons.entries()].map(([k, n]) => `${n} ${k}`).join(', ');
        const batches = [...new Set(decided.map((a) => a.batchId))].map((id) => {
          const inB = decided.filter((a) => a.batchId === id);
          return `${id}: ${inB.filter((a) => a.status === 'approved').length} of ${inB.length}`;
        });
        findings.push({
          text: `${fam.model} (${fam.chemistry}): ${ok} of ${decided.length} decided attempts qualified, 95% interval ${ci[0]}–${ci[1]}%${why ? `; not qualified: ${why}` : ''}. By batch: ${batches.join('; ')}.${decided.length < 30 ? ' Too few decisions to rank families or batches with confidence.' : ''}`,
          attention: false,
          citations: [...new Set(decided.map((a) => a.batchId))].map((id) => cite('batch', id, id)),
        });
      }
      const missing = [
        ...(findings.length === 0 ? [since ? `Decided attempts in the last ${input.periodDays} days.` : 'Decided restoration attempts.'] : []),
        'A recorded process version per attempt. Batches stand in for process here, and batches also differ in intake condition, so a difference between them is not proof that one process works better.',
        'A sale price per battery, so contribution per battery and revive-or-recycle value are not calculated.',
      ];
      if (!can(actor.role, 'cost.read')) missing.push('Costs, which your role cannot see.');
      return {
        kind, title: 'Process learning', generatedAt: now, findings, missing,
        scope: `Read decided restoration attempts${since ? ` from the last ${input.periodDays} days` : ''} and their reason codes for the batteries you can see. Observational comparisons in synthetic data; changed nothing.`,
      };
    },

    async routeInputs(batteryId) {
      await latency(ctx);
      authorize(ctx, 'prediction.read');
      const b = visibleBatteries().find((x) => x.id === batteryId);
      if (!b) throw new NotFoundError('Battery');
      return routeFieldsFor(b);
    },

    async ask(question, context = {}): Promise<AnalystAnswer> {
      await latency(ctx);
      authorize(ctx, 'prediction.read');
      const q = question.trim().slice(0, 500);
      const d = db(ctx);
      const label = /\bB-\d{4}\b/i.exec(q)?.[0]?.toUpperCase();
      const battery = label ? visibleBatteries().find((b) => b.label === label) ?? null : visibleBatteries().find((b) => b.id === context.batteryId) ?? null;
      const r = route(q);
      const tools: AnalystToolCall[] = [];
      audit(ctx, 'analyst.ask', 'analyst', r.kind ?? 'unrouted', `Question (${q.length} chars) routed to ${r.kind ?? 'none'}`);
      ctx.store.save();
      const answer = (report: AgentReport | null, insufficient: boolean, lead: string): AnalystAnswer => ({
        question: q, capability: r.kind, routedBecause: r.because, toolsCalled: tools, report, insufficient, lead,
      });

      if (!r.kind) {
        return answer(null, true, 'I can answer questions about missing records, one battery’s history, whether to revive or recycle a battery, and how outcomes compare across families and batches. Try one of the examples.');
      }
      if (label && !battery) {
        return answer(null, true, `${label} is not a battery you can see, so I did not read anything about it.`);
      }
      if (r.costVsValue) {
        const showCosts = can(ctx.actor().role, 'cost.read');
        const withCosts = new Set(d.costs.filter((c) => c.batteryId && c.amountAed !== null).map((c) => c.batteryId)).size;
        tools.push({ tool: 'get_cost_lines', input: 'all visible batteries', result: showCosts ? `${withCosts} batteries have known costs` : 'not permitted for your role' });
        tools.push({ tool: 'calculate_route_economics', input: 'cost vs value recovered', result: 'not run: no recovered value is recorded' });
        return answer({
          kind: 'recovery_decision', title: 'Recovery decision', generatedAt: ctx.store.now(), findings: [],
          missing: ['A sale price or recovered value per battery. Without it, cost cannot be compared with value for any battery.'],
          scope: 'Read cost lines only. Changed nothing.',
        }, true, `This cannot be answered from the records: ${showCosts ? `${withCosts} batteries have recorded costs, but` : 'whatever the costs are,'} no battery has a recorded sale price or recovered value to compare them with.`);
      }

      if (r.kind === 'data_steward') {
        const rep = await repo.runAgent('data_steward');
        tools.push({ tool: 'validate_records', input: 'batteries, tests, attempts, costs, sensor mappings', result: `${rep.findings.length} findings` });
        return answer(rep, false, rep.findings.length ? `${rep.findings.length} kinds of gap found. Fixing them comes before any comparison or model.` : 'No gaps found in the records you can see.');
      }
      if (r.kind === 'battery_investigator' || r.kind === 'recovery_decision') {
        if (!battery) {
          return answer(null, true, 'Open a battery or name one (for example B-0017) so I know which record to read.');
        }
        tools.push({ tool: 'get_battery_history', input: battery.label, result: `${d.events.filter((e) => e.batteryId === battery.id).length} events, ${d.tests.filter((t) => t.batteryId === battery.id).length} tests` });
        tools.push({ tool: 'retrieve_approved_procedure', input: battery.label, result: 'none on file: procedures stay in the controlled lab system' });
        if (r.kind === 'battery_investigator') {
          const rep = await repo.runAgent('battery_investigator', { batteryId: battery.id });
          return answer(rep, false, rep.findings[0]?.text ?? '');
        }
        const c = familyCohort(battery.familyId);
        tools.push({ tool: 'compare_process_cohorts', input: `${familyOf(ctx, battery).model}, all batches`, result: `${c.qualified} of ${c.n} decided attempts qualified` });
        tools.push({ tool: 'get_model_prediction', input: battery.label, result: 'unavailable: no validated model exists' });
        const rep = await repo.runAgent('recovery_decision', { batteryId: battery.id });
        const values = Object.fromEntries(Object.entries(routeFieldsFor(battery).fields).map(([k, f]) => [k, f.value])) as unknown as RouteInputs;
        const result = routeEconomics(values);
        tools.push({ tool: 'calculate_route_economics', input: `${battery.label}, recorded inputs only`, result: result.suggestion ? `suggests ${result.suggestion}` : `no suggestion: ${result.missing.length} inputs missing` });
        return answer(rep, !result.suggestion, result.suggestion ? `Suggested route for ${battery.label}: ${result.suggestion}. A person decides.` : `I cannot suggest a route for ${battery.label} from the records alone: ${result.missing.length} inputs are not recorded, starting with the sale price.`);
      }
      const periodDays = /last month|past month|30 days/.test(q.toLowerCase()) ? 30 : /last week|7 days/.test(q.toLowerCase()) ? 7 : null;
      const rep = await repo.runAgent('recovery_analyst', { periodDays });
      tools.push({ tool: 'compare_process_cohorts', input: periodDays ? `by family and batch, last ${periodDays} days` : 'by family and batch, all time', result: `${rep.findings.length} families with decisions` });
      const insufficient = rep.findings.length === 0;
      let lead = 'Observed outcomes by family and batch, with sample sizes. Differences are not proof that one process works better.';
      if (!insufficient && /best|highest|top|rank|most/.test(q.toLowerCase())) {
        // Answer the question asked, then say how far the sample supports it.
        const since = periodDays ? Date.parse(ctx.store.now()) - periodDays * DAY : null;
        const stats = d.families.map((f) => {
          const c = familyCohort(f.id);
          const dec = c.decided.filter((a) => since === null || (a.decidedAt !== null && Date.parse(a.decidedAt) >= since));
          return { model: f.model, n: dec.length, ok: dec.filter((a) => a.status === 'approved').length };
        }).filter((x) => x.n > 0).sort((x, y) => y.ok / y.n - x.ok / x.n || y.n - x.n);
        const top = stats[0];
        const largest = Math.max(...stats.map((x) => x.n));
        lead = `Highest observed: ${top.model}, ${top.ok} of ${top.n} qualified. ${largest < 30 ? `No family can be ranked yet: the largest sample is ${largest} decisions.` : 'Check the intervals below before acting on the ranking.'}`;
      }
      return answer(rep, insufficient, insufficient
        ? `No restoration attempts were decided ${periodDays ? `in the last ${periodDays} days` : 'yet'}, so there is nothing to compare.`
        : lead);
    },
  };
  return repo;
}
