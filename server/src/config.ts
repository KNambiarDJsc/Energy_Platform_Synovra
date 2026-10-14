/**
 * Server configuration from environment variables. Everything has a safe local default so
 * `npm run server:dev` works with no setup; production refuses unsafe combinations.
 */
import { randomBytes } from 'node:crypto';

export type DataMode = 'demo' | 'pilot';
export type AuthMode = 'dev' | 'oidc';

export interface Features {
  /** Intelligence page: reads `predictions` written by the separate ML service (shadow mode). */
  intelligence: boolean;
  /** V2: needs the sensor/gateway contract. No server implementation yet. */
  monitoring: false;
  alerts: false;
  /** V3: server-side, tool-restricted assistant. No server implementation yet. */
  assistant: false;
}

export interface Config {
  port: number;
  /** Postgres connection string. When absent, an embedded PGlite database is used. */
  databaseUrl: string | null;
  /** Directory for the embedded database. `memory://` keeps it in memory only. */
  pgliteDir: string;
  dataMode: DataMode;
  authMode: AuthMode;
  devJwtSecret: Uint8Array;
  oidc: { issuer: string; audience: string; jwksUrl: string | null } | null;
  corsOrigins: string[];
  features: Features;
  /** Load the synthetic seed on start when the database is empty (demo mode only). */
  seedOnStart: boolean;
}

function bool(v: string | undefined, fallback: boolean): boolean {
  if (v === undefined || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const production = env.NODE_ENV === 'production';
  const dataMode = (env.DATA_MODE ?? 'demo') as DataMode;
  if (!['demo', 'pilot'].includes(dataMode)) throw new Error(`DATA_MODE must be demo or pilot, got "${dataMode}"`);
  const authMode = (env.AUTH_MODE ?? 'dev') as AuthMode;
  if (!['dev', 'oidc'].includes(authMode)) throw new Error(`AUTH_MODE must be dev or oidc, got "${authMode}"`);

  if (production && authMode === 'dev' && !bool(env.ALLOW_DEV_AUTH, false)) {
    throw new Error('AUTH_MODE=dev lets anyone sign in as any user. It is refused when NODE_ENV=production unless ALLOW_DEV_AUTH=true.');
  }
  if (production && !env.DATABASE_URL) throw new Error('DATABASE_URL is required when NODE_ENV=production.');

  let oidc: Config['oidc'] = null;
  if (authMode === 'oidc') {
    if (!env.OIDC_ISSUER || !env.OIDC_AUDIENCE) throw new Error('AUTH_MODE=oidc needs OIDC_ISSUER and OIDC_AUDIENCE.');
    oidc = { issuer: env.OIDC_ISSUER, audience: env.OIDC_AUDIENCE, jwksUrl: env.OIDC_JWKS_URL ?? null };
  }

  const secret = env.DEV_JWT_SECRET;
  if (authMode === 'dev' && production && !secret) throw new Error('DEV_JWT_SECRET is required for dev auth in production.');

  return {
    port: Number(env.PORT ?? 4000),
    databaseUrl: env.DATABASE_URL || null,
    pgliteDir: env.PGLITE_DIR ?? './.data/pglite',
    dataMode,
    authMode,
    // A per-process random secret means dev tokens stop working after a restart, which is fine locally.
    devJwtSecret: secret ? new TextEncoder().encode(secret) : randomBytes(32),
    oidc,
    corsOrigins: (env.CORS_ORIGINS ?? 'http://localhost:3000').split(',').map((s) => s.trim()).filter(Boolean),
    features: {
      intelligence: bool(env.FEATURE_INTELLIGENCE, dataMode === 'demo'),
      monitoring: false,
      alerts: false,
      assistant: false,
    },
    seedOnStart: bool(env.SEED_ON_START, dataMode === 'demo'),
  };
}
