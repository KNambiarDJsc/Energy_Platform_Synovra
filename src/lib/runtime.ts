/**
 * Where the UI gets its data, and which product areas this deployment offers.
 *
 * - `mock` (default): everything runs in the browser against synthetic data. All areas on.
 * - `http`: the UI calls the Synovra API (server/). The API reports its data mode and features
 *   at GET /api/v1/meta; areas without a server implementation (monitoring, alerts, assistant)
 *   are hidden rather than shown empty.
 */
import type { OidcClientConfig } from '@/services/http/oidc';

export type DataSource = 'mock' | 'http';
export type FeatureName = 'monitoring' | 'alerts' | 'intelligence' | 'assistant';

export const DATA_SOURCE: DataSource = process.env.NEXT_PUBLIC_DATA_SOURCE === 'http' ? 'http' : 'mock';
export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000').replace(/\/$/, '');

export interface RuntimeInfo {
  loaded: boolean;
  /** `demo` = synthetic data (browser or server). `pilot` = real pilot records on the server. */
  dataMode: 'demo' | 'pilot';
  authMode: 'dev' | 'oidc' | 'none';
  features: Record<FeatureName, boolean>;
  /** Company sign-in settings published by the API (OIDC mode with a client ID configured). */
  oidc: OidcClientConfig | null;
  /** Set when the API could not be reached. */
  error: string | null;
}

const MOCK: RuntimeInfo = {
  loaded: true, dataMode: 'demo', authMode: 'none', error: null, oidc: null,
  features: { monitoring: true, alerts: true, intelligence: true, assistant: true },
};
// Until /meta answers, assume the most conservative server profile.
const HTTP_DEFAULT: RuntimeInfo = {
  loaded: false, dataMode: 'pilot', authMode: 'dev', error: null, oidc: null,
  features: { monitoring: false, alerts: false, intelligence: false, assistant: false },
};

let info: RuntimeInfo = DATA_SOURCE === 'http' ? HTTP_DEFAULT : MOCK;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

export function getRuntime(): RuntimeInfo {
  return info;
}

export function getServerRuntime(): RuntimeInfo {
  return DATA_SOURCE === 'http' ? HTTP_DEFAULT : MOCK;
}

export function subscribeRuntime(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Loads deployment info once (HTTP mode only). Safe to call repeatedly. */
export function loadRuntime(): Promise<void> {
  if (DATA_SOURCE !== 'http' || typeof window === 'undefined') return Promise.resolve();
  if (!loading) {
    loading = fetch(`${API_BASE_URL}/api/v1/meta`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`status ${res.status}`);
        const meta = (await res.json()) as {
          dataMode: RuntimeInfo['dataMode']; authMode: 'dev' | 'oidc'; features: Partial<Record<FeatureName, boolean>>; oidc?: OidcClientConfig | null;
        };
        info = {
          loaded: true, dataMode: meta.dataMode, authMode: meta.authMode, error: null, oidc: meta.oidc ?? null,
          features: { monitoring: !!meta.features.monitoring, alerts: !!meta.features.alerts, intelligence: !!meta.features.intelligence, assistant: !!meta.features.assistant },
        };
      })
      .catch(() => {
        info = { ...HTTP_DEFAULT, loaded: true, error: `The Synovra API is not reachable at ${API_BASE_URL}.` };
        loading = null;
      })
      .finally(() => listeners.forEach((l) => l()));
  }
  return loading ?? Promise.resolve();
}
