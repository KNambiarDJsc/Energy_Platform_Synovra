/**
 * HTTP API under /api/v1. Each route is a thin mapping onto one method of the shared service
 * interfaces in src/services/types.ts, so the browser's HTTP adapter and this server agree on
 * shapes by construction. See docs/API_ADAPTER.md for the endpoint list.
 */
import { asc, eq, sql } from 'drizzle-orm';
import { Hono, type Context } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { ConflictError, ForbiddenError, ValidationError, can, type Permission } from '../../src/domain/permissions';
import type {
  LifecycleState, PredictionKind, ReportTemplateId, RestorationReasonCode, StoredEvidence, TestReviewReasonCode,
} from '../../src/domain/types';
import type { AgentKind, Services } from '../../src/services/types';
import { createAuthenticator, issueDevToken, type Principal } from './auth';
import type { Config } from './config';
import type { Database } from './db/client';
import { users } from './db/schema';
import { AuthError, FeatureDisabledError, RateLimitError, toHttpError } from './errors';
import { inspectUpload, MAX_BYTES } from './evidence/inspect';
import { createScanner, type Scanner } from './evidence/scan';
import { createBlobStore, readVerified, type BlobStore } from './evidence/storage';
import { clientAddress, createErrorNotifier, Metrics, RateLimiter, requestIdFrom, routeLabel, tokenMatches } from './observability';
import { withServices, type Timing } from './uow';
import { llmProvider } from '../../src/services/agent';
import { runAgentLoop } from '../../src/services/agent/loop';
import { AGENT_TOOLS, runTool as runAgentTool } from '../../src/services/agent/tools';

type Env = { Variables: { principal: Principal; timing: Timing; requestId: string } };

export interface AppDeps {
  db: Database;
  config: Config;
  clock?: () => number;
  log?: (entry: Record<string, unknown>) => void;
  /** Injected by tests; built from config otherwise. */
  evidence?: { store: BlobStore; scanner: Scanner };
  /** Injected by tests: the error-alert transport and the rate limiter's clock. */
  alertFetch?: typeof fetch;
  limiterClock?: () => number;
}

const API_VERSION = '1';

export function createApp(deps: AppDeps) {
  const { config } = deps;
  const authenticate = createAuthenticator(config);
  const log = deps.log ?? ((e) => console.log(JSON.stringify(e)));
  const blobs = deps.evidence?.store ?? createBlobStore(config.evidence.store);
  const scanner = deps.evidence?.scanner ?? createScanner(config.evidence.scan);
  const metrics = new Metrics();
  const limiter = new RateLimiter(deps.limiterClock);
  const notifier = createErrorNotifier({ url: config.errorWebhookUrl, log, fetchImpl: deps.alertFetch });
  const app = new Hono<Env>();

  // Request ID first, so every log line, error body and alert can be correlated.
  app.use('*', async (c, next) => {
    const id = requestIdFrom(c.req.header('X-Request-Id'));
    c.set('requestId', id);
    await next();
    c.header('X-Request-Id', id);
  });
  app.use('*', secureHeaders());
  app.use('/api/*', cors({
    origin: config.corsOrigins, allowHeaders: ['Authorization', 'Content-Type', 'X-Request-Id'], allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    exposeHeaders: ['Content-Disposition', 'X-Request-Id', 'Retry-After'], maxAge: 600,
  }));
  // JSON bodies: CSV previews are capped at 1 MB by the service, plus overhead. Evidence uploads: 20 MB plus multipart overhead.
  const jsonLimit = bodyLimit({ maxSize: 2 * 1024 * 1024, onError: (c) => c.json({ error: { code: 'VALIDATION', message: 'Request body is larger than 2 MB.', details: [] } }, 413) });
  const uploadLimit = bodyLimit({ maxSize: MAX_BYTES + 64 * 1024, onError: (c) => c.json({ error: { code: 'VALIDATION', message: 'Evidence file is larger than 20 MB.', details: [] } }, 413) });
  app.use('/api/*', (c, next) => ((c.req.header('Content-Type') ?? '').startsWith('multipart/form-data') ? uploadLimit(c, next) : jsonLimit(c, next)));

  app.use('*', async (c, next) => {
    const started = performance.now();
    const timing: Timing = {};
    c.set('timing', timing);
    await next();
    const seconds = (performance.now() - started) / 1000;
    const route = routeLabel(c);
    if (route !== '/metrics') {
      metrics.inc('synovra_http_requests_total', { method: c.req.method, route, status: String(c.res.status) });
      metrics.observe('synovra_http_request_duration_seconds', { method: c.req.method, route }, seconds);
      if (timing.cache) metrics.inc('synovra_record_cache_total', { result: timing.cache });
    }
    if (c.req.path === '/health' || c.req.path === '/metrics') return;
    const principal = c.get('principal');
    log({
      at: new Date().toISOString(), requestId: c.get('requestId'), method: c.req.method, path: c.req.path, status: c.res.status,
      ms: Math.round(seconds * 1000), user: principal ? (principal.kind === 'dev' ? principal.userId : principal.subject) : undefined, ...timing,
    });
  });

  app.onError((err, c) => {
    const { status, body } = toHttpError(err);
    const requestId = c.get('requestId');
    if (err instanceof RateLimitError) c.header('Retry-After', String(err.retryAfterSeconds));
    if (status >= 500) {
      metrics.inc('synovra_server_errors_total');
      log({ at: new Date().toISOString(), level: 'error', requestId, method: c.req.method, path: c.req.path, error: String(err), stack: (err as Error).stack });
      void notifier.notify({ requestId, method: c.req.method, path: c.req.path, status, error: String(err) });
    }
    return c.json({ error: { ...body.error, requestId } }, status as 400);
  });
  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: `No route for ${c.req.method} ${c.req.path}`, details: [], requestId: c.get('requestId') } }, 404));

  /* ------------------------------ Unauthenticated ------------------------------ */

  app.get('/health', (c) => c.json({ status: 'ok' }));
  // Prometheus scrape endpoint. Off unless METRICS_TOKEN is set (open without a token outside production).
  app.get('/metrics', (c) => {
    if (config.metricsToken === null) return c.json({ error: { code: 'NOT_FOUND', message: 'Metrics are not enabled.', details: [] } }, 404);
    if (config.metricsToken && !tokenMatches(c.req.header('Authorization'), config.metricsToken)) {
      return c.json({ error: { code: 'UNAUTHENTICATED', message: 'A metrics token is required.', details: [] } }, 401);
    }
    return c.body(metrics.render(), 200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' });
  });
  app.get('/ready', async (c) => {
    await deps.db.execute(sql`SELECT 1`);
    await blobs.check();
    await scanner.check();
    return c.json({ status: 'ready', evidenceStore: blobs.kind, malwareScan: scanner.kind });
  });

  const api = new Hono<Env>();

  // Rate limits. Requests without a token (meta, sign-in) count per client address; signed-in
  // requests count per user, with a tighter limit on writes. Failed sign-ins count per address too.
  const countRequest = (c: Context<Env>, scope: 'anonymous' | 'user' | 'write', key: string, limit: number) => {
    try {
      limiter.hit(`${scope}:${key}`, limit);
    } catch (e) {
      metrics.inc('synovra_rate_limited_total', { scope });
      throw e;
    }
  };
  api.use('*', async (c, next) => {
    if (c.req.method !== 'OPTIONS' && !c.req.header('Authorization')) {
      countRequest(c, 'anonymous', clientAddress(c, config.limits.trustProxy), config.limits.anonymousPerMinute);
    }
    return next();
  });

  api.get('/meta', (c) => c.json({
    apiVersion: API_VERSION, dataMode: config.dataMode, authMode: config.authMode, features: config.features,
    notice: config.dataMode === 'demo' ? 'Synthetic demonstration data. No live customer, cloud or sensor connection.' : null,
    // Public sign-in settings for the browser (Authorization Code + PKCE). Never includes secrets.
    oidc: config.oidc?.clientId
      ? { issuer: config.oidc.issuer, clientId: config.oidc.clientId, scope: config.oidc.scope, audience: config.oidc.audience, tokenUse: config.oidc.tokenUse }
      : null,
  }));

  if (config.authMode === 'dev') {
    // Lists who can be impersonated in dev mode. Never mounted with OIDC.
    api.get('/dev/users', async (c) => {
      const rows = await deps.db.select({ id: users.id, name: users.name, title: users.title, role: users.role })
        .from(users).where(eq(users.active, true)).orderBy(asc(users.seq));
      return c.json(rows);
    });
    api.post('/dev/login', async (c) => {
      const { userId } = await body<{ userId?: string }>(c);
      const row = userId ? (await deps.db.select({ id: users.id, active: users.active }).from(users).where(eq(users.id, userId)).limit(1))[0] : undefined;
      if (!row || !row.active) throw new AuthError(401, 'Unknown or inactive user.');
      return c.json({ token: await issueDevToken(config, row.id), tokenType: 'Bearer' });
    });
  }

  /* ------------------------------ Authenticated ------------------------------ */

  api.use('*', async (c, next) => {
    if (c.req.path.endsWith('/meta') || c.req.path.includes('/dev/')) return next();
    let principal: Principal;
    try {
      principal = await authenticate(c.req.header('Authorization'));
    } catch (e) {
      if (e instanceof AuthError) countRequest(c, 'anonymous', clientAddress(c, config.limits.trustProxy), config.limits.anonymousPerMinute);
      throw e;
    }
    c.set('principal', principal);
    const who = principal.kind === 'dev' ? principal.userId : principal.subject;
    countRequest(c, 'user', who, config.limits.perUserPerMinute);
    if (c.req.method !== 'GET') countRequest(c, 'write', who, config.limits.writesPerUserPerMinute);
    return next();
  });

  const read = <T>(fn: (s: Services, c: Context<Env>) => Promise<T>) =>
    async (c: Context<Env>) => c.json(await withServices(deps, c.get('principal'), 'read', (s) => fn(s, c), c.get('timing')) as object);
  const write = <T>(fn: (s: Services, c: Context<Env>) => Promise<T>) =>
    async (c: Context<Env>) => c.json(await withServices(deps, c.get('principal'), 'write', (s) => fn(s, c), c.get('timing')) as object);
  const feature = (name: keyof Config['features'], label: string) => async (_c: Context<Env>, next: () => Promise<void>) => {
    if (!config.features[name]) throw new FeatureDisabledError(label);
    await next();
  };

  /**
   * Evidence upload. JSON `{ fileName, sizeKb }` records metadata only (accepted in demo mode only;
   * the service refuses it in pilot). Multipart `file` uploads are checked in this order: content
   * matches the declared type, the caller may attach evidence at all, malware scan, storage, then
   * the service rule (record state, scope) creates the evidence record.
   */
  const upload = (permission: Permission, attach: (s: Services, id: string, fileName: string, sizeKb: number, stored?: StoredEvidence) => Promise<unknown>) =>
    async (c: Context<Env>) => {
      const id = c.req.param('id') ?? '';
      const principal = c.get('principal');
      const timing = c.get('timing');
      if (!(c.req.header('Content-Type') ?? '').startsWith('multipart/form-data')) {
        const b = await body<{ fileName: string; sizeKb: number }>(c);
        return c.json(await withServices(deps, principal, 'write', (s) => attach(s, id, b.fileName, b.sizeKb), timing) as object);
      }
      const form = await c.req.parseBody();
      const file = form.file;
      if (!(file instanceof File)) throw new ValidationError('Choose a file to upload.', ['Send the file in a multipart field named "file".']);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const info = inspectUpload(file.name, bytes);
      // Nothing reaches storage for a caller who may not attach evidence. Running the service call
      // without a file makes it refuse with its usual audited permission error.
      await withServices(deps, principal, 'read', async (s, actor) => {
        if (!can(actor.role, permission)) await attach(s, id, info.fileName, info.sizeKb);
      }, timing);
      const scanStatus = await scanner.scan(bytes);
      const { key, checksum } = await blobs.put(bytes, info.contentType);
      const stored: StoredEvidence = { checksum, storageKey: key, contentType: info.contentType, sizeKb: info.sizeKb, scanStatus };
      return c.json(await withServices(deps, principal, 'write', (s) => attach(s, id, info.fileName, info.sizeKb, stored), timing) as object);
    };

  api.get('/me', read(async (s) => ({ actor: s.actor(), dataMode: config.dataMode, features: config.features })));

  // Batteries
  api.get('/batteries', read((s, c) => s.batteries.list({
    q: q(c, 'q'), manufacturer: q(c, 'manufacturer'), siteId: q(c, 'siteId'), state: q(c, 'state') as LifecycleState | undefined,
    chemistry: q(c, 'chemistry'), updatedFrom: q(c, 'updatedFrom'), updatedTo: q(c, 'updatedTo'), qualityLevel: q(c, 'qualityLevel'),
  })));
  api.get('/batteries/facets', read((s) => s.batteries.facets()));
  api.get('/batteries/export', read((s, c) => s.batteries.exportCsv(q(c, 'ids')?.split(',').filter(Boolean))));
  api.get('/battery-families', read((s) => s.batteries.families()));
  api.get('/batteries/:id/passport', read((s, c) => s.batteries.get(c.req.param('id'))));

  // Evidence files: visibility follows the passport; every open is audited.
  api.get('/evidence/:id', read((s, c) => s.batteries.openEvidence(c.req.param('id'))));
  api.get('/evidence/:id/content', async (c) => {
    const e = await withServices(deps, c.get('principal'), 'read', (s) => s.batteries.openEvidence(c.req.param('id')), c.get('timing'));
    if (!e.storageKey || !e.contentType) throw new ConflictError('Only the file name was recorded for this evidence; no file is stored.');
    const bytes = await readVerified(blobs, e.storageKey);
    if (!bytes) throw new Error(`Evidence ${e.id} is recorded but ${e.storageKey} is missing from storage.`);
    const ascii = e.fileName.replace(/[^\x20-\x7e]|["\\]/g, '_');
    return new Response(bytes, {
      headers: {
        'Content-Type': e.contentType,
        'Content-Length': String(bytes.length),
        'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(e.fileName)}`,
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Cache-Control': 'private, no-store',
        'X-Checksum-SHA256': e.checksum,
      },
    });
  });
  api.get('/lookup', read((s, c) => s.batteries.lookupByPublicRef(q(c, 'ref') ?? '')));
  api.post('/batteries', write(async (s, c) => s.batteries.create(await body(c))));
  api.post('/batteries/:id/corrections', write(async (s, c) => s.batteries.correct({ ...(await body<object>(c)), batteryId: c.req.param('id') } as never)));
  api.post('/batteries/:id/reissue-label', write(async (s, c) => s.batteries.reissueLabel(c.req.param('id'), (await body<{ reason: string }>(c)).reason)));

  // Imports
  api.get('/import-templates', read((s) => s.imports.templates()));
  api.get('/imports', read((s) => s.imports.list()));
  api.post('/imports', write(async (s, c) => s.imports.preview(await body(c))));
  api.post('/imports/:id/commit', write((s, c) => s.imports.commit(c.req.param('id'))));

  // Tests
  api.get('/tests', read((s, c) => s.tests.list({ status: q(c, 'status'), batteryId: q(c, 'batteryId') })));
  api.get('/test-protocols', read((s) => s.tests.protocols()));
  api.get('/tests/:id', read((s, c) => s.tests.get(c.req.param('id'))));
  api.post('/tests', write(async (s, c) => s.tests.create(await body(c))));
  api.post('/tests/:id/submit', write((s, c) => s.tests.submit(c.req.param('id'))));
  api.post('/tests/:id/start-review', write((s, c) => s.tests.startReview(c.req.param('id'))));
  api.post('/tests/:id/approve', write(async (s, c) => s.tests.approve(c.req.param('id'), (await body<{ reason: string }>(c)).reason)));
  api.post('/tests/:id/reject', write(async (s, c) => {
    const b = await body<{ reason: string; reasonCode: TestReviewReasonCode }>(c);
    return s.tests.reject(c.req.param('id'), b.reason, b.reasonCode);
  }));
  api.post('/tests/:id/rework', write(async (s, c) => {
    const b = await body<{ reason: string; reasonCode: TestReviewReasonCode }>(c);
    return s.tests.requestRework(c.req.param('id'), b.reason, b.reasonCode);
  }));
  api.post('/tests/:id/evidence', upload('test.create', (s, id, name, kb, stored) => s.tests.attachEvidence(id, name, kb, stored)));

  // Restoration
  api.get('/restoration/batches', read((s) => s.restoration.batches()));
  api.get('/restoration/batches/:id/results', read((s, c) => s.restoration.batchResults(c.req.param('id'))));
  // A scenario is user input, computed and returned; it is never stored as fact.
  api.post('/restoration/batches/:id/economics', read(async (s, c) => s.restoration.economics(c.req.param('id'), await body(c))));
  api.get('/restoration/attempts', read((s, c) => s.restoration.attempts({ batchId: q(c, 'batchId'), batteryId: q(c, 'batteryId'), status: q(c, 'status') })));
  api.post('/batteries/:id/restoration-candidate', write(async (s, c) => s.restoration.markCandidate(c.req.param('id'), (await body<{ reason: string }>(c)).reason)));
  api.post('/restoration/attempts', write(async (s, c) => s.restoration.createAttempt(await body(c))));
  api.post('/restoration/attempts/:id/notes', write(async (s, c) => s.restoration.addNote(c.req.param('id'), (await body<{ text: string }>(c)).text)));
  api.post('/restoration/attempts/:id/evidence', upload('restoration.write', (s, id, name, kb, stored) => s.restoration.addEvidence(id, name, kb, stored)));
  api.post('/restoration/attempts/:id/submit', write(async (s, c) => s.restoration.submitForReview(c.req.param('id'), (await body<{ afterTestId: string }>(c)).afterTestId)));
  api.post('/restoration/attempts/:id/decide', write(async (s, c) => {
    const b = await body<{ decision: 'approve' | 'reject' | 'rework'; reason: string; reasonCode?: RestorationReasonCode | null }>(c);
    return s.restoration.decide(c.req.param('id'), b.decision, b.reason, b.reasonCode ?? null);
  }));

  // Inventory and deployments
  api.get('/inventory', read((s) => s.deployments.inventory()));
  api.get('/inventory/deployable', read((s) => s.deployments.deployable()));
  api.get('/sites', read((s) => s.deployments.sites()));
  api.post('/assignments/validate', read(async (s, c) => {
    const b = await body<{ batteryId: string; slotId: string }>(c);
    return s.deployments.validate(b.batteryId, b.slotId);
  }));
  api.post('/assignments', write(async (s, c) => s.deployments.move(await body(c))));
  api.post('/batteries/:id/reserve', write(async (s, c) => s.deployments.reserve(c.req.param('id'), (await body<{ reason: string }>(c)).reason)));
  api.post('/batteries/:id/return', write(async (s, c) => s.deployments.returnFromSite(c.req.param('id'), (await body<{ reason: string }>(c)).reason)));

  // Intelligence (read-only output of the separate ML service; humans record agreement)
  api.use('/predictions/*', feature('intelligence', 'Intelligence'));
  api.use('/predictions', feature('intelligence', 'Intelligence'));
  api.get('/predictions', read((s, c) => s.predictions.list({ kind: q(c, 'kind') as PredictionKind | undefined, batteryId: q(c, 'batteryId') })));
  api.post('/predictions/:id/review', write(async (s, c) => s.predictions.review(c.req.param('id'), (await body<{ outcome: 'agreed' | 'disagreed' }>(c)).outcome)));

  // Insights: data sources, the learning loop and read-only agents sit with Intelligence; recovery metrics with Reports
  for (const path of ['/insights/collection', '/insights/data-sources', '/insights/learning', '/insights/agents/*', '/insights/ask']) api.use(path, feature('intelligence', 'Intelligence'));
  api.get('/insights/collection', read((s) => s.insights.collection()));
  api.get('/insights/data-sources', read((s) => s.insights.dataSources()));
  api.get('/insights/learning', read((s) => s.insights.learning()));
  api.get('/insights/recovery', read((s) => s.insights.recovery()));
  api.get('/insights/agents/:kind', read((s, c) => {
    const kind = c.req.param('kind') as AgentKind;
    if (!['data_steward', 'battery_investigator', 'recovery_decision', 'recovery_analyst'].includes(kind)) throw new ValidationError('Unknown agent');
    const days = Number(q(c, 'periodDays'));
    return s.insights.runAgent(kind, { batteryId: q(c, 'batteryId') ?? null, periodDays: Number.isFinite(days) && days > 0 ? days : null });
  }));
  api.get('/batteries/:id/route-inputs', read((s, c) => s.insights.routeInputs(c.req.param('id'))));
  api.post('/batteries/:id/route-decisions', write(async (s, c) => s.insights.recordRoute({ ...(await body<object>(c)), batteryId: c.req.param('id') } as never)));
  // Training rows for the ML service, straight from the point-in-time view. Fleet-wide, so administrators only.
  api.use('/ml/*', feature('intelligence', 'Intelligence'));
  api.get('/ml/training-rows', async (c) => {
    await withServices(deps, c.get('principal'), 'read', async (s) => {
      if (!can(s.actor().role, 'admin.read')) throw new ForbiddenError('admin.read');
      return null;
    });
    const result = (await deps.db.execute(sql`SELECT * FROM ml_restoration_attempt_features ORDER BY attempt_id`)) as unknown as { rows: Record<string, unknown>[] };
    return c.json({ view: 'ml_restoration_attempt_features', exportedAt: new Date().toISOString(), rows: result.rows });
  });

  // Agent: a local model through Ollama plans read-only tool calls. The loop runs outside any transaction;
  // each tool call is its own short read, so a slow model never holds the database.
  api.use('/agent/*', feature('intelligence', 'Intelligence'));
  api.get('/agent/status', read((s) => s.agent.status()));
  api.post('/agent/run', async (c) => {
    const b = await body<{ goal?: string; model?: string | null }>(c);
    const principal = c.get('principal');
    const goal = (b.goal ?? '').trim().slice(0, 600);
    if (!goal) throw new ValidationError('Give the agent a goal');
    const st = await withServices(deps, principal, 'read', async (s) => { s.agent.checkAccess(); return s.agent.status(); });
    if (!st.available || !st.model) throw new ConflictError(st.reason ?? 'No language model is available');
    const model = b.model && st.models.includes(b.model) ? b.model : st.model;
    const run = await runAgentLoop({
      goal, model, chat: llmProvider().chat(model), tools: AGENT_TOOLS, maxSteps: 5,
      runTool: (name, args) => withServices(deps, principal, 'read', (s) => runAgentTool(s, name, args)),
    });
    await withServices(deps, principal, 'write', async (s) => { s.agent.recordRun(run); return null; });
    return c.json(run);
  });

  // Bench results by CSV: preview changes nothing; commit creates submitted tests and audits the file hash.
  api.post('/bench-imports/preview', read(async (s, c) => s.bench.preview(await body<{ fileName: string; text: string; profileId?: string }>(c))));
  // The file itself is evidence for every row it creates, so it goes through the same size, type, scan and
  // checksum path as any upload before the service sees it. A pilot refuses a commit without it.
  api.post('/bench-imports/commit', async (c) => {
    const principal = c.get('principal');
    const b = await body<{ fileName: string; text: string; profileId?: string }>(c);
    if (typeof b.text !== 'string' || typeof b.fileName !== 'string') throw new ValidationError('Send the file name and its text.');
    const bytes = new TextEncoder().encode(b.text);
    const info = inspectUpload(b.fileName, bytes);
    await withServices(deps, principal, 'read', async (s, actor) => {
      if (!can(actor.role, 'battery.import') || !can(actor.role, 'test.create')) await s.bench.commit({ fileName: info.fileName, text: b.text, profileId: b.profileId });
    }, c.get('timing'));
    const scanStatus = await scanner.scan(bytes);
    const { key, checksum } = await blobs.put(bytes, info.contentType);
    const stored: StoredEvidence = { checksum, storageKey: key, contentType: info.contentType, sizeKb: info.sizeKb, scanStatus };
    return c.json(await withServices(deps, principal, 'write', (s) => s.bench.commit({ fileName: info.fileName, text: b.text, profileId: b.profileId }, stored), c.get('timing')) as object);
  });
  api.post('/batteries/:id/values', write(async (s, c) => s.values.record({ ...(await body<object>(c)), batteryId: c.req.param('id') } as never)));
  // A question is recorded in the audit log, so this is a write even though it changes no battery record.
  api.post('/insights/ask', write(async (s, c) => {
    const b = await body<{ question: string; batteryId?: string | null }>(c);
    if (typeof b.question !== 'string' || !b.question.trim()) throw new ValidationError('Ask a question');
    return s.insights.ask(b.question, { batteryId: b.batteryId ?? null });
  }));

  // Reports
  api.get('/report-templates', read((s) => s.reports.templates()));
  api.get('/report-scopes', read((s, c) => s.reports.scopes(q(c, 'templateId') as ReportTemplateId)));
  api.get('/reports', read((s) => s.reports.list()));
  api.get('/reports/:id', read((s, c) => s.reports.get(c.req.param('id'))));
  api.get('/reports/:id/export', read((s, c) => s.reports.exportCsv(c.req.param('id'))));
  api.post('/reports', write(async (s, c) => s.reports.generate(await body(c))));
  api.post('/reports/:id/approve', write((s, c) => s.reports.approve(c.req.param('id'))));

  // Administration
  api.get('/admin/users', read((s) => s.admin.users()));
  api.get('/admin/tenants', read((s) => s.admin.tenants()));
  api.get('/admin/sites', read((s) => s.admin.sites()));
  api.get('/admin/families', read((s) => s.admin.families()));
  api.get('/admin/protocols', read((s) => s.admin.protocols()));
  api.get('/admin/import-templates', read((s) => s.admin.importTemplates()));
  api.get('/admin/notifications', read((s) => s.admin.notifications()));
  api.get('/admin/sensor-mappings', read((s) => s.admin.sensorMappings()));
  api.patch('/admin/notifications/:id', write(async (s, c) => s.admin.setNotification(c.req.param('id'), (await body<{ enabled: boolean }>(c)).enabled)));
  api.post('/admin/users', write(async (s, c) => s.admin.createUser(await body(c))));
  api.patch('/admin/users/:id', write(async (s, c) => s.admin.updateUser(c.req.param('id'), await body(c))));
  api.get('/audit-events', read((s, c) => s.admin.audit({ outcome: q(c, 'outcome') as 'success' | 'denied' | undefined })));
  api.post('/admin/reset-demo', write(async (s) => { await s.admin.resetDemo(); return { ok: true }; }));

  api.get('/overview', read((s) => s.overview.get()));
  api.get('/home', read((s) => s.overview.home()));

  // V2/V3 areas without a server implementation answer clearly instead of with empty data.
  for (const [prefix, label] of [['/telemetry', 'Monitoring'], ['/alerts', 'Alerts'], ['/tasks', 'Service tasks'], ['/assistant', 'Assistant']] as const) {
    api.all(`${prefix}/*`, () => { throw new FeatureDisabledError(label); });
    api.all(prefix, () => { throw new FeatureDisabledError(label); });
  }

  app.route('/api/v1', api);
  return app;
}

function q(c: Context<Env>, name: string): string | undefined {
  const v = c.req.query(name);
  return v === undefined || v === '' ? undefined : v;
}

async function body<T = unknown>(c: Context<Env>): Promise<T> {
  try {
    return (await c.req.json()) as T;
  } catch {
    throw new ValidationError('Request body must be valid JSON.');
  }
}
