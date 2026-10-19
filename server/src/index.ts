/** Node entry point: load config, connect, migrate, seed the demo if empty, serve. */
import { serve } from '@hono/node-server';
import { buildSeed } from '../../src/data/seed';
import { createApp } from './app';
import { loadConfig } from './config';
import { connect } from './db/client';
import { readFileSync } from 'node:fs';
import { registerBenchProfile } from '../../src/domain/benchProfile';
import { insertAll, isEmpty, loadSnapshotCached } from './db/snapshot';
import { createErrorNotifier } from './observability';

const log = (e: Record<string, unknown>) => console.log(JSON.stringify({ at: new Date().toISOString(), ...e }));

async function main() {
  const config = loadConfig();
  const handle = await connect(config);
  await handle.migrate();

  // Extra bench export layouts for this lab's testers. A bad file stops the server here rather than mid-import.
  if (config.benchProfilesFile) {
    const profiles = JSON.parse(readFileSync(config.benchProfilesFile, 'utf8')) as unknown;
    if (!Array.isArray(profiles)) throw new Error('BENCH_PROFILES_FILE must hold a JSON array of profiles.');
    for (const p of profiles) registerBenchProfile(p);
    console.log(JSON.stringify({ at: new Date().toISOString(), msg: 'Loaded bench export profiles', count: profiles.length }));
  }

  if (config.seedOnStart && config.dataMode === 'demo' && (await isEmpty(handle.db))) {
    const r = await handle.db.transaction((tx) => insertAll(tx, buildSeed()));
    console.log(JSON.stringify({ at: new Date().toISOString(), msg: 'Loaded synthetic demo seed', records: r.inserted }));
  }

  // Warm the record cache so the first user request does not pay for the initial load.
  await handle.db.transaction((tx) => loadSnapshotCached(tx, handle.db, { predictions: config.features.intelligence }));

  // Faults outside a request (a rejected promise nobody awaited) are logged and alerted, not lost.
  const notifier = createErrorNotifier({ url: config.errorWebhookUrl, log });
  process.on('unhandledRejection', (reason) => {
    log({ level: 'error', msg: 'unhandled rejection', error: String(reason), stack: (reason as Error)?.stack });
    void notifier.notify({ requestId: 'none', method: '-', path: 'process', status: 500, error: `Unhandled rejection: ${String(reason)}` });
  });
  if (config.evidence.scan.kind === 'none') log({ level: 'warn', msg: 'Evidence uploads are not malware-scanned (EVIDENCE_SCAN=none).' });
  if (config.metricsToken === null) log({ level: 'info', msg: 'GET /metrics is disabled; set METRICS_TOKEN to enable it.' });
  if (!config.errorWebhookUrl) log({ level: 'info', msg: 'No ERROR_WEBHOOK_URL: server errors are logged but not alerted.' });

  const app = createApp({ db: handle.db, config, log });
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
