/** Node entry point: load config, connect, migrate, seed the demo if empty, serve. */
import { serve } from '@hono/node-server';
import { buildSeed } from '../../src/data/seed';
import { createApp } from './app';
import { loadConfig } from './config';
import { connect } from './db/client';
import { insertAll, isEmpty, loadSnapshotCached } from './db/snapshot';

async function main() {
  const config = loadConfig();
  const handle = await connect(config);
  await handle.migrate();

  if (config.seedOnStart && config.dataMode === 'demo' && (await isEmpty(handle.db))) {
    const r = await handle.db.transaction((tx) => insertAll(tx, buildSeed()));
    console.log(JSON.stringify({ at: new Date().toISOString(), msg: 'Loaded synthetic demo seed', records: r.inserted }));
  }

  // Warm the record cache so the first user request does not pay for the initial load.
  await handle.db.transaction((tx) => loadSnapshotCached(tx, handle.db, { predictions: config.features.intelligence }));

  const app = createApp({ db: handle.db, config });
  const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
    console.log(JSON.stringify({
      at: new Date().toISOString(), msg: 'Synovra API listening', port: info.port, database: handle.kind,
      dataMode: config.dataMode, authMode: config.authMode,
    }));
    if (config.authMode === 'dev') console.warn('AUTH_MODE=dev: anyone who can reach this API can sign in as any user. Local use only.');
  });

  const shutdown = async () => {
    server.close();
    await handle.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
