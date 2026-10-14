import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './server/src/db/schema.ts',
  out: './server/drizzle',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://synovra:synovra@localhost:5432/synovra' },
  strict: true,
  verbose: true,
});
