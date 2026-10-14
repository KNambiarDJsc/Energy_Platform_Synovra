/**
 * Operational basics: request IDs, rate limiting, Prometheus metrics and error alerts.
 *
 * All of it is in-process and dependency-free. With several API instances, each instance limits
 * and counts on its own: put the instances behind a load balancer with sticky sessions or a
 * gateway-level limit if exact global limits matter, and scrape every instance for metrics.
 */
import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { Context } from 'hono';
import { RateLimitError } from './errors';

/* ------------------------------ Request IDs ------------------------------ */

const SAFE_ID = /^[A-Za-z0-9._:-]{8,64}$/;

/** Reuses a well-formed incoming X-Request-Id (from a proxy or the browser), otherwise makes one. */
export function requestIdFrom(header: string | undefined): string {
  return header && SAFE_ID.test(header) ? header : randomUUID();
}

/* ------------------------------ Client address ------------------------------ */

export function clientAddress(c: Context, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = c.req.header('X-Forwarded-For')?.split(',')[0]?.trim();
    if (forwarded) return forwarded;
  }
  // The Node adapter exposes the socket; in-process test requests have none.
  const incoming = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming;
  return incoming?.socket?.remoteAddress ?? 'unknown';
}

/* ------------------------------ Rate limiting ------------------------------ */

/**
 * Fixed one-minute windows per key. Small and predictable: a client gets `limit` requests per
 * calendar minute, then 429 with Retry-After until the window rolls over.
 */
export class RateLimiter {
  private windows = new Map<string, { start: number; count: number }>();
  private lastSweep = 0;
  constructor(private readonly now: () => number = Date.now) {}

  /** Counts one request; throws RateLimitError when the key is over its limit. A limit of 0 disables the check. */
  hit(key: string, limit: number): void {
    if (limit <= 0) return;
    const now = this.now();
    const start = now - (now % 60_000);
    this.sweep(start);
    const w = this.windows.get(key);
    if (!w || w.start !== start) {
      this.windows.set(key, { start, count: 1 });
      return;
    }
    w.count += 1;
    if (w.count > limit) throw new RateLimitError(Math.max(1, Math.ceil((start + 60_000 - now) / 1000)));
  }

  private sweep(currentStart: number) {
    if (currentStart === this.lastSweep) return;
    this.lastSweep = currentStart;
    for (const [k, w] of this.windows) if (w.start < currentStart) this.windows.delete(k);
  }
}

/* ------------------------------ Metrics ------------------------------ */

const BUCKETS = [0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

type Labels = Record<string, string>;
const labelKey = (l: Labels) => Object.entries(l).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}="${v.replace(/["\\\n]/g, '_')}"`).join(',');

export class Metrics {
  private counters = new Map<string, Map<string, number>>();
  private histograms = new Map<string, { counts: number[]; sum: number; count: number }>();
  private readonly started = Date.now();
  private help: Record<string, string> = {
    synovra_http_requests_total: 'HTTP requests by method, route and status.',
    synovra_http_request_duration_seconds: 'HTTP request duration by method and route.',
    synovra_record_cache_total: 'Record cache lookups by result.',
    synovra_rate_limited_total: 'Requests refused by the rate limiter, by scope.',
    synovra_server_errors_total: 'Requests that ended in a 5xx error.',
    synovra_evidence_uploads_total: 'Evidence uploads by outcome.',
  };

  inc(name: string, labels: Labels = {}, by = 1) {
    const series = this.counters.get(name) ?? new Map<string, number>();
    const key = labelKey(labels);
    series.set(key, (series.get(key) ?? 0) + by);
    this.counters.set(name, series);
  }

  observe(name: string, labels: Labels, seconds: number) {
    const key = `${name}{${labelKey(labels)}}`;
    const h = this.histograms.get(key) ?? { counts: BUCKETS.map(() => 0), sum: 0, count: 0 };
    BUCKETS.forEach((b, i) => { if (seconds <= b) h.counts[i] += 1; });
    h.sum += seconds;
    h.count += 1;
    this.histograms.set(key, h);
  }

  /** Prometheus text exposition format 0.0.4. */
  render(): string {
    const lines: string[] = [];
    for (const [name, series] of this.counters) {
      lines.push(`# HELP ${name} ${this.help[name] ?? name}`, `# TYPE ${name} counter`);
      for (const [labels, v] of series) lines.push(`${name}${labels ? `{${labels}}` : ''} ${v}`);
    }
    const byName = new Map<string, [string, { counts: number[]; sum: number; count: number }][]>();
    for (const [key, h] of this.histograms) {
      const name = key.slice(0, key.indexOf('{'));
      byName.set(name, [...(byName.get(name) ?? []), [key.slice(name.length + 1, -1), h]]);
    }
    for (const [name, series] of byName) {
      lines.push(`# HELP ${name} ${this.help[name] ?? name}`, `# TYPE ${name} histogram`);
      for (const [labels, h] of series) {
        const sep = labels ? ',' : '';
        BUCKETS.forEach((b, i) => lines.push(`${name}_bucket{${labels}${sep}le="${b}"} ${h.counts[i]}`));
        lines.push(`${name}_bucket{${labels}${sep}le="+Inf"} ${h.count}`, `${name}_sum{${labels}} ${h.sum.toFixed(6)}`, `${name}_count{${labels}} ${h.count}`);
      }
    }
    const mem = process.memoryUsage();
    lines.push(
      '# HELP process_resident_memory_bytes Resident memory size in bytes.', '# TYPE process_resident_memory_bytes gauge', `process_resident_memory_bytes ${mem.rss}`,
      '# HELP nodejs_heap_used_bytes V8 heap used in bytes.', '# TYPE nodejs_heap_used_bytes gauge', `nodejs_heap_used_bytes ${mem.heapUsed}`,
      '# HELP process_uptime_seconds Seconds since the API process started.', '# TYPE process_uptime_seconds gauge', `process_uptime_seconds ${Math.round((Date.now() - this.started) / 1000)}`,
    );
    return `${lines.join('\n')}\n`;
  }
}

/** Compares a presented bearer token with the configured one in constant time. */
export function tokenMatches(presented: string | undefined, expected: string): boolean {
  const got = Buffer.from(presented?.replace(/^Bearer\s+/i, '') ?? '');
  const want = Buffer.from(expected);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** The route pattern a request matched (e.g. `/api/v1/batteries/:id/passport`), for low-cardinality labels. */
export function routeLabel(c: Context): string {
  const routes = c.req.matchedRoutes.filter((r) => !r.path.endsWith('*') && r.method !== 'ALL');
  return routes.at(-1)?.path ?? (c.res.status === 404 ? 'unmatched' : c.req.routePath);
}

/* ------------------------------ Error alerts ------------------------------ */

export interface ErrorAlert { requestId: string; method: string; path: string; status: number; error: string }

/**
 * Posts server errors to a webhook (Slack, Teams via a workflow, or any JSON endpoint) as `{ text }`.
 * The same error is sent at most once per quiet period, so an outage does not flood the channel.
 * Delivery problems are logged and never affect the request.
 */
export function createErrorNotifier(opts: {
  url: string | null;
  log: (e: Record<string, unknown>) => void;
  quietMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
}) {
  const quietMs = opts.quietMs ?? 5 * 60_000;
  const now = opts.now ?? Date.now;
  const lastSent = new Map<string, number>();
  const suppressed = new Map<string, number>();
  return {
    /** Returns the delivery promise (tests await it); callers in the request path do not. */
    notify(alert: ErrorAlert): Promise<void> {
      if (!opts.url) return Promise.resolve();
      const signature = `${alert.status} ${alert.path.replace(/[0-9a-f-]{8,}/gi, ':id')} ${alert.error.split('\n')[0].slice(0, 120)}`;
      const t = now();
      const last = lastSent.get(signature);
      if (last !== undefined && t - last < quietMs) {
        suppressed.set(signature, (suppressed.get(signature) ?? 0) + 1);
        return Promise.resolve();
      }
      lastSent.set(signature, t);
      const repeats = suppressed.get(signature) ?? 0;
      suppressed.delete(signature);
      const text = [
        `Synovra API error ${alert.status} on ${alert.method} ${alert.path}`,
        `Request ID: ${alert.requestId}`,
        `Error: ${alert.error.split('\n')[0].slice(0, 300)}`,
        repeats ? `(${repeats} similar errors were not sent during the quiet period)` : '',
      ].filter(Boolean).join('\n');
      const doFetch = opts.fetchImpl ?? fetch;
      return doFetch(opts.url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(5000),
      })
        .then((res) => { if (!res.ok) opts.log({ at: new Date().toISOString(), level: 'warn', msg: 'error webhook refused', status: res.status }); })
        .catch((e: unknown) => opts.log({ at: new Date().toISOString(), level: 'warn', msg: 'error webhook unreachable', error: String(e) }));
    },
  };
}
