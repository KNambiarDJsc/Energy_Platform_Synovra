/**
 * In-process profile of the read paths at a given size, without HTTP or a database.
 *   npx tsx server/scripts/profile-reads.ts 5000
 * Add `node --cpu-prof --import tsx` to find where the time goes.
 */
import { buildSeed } from '../../src/data/seed';
import { createStore } from '../../src/data/store';
import { actorFromUser, createServices } from '../../src/services';
import { scaleSeed } from './scale-seed';

(async () => {
  const n = Number(process.argv[2] ?? 5000);
  const db = scaleSeed(buildSeed(), n);
  const store = createStore({ persist: false, initialDb: db, telemetry: [], mode: 'demo', snapshotAt: new Date().toISOString() });
  const svc = createServices(store, () => actorFromUser(store, 'u_eng1'));
  const fin = createServices(store, () => actorFromUser(store, 'u_fin'));
  const ms = async (label: string, fn: () => Promise<unknown>) => {
    await fn();
    const t = performance.now();
    for (let i = 0; i < 3; i++) await fn();
    console.log(`${label.padEnd(26)} ${((performance.now() - t) / 3).toFixed(0).padStart(6)} ms`);
  };
  console.log(`${db.batteries.length} batteries, ${db.tests.length} tests, ${db.events.length} events`);
  const id = db.batteries[Math.floor(db.batteries.length / 2)].id;
  await ms('batteries.list', () => svc.batteries.list());
  await ms('batteries.get (passport)', () => svc.batteries.get(id));
  await ms('overview.get', () => svc.overview.get());
  await ms('insights.collection', () => svc.insights.collection());
  await ms('insights.recovery', () => fin.insights.recovery());
  await ms('insights.learning', () => svc.insights.learning());
  await ms('structuredClone(db)', async () => { structuredClone(db); });

})();
