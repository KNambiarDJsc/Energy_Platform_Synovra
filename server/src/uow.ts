/**
 * One request = one database transaction:
 *   resolve the signed-in user -> load records -> run the shared service method -> write the changes.
 *
 * Writers take a transaction-scoped advisory lock, so two writes never interleave (no double-commit
 * of an import, no two assignments racing for one slot). Readers use REPEATABLE READ so every query
 * in the request sees the same consistent snapshot, and never wait for writers.
 *
 * When a service refuses an action (forbidden, not found, conflict, invalid), its audit entry is still
 * committed and the error is returned to the client. Nothing else from a failed request is written.
 */
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { createStore } from '../../src/data/store';
import { buildSeed } from '../../src/data/seed';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../src/domain/permissions';
import type { Actor } from '../../src/domain/types';
import { createServices } from '../../src/services';
import type { Services } from '../../src/services/types';
import type { Principal } from './auth';
import type { Config } from './config';
import type { Database } from './db/client';
import { AuthError } from './errors';
import { users } from './db/schema';
import { insertAll, loadSnapshotCached, persistChanges, truncateAll } from './db/snapshot';

/** Arbitrary constant: the key of the single writer lock. */
const WRITE_LOCK_KEY = 72_431_009;

export interface UowDeps {
  db: Database;
  config: Pick<Config, 'dataMode' | 'features'>;
  /** Epoch milliseconds. Injected by tests for a fixed clock. */
  clock?: () => number;
}

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

export function isDomainError(e: unknown): e is ForbiddenError | NotFoundError | ConflictError | ValidationError {
  return e instanceof ForbiddenError || e instanceof NotFoundError || e instanceof ConflictError || e instanceof ValidationError;
}

/** Finds the platform user for a verified token. OIDC users are linked to their record on first sign-in by email. */
async function resolveUserId(tx: Tx, p: Principal): Promise<string> {
  if (p.kind === 'dev') return p.userId;
  const bySubject = await tx.select({ id: users.id }).from(users).where(eq(users.externalSubject, p.subject)).limit(1);
  if (bySubject[0]) return bySubject[0].id;
  if (!p.email) throw new AuthError(403, 'Your identity provider did not supply a verified email, so no platform account can be matched.');
  const byEmail = await tx.select({ id: users.id, externalSubject: users.externalSubject }).from(users)
    .where(sql`lower(${users.email}) = ${p.email.toLowerCase()}`).limit(1);
  const u = byEmail[0];
  if (!u) throw new AuthError(403, 'Signed in, but no platform account exists for this email. Ask an administrator to add you.');
  if (u.externalSubject && u.externalSubject !== p.subject) throw new AuthError(403, 'This account is linked to a different identity.');
  await tx.update(users).set({ externalSubject: p.subject }).where(eq(users.id, u.id));
  return u.id;
}

/** Per-phase timings for the request log, in milliseconds. */
export interface Timing { waitMs?: number; loadMs?: number; cache?: 'hit' | 'miss'; runMs?: number; saveMs?: number }

export async function withServices<T>(
  deps: UowDeps,
  principal: Principal,
  mode: 'read' | 'write',
  fn: (services: Services, actor: Actor) => Promise<T> | T,
  timing: Timing = {},
): Promise<T> {
  const clock = deps.clock ?? Date.now;
  const requested = performance.now();
  const outcome = await deps.db.transaction(async (tx) => {
    if (mode === 'write') {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${WRITE_LOCK_KEY})`);
    } else {
      await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ`);
    }
    let t = performance.now();
    timing.waitMs = Math.round(t - requested);
    const userId = await resolveUserId(tx, principal);
    const snap = await loadSnapshotCached(tx, deps.db, { predictions: deps.config.features.intelligence }, (hit) => { timing.cache = hit ? 'hit' : 'miss'; });
    timing.loadMs = Math.round(performance.now() - t);
    t = performance.now();
    const user = snap.db.users.find((u) => u.id === userId);
    if (!user) throw new AuthError(401, 'Unknown user.');
    if (!user.active) throw new AuthError(403, 'This account is deactivated.');
    const actor: Actor = { userId: user.id, name: user.name, role: user.role, tenantId: user.tenantId, siteScope: user.siteScope };

    const nowIso = new Date(clock()).toISOString();
    const store = createStore({
      initialDb: snap.db, telemetry: [], mode: deps.config.dataMode === 'pilot' ? 'pilot' : 'demo', snapshotAt: nowIso, now: clock,
    });
    // Collision-free ids across concurrent requests (the browser store uses a per-tab counter).
    store.nextId = (prefix: string) => `${prefix}_${randomUUID()}`;
    let resetRequested = false;
    store.reset = () => {
      if (deps.config.dataMode !== 'demo') throw new ConflictError('Resetting data is only available in demo mode.');
      resetRequested = true;
    };
    const services = createServices(store, () => actor);

    try {
      const value = await fn(services, actor);
      timing.runMs = Math.round(performance.now() - t);
      t = performance.now();
      if (resetRequested) {
        await truncateAll(tx);
        await insertAll(tx, buildSeed());
      } else if (mode === 'write') {
        await persistChanges(tx, snap);
      } else {
        // Reads only ever add audit entries (exports, denied attempts, QR lookups outside scope).
        await persistChanges(tx, snap, ['audit']);
      }
      timing.saveMs = Math.round(performance.now() - t);
      return { ok: true as const, value };
    } catch (e) {
      if (!isDomainError(e)) throw e;
      await persistChanges(tx, snap, ['audit']);
      return { ok: false as const, error: e };
    }
  });
  if (!outcome.ok) throw outcome.error;
  return outcome.value;
}
