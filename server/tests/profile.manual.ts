/** Manual profiling script (not part of the test suite): npx tsx server/tests/profile.manual.ts */
import { buildSeed } from '../../src/data/seed';
import { connect } from '../src/db/client';
import { insertAll, loadSnapshot } from '../src/db/snapshot';
import * as s from '../src/db/schema';

(async () => {
const handle = await connect({ databaseUrl: null, pgliteDir: 'memory://' });
await handle.migrate();
await handle.db.transaction((tx) => insertAll(tx, buildSeed()));
for (let i = 0; i < 3; i++) {
  let t = performance.now();
  await handle.db.transaction(async (tx) => {
    await loadSnapshot(tx, { predictions: true });
  });
  console.log(`loadSnapshot ${(performance.now() - t).toFixed(1)} ms`);
  t = performance.now();
  await handle.db.select().from(s.batteryEvents);
  console.log(`  events only ${(performance.now() - t).toFixed(1)} ms`);
  t = performance.now();
  await handle.db.select().from(s.tenants);
  console.log(`  tenants only ${(performance.now() - t).toFixed(1)} ms`);
  t = performance.now();
  await handle.db.select().from(s.importJobs);
  console.log(`  imports only ${(performance.now() - t).toFixed(1)} ms`);
}
await handle.close();
})();
