/**
 * PostgreSQL schema for the V1 pilot scope: identity, lifecycle history, tests, restoration,
 * assignments, costs, warranty, recycling, evidence, imports, reports and audit.
 *
 * Column names mirror the domain types in src/domain/types.ts one to one (camelCase in TS,
 * snake_case in SQL), so records load and save without translation loss.
 *
 * Integrity rules from the blueprint are enforced in the database as a second line of defence
 * behind the service layer:
 * - one open assignment per slot and per battery (partial unique indexes)
 * - at most one restoration attempt in progress per battery
 * - battery-level and string-level tests are mutually exclusive (check constraint)
 * - an approved test was reviewed by someone other than its operator and submitter (check constraint)
 * - unknown money is NULL, never zero, and never negative (check constraint)
 * - a rejected or reworked test or restoration attempt carries a reason code (check constraints;
 *   NOT VALID, so rows decided before codes existed are kept as they are)
 * - lifecycle events and audit events are append-only (triggers in drizzle/0001_integrity.sql)
 *
 * Every table has an identity `seq` column: insertion order, used to load records in a stable order.
 *
 * Telemetry, gateways, sensors, alerts and tasks are V2 scope and are not in this schema yet.
 * `predictions`, `model_versions` and `model_training_records` are the V3 contract: an ML service
 * writes there, the API only reads. The ML service reads through the `ml_*` views in
 * drizzle/0005_ml_views.sql, never the operational tables directly (docs/ML_PLAN.md).
 */
import { sql } from 'drizzle-orm';
import {
  bigint, boolean, check, date, doublePrecision, index, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, uniqueIndex,
} from 'drizzle-orm/pg-core';
import type {
  ApprovalState, CostEntry, EvidenceFile, ImportRow, LifecycleEventType, LifecycleState, PredictionKind, ProcessNote,
  ReportSection, ReportTemplateId, RestorationReasonCode, Role, TestConditions, TestResult, TestReviewReasonCode, ValueRecord, WarrantyRecord,
} from '../../../src/domain/types';

const ts = (name: string) => timestamp(name, { withTimezone: true, precision: 3, mode: 'date' });
const day = (name: string) => date(name, { mode: 'string' });
const seq = () => integer('seq').generatedAlwaysAsIdentity();

/* ------------------------------ Identity & access ------------------------------ */

export const tenants = pgTable('tenants', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  kind: text('kind', { enum: ['operator', 'customer'] }).notNull(),
  seq: seq(),
});

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull(),
  title: text('title').notNull(),
  email: text('email').notNull(),
  role: text('role').$type<Role>().notNull(),
  /** `"all"` or an array of site ids. */
  siteScope: jsonb('site_scope').$type<'all' | string[]>().notNull(),
  active: boolean('active').notNull().default(true),
  /** OIDC subject. Linked on first sign-in by verified email; null until then. */
  externalSubject: text('external_subject'),
  seq: seq(),
}, (t) => [
  uniqueIndex('users_email_uq').on(sql`lower(${t.email})`),
  uniqueIndex('users_external_subject_uq').on(t.externalSubject),
]);

/* ------------------------------ Sites ------------------------------ */

export const sites = pgTable('sites', {
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  name: text('name').notNull(),
  city: text('city').notNull(),
  kind: text('kind').notNull(),
  seq: seq(),
});

export const banks = pgTable('banks', {
  id: text('id').primaryKey(),
  siteId: text('site_id').notNull().references(() => sites.id),
  name: text('name').notNull(),
  seq: seq(),
});

export const batteryFamilies = pgTable('battery_families', {
  id: text('id').primaryKey(),
  manufacturer: text('manufacturer').notNull(),
  model: text('model').notNull(),
  chemistry: text('chemistry').notNull(),
  unitType: text('unit_type').notNull(),
  ratedVoltageV: doublePrecision('rated_voltage_v').notNull(),
  ratedCapacityAh: doublePrecision('rated_capacity_ah').notNull(),
  ratingConditions: text('rating_conditions').notNull(),
  rateHours: doublePrecision('rate_hours').notNull(),
  ratedTempC: doublePrecision('rated_temp_c').notNull(),
  endVoltagePerUnitV: doublePrecision('end_voltage_per_unit_v').notNull(),
  seq: seq(),
}, (t) => [check('families_rating_ck', sql`${t.ratedCapacityAh} > 0 AND ${t.ratedVoltageV} > 0`)]);

export const strings = pgTable('strings', {
  id: text('id').primaryKey(),
  bankId: text('bank_id').notNull().references(() => banks.id),
  siteId: text('site_id').notNull().references(() => sites.id),
  name: text('name').notNull(),
  familyId: text('family_id').notNull().references(() => batteryFamilies.id),
  nominalVoltageV: doublePrecision('nominal_voltage_v').notNull(),
  seq: seq(),
});

export const slots = pgTable('slots', {
  id: text('id').primaryKey(),
  stringId: text('string_id').notNull().references(() => strings.id),
  bankId: text('bank_id').notNull().references(() => banks.id),
  siteId: text('site_id').notNull().references(() => sites.id),
  position: integer('position').notNull(),
  seq: seq(),
}, (t) => [uniqueIndex('slots_string_position_uq').on(t.stringId, t.position)]);

/* ------------------------------ Batteries ------------------------------ */

export const restorationBatches = pgTable('restoration_batches', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  familyId: text('family_id').notNull().references(() => batteryFamilies.id),
  openedOn: day('opened_on').notNull(),
  status: text('status', { enum: ['open', 'closed'] }).notNull(),
  plannedCount: integer('planned_count').notNull(),
  /** Approved process version, by reference. The procedure itself stays in the controlled lab system. */
  processVersion: text('process_version'),
  seq: seq(),
});

export const batteries = pgTable('batteries', {
  /** Permanent internal UUID. Never reused, never derived from the serial. */
  id: text('id').primaryKey(),
  tenantId: text('tenant_id').notNull().references(() => tenants.id),
  /** Printed label (e.g. B-0002). Human-friendly, not the identity. */
  label: text('label').notNull(),
  /** QR lookup key. A pointer only; it never authorises access. */
  publicRef: text('public_ref').notNull(),
  manufacturerSerial: text('manufacturer_serial'),
  familyId: text('family_id').notNull().references(() => batteryFamilies.id),
  manufacturedOn: day('manufactured_on'),
  lifecycleState: text('lifecycle_state').$type<LifecycleState>().notNull(),
  siteId: text('site_id').references(() => sites.id),
  currentAssignmentId: text('current_assignment_id'),
  physicalLocation: text('physical_location').notNull(),
  restorationBatchId: text('restoration_batch_id').references(() => restorationBatches.id),
  /** A physical replacement links to the replaced record; it never merges into it. */
  replacesBatteryId: text('replaces_battery_id'),
  createdAt: ts('created_at').notNull(),
  updatedAt: ts('updated_at').notNull(),
  sourceSystem: text('source_system').notNull(),
  internalNotes: text('internal_notes').notNull().default(''),
  seq: seq(),
}, (t) => [
  uniqueIndex('batteries_tenant_label_uq').on(t.tenantId, t.label),
  uniqueIndex('batteries_public_ref_uq').on(t.publicRef),
  // Serials are deliberately not unique: they can be missing or duplicated. Duplicates go to identity review.
  index('batteries_serial_idx').on(sql`lower(${t.manufacturerSerial})`),
  index('batteries_state_idx').on(t.lifecycleState),
]);

export const batteryAliases = pgTable('battery_aliases', {
  id: text('id').primaryKey(),
  batteryId: text('battery_id').notNull().references(() => batteries.id),
  kind: text('kind').notNull(),
  value: text('value').notNull(),
  source: text('source').notNull(),
  seq: seq(),
}, (t) => [index('battery_aliases_value_idx').on(sql`lower(${t.value})`), index('battery_aliases_battery_idx').on(t.batteryId)]);

export const batteryEvents = pgTable('battery_events', {
  id: text('id').primaryKey(),
  batteryId: text('battery_id').notNull().references(() => batteries.id),
  type: text('type').$type<LifecycleEventType>().notNull(),
  /** When it happened, separate from when someone entered it. */
  occurredAt: ts('occurred_at').notNull(),
  dateCertainty: text('date_certainty', { enum: ['exact', 'approximate'] }).notNull(),
  recordedAt: ts('recorded_at').notNull(),
  /** User id, or `system`. Deliberately not a foreign key: history outlives accounts. */
  actorId: text('actor_id').notNull(),
  actorName: text('actor_name').notNull(),
  title: text('title').notNull(),
  reason: text('reason').notNull(),
  evidenceIds: jsonb('evidence_ids').$type<string[]>().notNull(),
  approvalState: text('approval_state').$type<ApprovalState>().notNull(),
  correction: jsonb('correction').$type<{ field: string; previous: string | null; next: string | null } | null>(),
  sourceSystem: text('source_system').notNull(),
  previousState: text('previous_state').$type<LifecycleState | null>(),
  newState: text('new_state').$type<LifecycleState | null>(),
  ref: jsonb('ref').$type<{ kind: string; id: string } | null>(),
  seq: seq(),
}, (t) => [index('battery_events_battery_idx').on(t.batteryId, t.occurredAt)]);

/* ------------------------------ Testing ------------------------------ */

export const testProtocols = pgTable('test_protocols', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  revision: text('revision').notNull(),
  status: text('status', { enum: ['placeholder', 'approved'] }).notNull(),
  summary: text('summary').notNull(),
  seq: seq(),
});

export const tests = pgTable('tests', {
  id: text('id').primaryKey(),
  batteryId: text('battery_id').references(() => batteries.id),
  stringId: text('string_id').references(() => strings.id),
  level: text('level', { enum: ['battery', 'string'] }).notNull(),
  kind: text('kind', { enum: ['intake_inspection', 'initial', 'final', 'periodic'] }).notNull(),
  protocolId: text('protocol_id').notNull().references(() => testProtocols.id),
  status: text('status', { enum: ['draft', 'submitted', 'under_review', 'approved', 'rejected', 'requires_rework'] }).notNull(),
  operatorId: text('operator_id').notNull(),
  operatorName: text('operator_name').notNull(),
  witnessName: text('witness_name'),
  instrument: text('instrument').notNull(),
  calibrationRef: text('calibration_ref').notNull(),
  conditions: jsonb('conditions').$type<TestConditions>().notNull(),
  result: jsonb('result').$type<TestResult>().notNull(),
  evidenceIds: jsonb('evidence_ids').$type<string[]>().notNull(),
  attemptId: text('attempt_id'),
  startedAt: ts('started_at').notNull(),
  submittedAt: ts('submitted_at'),
  submittedById: text('submitted_by_id'),
  reviewedAt: ts('reviewed_at'),
  reviewerId: text('reviewer_id'),
  reviewerName: text('reviewer_name'),
  reviewReason: text('review_reason'),
  /** Codes are validated by the service layer; the lists are placeholders owned by engineering (src/domain/outcomes.ts). */
  reviewReasonCode: text('review_reason_code').$type<TestReviewReasonCode>(),
  seq: seq(),
}, (t) => [
  index('tests_battery_idx').on(t.batteryId),
  index('tests_status_idx').on(t.status),
  check('tests_level_target_ck', sql`(${t.level} = 'battery' AND ${t.batteryId} IS NOT NULL AND ${t.stringId} IS NULL)
    OR (${t.level} = 'string' AND ${t.stringId} IS NOT NULL AND ${t.batteryId} IS NULL)`),
  check('tests_separation_of_duties_ck', sql`${t.status} <> 'approved'
    OR (${t.reviewerId} IS NOT NULL AND ${t.reviewerId} <> ${t.operatorId} AND ${t.reviewerId} IS DISTINCT FROM ${t.submittedById})`),
  check('tests_reason_code_ck', sql`${t.status} NOT IN ('rejected', 'requires_rework') OR ${t.reviewReasonCode} IS NOT NULL`),
]);

/* ------------------------------ Restoration ------------------------------ */

export const restorationAttempts = pgTable('restoration_attempts', {
  id: text('id').primaryKey(),
  batchId: text('batch_id').notNull().references(() => restorationBatches.id),
  batteryId: text('battery_id').notNull().references(() => batteries.id),
  attemptNo: integer('attempt_no').notNull(),
  status: text('status', { enum: ['in_restoration', 'awaiting_review', 'approved', 'rejected', 'rework'] }).notNull(),
  beforeTestId: text('before_test_id').references(() => tests.id),
  afterTestId: text('after_test_id').references(() => tests.id),
  notes: jsonb('notes').$type<ProcessNote[]>().notNull(),
  /** Lot references only. Recipes and procedures stay in the controlled lab system. */
  lotRefs: jsonb('lot_refs').$type<{ kind: 'material' | 'solvent'; ref: string }[]>().notNull(),
  evidenceIds: jsonb('evidence_ids').$type<string[]>().notNull(),
  startedAt: ts('started_at').notNull(),
  submittedAt: ts('submitted_at'),
  decidedAt: ts('decided_at'),
  deciderName: text('decider_name'),
  decisionReason: text('decision_reason'),
  /** The training label for restoration outcomes. Required for rework and rejection. */
  decisionReasonCode: text('decision_reason_code').$type<RestorationReasonCode>(),
  seq: seq(),
}, (t) => [
  uniqueIndex('attempts_battery_no_uq').on(t.batteryId, t.attemptNo),
  uniqueIndex('attempts_one_open_uq').on(t.batteryId).where(sql`${t.status} IN ('in_restoration', 'awaiting_review')`),
  check('attempts_reason_code_ck', sql`${t.status} NOT IN ('rejected', 'rework') OR ${t.decisionReasonCode} IS NOT NULL`),
]);

/* ------------------------------ Assignments ------------------------------ */

export const assignments = pgTable('assignments', {
  id: text('id').primaryKey(),
  batteryId: text('battery_id').notNull().references(() => batteries.id),
  slotId: text('slot_id').notNull().references(() => slots.id),
  startAt: ts('start_at').notNull(),
  endAt: ts('end_at'),
  reason: text('reason').notNull(),
  actorId: text('actor_id').notNull(),
  seq: seq(),
}, (t) => [
  uniqueIndex('assignments_open_slot_uq').on(t.slotId).where(sql`${t.endAt} IS NULL`),
  uniqueIndex('assignments_open_battery_uq').on(t.batteryId).where(sql`${t.endAt} IS NULL`),
  index('assignments_battery_idx').on(t.batteryId),
  check('assignments_period_ck', sql`${t.endAt} IS NULL OR ${t.endAt} >= ${t.startAt}`),
]);

/* ------------------------------ Commercial ------------------------------ */

export const costEntries = pgTable('cost_entries', {
  id: text('id').primaryKey(),
  batteryId: text('battery_id').references(() => batteries.id),
  batchId: text('batch_id').references(() => restorationBatches.id),
  kind: text('kind').$type<CostEntry['kind']>().notNull(),
  /** NULL means unknown. It is never treated as zero. */
  amountAed: numeric('amount_aed', { precision: 14, scale: 2 }),
  allocation: text('allocation', { enum: ['direct', 'allocated', 'estimate'] }).notNull(),
  recordedOn: day('recorded_on').notNull(),
  note: text('note').notNull(),
  source: text('source').notNull(),
  allocationBasis: text('allocation_basis'),
  seq: seq(),
}, (t) => [
  index('costs_battery_idx').on(t.batteryId),
  index('costs_batch_idx').on(t.batchId),
  check('costs_scope_ck', sql`${t.batteryId} IS NOT NULL OR ${t.batchId} IS NOT NULL`),
  check('costs_amount_ck', sql`${t.amountAed} IS NULL OR ${t.amountAed} >= 0`),
]);

/** Money in per battery: sales, fees and recycler settlements. Rows are never updated or deleted (trigger). */
export const valueRecords = pgTable('value_records', {
  id: text('id').primaryKey(),
  batteryId: text('battery_id').notNull().references(() => batteries.id),
  kind: text('kind').$type<ValueRecord['kind']>().notNull(),
  /** NULL means agreed but not yet known. It is never treated as zero. */
  amountAed: numeric('amount_aed', { precision: 14, scale: 2 }),
  recordedOn: day('recorded_on').notNull(),
  counterparty: text('counterparty').notNull(),
  reference: text('reference'),
  source: text('source').notNull(),
  note: text('note').notNull(),
  recordedByName: text('recorded_by_name').notNull(),
  seq: seq(),
}, (t) => [
  index('value_records_battery_idx').on(t.batteryId),
  check('value_records_amount_ck', sql`${t.amountAed} IS NULL OR ${t.amountAed} >= 0`),
]);

export const warranties = pgTable('warranties', {
  id: text('id').primaryKey(),
  batteryId: text('battery_id').notNull().references(() => batteries.id),
  termsRef: text('terms_ref'),
  startsOn: day('starts_on'),
  endsOn: day('ends_on'),
  state: text('state').$type<WarrantyRecord['state']>().notNull(),
  claims: jsonb('claims').$type<WarrantyRecord['claims']>().notNull(),
  seq: seq(),
}, (t) => [uniqueIndex('warranties_battery_uq').on(t.batteryId)]);

export const recyclingRecords = pgTable('recycling_records', {
  id: text('id').primaryKey(),
  batteryId: text('battery_id').notNull().references(() => batteries.id),
  state: text('state', { enum: ['queued', 'consigned', 'recycled'] }).notNull(),
  recyclerName: text('recycler_name').notNull(),
  consignmentRef: text('consignment_ref'),
  massKg: doublePrecision('mass_kg'),
  consignedOn: day('consigned_on'),
  certificateState: text('certificate_state', { enum: ['not_received', 'received'] }).notNull(),
  certificateRef: text('certificate_ref'),
  seq: seq(),
}, (t) => [uniqueIndex('recycling_battery_uq').on(t.batteryId)]);

export const evidenceFiles = pgTable('evidence_files', {
  id: text('id').primaryKey(),
  batteryId: text('battery_id').references(() => batteries.id),
  kind: text('kind').$type<EvidenceFile['kind']>().notNull(),
  fileName: text('file_name').notNull(),
  sizeKb: integer('size_kb').notNull(),
  uploadedAt: ts('uploaded_at').notNull(),
  uploadedByName: text('uploaded_by_name').notNull(),
  /** SHA-256 of the stored bytes; a placeholder for metadata-only demo records. */
  checksum: text('checksum').notNull(),
  classification: text('classification', { enum: ['customer_visible', 'internal', 'controlled'] }).notNull(),
  /** Content-addressed storage key (`sha256/<checksum>`). Null for metadata-only demo records. */
  storageKey: text('storage_key'),
  contentType: text('content_type'),
  scanStatus: text('scan_status', { enum: ['clean', 'not_scanned'] }),
  seq: seq(),
}, (t) => [
  index('evidence_battery_idx').on(t.batteryId),
  // A stored file is addressed by its own checksum and always has a type and a scan result.
  check('evidence_stored_consistent_ck', sql`${t.storageKey} IS NULL
    OR (${t.storageKey} = 'sha256/' || ${t.checksum} AND ${t.contentType} IS NOT NULL AND ${t.scanStatus} IS NOT NULL)`),
]);

/* ------------------------------ Imports, reports, audit ------------------------------ */

export const importTemplates = pgTable('import_templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  version: text('version').notNull(),
  description: text('description').notNull(),
  columns: jsonb('columns').$type<Record<string, string[]>>().notNull(),
  seq: seq(),
});

export const importJobs = pgTable('import_jobs', {
  id: text('id').primaryKey(),
  fileName: text('file_name').notNull(),
  /** Content fingerprint. Re-importing the same content is classified as skips, so it creates nothing. */
  fileHash: text('file_hash').notNull(),
  templateId: text('template_id').notNull().references(() => importTemplates.id),
  mappingVersion: text('mapping_version').notNull(),
  actorName: text('actor_name').notNull(),
  createdAt: ts('created_at').notNull(),
  committedAt: ts('committed_at'),
  status: text('status', { enum: ['previewed', 'committed'] }).notNull(),
  priorCommitAt: text('prior_commit_at'),
  rows: jsonb('rows').$type<ImportRow[]>().notNull(),
  counts: jsonb('counts').$type<{ created: number; updated: number; skipped: number; quarantined: number }>().notNull(),
  seq: seq(),
}, (t) => [index('import_jobs_hash_idx').on(t.fileHash, t.status)]);

export const reports = pgTable('reports', {
  id: text('id').primaryKey(),
  templateId: text('template_id').$type<ReportTemplateId>().notNull(),
  title: text('title').notNull(),
  scope: text('scope').notNull(),
  periodFrom: day('period_from').notNull(),
  periodTo: day('period_to').notNull(),
  generatedAt: ts('generated_at').notNull(),
  generatedByName: text('generated_by_name').notNull(),
  audience: text('audience', { enum: ['internal', 'customer'] }).notNull(),
  approvalState: text('approval_state', { enum: ['draft', 'approved', 'rejected'] }).notNull(),
  approvedByName: text('approved_by_name'),
  sourceWatermark: text('source_watermark').notNull(),
  evidenceRefs: jsonb('evidence_refs').$type<string[]>().notNull(),
  sections: jsonb('sections').$type<ReportSection[]>().notNull(),
  seq: seq(),
}, (t) => [check('reports_period_ck', sql`${t.periodTo} >= ${t.periodFrom}`)]);

export const auditEvents = pgTable('audit_events', {
  id: text('id').primaryKey(),
  at: ts('at').notNull(),
  actorId: text('actor_id').notNull(),
  actorName: text('actor_name').notNull(),
  role: text('role').notNull(),
  action: text('action').notNull(),
  entityKind: text('entity_kind').notNull(),
  entityId: text('entity_id').notNull(),
  summary: text('summary').notNull(),
  outcome: text('outcome', { enum: ['success', 'denied'] }).notNull(),
  seq: seq(),
}, (t) => [index('audit_entity_idx').on(t.entityId), index('audit_at_idx').on(t.at)]);

export const notificationSettings = pgTable('notification_settings', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  channel: text('channel', { enum: ['email', 'in_app'] }).notNull(),
  enabled: boolean('enabled').notNull(),
  seq: seq(),
});

/**
 * A single counter bumped by every transaction that writes records. API instances cache loaded
 * records in memory and reuse them while the counter is unchanged, so reads stay fast and every
 * instance still sees every write.
 */
export const dataVersion = pgTable('data_version', {
  id: integer('id').primaryKey(),
  version: bigint('version', { mode: 'number' }).notNull(),
}, (t) => [check('data_version_single_row_ck', sql`${t.id} = 1`)]);

/* ------------------------------ V3 ML contract (the API never creates these) ------------------------------ */

/** Registry of model versions. Every prediction points at a registered version and its evaluation report. */
export const modelVersions = pgTable('model_versions', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  version: text('version').notNull(),
  /** `shadow` = logged for comparison only. `validated` requires a passed deployment gate (blueprint §21). */
  status: text('status', { enum: ['shadow', 'validated', 'retired'] }).notNull(),
  /** The simple engineering rule the model is compared against. */
  baseline: text('baseline').notNull(),
  trainingCohort: text('training_cohort').notNull(),
  evaluationReportRef: text('evaluation_report_ref'),
  registeredAt: ts('registered_at').notNull(),
  seq: seq(),
}, (t) => [
  uniqueIndex('model_versions_name_version_uq').on(t.name, t.version),
  check('model_versions_validated_needs_evidence_ck', sql`${t.status} <> 'validated' OR ${t.evaluationReportRef} IS NOT NULL`),
]);

/**
 * Which records a model version was trained on. This is what makes learning auditable: when a record
 * is corrected, or has to be withdrawn, these rows say which model versions used it, so they can be
 * reviewed, retrained without it and retired (`ml_model_review_flags` in drizzle/0005_ml_views.sql).
 * Removing a record's influence means retraining without it; nothing edits a trained model in place.
 */
export const modelTrainingRecords = pgTable('model_training_records', {
  modelVersionId: text('model_version_id').notNull().references(() => modelVersions.id),
  /** The row of the training view that was used, e.g. `restoration_attempt`. */
  recordKind: text('record_kind', { enum: ['restoration_attempt', 'test'] }).notNull(),
  recordId: text('record_id').notNull(),
  /** The battery the record belongs to, so corrections and withdrawals can be traced in one step. */
  batteryId: text('battery_id').notNull().references(() => batteries.id),
  seq: seq(),
}, (t) => [
  primaryKey({ columns: [t.modelVersionId, t.recordKind, t.recordId] }),
  index('model_training_records_battery_idx').on(t.batteryId),
]);

export const predictions = pgTable('predictions', {
  id: text('id').primaryKey(),
  modelVersionId: text('model_version_id').notNull().references(() => modelVersions.id),
  kind: text('kind').$type<PredictionKind>().notNull(),
  batteryId: text('battery_id').references(() => batteries.id),
  siteId: text('site_id').references(() => sites.id),
  /** Latest timestamp of the input data. Inputs must exist at decision time (no leakage). */
  inputAt: ts('input_at').notNull(),
  predictedAt: ts('predicted_at').notNull(),
  output: jsonb('output').$type<{ label: string; value: string; range: string | null }>().notNull(),
  uncertainty: text('uncertainty').notNull(),
  applicability: jsonb('applicability').$type<{ inScope: boolean; note: string }>().notNull(),
  sourceRecordIds: jsonb('source_record_ids').$type<string[]>().notNull(),
  factors: jsonb('factors').$type<string[]>().notNull(),
  inputsUsed: text('inputs_used').notNull(),
  reviewState: text('review_state', { enum: ['unreviewed', 'agreed', 'disagreed'] }).notNull().default('unreviewed'),
  reviewedByName: text('reviewed_by_name'),
  seq: seq(),
}, (t) => [
  index('predictions_battery_idx').on(t.batteryId),
  check('predictions_input_before_prediction_ck', sql`${t.inputAt} <= ${t.predictedAt}`),
]);
