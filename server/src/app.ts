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
import { ConflictError, ValidationError, can, type Permission } from '../../src/domain/permissions';
import type { LifecycleState, PredictionKind, ReportTemplateId, StoredEvidence } from '../../src/domain/types';
import type { Services } from '../../src/services/types';
import { createAuthenticator, issueDevToken, type Principal } from './auth';
import type { Config } from './config';
import type { Database } from './db/client';
import { users } from './db/schema';
import { AuthError, FeatureDisabledError, toHttpError } from './errors';
import { inspectUpload, MAX_BYTES } from './evidence/inspect';
import { createScanner, type Scanner } from './evidence/scan';
import { createBlobStore, readVerified, type BlobStore } from './evidence/storage';
import { withServices, type Timing } from './uow';

type Env = { Variables: { principal: Principal; timing: Timing } };

export interface AppDeps {
  db: Database;
  config: Config;
  clock?: () => number;
  log?: (entry: Record<string, unknown>) => void;
  /** Injected by tests; built from config otherwise. */
  evidence?: { store: BlobStore; scanner: Scanner };
}

const API_VERSION = '1';

export function createApp(deps: AppDeps) {
  const { config } = deps;
  const authenticate = createAuthenticator(config);
  const log = deps.log ?? ((e) => console.log(JSON.stringify(e)));
  const blobs = deps.evidence?.store ?? createBlobStore(config.evidence.store);
  const scanner = deps.evidence?.scanner ?? createScanner(config.evidence.scan);
  const app = new Hono<Env>();

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
    const started = Date.now();
    const timing: Timing = {};
    c.set('timing', timing);
    await next();
    if (c.req.path !== '/health') log({ at: new Date().toISOString(), method: c.req.method, path: c.req.path, status: c.res.status, ms: Date.now() - started, ...timing });
  });

  app.onError((err, c) => {
    const { status, body } = toHttpError(err);
    if (status >= 500) log({ at: new Date().toISOString(), level: 'error', path: c.req.path, error: String(err), stack: (err as Error).stack });
    return c.json(body, status as 400);
  });
  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: `No route for ${c.req.method} ${c.req.path}`, details: [] } }, 404));

  /* ------------------------------ Unauthenticated ------------------------------ */

  app.get('/health', (c) => c.json({ status: 'ok' }));
  app.get('/ready', async (c) => {
    await deps.db.execute(sql`SELECT 1`);
    await blobs.check();
    await scanner.check();
    return c.json({ status: 'ready', evidenceStore: blobs.kind, malwareScan: scanner.kind });
  });

  const api = new Hono<Env>();

  api.get('/meta', (c) => c.json({
    apiVersion: API_VERSION, dataMode: config.dataMode, authMode: config.authMode, features: config.features,
    notice: config.dataMode === 'demo' ? 'Synthetic demonstration data. No live customer, cloud or sensor connection.' : null,
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
    c.set('principal', await authenticate(c.req.header('Authorization')));
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
  api.post('/tests/:id/reject', write(async (s, c) => s.tests.reject(c.req.param('id'), (await body<{ reason: string }>(c)).reason)));
  api.post('/tests/:id/rework', write(async (s, c) => s.tests.requestRework(c.req.param('id'), (await body<{ reason: string }>(c)).reason)));
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
    const b = await body<{ decision: 'approve' | 'reject' | 'rework'; reason: string }>(c);
    return s.restoration.decide(c.req.param('id'), b.decision, b.reason);
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
