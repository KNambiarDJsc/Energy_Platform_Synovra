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
  oidc: {
    issuer: string; audience: string; jwksUrl: string | null;
    /** Public (browser) client for the Authorization Code + PKCE sign-in. Published at /meta. */
    clientId: string | null; scope: string;
    /** Which token the browser sends to the API: the access token (default) or the ID token. */
    tokenUse: 'access' | 'id';
  } | null;
  corsOrigins: string[];
  features: Features;
  /** Load the synthetic seed on start when the database is empty (demo mode only). */
  seedOnStart: boolean;
  evidence: {
    store: { kind: 'local'; dir: string } | { kind: 's3'; endpoint: string; bucket: string; region: string; accessKeyId: string; secretAccessKey: string };
    scan: { kind: 'none' } | { kind: 'clamd'; host: string; port: number; timeoutMs: number };
  };
  limits: {
    /** Requests per minute per signed-in user, and writes per minute per user. */
    perUserPerMinute: number;
    writesPerUserPerMinute: number;
    /** Unauthenticated requests (sign-in, meta) per minute per client address. */
    anonymousPerMinute: number;
    /** Use X-Forwarded-For for the client address (only behind a trusted proxy). */
    trustProxy: boolean;
  };
  /** Bearer token for GET /metrics. Unset: metrics are served only outside production. */
  metricsToken: string | null;
  /** Webhook (Slack-compatible JSON `{ text }`) notified about server errors, rate-limited. */
  errorWebhookUrl: string | null;
  /** JSON file holding an array of extra bench export profiles (see src/domain/benchProfile.ts). */
  benchProfilesFile: string | null;
}

function int(v: string | undefined, fallback: number): number {
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new Error(`Expected a non-negative integer, got "${v}"`);
  return n;
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
    const tokenUse = (env.OIDC_TOKEN_USE ?? 'access') as 'access' | 'id';
    if (!['access', 'id'].includes(tokenUse)) throw new Error('OIDC_TOKEN_USE must be access or id.');
    oidc = {
      issuer: env.OIDC_ISSUER, audience: env.OIDC_AUDIENCE, jwksUrl: env.OIDC_JWKS_URL ?? null,
      clientId: env.OIDC_CLIENT_ID || null, scope: env.OIDC_SCOPE || 'openid profile email', tokenUse,
    };
  }

  let store: Config['evidence']['store'] = { kind: 'local', dir: env.EVIDENCE_DIR ?? './.data/evidence' };
  if ((env.EVIDENCE_STORE ?? 'local') === 's3') {
    const need = ['EVIDENCE_S3_ENDPOINT', 'EVIDENCE_S3_BUCKET', 'EVIDENCE_S3_ACCESS_KEY_ID', 'EVIDENCE_S3_SECRET_ACCESS_KEY'].filter((k) => !env[k]);
    if (need.length) throw new Error(`EVIDENCE_STORE=s3 needs ${need.join(', ')}.`);
    store = {
      kind: 's3', endpoint: env.EVIDENCE_S3_ENDPOINT!.replace(/\/$/, ''), bucket: env.EVIDENCE_S3_BUCKET!, region: env.EVIDENCE_S3_REGION ?? 'us-east-1',
      accessKeyId: env.EVIDENCE_S3_ACCESS_KEY_ID!, secretAccessKey: env.EVIDENCE_S3_SECRET_ACCESS_KEY!,
    };
  } else if (env.EVIDENCE_STORE && env.EVIDENCE_STORE !== 'local') {
    throw new Error(`EVIDENCE_STORE must be local or s3, got "${env.EVIDENCE_STORE}"`);
  }
  const scan: Config['evidence']['scan'] = (env.EVIDENCE_SCAN ?? 'none') === 'clamd'
    ? { kind: 'clamd', host: env.CLAMD_HOST ?? 'localhost', port: int(env.CLAMD_PORT, 3310), timeoutMs: int(env.CLAMD_TIMEOUT_MS, 30_000) }
    : { kind: 'none' };
  if (production && dataMode === 'pilot' && scan.kind === 'none' && !bool(env.EVIDENCE_ALLOW_UNSCANNED, false)) {
    throw new Error('Pilot evidence uploads must be malware-scanned in production. Set EVIDENCE_SCAN=clamd, or EVIDENCE_ALLOW_UNSCANNED=true if your storage scans files itself.');
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
    evidence: { store, scan },
    limits: {
      perUserPerMinute: int(env.RATE_LIMIT_PER_MINUTE, 600),
      writesPerUserPerMinute: int(env.RATE_LIMIT_WRITES_PER_MINUTE, 120),
      anonymousPerMinute: int(env.RATE_LIMIT_ANONYMOUS_PER_MINUTE, 60),
      trustProxy: bool(env.TRUST_PROXY, false),
    },
    metricsToken: env.METRICS_TOKEN || (production ? null : ''),
    errorWebhookUrl: env.ERROR_WEBHOOK_URL || null,
    benchProfilesFile: env.BENCH_PROFILES_FILE || null,
  };
}
