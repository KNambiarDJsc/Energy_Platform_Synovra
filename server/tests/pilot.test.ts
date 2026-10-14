/** Pilot mode: starts empty, loads reference data only, labels nothing as synthetic, no demo-only features. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildSeed } from '../../src/data/seed';
import { bootstrap, REFERENCE_KEYS, validateBootstrap } from '../src/db/bootstrap';
import { goodTest, startServer, USERS, type Server } from './helpers';

let server: Server;
const reference = () => {
  const seed = buildSeed();
  return Object.fromEntries(REFERENCE_KEYS.map((k) => [k, seed[k]]));
};

beforeAll(async () => {
  server = await startServer({ seed: false, env: { DATA_MODE: 'pilot' } });
  await bootstrap(server.handle.db, reference());
});
afterAll(async () => { await server?.close(); });

describe('pilot bootstrap', () => {
  it('refuses operational records, a missing admin, a lone engineer, and a non-empty database', async () => {
    expect(() => validateBootstrap({ ...reference(), batteries: [] })).toThrow(/reference data only/);
    const seed = buildSeed();
    expect(() => validateBootstrap({ ...reference(), users: seed.users.filter((u) => u.role !== 'platform_admin') })).toThrow(/platform_admin/);
    expect(() => validateBootstrap({ ...reference(), users: seed.users.filter((u) => u.id !== 'u_eng2') })).toThrow(/two active battery engineers/);
    await expect(bootstrap(server.handle.db, reference())).rejects.toThrow(/empty database/);
  });

  it('accepts the shipped example file', () => {
    const example = JSON.parse(readFileSync(path.resolve(__dirname, '../pilot-bootstrap.example.json'), 'utf8'));
    expect(() => validateBootstrap(example)).not.toThrow();
  });
});

describe('pilot mode behaviour', () => {
  it('reports pilot mode with no synthetic notice and intelligence off', async () => {
    const meta = await (await server.raw('/api/v1/meta')).json();
    expect(meta).toMatchObject({ dataMode: 'pilot', notice: null, features: { intelligence: false } });
  });

  it('starts with an empty register', async () => {
    expect((await (await server.as(USERS.eng)).get('/batteries')).body).toEqual([]);
  });

  it('labels new records with real source names, not "(demo)"', async () => {
    const lab = await server.as(USERS.lab);
    const { battery } = (await lab.post('/batteries', {
      familyId: 'f1', manufacturerSerial: 'PILOT-0001', manufacturedOn: null, physicalLocation: 'Receiving bay', legacyId: null, acquisitionCostAed: 120,
    })).body;
    expect(battery.sourceSystem).toBe('Manual entry');
    const t = (await lab.post('/tests', goodTest(battery.id))).body;
    await lab.post(`/tests/${t.id}/submit`);
    const p = (await lab.get(`/batteries/${battery.id}/passport`)).body;
    expect(p.events.every((e: { sourceSystem: string }) => !/demo/i.test(e.sourceSystem))).toBe(true);
    expect(p.telemetry).toMatchObject({ available: false });

    const eng = await server.as(USERS.eng);
    const r = (await eng.post('/reports', { templateId: 'battery_passport', scopeId: battery.id, from: '2026-01-01', to: '2026-12-31', audience: 'internal' })).body;
    expect(r.sourceWatermark).toMatch(/Synovra pilot records/);
    expect(r.sourceWatermark).not.toMatch(/Synthetic/);
  });

  it('disables predictions and refuses the demo reset', async () => {
    const eng = await server.as(USERS.eng);
    expect((await eng.get('/predictions')).body.error.code).toBe('FEATURE_DISABLED');
    const admin = await server.as(USERS.admin);
    const reset = await admin.post('/admin/reset-demo');
    expect(reset.status).toBe(409);
    expect((await eng.get('/batteries')).body).toHaveLength(1);
  });
});
