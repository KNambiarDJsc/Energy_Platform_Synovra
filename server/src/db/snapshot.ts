/**
 * Moves records between PostgreSQL and the domain shape (`DemoDb`) that the shared service layer
 * operates on, and writes back only what a request changed.
 *
 * Why this design: the business rules (authorisation, separation of duties, lifecycle transitions,
 * unknown-is-not-zero, redaction, idempotent import) already live in src/services and are covered
 * by the unit tests. The API runs exactly that code against database records instead of a second,
 * hand-ported copy that could drift. The database adds its own constraints underneath.
 *
 * Trade-off: each request loads the V1 tables. That is fine for a pilot (hundreds to low thousands
 * of batteries). When volumes grow, hot read paths (register list, passport) get dedicated SQL
 * queries behind the same HTTP contract; see server/README.md.
 */
import { asc, desc, eq, getTableColumns, getTableName, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { DemoDb, Prediction } from '../../../src/domain/types';
import type { Database } from './client';
import * as s from './schema';

type Row = Record<string, unknown>;
type Tx = Pick<Database, 'select' | 'insert' | 'update' | 'delete' | 'execute'>;

interface TableSpec {
  key: keyof DemoDb;
  table: PgTable;
  /** Newest-first arrays (the audit log) load in descending insertion order. */
  order?: 'asc' | 'desc';
  /** Rows may be inserted but never changed or removed. */
  appendOnly?: boolean;
  fromRow?(row: Row): Row;
  toRow?(obj: Row): Row;
}

/** Insertion order matters for foreign keys. */
const SPECS: TableSpec[] = [
  { key: 'tenants', table: s.tenants },
  { key: 'users', table: s.users },
  { key: 'families', table: s.batteryFamilies },
  { key: 'sites', table: s.sites },
  { key: 'banks', table: s.banks },
  { key: 'strings', table: s.strings },
  { key: 'slots', table: s.slots },
  { key: 'protocols', table: s.testProtocols },
  { key: 'batches', table: s.restorationBatches },
  { key: 'batteries', table: s.batteries },
  { key: 'aliases', table: s.batteryAliases },
  { key: 'tests', table: s.tests },
  { key: 'attempts', table: s.restorationAttempts },
  { key: 'assignments', table: s.assignments },
  {
    key: 'costs', table: s.costEntries,
    fromRow: (r) => ({ ...r, amountAed: r.amountAed === null ? null : Number(r.amountAed) }),
    toRow: (o) => ({ ...o, amountAed: o.amountAed === null || o.amountAed === undefined ? null : String(o.amountAed) }),
  },
  {
    key: 'values', table: s.valueRecords, appendOnly: true,
    fromRow: (r) => ({ ...r, amountAed: r.amountAed === null ? null : Number(r.amountAed) }),
    toRow: (o) => ({ ...o, amountAed: o.amountAed === null || o.amountAed === undefined ? null : String(o.amountAed) }),
  },
  { key: 'warranties', table: s.warranties },
  { key: 'recycling', table: s.recyclingRecords },
  { key: 'evidence', table: s.evidenceFiles },
  { key: 'events', table: s.batteryEvents, appendOnly: true, toRow: (o) => ({ ...o, correction: o.correction ?? null }) },
  { key: 'importTemplates', table: s.importTemplates },
  { key: 'imports', table: s.importJobs, toRow: (o) => ({ ...o, priorCommitAt: o.priorCommitAt ?? null }) },
  {
    key: 'reports', table: s.reports,
    fromRow: ({ periodFrom, periodTo, ...r }) => ({ ...r, period: { from: periodFrom, to: periodTo } }),
    toRow: ({ period, ...o }) => ({ ...o, periodFrom: (period as { from: string }).from, periodTo: (period as { to: string }).to }),
  },
  { key: 'audit', table: s.auditEvents, order: 'desc', appendOnly: true },
  { key: 'notifications', table: s.notificationSettings },
];

/** V2 collections. The API has no tables for them yet, so they load empty and must stay empty. */
const UNSUPPORTED: (keyof DemoDb)[] = ['gateways', 'sensors', 'sensorAssignments', 'alerts', 'tasks'];

/** Columns that exist only in the database (not part of the domain record). */
const DB_ONLY = new Set(['seq', 'externalSubject']);

function columnsOf(table: PgTable) {
  return getTableColumns(table) as Record<string, { columnType: string }>;
}

function decode(spec: TableSpec, row: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) {
    if (DB_ONLY.has(k)) continue;
    out[k] = v instanceof Date ? v.toISOString() : v;
  }
  return spec.fromRow ? spec.fromRow(out) : out;
}

function encode(spec: TableSpec, obj: Row): Row {
  const mapped = spec.toRow ? spec.toRow(obj) : obj;
  const cols = columnsOf(spec.table);
  const out: Row = {};
  for (const [k, col] of Object.entries(cols)) {
    if (k === 'seq' || !(k in mapped)) continue;
    const v = mapped[k];
    out[k] = col.columnType === 'PgTimestamp' && typeof v === 'string' ? new Date(v) : v;
  }
  return out;
}

export interface Snapshot {
  db: DemoDb;
  /** JSON of each record as loaded, keyed by collection then id. */
  original: Map<keyof DemoDb, Map<string, string>>;
}

export function emptyDb(): DemoDb {
  return {
    tenants: [], users: [], families: [], batteries: [], aliases: [], sites: [], banks: [], strings: [], slots: [],
    assignments: [], gateways: [], sensors: [], sensorAssignments: [], events: [], protocols: [], tests: [], batches: [],
    attempts: [], costs: [], values: [], warranties: [], recycling: [], evidence: [], alerts: [], tasks: [], predictions: [],
    reports: [], imports: [], importTemplates: [], notifications: [], audit: [],
  };
}

async function loadPredictions(tx: Tx): Promise<Prediction[]> {
  const rows = await tx.select({ p: s.predictions, m: s.modelVersions })
    .from(s.predictions)
    .innerJoin(s.modelVersions, eq(s.predictions.modelVersionId, s.modelVersions.id))
    .orderBy(asc(s.predictions.seq));
  return rows.map(({ p, m }) => ({
    id: p.id, kind: p.kind, batteryId: p.batteryId, siteId: p.siteId,
    modelName: m.name, modelVersion: m.version,
    inputAt: p.inputAt.toISOString(), predictedAt: p.predictedAt.toISOString(),
    output: p.output, uncertainty: p.uncertainty, applicability: p.applicability, sourceRecordIds: p.sourceRecordIds,
    factors: p.factors, baseline: m.baseline, inputsUsed: p.inputsUsed,
    // Only a model version that passed the deployment gate is shown as validated; everything else is shadow.
    status: m.status === 'validated' ? 'validated' : 'shadow',
    reviewState: p.reviewState, reviewedByName: p.reviewedByName,
  }));
}

export async function loadSnapshot(tx: Tx, opts: { predictions: boolean }): Promise<Snapshot> {
  const db = emptyDb();
  const original: Snapshot['original'] = new Map();
  for (const spec of SPECS) {
    const seqCol = (spec.table as unknown as { seq: never }).seq;
    const rows = await tx.select().from(spec.table).orderBy(spec.order === 'desc' ? desc(seqCol) : asc(seqCol));
    const records = (rows as Row[]).map((r) => decode(spec, r));
    (db[spec.key] as unknown as Row[]) = records;
    original.set(spec.key, new Map(records.map((r) => [r.id as string, JSON.stringify(r)])));
  }
  if (opts.predictions) {
    db.predictions = await loadPredictions(tx);
    original.set('predictions', new Map(db.predictions.map((p) => [p.id, JSON.stringify(p)])));
  }
  return { db, original };
}

export class UnsupportedWriteError extends Error {}

export interface PersistResult { inserted: number; updated: number }

/**
 * Writes the difference between the loaded snapshot and the current records.
 * `only` restricts the write to some collections (e.g. the audit log when a request was denied).
 */
export async function persistChanges(tx: Tx, snap: Snapshot, only?: (keyof DemoDb)[]): Promise<PersistResult> {
  let inserted = 0;
  let updated = 0;
  for (const key of UNSUPPORTED) {
    if (snap.db[key].length > 0) throw new UnsupportedWriteError(`${key} are not stored by this server (V2 scope).`);
  }
  for (const spec of SPECS) {
    if (only && !only.includes(spec.key)) continue;
    const before = snap.original.get(spec.key) ?? new Map<string, string>();
    const current = snap.db[spec.key] as unknown as Row[];
    const seen = new Set<string>();
    const inserts: Row[] = [];
    for (const obj of current) {
      const id = obj.id as string;
      seen.add(id);
      const prev = before.get(id);
      if (prev === undefined) {
        inserts.push(encode(spec, obj));
        continue;
      }
      if (prev === JSON.stringify(obj)) continue;
      if (spec.appendOnly) throw new UnsupportedWriteError(`${spec.key} are append-only; record ${id} was modified.`);
      const { id: _id, ...patch } = encode(spec, obj);
      await tx.update(spec.table).set(patch).where(eq((spec.table as unknown as { id: never }).id, id));
      updated += 1;
    }
    for (const id of before.keys()) {
      if (!seen.has(id)) throw new UnsupportedWriteError(`${spec.key} record ${id} was removed; records are never deleted.`);
    }
    // Newest-first collections hold new records at the front; insert oldest first to keep `seq` chronological.
    if (spec.order === 'desc') inserts.reverse();
    for (let i = 0; i < inserts.length; i += 500) {
      await tx.insert(spec.table).values(inserts.slice(i, i + 500) as never);
    }
    inserted += inserts.length;
  }
  if (!only || only.includes('predictions')) updated += await persistPredictionReviews(tx, snap);
  if (inserted + updated > 0) await bumpVersion(tx);
  return { inserted, updated };
}

async function bumpVersion(tx: Tx): Promise<void> {
  await tx.update(s.dataVersion).set({ version: sql`${s.dataVersion.version} + 1` }).where(eq(s.dataVersion.id, 1));
}

interface CacheEntry { version: number; predictions: boolean; db: DemoDb; original: Snapshot['original'] }
const caches = new WeakMap<object, CacheEntry>();

/**
 * `loadSnapshot` with an in-process cache. The version is read inside the caller's transaction,
 * so the cached records are exactly what this transaction would have loaded. Callers get a deep
 * copy because services modify records in place.
 */
export async function loadSnapshotCached(
  tx: Tx, cacheKey: object, opts: { predictions: boolean }, onCache?: (hit: boolean) => void,
): Promise<Snapshot> {
  const [row] = await tx.select({ version: s.dataVersion.version }).from(s.dataVersion).where(eq(s.dataVersion.id, 1));
  const version = row?.version ?? -1;
  const hit = caches.get(cacheKey);
  const isHit = !!hit && hit.version === version && hit.predictions === opts.predictions;
  onCache?.(isHit);
  if (isHit) {
    return { db: structuredClone(hit.db), original: hit.original };
  }
  const snap = await loadSnapshot(tx, opts);
  if (!hit || version >= hit.version) {
    caches.set(cacheKey, { version, predictions: opts.predictions, db: structuredClone(snap.db), original: snap.original });
  }
  return snap;
}

/** The API may only record a human review on a prediction. Predictions themselves come from the ML service. */
async function persistPredictionReviews(tx: Tx, snap: Snapshot): Promise<number> {
  const before = snap.original.get('predictions');
  if (!before) {
    if (snap.db.predictions.length) throw new UnsupportedWriteError('Predictions are written by the ML service, not the API.');
    return 0;
  }
  let n = 0;
  for (const p of snap.db.predictions) {
    const prev = before.get(p.id);
    if (prev === undefined) throw new UnsupportedWriteError('Predictions are written by the ML service, not the API.');
    if (prev === JSON.stringify(p)) continue;
    const old = JSON.parse(prev) as Prediction;
    const changed = Object.keys(p).filter((k) => JSON.stringify((p as never)[k]) !== JSON.stringify((old as never)[k]));
    if (changed.some((k) => k !== 'reviewState' && k !== 'reviewedByName')) {
      throw new UnsupportedWriteError('Only the human review of a prediction can be changed.');
    }
    await tx.update(s.predictions).set({ reviewState: p.reviewState, reviewedByName: p.reviewedByName }).where(eq(s.predictions.id, p.id));
    n += 1;
  }
  return n;
}

/**
 * Loads a complete DemoDb (the synthetic seed) into an empty database, including a model registry
 * entry for each demonstration model. Every such entry is `shadow` with no evaluation report.
 */
export async function insertAll(tx: Tx, data: DemoDb): Promise<PersistResult> {
  // V2 collections (gateways, sensors, alerts, tasks) in the synthetic seed are not stored by this server.
  const v1 = { ...data, predictions: [], ...Object.fromEntries(UNSUPPORTED.map((k) => [k, []])) } as DemoDb;
  const snap: Snapshot = { db: v1, original: new Map() };
  const result = await persistChanges(tx, snap);
  const versions = new Map<string, Prediction>();
  data.predictions.forEach((p) => versions.set(`${p.modelName}@${p.modelVersion}`, p));
  if (versions.size) {
    await tx.insert(s.modelVersions).values([...versions.entries()].map(([id, p]) => ({
      id, name: p.modelName, version: p.modelVersion, status: 'shadow' as const, baseline: p.baseline,
      trainingCohort: 'None. Synthetic demonstration output; no model has been trained.',
      evaluationReportRef: null, registeredAt: new Date(p.predictedAt),
    })));
    await tx.insert(s.predictions).values(data.predictions.map((p) => ({
      id: p.id, modelVersionId: `${p.modelName}@${p.modelVersion}`, kind: p.kind, batteryId: p.batteryId, siteId: p.siteId,
      inputAt: new Date(p.inputAt), predictedAt: new Date(p.predictedAt), output: p.output, uncertainty: p.uncertainty,
      applicability: p.applicability, sourceRecordIds: p.sourceRecordIds, factors: p.factors, inputsUsed: p.inputsUsed,
      reviewState: p.reviewState, reviewedByName: p.reviewedByName,
    })));
    await bumpVersion(tx);
  }
  return { inserted: result.inserted + data.predictions.length + versions.size, updated: 0 };
}

/** Removes every record. Demo mode only (the caller checks). */
export async function truncateAll(tx: Tx): Promise<void> {
  const names = ['predictions', 'model_training_records', 'model_versions', ...SPECS.map((spec) => getTableName(spec.table))];
  await tx.execute(sql.raw(`TRUNCATE ${names.map((n) => `"${n}"`).join(', ')} RESTART IDENTITY CASCADE`));
  await bumpVersion(tx);
}

export async function isEmpty(tx: Tx): Promise<boolean> {
  const rows = await tx.select({ id: s.tenants.id }).from(s.tenants).limit(1);
  return rows.length === 0;
}
