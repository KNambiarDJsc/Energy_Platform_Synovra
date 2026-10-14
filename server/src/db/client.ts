/**
 * Database connection. PostgreSQL via `pg` when DATABASE_URL is set; otherwise an embedded
 * PGlite database (real Postgres compiled to WASM) so the API runs locally without Docker.
 * Both expose the same Drizzle API, so nothing above this file knows which one is in use.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import { drizzle as drizzlePg } from 'drizzle-orm/node-postgres';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

export type Schema = typeof schema;
export type Database = PgDatabase<PgQueryResultHKT, Schema>;

export interface DbHandle {
  db: Database;
  kind: 'postgres' | 'pglite';
  migrate(): Promise<void>;
  close(): Promise<void>;
}

/** Commands run from the repository root; containers set MIGRATIONS_DIR explicitly. */
function migrationsFolder(): string {
  return process.env.MIGRATIONS_DIR ?? path.resolve(process.cwd(), 'server/drizzle');
}

export async function connect(opts: { databaseUrl: string | null; pgliteDir: string }): Promise<DbHandle> {
  if (opts.databaseUrl) {
    const pool = new pg.Pool({ connectionString: opts.databaseUrl, max: 10 });
    const db = drizzlePg(pool, { schema }) as unknown as Database;
    return {
      db, kind: 'postgres',
      migrate: () => migratePg(db as never, { migrationsFolder: migrationsFolder() }),
      close: () => pool.end(),
    };
  }
  const inMemory = opts.pgliteDir === 'memory://';
  if (!inMemory) mkdirSync(opts.pgliteDir, { recursive: true });
  const client = new PGlite(inMemory ? undefined : opts.pgliteDir);
  const db = drizzlePglite(client, { schema }) as unknown as Database;
  return {
    db, kind: 'pglite',
    migrate: () => migratePglite(db as never, { migrationsFolder: migrationsFolder() }),
    close: () => client.close(),
  };
}
