import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildSeed } from '../../src/data/seed';
import { assessDataQuality, buildQualityIndex } from '../../src/domain/lifecycle';
import { insertAll } from '../src/db/snapshot';
import { scaleSeed } from '../scripts/scale-seed';
import { startServer, USERS, type Server } from './helpers';

describe('scaled data and the quality index', () => {
  const data = scaleSeed(buildSeed(), 300);

  it('scales to the target with unique ids and no dangling battery references', () => {
    expect(data.batteries).toHaveLength(300);
    const ids = new Set(data.batteries.map((b) => b.id));
    expect(ids.size).toBe(300);
    for (const t of data.tests) if (t.batteryId) expect(ids.has(t.batteryId)).toBe(true);
    for (const a of data.attempts) expect(ids.has(a.batteryId)).toBe(true);
    for (const list of [data.tests, data.attempts, data.events, data.evidence, data.costs, data.values]) {
      expect(new Set(list.map((r) => r.id)).size).toBe(list.length);
    }
  });

  it('finds exactly the same duplicates with the index as by scanning every record', () => {
    // Plant a serial clash, an alias clash and an alias that equals another battery's serial.
    const db = structuredClone(data);
    db.batteries[10].manufacturerSerial = db.batteries[20].manufacturerSerial ?? 'DUP-1';
    db.batteries[20].manufacturerSerial = db.batteries[20].manufacturerSerial ?? 'DUP-1';
    db.aliases.push({ ...db.aliases[0], id: 'al_x1', batteryId: db.batteries[30].id, value: 'SHARED-ALIAS' });
    db.aliases.push({ ...db.aliases[0], id: 'al_x2', batteryId: db.batteries[31].id, value: 'shared-alias' });
    db.aliases.push({ ...db.aliases[0], id: 'al_x3', batteryId: db.batteries[40].id, value: db.batteries[41].manufacturerSerial ?? 'none' });
    const index = buildQualityIndex(db.batteries, db.aliases);
    let conflicts = 0;
    for (const b of db.batteries) {
      const family = db.families.find((f) => f.id === b.familyId);
      const mine = db.aliases.filter((a) => a.batteryId === b.id);
      const tested = db.tests.some((t) => t.batteryId === b.id && t.status === 'approved');
      const scan = assessDataQuality(b, family, mine, db.batteries, db.aliases, tested);
      const fast = assessDataQuality(b, family, mine, db.batteries, db.aliases, tested, index);
      expect(fast).toEqual(scan);
      conflicts += scan.conflicts.length;
    }
    expect(conflicts).toBeGreaterThanOrEqual(4);
  });
});

describe('API on scaled data', () => {
  let server: Server;
  beforeAll(async () => {
    server = await startServer({ seed: false });
    await server.handle.db.transaction((tx) => insertAll(tx, scaleSeed(buildSeed(), 300)));
  });
  afterAll(async () => { await server?.close(); });

  it('serves the whole register, and a write is visible to the next read', async () => {
    const eng = await server.as(USERS.eng);
    const before = await eng.get<unknown[]>('/batteries');
    expect(before.body).toHaveLength(300);
    const lab = await server.as(USERS.lab);
    const made = await lab.post('/batteries', { familyId: 'f1', manufacturerSerial: 'SCALE-NEW-1', manufacturedOn: null, physicalLocation: 'Bay', legacyId: null, acquisitionCostAed: null });
    expect(made.status).toBe(200);
    expect((await eng.get<unknown[]>('/batteries')).body).toHaveLength(301);
  });

  it('does not let a reader change what the next reader sees', async () => {
    const eng = await server.as(USERS.eng);
    const a = await eng.get<unknown[]>('/batteries');
    const b = await eng.get<unknown[]>('/batteries');
    expect(b.body).toEqual(a.body);
    expect((await eng.get('/overview')).status).toBe(200);
    expect((await eng.get<unknown[]>('/batteries')).body).toEqual(a.body);
  });
});
