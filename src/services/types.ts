/**
 * Service contracts. The UI depends only on these interfaces.
 * `services/index.ts` wires the in-browser mock implementations; a FastAPI/PostgreSQL
 * adapter can implement the same interfaces (see docs/API_ADAPTER.md for the endpoint mapping).
 */
import type {
  Alert, AlertState, AlertType, AuditEvent, Battery, BatteryAlias, BatteryAssignment, BatteryFamily, CostEntry,
  DataQuality, EvidenceFile, ImportJob, ImportTemplate, LifecycleEvent, LifecycleState, NotificationSetting,
  Prediction, PredictionKind, RecyclingRecord, Report, ReportTemplateId, RestorationAttempt, RestorationBatch,
  Role, ServiceTask, Severity, Site, StringUnit, Slot, Bank, Tenant, TestProtocolRevision, TestSession, User,
  WarrantyRecord, Gateway, Sensor, SensorAssignment, Actor, StoredEvidence, RestorationReasonCode, TestReviewReasonCode,
} from '@/domain/types';
import type { InventoryGroup } from '@/domain/lifecycle';
import type { RouteInputs } from '@/domain/routeEconomics';
import type { CorrectionInput, CreateBatteryInput, DeploymentInput, ReportInput, TaskInput, TestInput, UserInput, UserUpdate } from '@/domain/schemas';
import type { EvidenceStatusCode } from './core';

/* ------------------------------ Batteries ------------------------------ */

export interface BatteryFilters {
  q?: string;
  manufacturer?: string;
  siteId?: string;
  state?: LifecycleState | '';
  chemistry?: string;
  updatedFrom?: string;
  updatedTo?: string;
  qualityLevel?: string;
}

export interface BatteryListItem {
  id: string;
  label: string;
  publicRef: string;
  manufacturerSerial: string | null;
  manufacturer: string;
  model: string;
  chemistry: string;
  unitType: string;
  ratedVoltageV: number;
  ratedCapacityAh: number;
  lifecycleState: LifecycleState;
  siteName: string | null;
  position: string | null;
  physicalLocation: string;
  lastApprovedTest: { id: string; at: string; capacityAh: number | null; pctOfRated: number | null } | null;
  quality: DataQuality;
  evidenceStatus: { code: EvidenceStatusCode; label: string };
  warrantyState: WarrantyRecord['state'] | null;
  updatedAt: string;
  duplicateWarning: string | null;
}

export interface LocationDetail {
  siteId: string | null;
  siteName: string | null;
  bankName: string | null;
  stringName: string | null;
  position: number | null;
  slotId: string | null;
}

export interface AssignmentView extends BatteryAssignment {
  siteName: string;
  bankName: string;
  stringName: string;
  position: number;
}

export interface TimelineEvent extends LifecycleEvent {
  evidence: EvidenceFile[];
}

export interface TelemetrySummary {
  available: boolean;
  reason: string;
  sensorSerial: string | null;
  lastReadingAt: string | null;
  freshness: 'fresh' | 'stale' | 'none';
  voltageV: number | null;
  temperatureC: number | null;
  resistanceMOhm: number | null;
  resistanceSource: 'measured' | 'inferred' | 'unavailable' | null;
  completenessPct: number | null;
  mappingQuality: 'verified' | 'unverified' | null;
  hoursAbove30C: number | null;
}

export interface BatteryPassport {
  battery: Battery;
  family: BatteryFamily;
  aliases: BatteryAlias[];
  retiredRefs: BatteryAlias[];
  quality: DataQuality;
  evidenceStatus: { code: EvidenceStatusCode; label: string; detail: string };
  location: LocationDetail;
  lastApprovedTest: TestSession | null;
  events: TimelineEvent[];
  tests: TestSession[];
  stringTests: (TestSession & { stringName: string })[];
  attempts: RestorationAttempt[];
  assignments: AssignmentView[];
  telemetry: TelemetrySummary;
  costs: CostEntry[] | null;
  warranty: WarrantyRecord | null;
  recycling: RecyclingRecord | null;
  evidence: EvidenceFile[];
  audit: AuditEvent[] | null;
  alerts: Alert[];
  tasks: ServiceTask[];
  predictions: Prediction[];
  relatedBatteries: { id: string; label: string; publicRef: string; relation: string }[];
  /** True when customer-audience redaction has been applied. */
  redacted: boolean;
  redactions: string[];
}

export interface QrLookupResult {
  status: 'active' | 'retired' | 'unknown' | 'forbidden';
  batteryId: string | null;
  message: string;
}

export interface BatteryRepository {
  list(filters?: BatteryFilters): Promise<BatteryListItem[]>;
  facets(): Promise<{ manufacturers: string[]; chemistries: string[]; sites: Site[] }>;
  get(id: string): Promise<BatteryPassport>;
  lookupByPublicRef(ref: string): Promise<QrLookupResult>;
  create(input: CreateBatteryInput): Promise<{ battery: Battery; warnings: string[] }>;
  correct(input: CorrectionInput): Promise<Battery>;
  reissueLabel(batteryId: string, reason: string): Promise<{ battery: Battery; retired: string }>;
  exportCsv(ids?: string[]): Promise<{ fileName: string; csv: string }>;
  families(): Promise<BatteryFamily[]>;
  /** Checks that the caller may open an evidence file and records the access in the audit log. */
  openEvidence(evidenceId: string): Promise<EvidenceFile>;
  /** Downloads stored evidence bytes (HTTP mode only; the demo stores no files). */
  downloadEvidence?(evidenceId: string): Promise<{ blob: Blob; fileName: string }>;
}

/* ------------------------------ Imports ------------------------------ */

export interface ImportService {
  templates(): Promise<ImportTemplate[]>;
  preview(args: { fileName: string; text: string; templateId: string }): Promise<ImportJob>;
  commit(jobId: string): Promise<ImportJob>;
  list(): Promise<ImportJob[]>;
  sampleCsv(): string;
}

/* ------------------------------ Tests & restoration ------------------------------ */

export interface TestView extends TestSession {
  batteryLabel: string | null;
  batterySerial: string | null;
  familyModel: string | null;
  ratedCapacityAh: number | null;
  pctOfRated: number | null;
  protocolName: string;
  rule: { state: 'meets' | 'below' | 'unknown'; pct: number | null; label: string };
  evidence: EvidenceFile[];
}

export interface TestRepository {
  list(filter?: { status?: string; batteryId?: string }): Promise<TestView[]>;
  get(id: string): Promise<TestView>;
  protocols(): Promise<TestProtocolRevision[]>;
  create(input: TestInput): Promise<TestSession>;
  submit(id: string): Promise<TestSession>;
  startReview(id: string): Promise<TestSession>;
  approve(id: string, reason: string): Promise<TestSession>;
  reject(id: string, reason: string, reasonCode: TestReviewReasonCode): Promise<TestSession>;
  requestRework(id: string, reason: string, reasonCode: TestReviewReasonCode): Promise<TestSession>;
  /**
   * `stored` is set by the API after it has received, checked and stored the bytes. The browser's
   * HTTP adapter passes the `file` itself instead; the in-browser demo records metadata only.
   */
  attachEvidence(id: string, fileName: string, sizeKb: number, stored?: StoredEvidence, file?: Blob): Promise<EvidenceFile>;
}

export interface AttemptView extends RestorationAttempt {
  batteryLabel: string;
  batterySerial: string | null;
  familyModel: string;
  before: TestView | null;
  after: TestView | null;
  /** Null for customer audience: process data is confidential. */
  confidentialHidden: boolean;
}

export interface BatchResults {
  batch: RestorationBatch;
  familyModel: string;
  counts: {
    intake: number; attempted: number; qualified: number; rework: number; rejected: number; inProgress: number;
  };
  yield: { qualifiedOverIntake: number | null; qualifiedOverDecided: number | null; decided: number };
  /** Rework and rejection decisions in the batch, counted by reason code, most frequent first. */
  notQualifiedReasons: { code: RestorationReasonCode | null; label: string; count: number }[];
  costs: null | {
    knownTotalAed: number; unknownEntries: number; actualAed: number; allocatedAed: number; estimatedAed: number;
    warrantyProvisionAed: number; perQualifiedGrossAed: number | null;
    entries: CostEntry[];
  };
}

export interface EconomicsScenario {
  salesPerQualifiedAed: number;
  recoveryPerRejectAed: number;
}
export interface EconomicsResult {
  incoming: number;
  qualified: number;
  rejects: number;
  yieldPct: number | null;
  sales: number;
  recovery: number;
  listedCosts: number;
  contribution: number;
  grossCostPerQualified: number | null;
  netCostPerQualified: number | null;
  unknownCostEntries: number;
}

export interface RestorationRepository {
  batches(): Promise<RestorationBatch[]>;
  batchResults(batchId: string): Promise<BatchResults>;
  economics(batchId: string, scenario: EconomicsScenario): Promise<EconomicsResult>;
  attempts(filter?: { batchId?: string; batteryId?: string; status?: string }): Promise<AttemptView[]>;
  markCandidate(batteryId: string, reason: string): Promise<Battery>;
  createAttempt(args: { batteryId: string; batchId: string; lotRefs?: { kind: 'material' | 'solvent'; ref: string }[] }): Promise<RestorationAttempt>;
  addNote(attemptId: string, text: string): Promise<RestorationAttempt>;
  addEvidence(attemptId: string, fileName: string, sizeKb: number, stored?: StoredEvidence, file?: Blob): Promise<RestorationAttempt>;
  submitForReview(attemptId: string, afterTestId: string): Promise<RestorationAttempt>;
  /** `reasonCode` is required for rework and rejection, and must be null for approval. */
  decide(attemptId: string, decision: 'approve' | 'reject' | 'rework', reason: string, reasonCode?: RestorationReasonCode | null): Promise<RestorationAttempt>;
}

/* ------------------------------ Inventory & deployments ------------------------------ */

export interface InventoryOverview {
  groups: Record<InventoryGroup, BatteryListItem[]>;
  byFamily: { familyId: string; model: string; qualified: number; deployed: number; total: number }[];
}

export interface SlotView {
  slot: Slot;
  battery: { id: string; label: string; publicRef: string; state: LifecycleState } | null;
}
export interface StringView {
  string: StringUnit;
  bank: Bank;
  familyModel: string;
  slots: SlotView[];
}
export interface SiteView {
  site: Site;
  strings: StringView[];
  gatewayStatus: Gateway['status'] | null;
  occupied: number;
  capacity: number;
}

export interface CompatibilityCheck {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}
export interface DeploymentValidation {
  ok: boolean;
  checks: CompatibilityCheck[];
}

export interface DeploymentRepository {
  inventory(): Promise<InventoryOverview>;
  sites(): Promise<SiteView[]>;
  validate(batteryId: string, slotId: string): Promise<DeploymentValidation>;
  move(input: DeploymentInput): Promise<BatteryAssignment>;
  reserve(batteryId: string, reason: string): Promise<Battery>;
  returnFromSite(batteryId: string, reason: string): Promise<Battery>;
  deployable(): Promise<BatteryListItem[]>;
}

/* ------------------------------ Telemetry ------------------------------ */

export interface SeriesPoint {
  t: string;
  voltageV: number | null;
  temperatureC: number | null;
  resistanceMOhm: number | null;
}
export interface SensorView {
  sensor: Sensor;
  gateway: Gateway;
  assignment: SensorAssignment | null;
  history: SensorAssignment[];
  slotLabel: string | null;
  batteryId: string | null;
  batteryLabel: string | null;
  siteName: string;
  lastReadingAt: string | null;
  freshness: 'fresh' | 'stale' | 'none';
  completenessPct: number | null;
}
export interface GatewayView {
  gateway: Gateway;
  siteName: string;
  freshness: 'fresh' | 'stale';
  ageHours: number;
  sensors: number;
  unmapped: number;
}
export interface TelemetryRepository {
  gateways(): Promise<GatewayView[]>;
  sensors(): Promise<SensorView[]>;
  series(batteryId: string, days: number): Promise<{ points: SeriesPoint[]; bucketHours: number; sensorSerial: string | null; note: string }>;
  stringPeers(batteryId: string, days: number): Promise<{ points: { t: string; own: number | null; peerMedian: number | null }[] }>;
  summary(batteryId: string): Promise<TelemetrySummary>;
  fleet(): Promise<{ monitoredBatteries: number; deployed: number; unmonitored: number; completenessPct: number | null; staleGateways: number }>;
  snapshotAt(): string;
}

/* ------------------------------ Alerts & tasks ------------------------------ */

export interface AlertFilters {
  state?: AlertState | '';
  severity?: Severity | '';
  type?: AlertType | '';
  siteId?: string;
  active?: boolean;
}
export interface AlertView extends Alert {
  siteName: string;
  batteryLabel: string | null;
  assigneeName: string | null;
  freshness: { label: string; stale: boolean };
}
export interface TaskView extends ServiceTask {
  siteName: string;
  batteryLabel: string | null;
  assigneeName: string | null;
}
export interface AlertRepository {
  list(filters?: AlertFilters): Promise<AlertView[]>;
  get(id: string): Promise<AlertView>;
  acknowledge(id: string, note?: string): Promise<Alert>;
  assign(id: string, assigneeId: string, note?: string): Promise<Alert>;
  start(id: string, note?: string): Promise<Alert>;
  resolve(id: string, reason: string): Promise<Alert>;
  close(id: string, note?: string): Promise<Alert>;
  tasks(filter?: { status?: string; siteId?: string }): Promise<TaskView[]>;
  createTask(input: TaskInput, opts?: { draft?: boolean }): Promise<ServiceTask>;
  confirmDraft(taskId: string): Promise<ServiceTask>;
  updateTask(id: string, patch: { status?: ServiceTask['status']; assigneeId?: string | null }): Promise<ServiceTask>;
  assignees(): Promise<{ id: string; name: string; role: Role }[]>;
}

/* ------------------------------ Intelligence ------------------------------ */

export interface PredictionView extends Prediction {
  batteryLabel: string | null;
  siteName: string | null;
}
export interface PredictionRepository {
  list(filter?: { kind?: PredictionKind; batteryId?: string }): Promise<PredictionView[]>;
  review(id: string, outcome: 'agreed' | 'disagreed'): Promise<Prediction>;
}

/* ------------------------------ Reports ------------------------------ */

export interface ReportTemplate {
  id: ReportTemplateId;
  name: string;
  description: string;
  scopeKind: 'battery' | 'batch' | 'site' | 'all';
  internalOnlySections: string[];
}
export interface ReportRepository {
  templates(): Promise<ReportTemplate[]>;
  list(): Promise<Report[]>;
  get(id: string): Promise<Report>;
  generate(input: ReportInput): Promise<Report>;
  approve(id: string): Promise<Report>;
  exportCsv(id: string): Promise<{ fileName: string; csv: string }>;
  scopes(templateId: ReportTemplateId): Promise<{ id: string | null; label: string }[]>;
}

/* ------------------------------ Assistant ------------------------------ */

export interface AssistantCitation {
  kind: string;
  id: string;
  label: string;
}
export interface AssistantDraft {
  id: string;
  kind: 'service_task' | 'report';
  title: string;
  body: string;
  payload: unknown;
}
export interface AssistantResponse {
  id: string;
  prompt: string;
  answer: string;
  citations: AssistantCitation[];
  uncertainty: string;
  refused: boolean;
  refusalReason: string | null;
  draft: AssistantDraft | null;
  scopeNote: string;
}
export interface AssistantService {
  suggestions(): string[];
  ask(prompt: string, context?: { batteryId?: string | null }): Promise<AssistantResponse>;
  confirmDraft(draftId: string): Promise<{ kind: string; id: string; message: string }>;
}

/* ------------------------------ Admin ------------------------------ */

export interface AdminRepository {
  users(): Promise<User[]>;
  tenants(): Promise<Tenant[]>;
  sites(): Promise<Site[]>;
  families(): Promise<BatteryFamily[]>;
  protocols(): Promise<TestProtocolRevision[]>;
  sensorMappings(): Promise<{ assignment: SensorAssignment; sensor: Sensor; siteName: string; slotLabel: string | null }[]>;
  importTemplates(): Promise<ImportTemplate[]>;
  notifications(): Promise<NotificationSetting[]>;
  setNotification(id: string, enabled: boolean): Promise<NotificationSetting>;
  setUserActive(id: string, active: boolean): Promise<User>;
  createUser(input: UserInput): Promise<User>;
  /** Name, title, role, site scope and active status. Email and tenant are fixed after creation. */
  updateUser(id: string, patch: UserUpdate): Promise<User>;
  audit(filter?: { outcome?: 'success' | 'denied' }): Promise<AuditEvent[]>;
  resetDemo(): Promise<void>;
}

export interface OverviewData {
  totals: {
    batteries: number; testing: number; qualified: number; deployed: number; needsReview: number;
    activeAlerts: number; criticalAlerts: number;
  };
  restoration: { qualified: number; attempted: number; yieldPct: number | null };
  completeness: { complete: number; partial: number; incomplete: number; conflict: number; pctComplete: number };
  byState: { state: LifecycleState; count: number }[];
  recent: LifecycleEvent[];
  workload: { status: string; count: number }[];
  siteHealth: { siteId: string; siteName: string; batteries: number; openAlerts: number; gateway: Gateway['status'] | null; worst: Severity | null }[];
  trends: { week: string; received: number; qualified: number; deployed: number }[];
  snapshotAt: string;
}
export interface OverviewRepository {
  get(): Promise<OverviewData>;
}

/* ------------------------------ Insights: the learning foundation ------------------------------ */

/** How a source reaches the platform today. "Simulated" and "not connected" are said plainly, never implied away. */
export type SourceStatus = 'in_use' | 'simulated' | 'not_connected' | 'reference_only';
export interface DataSourceView {
  key: string;
  name: string;
  /** What it contributes, in plain words. */
  provides: string;
  /** How it arrives: form, CSV import, gateway, export, API. */
  channel: string;
  status: SourceStatus;
  statusNote: string;
  /** Records from it in this database; null when nothing is connected. */
  records: number | null;
  lastAt: string | null;
  issues: { label: string; count: number }[];
}
export interface DataQualitySummary {
  batteries: number;
  complete: number;
  partial: number;
  incomplete: number;
  conflict: number;
  quarantinedImportRows: number;
  corrections: number;
  unknownCosts: number;
}
export interface LearningLoopView {
  /** Restoration attempts on their way to becoming training rows, mirroring ml_restoration_attempt_features. */
  stages: { key: string; label: string; count: number; note: string }[];
  exclusions: { reason: string; count: number }[];
  labelMix: { outcome: 'approved' | 'rejected' | 'rework'; code: RestorationReasonCode | null; label: string; count: number }[];
  /** Fingerprint of the eligible row ids: the same selection always gives the same value. */
  fingerprint: string;
  models: { registered: number; withTrainingRecords: number; validated: number };
  reviews: { agreed: number; disagreed: number; unreviewed: number };
  corrections: { events: number; batteries: number };
  quarantinedImportRows: number;
}
export interface RecoveryMetric {
  key: string;
  label: string;
  value: string | null;
  status: 'calculated' | 'not_calculated' | 'hidden';
  /** The denominator and inputs, or why it is not calculated. */
  basis: string;
}
/**
 * Four bounded capabilities: data quality (data_steward), battery evidence (battery_investigator),
 * recovery decision, and process learning (recovery_analyst). Each is read-only.
 */
export type AgentKind = 'data_steward' | 'battery_investigator' | 'recovery_decision' | 'recovery_analyst';

/** One prefilled input of the route calculator, with where it came from. Null means a person must enter it. */
export interface RouteInputField { value: number | null; source: string }
export interface RouteInputsView {
  batteryId: string;
  batteryLabel: string;
  familyModel: string;
  lifecycleState: LifecycleState;
  fields: Record<keyof RouteInputs, RouteInputField>;
  /** Known costs already spent on this battery. Shown, but excluded from the decision: they are spent either way. */
  sunkCostsAed: number | null;
  costsHidden: boolean;
}

export interface AnalystToolCall {
  tool: 'validate_records' | 'get_battery_history' | 'compare_process_cohorts' | 'calculate_route_economics' | 'get_model_prediction' | 'retrieve_approved_procedure' | 'get_cost_lines';
  input: string;
  result: string;
}
export interface AnalystAnswer {
  question: string;
  capability: AgentKind | null;
  routedBecause: string;
  toolsCalled: AnalystToolCall[];
  report: AgentReport | null;
  /** True when the records cannot support an answer; the report says what is missing. */
  insufficient: boolean;
  lead: string;
}
export interface AgentFinding {
  text: string;
  attention: boolean;
  citations: AssistantCitation[];
}
export interface AgentReport {
  kind: AgentKind;
  title: string;
  generatedAt: string;
  findings: AgentFinding[];
  /** Evidence the agent looked for and did not find. */
  missing: string[];
  /** What it read, and what it cannot do. */
  scope: string;
}
/** One step of the collection checklist: what must be captured, and how much of it is. */
export interface CollectionStep {
  key: string;
  step: string;
  /** Where it is captured in the app. */
  capturedIn: string;
  href: string;
  /** Records or batteries the step applies to. */
  applicable: number;
  complete: number;
  /** Required fields and how many applicable records have each. */
  fields: { field: string; present: number }[];
}
export interface CollectionPipeline {
  /** Batteries that reach each link of the chain that learning needs, in order. */
  chain: { key: string; label: string; count: number }[];
  steps: CollectionStep[];
  /** Records stopped at the door, kept for a person to check. */
  held: { label: string; count: number }[];
}

export interface InsightsRepository {
  /** The data collection pipeline: how complete each capture step is, measured from the records. */
  collection(): Promise<CollectionPipeline>;
  dataSources(): Promise<{ sources: DataSourceView[]; quality: DataQualitySummary }>;
  learning(): Promise<LearningLoopView>;
  recovery(): Promise<RecoveryMetric[]>;
  /** Read-only. Agents cite records, say what is missing, and never write or act. */
  runAgent(kind: AgentKind, input?: { batteryId?: string | null; periodDays?: number | null }): Promise<AgentReport>;
  /** Prefilled, editable inputs for the revive / test / recycle calculator (src/domain/routeEconomics.ts). */
  routeInputs(batteryId: string): Promise<RouteInputsView>;
  /** One entry point: routes a question to a bounded capability and shows the tools it called. */
  ask(question: string, context?: { batteryId?: string | null }): Promise<AnalystAnswer>;
}

export interface Services {
  insights: InsightsRepository;
  batteries: BatteryRepository;
  imports: ImportService;
  tests: TestRepository;
  restoration: RestorationRepository;
  deployments: DeploymentRepository;
  telemetry: TelemetryRepository;
  alerts: AlertRepository;
  predictions: PredictionRepository;
  reports: ReportRepository;
  assistant: AssistantService;
  admin: AdminRepository;
  overview: OverviewRepository;
  actor(): Actor;
}
