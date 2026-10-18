/**
 * Operational commands.
 *
 *   tsx server/src/cli.ts migrate                  apply pending migrations
 *   tsx server/src/cli.ts seed-demo [--force]      load the synthetic demo seed (DATA_MODE=demo only)
 *   tsx server/src/cli.ts bootstrap <file.json>    load pilot reference data into an empty database
 *   tsx server/src/cli.ts ml-register <card.json>  register a trained model version in shadow, with its training records
 *
 * A pilot starts empty: no synthetic batteries, tests or costs. See server/pilot-bootstrap.example.json.
 */
import { readFileSync } from 'node:fs';
import { buildSeed } from '../../src/data/seed';
import { loadConfig } from './config';
import { connect } from './db/client';
import { bootstrap } from './db/bootstrap';
import { insertAll, isEmpty, truncateAll } from './db/snapshot';
import { modelTrainingRecords, modelVersions } from './db/schema';

/** Written by ml/train_restoration.py. Only a card whose readiness gate passed can be registered. */
interface ModelCard {
  name: string; version: string; baseline: string; training_cohort: string; evaluation_report: string;
  gate: { passed: boolean; reasons: string[] };
  training_records: { record_kind: 'restoration_attempt'; record_id: string; battery_id: string }[];
}

async function main() {
  const [command, arg] = process.argv.slice(2);
  // A card that cannot be registered is refused before the database is opened.
  let card: ModelCard | null = null;
  if (command === 'ml-register') {
    if (!arg) throw new Error('Usage: ml-register <model_card.json>');
    card = JSON.parse(readFileSync(arg, 'utf8')) as ModelCard;
    if (!card.gate?.passed) throw new Error(`Refused: the readiness gate did not pass (${(card.gate?.reasons ?? []).join('; ')}).`);
    if (!card.training_records?.length) throw new Error('Refused: a model version must name the records it was trained on.');
  }
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
    } else if (command === 'ml-register' && card) {
      const id = `${card.name}@${card.version}`;
      await handle.db.transaction(async (tx) => {
        // Always shadow: promotion to validated is a separate, signed-off step (docs/ML_PLAN.md).
        await tx.insert(modelVersions).values({
          id, name: card.name, version: card.version, status: 'shadow', baseline: card.baseline,
          trainingCohort: card.training_cohort, evaluationReportRef: card.evaluation_report, registeredAt: new Date(),
        });
        await tx.insert(modelTrainingRecords).values(card.training_records.map((r) => ({
          modelVersionId: id, recordKind: r.record_kind, recordId: r.record_id, batteryId: r.battery_id,
        })));
      });
      console.log(`Registered ${id} in shadow with ${card.training_records.length} training records.`);
    } else {
      console.log('Commands: migrate | seed-demo [--force] | bootstrap <file.json> | ml-register <card.json>');
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
