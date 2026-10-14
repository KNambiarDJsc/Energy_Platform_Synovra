import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { buildSeed, DEMO_NOW } from '../../src/data/seed';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { connect, type DbHandle } from '../src/db/client';
import { insertAll } from '../src/db/snapshot';

export const USERS = {
  lab: 'u_lab1', lab2: 'u_lab2', eng: 'u_eng1', eng2: 'u_eng2', field1: 'u_field1', field2: 'u_field2',
  noc: 'u_noc', fin: 'u_fin', cust: 'u_cust', admin: 'u_admin',
} as const;

export interface ApiResponse<T = unknown> { status: number; body: T }

export interface Server {
  handle: DbHandle;
  as(userId: string): Promise<Client>;
  raw(path: string, init?: RequestInit): Promise<Response>;
  close(): Promise<void>;
}

export interface Client {
  get<T = any>(path: string): Promise<ApiResponse<T>>;
  post<T = any>(path: string, body?: unknown): Promise<ApiResponse<T>>;
  patch<T = any>(path: string, body?: unknown): Promise<ApiResponse<T>>;
}

/**
 * A fresh database with migrations applied and, by default, the demo seed loaded.
 * Uses in-memory PGlite, or a throwaway database on a real PostgreSQL server when
 * TEST_DATABASE_URL is set (e.g. postgres://synovra:synovra-local-only@localhost:5432/synovra).
 */
export async function startServer(opts: { env?: Record<string, string>; seed?: boolean } = {}): Promise<Server> {
  const real = await createTestDatabase();
  const inner = await connect({ databaseUrl: real?.url ?? null, pgliteDir: 'memory://' });
  const handle: DbHandle = { ...inner, close: async () => { await inner.close(); await real?.drop(); } };
  await handle.migrate();
  if (opts.seed !== false) await handle.db.transaction((tx) => insertAll(tx, buildSeed()));
  const config = loadConfig({ DATA_MODE: 'demo', AUTH_MODE: 'dev', DEV_JWT_SECRET: 'test-secret-not-for-production', ...opts.env });
  let t = Date.parse(DEMO_NOW) + 3_600_000;
  const app = createApp({ db: handle.db, config, clock: () => (t += 1000), log: () => {} });

  const raw = (path: string, init?: RequestInit) => Promise.resolve(app.request(path, init));
  const call = async (token: string, method: string, path: string, body?: unknown) => {
    const res = await raw(`/api/v1${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };
  return {
    handle,
    raw,
    async as(userId) {
      const res = await raw('/api/v1/dev/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) });
      if (res.status !== 200) throw new Error(`login failed for ${userId}: ${res.status}`);
      const { token } = (await res.json()) as { token: string };
      return {
        get: (p) => call(token, 'GET', p),
        post: (p, b) => call(token, 'POST', p, b ?? {}),
        patch: (p, b) => call(token, 'PATCH', p, b ?? {}),
      };
    },
    close: () => handle.close(),
  };
}

async function createTestDatabase(): Promise<{ url: string; drop(): Promise<void> } | null> {
  const admin = process.env.TEST_DATABASE_URL;
  if (!admin) return null;
  const name = `synovra_test_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const run = async (statement: string) => {
    const client = new pg.Client({ connectionString: admin });
    await client.connect();
    try { await client.query(statement); } finally { await client.end(); }
  };
  await run(`CREATE DATABASE ${name}`);
  const url = new URL(admin);
  url.pathname = `/${name}`;
  return { url: url.toString(), drop: () => run(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`) };
}

export const goodTest =(batteryId: string, over: Record<string, unknown> = {}) => ({
  batteryId, kind: 'initial' as const, protocolId: 'proto_c10', voltageV: 12.4, resistanceMOhm: 4.1, temperatureC: 25,
  capacityAh: 140, ambientTempC: 25, loadCurrentA: 20, cutoffVoltageV: 10.8, durationH: 7, instrument: 'Bench DB-2',
  calibrationRef: 'CAL-DEMO', witnessName: null, evidenceFileName: 'report.pdf', notes: '', ...over,
});
