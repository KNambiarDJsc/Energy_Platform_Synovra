/** Pilot mode: starts empty, loads reference data only, labels nothing as synthetic, no demo-only features. */
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
  server = await startServer({ seed: false, env: { DATA_MODE: 'pilot', EVIDENCE_DIR: path.join(tmpdir(), `synovra-pilot-evidence-${process.pid}`) } });
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
    // A pilot record must point at the actual file: a file name alone is refused.
    const nameOnly = await lab.post('/tests', goodTest(battery.id));
    expect(nameOnly.status).toBe(422);
    expect(nameOnly.body.error.message).toMatch(/Upload the evidence file itself/);
    const t = (await lab.post('/tests', goodTest(battery.id, { evidenceFileName: null }))).body;
    expect((await lab.post(`/tests/${t.id}/evidence`, { fileName: 'report.pdf', sizeKb: 10 })).status).toBe(422);
    const uploaded = await lab.upload(`/tests/${t.id}/evidence`, 'report.pdf', '%PDF-1.7 pilot evidence');
    expect(uploaded.body).toMatchObject({ storageKey: expect.stringMatching(/^sha256\/[0-9a-f]{64}$/), scanStatus: 'not_scanned' });
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

describe('pilot mode: bench import and money in', () => {
  it('stores the bench file itself as evidence, labels records without "(demo)", and refuses a name-only commit', async () => {
    const lab = await server.as(USERS.lab);
    const { battery } = (await lab.post('/batteries', {
      familyId: 'f1', manufacturerSerial: 'PILOT-BENCH-1', manufacturedOn: null, physicalLocation: 'Receiving bay', legacyId: null, acquisitionCostAed: null,
    })).body;
    const header = 'battery,test_kind,test_date,protocol,ocv_v,internal_resistance_mohm,temperature_c,capacity_ah,load_current_a,cutoff_v,ambient_c,duration_h,instrument,calibration_ref,notes';
    const csv = `${header}\n${battery.label},initial,2026-10-12,proto_c10,12.6,4.6,25,126.5,20,10.8,25,6.3,Bench DB-2,CAL-REAL-1,pilot row\n`;
    const preview = await lab.post('/bench-imports/preview', { fileName: 'bench.csv', text: csv });
    expect(preview.body.counts).toEqual({ create: 1, skipped: 0, quarantined: 0 });

    const done = await lab.post('/bench-imports/commit', { fileName: 'bench.csv', text: csv });
    expect(done.status).toBe(200);
    expect(done.body).toMatchObject({ created: 1 });
    const p = (await lab.get(`/batteries/${battery.id}/passport`)).body;
    const t = p.tests.find((x: { id: string }) => x.id === done.body.testIds[0]);
    expect(t).toMatchObject({ status: 'submitted', result: { capacityAh: 126.5 } });
    // The file covers several batteries, so it hangs off each test it created, not off one battery.
    const view = (await lab.get(`/tests/${t.id}`)).body;
    const ev = view.evidence[0];
    expect(ev).toMatchObject({ kind: 'import_source', storageKey: expect.stringMatching(/^sha256\/[0-9a-f]{64}$/) });
    expect(ev.checksum).not.toMatch(/metadata-only/);
    expect(p.events.every((e: { sourceSystem: string }) => !/demo/i.test(e.sourceSystem))).toBe(true);

    // Importing the same file again creates nothing.
    const again = await lab.post('/bench-imports/commit', { fileName: 'bench-copy.csv', text: csv });
    expect(again.body).toMatchObject({ created: 0, alreadyCommittedAt: expect.any(String) });

    // A role without import rights is refused before anything is stored.
    const fin = await server.as(USERS.fin);
    expect((await fin.post('/bench-imports/commit', { fileName: 'bench.csv', text: csv })).status).toBe(403);
  });

  it('records money in for finance only, and never as a demo record', async () => {
    const fin = await server.as(USERS.fin);
    const [battery] = (await fin.get('/batteries')).body;
    const rec = await fin.post(`/batteries/${battery.id}/values`, { kind: 'restoration_fee', amountAed: 150, recordedOn: '2026-10-12', counterparty: 'Customer Ltd', reference: 'INV-1' });
    expect(rec.status).toBe(200);
    expect(rec.body.source).toBe('Commercial ledger');
    const eng = await server.as(USERS.eng);
    expect((await eng.get(`/batteries/${battery.id}/passport`)).body.values).toBeNull();
    expect((await eng.post(`/batteries/${battery.id}/values`, { kind: 'restoration_fee', amountAed: 1, recordedOn: '2026-10-12', counterparty: 'X' })).status).toBe(403);
  });
});
