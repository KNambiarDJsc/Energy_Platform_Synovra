/**
 * Domain model for the Synovra Battery Intelligence Platform demo.
 *
 * These types are the data contract between the UI and the repository layer.
 * A FastAPI/PostgreSQL backend should expose the same shapes (see docs/API_ADAPTER.md).
 * All identifiers are strings; batteries use permanent UUIDs.
 */

export type ISODateTime = string;
export type ISODate = string;

/* ------------------------------ Identity ------------------------------ */

export type Role =
  | 'lab_operator'
  | 'battery_engineer'
  | 'field_technician'
  | 'noc_manager'
  | 'finance_owner'
  | 'customer_auditor'
  | 'platform_admin';

export interface Tenant {
  id: string;
  name: string;
  kind: 'operator' | 'customer';
}

export interface User {
  id: string;
  name: string;
  title: string;
  email: string;
  role: Role;
  tenantId: string;
  /** Site scope. `all` means every site in the tenant boundary. */
  siteScope: 'all' | string[];
  active: boolean;
}

/** The acting identity attached to every service call. */
export interface Actor {
  userId: string;
  name: string;
  role: Role;
  tenantId: string;
  siteScope: 'all' | string[];
}

/* ------------------------------ Batteries ----------------------------- */

export type LifecycleState =
  | 'received'
  | 'testing'
  | 'restoration_candidate'
  | 'in_restoration'
  | 'awaiting_review'
  | 'rework'
  | 'qualified'
  | 'reserved'
  | 'deployed'
  | 'returned'
  | 'rejected'
  | 'recycling_queue'
  | 'recycled';

export type Chemistry = 'VRLA AGM' | 'VRLA Gel' | 'Flooded OPzS';

export interface BatteryFamily {
  id: string;
  manufacturer: string;
  model: string;
  chemistry: Chemistry;
  unitType: '12V block' | '2V cell';
  ratedVoltageV: number;
  ratedCapacityAh: number;
  /** Rating conditions are recorded explicitly; capacity is meaningless without them. */
  ratingConditions: string;
  rateHours: number;
  ratedTempC: number;
  endVoltagePerUnitV: number;
}

export interface Battery {
  /** Permanent internal UUID. Never reused, never derived from the serial. */
  id: string;
  /** Human-readable label printed on the physical battery (e.g. B-0002). Not the identity. */
  label: string;
  /** Public QR lookup reference. A lookup key only - it does not authorise access. */
  publicRef: string;
  manufacturerSerial: string | null;
  familyId: string;
  manufacturedOn: ISODate | null;
  tenantId: string;
  lifecycleState: LifecycleState;
  siteId: string | null;
  currentAssignmentId: string | null;
  /** Physical location when not in a slot (e.g. "Lab bay 2", "Quarantine shelf"). */
  physicalLocation: string;
  restorationBatchId: string | null;
  /** If this battery physically replaced another, the replaced record is linked (not merged). */
  replacesBatteryId: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  sourceSystem: string;
  internalNotes: string;
}

export interface BatteryAlias {
  id: string;
  batteryId: string;
  kind: 'legacy_lab_id' | 'customer_asset_tag' | 'previous_serial' | 'spreadsheet_row' | 'retired_qr_reference';
  value: string;
  source: string;
}

export type DataQualityLevel = 'complete' | 'partial' | 'incomplete' | 'conflict';

export interface DataQuality {
  level: DataQualityLevel;
  missing: string[];
  conflicts: string[];
}

/* ------------------------------ Sites ------------------------------ */

export interface Site {
  id: string;
  tenantId: string;
  name: string;
  city: string;
  kind: string;
}
export interface Bank {
  id: string;
  siteId: string;
  name: string;
}
export interface StringUnit {
  id: string;
  bankId: string;
  siteId: string;
  name: string;
  familyId: string;
  nominalVoltageV: number;
}
export interface Slot {
  id: string;
  stringId: string;
  bankId: string;
  siteId: string;
  position: number;
}
export interface BatteryAssignment {
  id: string;
  batteryId: string;
  slotId: string;
  startAt: ISODateTime;
  endAt: ISODateTime | null;
  reason: string;
  actorId: string;
}

/* ------------------------------ Sensors & telemetry ------------------------------ */

export interface Gateway {
  id: string;
  siteId: string;
  name: string;
  status: 'online' | 'degraded' | 'offline';
  lastSeenAt: ISODateTime;
  samplingIntervalMin: number;
}
export interface Sensor {
  id: string;
  gatewayId: string;
  serial: string;
  kind: 'block_monitor';
  /** Whether resistance is directly measured, inferred by firmware, or not provided at all. */
  resistanceSource: 'measured' | 'inferred' | 'unavailable';
  calibrationRef: string;
}
export interface SensorAssignment {
  id: string;
  sensorId: string;
  slotId: string | null;
  startAt: ISODateTime;
  endAt: ISODateTime | null;
  mappingQuality: 'verified' | 'unverified';
  actorId: string;
}
export type ObservationQuality = 'measured' | 'missing' | 'stale';
export interface TelemetryObservation {
  t: ISODateTime;
  sensorId: string;
  batteryId: string;
  voltageV: number | null;
  temperatureC: number | null;
  resistanceMOhm: number | null;
  quality: ObservationQuality;
}

/* ------------------------------ Lifecycle ------------------------------ */

export type LifecycleEventType =
  | 'intake'
  | 'test'
  | 'restoration'
  | 'approval'
  | 'rejection'
  | 'rework'
  | 'movement'
  | 'deployment'
  | 'alert'
  | 'service'
  | 'return'
  | 'recycling'
  | 'identity'
  | 'value'
  | 'route_decision';

export type ApprovalState = 'not_required' | 'pending' | 'approved' | 'rejected';

export interface LifecycleEvent {
  id: string;
  batteryId: string;
  type: LifecycleEventType;
  occurredAt: ISODateTime;
  /** Historical dates reconstructed from legacy records are flagged as approximate. */
  dateCertainty: 'exact' | 'approximate';
  recordedAt: ISODateTime;
  actorId: string;
  actorName: string;
  title: string;
  reason: string;
  evidenceIds: string[];
  approvalState: ApprovalState;
  /** Set on corrections: the value before the change. */
  correction?: { field: string; previous: string | null; next: string | null } | null;
  sourceSystem: string;
  previousState: LifecycleState | null;
  newState: LifecycleState | null;
  ref: { kind: string; id: string } | null;
}

/* ------------------------------ Testing ------------------------------ */

export interface TestProtocolRevision {
  id: string;
  name: string;
  revision: string;
  status: 'placeholder' | 'approved';
  summary: string;
}

export type TestKind = 'intake_inspection' | 'initial' | 'final' | 'periodic';
export type TestStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'requires_rework';

/**
 * Why a test was rejected or sent back. Labels and the placeholder status of these lists are in
 * src/domain/outcomes.ts.
 */
export type TestReviewReasonCode =
  | 'conditions_out_of_protocol'
  | 'instrument_or_calibration'
  | 'evidence_missing'
  | 'data_entry_error'
  | 'implausible_result'
  | 'other';

export interface TestResult {
  openCircuitVoltageV: number | null;
  internalResistanceMOhm: number | null;
  temperatureC: number | null;
  /** Measured discharge capacity in Ah under the stated conditions. Not temperature-corrected. */
  capacityAh: number | null;
  notes: string;
}
export interface TestConditions {
  ambientTempC: number | null;
  loadCurrentA: number | null;
  cutoffVoltageV: number | null;
  durationH: number | null;
}
export interface TestSession {
  id: string;
  /** Null for string-level tests. */
  batteryId: string | null;
  /** Set for string-level tests. A string result is never a per-battery capacity. */
  stringId: string | null;
  /** Battery-level and string-level results are kept distinct. */
  level: 'battery' | 'string';
  kind: TestKind;
  protocolId: string;
  status: TestStatus;
  operatorId: string;
  operatorName: string;
  witnessName: string | null;
  instrument: string;
  calibrationRef: string;
  conditions: TestConditions;
  result: TestResult;
  evidenceIds: string[];
  attemptId: string | null;
  startedAt: ISODateTime;
  submittedAt: ISODateTime | null;
  submittedById: string | null;
  reviewedAt: ISODateTime | null;
  reviewerId: string | null;
  reviewerName: string | null;
  reviewReason: string | null;
  /** Set when the test is rejected or sent back; null otherwise. */
  reviewReasonCode: TestReviewReasonCode | null;
}

/* ------------------------------ Restoration ------------------------------ */

export interface RestorationBatch {
  id: string;
  name: string;
  familyId: string;
  openedOn: ISODate;
  status: 'open' | 'closed';
  plannedCount: number;
  /**
   * The approved process version every attempt in this batch follows, by reference only (the procedure itself
   * stays in the controlled lab system). Null when it was not recorded. This is what lets outcomes be compared
   * by process rather than by batch.
   */
  processVersion: string | null;
}
export type AttemptStatus = 'in_restoration' | 'awaiting_review' | 'approved' | 'rejected' | 'rework';
/** Why an attempt did not qualify. The training label for restoration outcomes (docs/ML_PLAN.md). */
export type RestorationReasonCode =
  | 'below_capacity_threshold'
  | 'high_internal_resistance'
  | 'physical_damage'
  | 'failed_inspection'
  | 'after_test_not_valid'
  | 'other';
export interface ProcessNote {
  id: string;
  at: ISODateTime;
  actorName: string;
  text: string;
}
export interface RestorationAttempt {
  id: string;
  batchId: string;
  batteryId: string;
  attemptNo: number;
  status: AttemptStatus;
  beforeTestId: string | null;
  afterTestId: string | null;
  notes: ProcessNote[];
  /** Lot references only. Recipes and procedures are controlled lab information, not stored here. */
  lotRefs: { kind: 'material' | 'solvent'; ref: string }[];
  evidenceIds: string[];
  startedAt: ISODateTime;
  submittedAt: ISODateTime | null;
  decidedAt: ISODateTime | null;
  deciderName: string | null;
  decisionReason: string | null;
  /** Required for rework and rejection; null for approval and undecided attempts. */
  decisionReasonCode: RestorationReasonCode | null;
}

/* ------------------------------ Commercial ------------------------------ */

export interface CostEntry {
  id: string;
  /** Null for batch-level shared costs. */
  batteryId: string | null;
  batchId: string | null;
  kind:
    | 'acquisition'
    | 'collection'
    | 'testing'
    | 'restoration_inputs'
    | 'logistics'
    | 'installation'
    | 'service'
    | 'warranty_provision';
  /** `null` means unknown. It is never treated as zero. */
  amountAed: number | null;
  allocation: 'direct' | 'allocated' | 'estimate';
  recordedOn: ISODate;
  note: string;
  source: string;
  /** How a shared cost was split (required for allocated entries). */
  allocationBasis: string | null;
}
/**
 * Money that came in for a battery: the other side of the cost ledger. Without it nothing can say whether
 * reviving a battery paid. Recorded once; a correction is a new record with a note, never an edit.
 */
export type ValueKind = 'sale' | 'swap_fee' | 'restoration_fee' | 'recycling_settlement';
export interface ValueRecord {
  id: string;
  batteryId: string;
  kind: ValueKind;
  /** `null` means agreed but not yet known (for example an unsettled invoice). Never treated as zero. */
  amountAed: number | null;
  recordedOn: ISODate;
  counterparty: string;
  reference: string | null;
  source: string;
  note: string;
  recordedByName: string;
}

export interface WarrantyRecord {
  id: string;
  batteryId: string;
  termsRef: string | null;
  startsOn: ISODate | null;
  endsOn: ISODate | null;
  state: 'active' | 'expiring' | 'expired' | 'claim_open' | 'claim_closed' | 'not_applicable' | 'unknown';
  claims: { id: string; openedOn: ISODate; status: 'open' | 'closed'; summary: string; finding: string; confirmedCause: string | null }[];
}
export interface RecyclingRecord {
  id: string;
  batteryId: string;
  state: 'queued' | 'consigned' | 'recycled';
  recyclerName: string;
  consignmentRef: string | null;
  massKg: number | null;
  consignedOn: ISODate | null;
  certificateState: 'not_received' | 'received';
  certificateRef: string | null;
}

export type EvidenceClassification = 'customer_visible' | 'internal' | 'controlled';
export interface EvidenceFile {
  id: string;
  batteryId: string | null;
  kind: 'test_report' | 'photo' | 'calibration_certificate' | 'import_source' | 'service_report' | 'other';
  fileName: string;
  sizeKb: number;
  uploadedAt: ISODateTime;
  uploadedByName: string;
  /** SHA-256 of the stored bytes. Placeholder text when only metadata was recorded. */
  checksum: string;
  classification: EvidenceClassification;
  /** Content-addressed key in evidence storage (`sha256/<hex>`). Null when only metadata was recorded. */
  storageKey: string | null;
  contentType: string | null;
  /** Malware scan result at upload. Null when no file is stored. */
  scanStatus: 'clean' | 'not_scanned' | null;
}

/** File facts established by the server when the bytes were stored. */
export interface StoredEvidence {
  checksum: string;
  storageKey: string;
  contentType: string;
  sizeKb: number;
  scanStatus: 'clean' | 'not_scanned';
}

/* ------------------------------ Alerts ------------------------------ */

export type AlertType =
  | 'gateway_offline'
  | 'sensor_unmapped'
  | 'missing_telemetry'
  | 'voltage_threshold'
  | 'temperature_threshold'
  | 'resistance_trend'
  | 'suspected_battery_issue'
  | 'warranty_review';
export type AlertState = 'open' | 'acknowledged' | 'assigned' | 'in_progress' | 'resolved' | 'closed';
export type Severity = 'info' | 'warning' | 'critical';

export interface Alert {
  id: string;
  type: AlertType;
  state: AlertState;
  severity: Severity;
  batteryId: string | null;
  siteId: string;
  source: { kind: 'rule' | 'model' | 'system'; name: string; version: string };
  title: string;
  detail: string;
  recommendedAction: string;
  createdAt: ISODateTime;
  lastEvaluatedAt: ISODateTime;
  assigneeId: string | null;
  evidence: { label: string; value: string }[];
  resolutionReason: string | null;
  history: { at: ISODateTime; actorName: string; from: AlertState | null; to: AlertState; note: string }[];
}

export type TaskStatus = 'draft' | 'open' | 'in_progress' | 'done' | 'cancelled';
export interface ServiceTask {
  id: string;
  alertId: string | null;
  batteryId: string | null;
  siteId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: 'low' | 'normal' | 'high';
  assigneeId: string | null;
  dueOn: ISODate | null;
  createdAt: ISODateTime;
  createdByName: string;
  origin: 'manual' | 'alert' | 'assistant_draft';
}

/* ------------------------------ Intelligence ------------------------------ */

export type PredictionKind =
  | 'qualification_aid'
  | 'capacity_estimate'
  | 'failure_risk'
  | 'anomaly_detection'
  | 'inventory_planning'
  | 'warranty_risk';

export interface Prediction {
  id: string;
  kind: PredictionKind;
  batteryId: string | null;
  siteId: string | null;
  modelName: string;
  modelVersion: string;
  inputAt: ISODateTime;
  predictedAt: ISODateTime;
  /** Human-readable output with the unit and range. Never a single unexplained score. */
  output: { label: string; value: string; range: string | null };
  uncertainty: string;
  applicability: { inScope: boolean; note: string };
  sourceRecordIds: string[];
  factors: string[];
  /** The simple engineering rule this output is compared against. */
  baseline: string;
  /** Inputs must exist at decision time; list what was (and was not) used. */
  inputsUsed: string;
  status: 'shadow' | 'validated'; // taste-skill-ignore: "shadow mode" is the model status, not a style
  reviewState: 'unreviewed' | 'agreed' | 'disagreed';
  reviewedByName: string | null;
}

/* ------------------------------ Reports ------------------------------ */

export type ReportTemplateId =
  | 'battery_passport'
  | 'restoration_batch'
  | 'customer_site'
  | 'warranty_pack'
  | 'esg_recycling'
  | 'data_completeness';

export interface ReportSection {
  heading: string;
  /** `internal` sections are removed for customer audiences. */
  visibility: 'customer' | 'internal';
  columns: string[];
  rows: string[][];
  note?: string;
}
export interface Report {
  id: string;
  templateId: ReportTemplateId;
  title: string;
  scope: string;
  period: { from: ISODate; to: ISODate };
  generatedAt: ISODateTime;
  generatedByName: string;
  audience: 'internal' | 'customer';
  approvalState: 'draft' | 'approved' | 'rejected';
  approvedByName: string | null;
  sourceWatermark: string;
  evidenceRefs: string[];
  sections: ReportSection[];
}

/* ------------------------------ Imports & audit ------------------------------ */

export type ImportOutcome = 'create' | 'update' | 'skip' | 'quarantine';
export interface ImportIssue {
  severity: 'error' | 'warning';
  field: string;
  message: string;
}
export interface ImportFieldValue {
  original: string;
  normalized: string | number | null;
}
export interface ImportRow {
  rowNumber: number;
  fields: Record<string, ImportFieldValue>;
  issues: ImportIssue[];
  outcome: ImportOutcome;
  batteryId: string | null;
  note: string;
}
export interface ImportJob {
  id: string;
  fileName: string;
  fileHash: string;
  templateId: string;
  mappingVersion: string;
  actorName: string;
  createdAt: ISODateTime;
  committedAt: ISODateTime | null;
  status: 'previewed' | 'committed';
  /** Set when an identical file (same hash) was committed before. */
  priorCommitAt?: string | null;
  rows: ImportRow[];
  counts: { created: number; updated: number; skipped: number; quarantined: number };
}
export interface ImportTemplate {
  id: string;
  name: string;
  version: string;
  description: string;
  /** canonical field -> accepted source column names */
  columns: Record<string, string[]>;
}

export interface AuditEvent {
  id: string;
  at: ISODateTime;
  actorId: string;
  actorName: string;
  role: Role | 'system';
  action: string;
  entityKind: string;
  entityId: string;
  summary: string;
  outcome: 'success' | 'denied';
}

export interface NotificationSetting {
  id: string;
  label: string;
  channel: 'email' | 'in_app';
  enabled: boolean;
}

/* ------------------------------ Database snapshot ------------------------------ */

export interface DemoDb {
  tenants: Tenant[];
  users: User[];
  families: BatteryFamily[];
  batteries: Battery[];
  aliases: BatteryAlias[];
  sites: Site[];
  banks: Bank[];
  strings: StringUnit[];
  slots: Slot[];
  assignments: BatteryAssignment[];
  gateways: Gateway[];
  sensors: Sensor[];
  sensorAssignments: SensorAssignment[];
  events: LifecycleEvent[];
  protocols: TestProtocolRevision[];
  tests: TestSession[];
  batches: RestorationBatch[];
  attempts: RestorationAttempt[];
  costs: CostEntry[];
  values: ValueRecord[];
  warranties: WarrantyRecord[];
  recycling: RecyclingRecord[];
  evidence: EvidenceFile[];
  alerts: Alert[];
  tasks: ServiceTask[];
  predictions: Prediction[];
  reports: Report[];
  imports: ImportJob[];
  importTemplates: ImportTemplate[];
  notifications: NotificationSetting[];
  audit: AuditEvent[];
}
