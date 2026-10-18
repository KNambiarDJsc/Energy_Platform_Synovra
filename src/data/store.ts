import type { BatteryAssignment, DemoDb, TelemetryObservation } from '@/domain/types';
import { ConflictError } from '@/domain/permissions';
import { DEMO_NOW, buildSeed, buildTelemetry } from './seed';

const STORAGE_KEY = 'synovra-demo-db-v4';

export interface StoreOptions {
  /** Persist mutations to localStorage (browser only). */
  persist?: boolean;
  /** Override the clock (tests). Returns epoch milliseconds. */
  now?: () => number;
  /** Simulated network latency for mock calls, in ms. */
  latencyMs?: number;
  /** Start from this snapshot instead of the seed (the API server loads it from PostgreSQL). */
  initialDb?: DemoDb;
  /** Telemetry to serve. Defaults to synthetic telemetry generated from the seed. */
  telemetry?: TelemetryObservation[];
  /** `demo` labels records as synthetic. `pilot` is used by the API server for real pilot records. */
  mode?: 'demo' | 'pilot';
  /** Reference time for freshness. Defaults to the fixed demo snapshot. */
  snapshotAt?: string;
}

export interface Store {
  db: DemoDb;
  telemetry: TelemetryObservation[];
  latencyMs: number;
  mode: 'demo' | 'pilot';
  /** Current demo time as ISO. New records are stamped with this. */
  now(): string;
  /** Fixed reference time of the synthetic snapshot; used to judge data freshness. */
  snapshotAt: string;
  nextId(prefix: string): string;
  save(): void;
  reset(): void;
  /** The only way to open an assignment. Rejects overlaps for the slot and for the battery. */
  insertAssignment(a: BatteryAssignment): void;
  subscribe(fn: () => void): () => void;
  version: number;
}

function hasLocalStorage(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    return false;
  }
}

export function createStore(opts: StoreOptions = {}): Store {
  const startReal = Date.now();
  const startDemo = Date.parse(DEMO_NOW);
  const clock = opts.now ?? (() => startDemo + (Date.now() - startReal));
  const listeners = new Set<() => void>();
  let counter = 0;

  let db: DemoDb | null = opts.initialDb ?? null;
  if (!db && opts.persist && hasLocalStorage()) {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) db = JSON.parse(raw) as DemoDb;
    } catch {
      db = null;
    }
  }
  const fresh = !db;
  if (!db) db = buildSeed();

  const store: Store = {
    db,
    telemetry: opts.telemetry ?? buildTelemetry(db),
    latencyMs: opts.latencyMs ?? 0,
    mode: opts.mode ?? 'demo',
    snapshotAt: opts.snapshotAt ?? DEMO_NOW,
    version: 0,
    now: () => new Date(clock()).toISOString(),
    nextId(prefix: string) {
      counter += 1;
      return `${prefix}_${Math.floor(clock()).toString(36)}${counter.toString(36)}`;
    },
    save() {
      store.version += 1;
      if (opts.persist && hasLocalStorage()) {
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store.db));
        } catch {
          /* storage full or blocked: demo continues in memory */
        }
      }
      listeners.forEach((fn) => fn());
    },
    reset() {
      store.db = buildSeed();
      store.telemetry = buildTelemetry(store.db);
      if (opts.persist && hasLocalStorage()) {
        try {
          window.localStorage.removeItem(STORAGE_KEY);
        } catch {
          /* ignore */
        }
      }
      store.save();
    },
    insertAssignment(a) {
      const start = Date.parse(a.startAt);
      const end = a.endAt ? Date.parse(a.endAt) : Number.POSITIVE_INFINITY;
      for (const other of store.db.assignments) {
        const oStart = Date.parse(other.startAt);
        const oEnd = other.endAt ? Date.parse(other.endAt) : Number.POSITIVE_INFINITY;
        const overlaps = start < oEnd && oStart < end;
        if (!overlaps) continue;
        if (other.slotId === a.slotId) {
          throw new ConflictError(`Slot ${a.slotId} already has an overlapping assignment (${other.id}).`);
        }
        if (other.batteryId === a.batteryId) {
          throw new ConflictError(`Battery already has an overlapping assignment (${other.id}). Close it before assigning a new slot.`);
        }
      }
      store.db.assignments.push(a);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  if (fresh && opts.persist && !opts.initialDb) store.save();
  return store;
}

let singleton: Store | null = null;

/** Browser/server singleton used by the app. Tests create their own isolated stores. */
export function getStore(): Store {
  if (!singleton) {
    singleton = createStore({
      persist: typeof window !== 'undefined',
      // No artificial delay: the demo should feel as fast as it is. Loading states still render on first fetch.
      latencyMs: 0,
    });
  }
  return singleton;
}
