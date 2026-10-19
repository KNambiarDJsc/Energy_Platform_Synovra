/**
 * Loads a database with many synthetic batteries, to measure where the API slows down.
 *
 *   DATABASE_URL=postgres://... npx tsx server/scripts/scale-seed.ts 5000
 *
 * The demo seed has about 50 batteries. This clones each one (with its tests, attempts, events, costs, money
 * in, evidence and aliases) under fresh ids until the target is reached. Slot assignments, sensors, alerts
 * and predictions are not cloned, and deployed or reserved clones become qualified, so every database rule
 * (one open assignment per slot, and so on) still holds. The result is a realistic SHAPE and VOLUME of
 * records, not realistic content. It refuses to run against a database that already has data.
 */
import { buildSeed } from '../../src/data/seed';
import type { DemoDb } from '../../src/domain/types';
import { connect } from '../src/db/client';
import { insertAll, isEmpty } from '../src/db/snapshot';

export function scaleSeed(base: DemoDb, targetBatteries: number): DemoDb {
  const out: DemoDb = structuredClone(base);
  out.gateways = []; out.sensors = []; out.sensorAssignments = []; out.alerts = []; out.tasks = [];
  const src = base.batteries;
  const copies = Math.max(0, Math.ceil((targetBatteries - src.length) / src.length));
  let serial = src.length;
  for (let k = 1; k <= copies; k++) {
    const map = new Map<string, string>(); // old id -> new id, per collection kind
    const id = (kind: string, old: string | null) => (old === null ? null : (map.get(`${kind}:${old}`) ?? (map.set(`${kind}:${old}`, `${old}~${k}`), `${old}~${k}`)));
    const mine = (b: { id: string }) => src.some((s) => s.id === b.id);
    for (const b of src) {
      if (serial >= targetBatteries) break;
      serial += 1;
      const deployed = ['deployed', 'reserved'].includes(b.lifecycleState);
      out.batteries.push({
        ...structuredClone(b), id: id('b', b.id)!, label: `B-${String(serial).padStart(5, '0')}`, publicRef: `SYN-${k}-${b.publicRef.slice(4)}`,
        lifecycleState: deployed ? 'qualified' : b.lifecycleState, siteId: deployed ? null : b.siteId, currentAssignmentId: null,
        replacesBatteryId: null, manufacturerSerial: b.manufacturerSerial ? `${b.manufacturerSerial}-${k}` : null,
      });
    }
    const cloned = new Set(out.batteries.filter((b) => b.id.endsWith(`~${k}`)).map((b) => b.id));
    const newB = (old: string | null) => (old && cloned.has(`${old}~${k}`) ? `${old}~${k}` : null);
    const ev = (ids: string[]) => ids.map((e) => id('ev', e)!);
    for (const a of base.aliases) if (newB(a.batteryId)) out.aliases.push({ ...a, id: id('al', a.id)!, batteryId: newB(a.batteryId)!, value: `${a.value}-${k}` });
    for (const e of base.evidence) if (e.batteryId && newB(e.batteryId)) out.evidence.push({ ...e, id: id('ev', e.id)!, batteryId: newB(e.batteryId) });
    for (const t of base.tests) if (t.batteryId && newB(t.batteryId)) {
      out.tests.push({ ...t, id: id('t', t.id)!, batteryId: newB(t.batteryId), attemptId: id('a', t.attemptId), evidenceIds: ev(t.evidenceIds) });
    }
    for (const a of base.attempts) if (newB(a.batteryId)) {
      out.attempts.push({ ...a, id: id('a', a.id)!, batteryId: newB(a.batteryId)!, beforeTestId: id('t', a.beforeTestId), afterTestId: id('t', a.afterTestId), evidenceIds: ev(a.evidenceIds), notes: a.notes.map((n) => ({ ...n, id: `${n.id}~${k}` })) });
    }
    for (const c of base.costs) if (c.batteryId && newB(c.batteryId)) out.costs.push({ ...c, id: id('c', c.id)!, batteryId: newB(c.batteryId) });
    for (const v of base.values) if (newB(v.batteryId)) out.values.push({ ...v, id: id('v', v.id)!, batteryId: newB(v.batteryId)! });
    for (const w of base.warranties) if (newB(w.batteryId)) out.warranties.push({ ...w, id: id('w', w.id)!, batteryId: newB(w.batteryId)! });
    for (const r of base.recycling) if (newB(r.batteryId)) out.recycling.push({ ...r, id: id('r', r.id)!, batteryId: newB(r.batteryId)! });
    for (const e of base.events) {
      if (!newB(e.batteryId) || e.ref?.kind === 'alert' || e.ref?.kind === 'task') continue;
      const ref = e.ref && ['test', 'attempt', 'value'].includes(e.ref.kind) ? { kind: e.ref.kind, id: id(e.ref.kind === 'test' ? 't' : e.ref.kind === 'attempt' ? 'a' : 'v', e.ref.id)! } : e.ref;
      out.events.push({ ...e, id: id('e', e.id)!, batteryId: newB(e.batteryId)!, evidenceIds: ev(e.evidenceIds), ref });
    }
    void mine;
  }
  out.assignments = out.assignments.filter((a) => base.batteries.some((b) => b.id === a.batteryId));
  return out;
}

async function main() {
  const target = Number(process.argv[2] ?? 5000);
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Set DATABASE_URL to a throwaway PostgreSQL database.');
  const handle = await connect({ databaseUrl: url, pgliteDir: 'memory://' });
  try {
    await handle.migrate();
    if (!(await isEmpty(handle.db))) throw new Error('Refusing to load into a database that already has data.');
    const data = scaleSeed(buildSeed(), target);
    const t = performance.now();
    const r = await handle.db.transaction((tx) => insertAll(tx, data));
    console.log(`Loaded ${data.batteries.length} batteries, ${data.tests.length} tests, ${data.events.length} events (${r.inserted} rows) in ${Math.round((performance.now() - t) / 1000)} s.`);
  } finally {
    await handle.close();
  }
}

if (process.argv[1]?.includes('scale-seed')) main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
