/**
 * Pilot bootstrap: loads reference data only (tenants, users, sites and slots, battery families,
 * test protocols, import templates, notification settings, restoration batches) into an empty
 * database. Operational records (batteries, tests, costs...) are never bootstrapped; they arrive
 * through intake and the CSV import so that every one has an audit trail.
 */
import type { DemoDb } from '../../../src/domain/types';
import type { Database } from './client';
import { emptyDb, insertAll, isEmpty } from './snapshot';

export const REFERENCE_KEYS = ['tenants', 'users', 'sites', 'banks', 'strings', 'slots', 'families', 'protocols', 'importTemplates', 'notifications', 'batches'] as const;

export function validateBootstrap(input: Partial<DemoDb> & Record<string, unknown>): DemoDb {
  const extra = Object.keys(input).filter((k) => !(REFERENCE_KEYS as readonly string[]).includes(k) && !k.startsWith('_'));
  if (extra.length) throw new Error(`Bootstrap loads reference data only. Remove: ${extra.join(', ')}`);
  if (!input.tenants?.some((t) => t.kind === 'operator')) throw new Error('Include the operator tenant (kind "operator").');
  if (!input.users?.some((u) => u.role === 'platform_admin' && u.active)) throw new Error('Include at least one active platform_admin user.');
  const engineers = input.users.filter((u) => u.role === 'battery_engineer' && u.active);
  if (engineers.length < 2) {
    throw new Error('Include at least two active battery engineers: a test can never be approved by the person who recorded or submitted it.');
  }
  return { ...emptyDb(), ...Object.fromEntries(REFERENCE_KEYS.map((k) => [k, input[k] ?? []])) };
}

export async function bootstrap(db: Database, input: Partial<DemoDb> & Record<string, unknown>): Promise<number> {
  const data = validateBootstrap(input);
  return db.transaction(async (tx) => {
    if (!(await isEmpty(tx))) throw new Error('Bootstrap only runs on an empty database.');
    return (await insertAll(tx, data)).inserted;
  });
}
