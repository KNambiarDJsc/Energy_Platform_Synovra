/**
 * Operational commands.
 *
 *   tsx server/src/cli.ts migrate                  apply pending migrations
 *   tsx server/src/cli.ts seed-demo [--force]      load the synthetic demo seed (DATA_MODE=demo only)
 *   tsx server/src/cli.ts bootstrap <file.json>    load pilot reference data into an empty database
 *
 * A pilot starts empty: no synthetic batteries, tests or costs. See server/pilot-bootstrap.example.json.
 */
import { readFileSync } from 'node:fs';
import { buildSeed } from '../../src/data/seed';
import { loadConfig } from './config';
import { connect } from './db/client';
import { bootstrap } from './db/bootstrap';
import { insertAll, isEmpty, truncateAll } from './db/snapshot';

async function main() {
  const [command, arg] = process.argv.slice(2);
  const config = loadConfig();
  const handle = await connect(config);
  try {
    await handle.migrate();
    if (command === 'migrate') {
      console.log('Migrations applied.');
    } else if (command === 'seed-demo') {
      if (config.dataMode !== 'demo') throw new Error('seed-demo is refused when DATA_MODE is not demo.');
      const empty = await isEmpty(handle.db);
      if (!empty && arg !== '--force') throw new Error('Database is not empty. Re-run with --force to replace everything with the demo seed.');
      const r = await handle.db.transaction(async (tx) => {
        if (!empty) await truncateAll(tx);
        return insertAll(tx, buildSeed());
      });
      console.log(`Loaded synthetic demo seed: ${r.inserted} records.`);
    } else if (command === 'bootstrap') {
      if (!arg) throw new Error('Usage: bootstrap <file.json>');
      const n = await bootstrap(handle.db, JSON.parse(readFileSync(arg, 'utf8')));
      console.log(`Bootstrapped ${n} reference records.`);
    } else {
      console.log('Commands: migrate | seed-demo [--force] | bootstrap <file.json>');
      process.exitCode = 1;
    }
  } finally {
    await handle.close();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
