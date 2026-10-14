/** Request IDs, rate limits, metrics and error alerts. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createErrorNotifier, RateLimiter } from '../src/observability';
import { startServer, USERS, type Server } from './helpers';

const sent: { url: string; body: { text: string } }[] = [];
const alertFetch = (async (url: string | URL, init?: RequestInit) => {
  sent.push({ url: String(url), body: JSON.parse(String(init?.body)) });
  return new Response('ok');
}) as typeof fetch;

let now = Date.parse('2026-10-14T10:00:10Z');
const logs: Record<string, unknown>[] = [];
let server: Server;

beforeAll(async () => {
  server = await startServer({
    env: {
      RATE_LIMIT_PER_MINUTE: '20', RATE_LIMIT_WRITES_PER_MINUTE: '3', RATE_LIMIT_ANONYMOUS_PER_MINUTE: '5',
      METRICS_TOKEN: 'metrics-test-token', ERROR_WEBHOOK_URL: 'https://hooks.example.invalid/synovra',
    },
    alertFetch, limiterClock: () => now, log: (e) => logs.push(e),
  });
});
afterAll(async () => { await server?.close(); });

describe('request IDs', () => {
  it('returns a request ID on every response, reuses a safe incoming one, and puts it in errors and logs', async () => {
    const res = await server.raw('/api/v1/meta', { headers: { 'X-Request-Id': 'trace-abc-12345' } });
    expect(res.headers.get('x-request-id')).toBe('trace-abc-12345');
    const unsafe = await server.raw('/api/v1/meta', { headers: { 'X-Request-Id': 'bad id with spaces <script>' } });
    expect(unsafe.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
    const denied = await server.raw('/api/v1/batteries');
    const body = await denied.json();
    expect(body.error.requestId).toBe(denied.headers.get('x-request-id'));
    expect(logs.some((l) => l.requestId === body.error.requestId && l.status === 401)).toBe(true);
  });
});

describe('rate limits', () => {
  it('limits writes per user, answers 429 with Retry-After, and resets in the next minute', async () => {
    now = Date.parse('2026-10-14T10:01:10Z');
    const lab = await server.as(USERS.lab);
    for (let i = 0; i < 3; i++) expect((await lab.post('/imports/none/commit')).status).not.toBe(429);
    const limited = await lab.post('/imports/none/commit');
    expect(limited.status).toBe(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
    // Another user is unaffected; reads by the same user still work.
    expect((await (await server.as(USERS.eng)).post('/imports/none/commit')).status).not.toBe(429);
    expect((await lab.get('/me')).status).toBe(200);
    now = Date.parse('2026-10-14T10:02:00Z');
    expect((await lab.post('/imports/none/commit')).status).not.toBe(429);
  });

  it('limits unauthenticated requests and failed sign-ins per client address', async () => {
    now = Date.parse('2026-10-14T10:03:00Z');
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) statuses.push((await server.raw('/api/v1/batteries', { headers: { Authorization: 'Bearer forged' } })).status);
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses.at(-1)).toBe(429);
    const res = await server.raw('/api/v1/meta');
    expect(res.status).toBe(429);
    expect(Number(res.headers.get('retry-after'))).toBeGreaterThan(0);
  });

  it('keeps one window per key and minute', () => {
    let t = 0;
    const l = new RateLimiter(() => t);
    l.hit('a', 2); l.hit('a', 2);
    expect(() => l.hit('a', 2)).toThrow(/Too many requests/);
    l.hit('b', 2);
    t = 60_000;
    l.hit('a', 2);
    l.hit('a', 0); // 0 disables the limit
  });
});

describe('metrics', () => {
  it('requires the metrics token and reports requests by route pattern, not by raw path', async () => {
    expect((await server.raw('/metrics')).status).toBe(401);
    const res = await server.raw('/metrics', { headers: { Authorization: 'Bearer metrics-test-token' } });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toMatch(/synovra_http_requests_total\{method="GET",route="\/api\/v1\/meta",status="200"\} \d+/);
    expect(text).toMatch(/synovra_rate_limited_total\{scope="write"\} 1/);
    expect(text).toContain('# TYPE synovra_http_request_duration_seconds histogram');
    expect(text).toContain('process_resident_memory_bytes');
    expect(text).not.toMatch(/route="\/api\/v1\/imports\/none/);
  });
});

describe('error alerts', () => {
  it('sends one webhook message per distinct error in a quiet period and counts the rest', async () => {
    let t = 0;
    const posts: string[] = [];
    const notifier = createErrorNotifier({
      url: 'https://hooks.example.invalid/x', log: () => {}, quietMs: 1000, now: () => t,
      fetchImpl: (async (_u: unknown, init?: RequestInit) => { posts.push(JSON.parse(String(init?.body)).text); return new Response('ok'); }) as typeof fetch,
    });
    const alert = { requestId: 'r1', method: 'GET', path: '/api/v1/batteries/3f2a9c1e-0000/passport', status: 500, error: 'Error: database down' };
    await notifier.notify(alert);
    await notifier.notify({ ...alert, requestId: 'r2', path: '/api/v1/batteries/7b1d2e3f-1111/passport' });
    t = 2000;
    await notifier.notify({ ...alert, requestId: 'r3' });
    expect(posts).toHaveLength(2);
    expect(posts[0]).toContain('Request ID: r1');
    expect(posts[1]).toContain('1 similar errors were not sent');
  });

  it('is wired to server errors with the request ID', async () => {
    const before = sent.length;
    // A malformed storage key in the database is a server fault: it must alert, not leak details.
    const { evidenceFiles } = await import('../src/db/schema');
    const { sql } = await import('drizzle-orm');
    await server.handle.db.execute(sql`ALTER TABLE ${evidenceFiles} DROP CONSTRAINT evidence_stored_consistent_ck`);
    const [row] = await server.handle.db.select().from(evidenceFiles).limit(1);
    await server.handle.db.execute(sql`UPDATE ${evidenceFiles} SET storage_key = 'not-a-key', content_type = 'application/pdf', scan_status = 'clean' WHERE id = ${row.id}`);
    await server.handle.db.execute(sql`UPDATE data_version SET version = version + 1`);
    now = Date.parse('2026-10-14T10:09:00Z');
    const eng = await server.as(USERS.eng);
    const res = await eng.fetch(`/evidence/${row.id}/content`);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatchObject({ code: 'INTERNAL', requestId: res.headers.get('x-request-id') });
    expect(body.error.message).not.toMatch(/not-a-key/);
    await new Promise((r) => setTimeout(r, 20));
    expect(sent.length).toBe(before + 1);
    expect(sent.at(-1)!.body.text).toContain(`Request ID: ${body.error.requestId}`);
  });
});
