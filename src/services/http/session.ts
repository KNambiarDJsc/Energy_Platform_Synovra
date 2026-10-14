/**
 * API session for HTTP mode: holds the bearer token and the actor the server resolved for it.
 *
 * With the API's dev auth, choosing a user on the sign-in page requests a token for that user.
 * With OIDC, the token comes from the identity provider's sign-in flow (not wired in this build;
 * see server/README.md) and is passed to `setToken`.
 */
import { API_BASE_URL } from '@/lib/runtime';
import type { Actor } from '@/domain/types';

const KEY = 'synovra-api-session';

interface ApiSession { userId: string; token: string; actor: Actor }
type State = { status: 'idle' } | { status: 'loading'; userId: string } | { status: 'ready'; session: ApiSession } | { status: 'error'; userId: string; message: string };

let state: State = { status: 'idle' };
const listeners = new Set<() => void>();

function emit(next: State) {
  state = next;
  listeners.forEach((l) => l());
}

function restore(): ApiSession | null {
  try {
    const raw = typeof window !== 'undefined' ? window.sessionStorage.getItem(KEY) : null;
    return raw ? (JSON.parse(raw) as ApiSession) : null;
  } catch {
    return null;
  }
}

function persist(s: ApiSession | null) {
  try {
    if (typeof window === 'undefined') return;
    if (s) window.sessionStorage.setItem(KEY, JSON.stringify(s));
    else window.sessionStorage.removeItem(KEY);
  } catch {
    /* storage blocked: the session lives in memory only */
  }
}

export function getApiSessionState(): State {
  if (state.status === 'idle') {
    const saved = restore();
    if (saved) state = { status: 'ready', session: saved };
  }
  return state;
}

export function subscribeApiSession(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function currentToken(): string | null {
  const s = getApiSessionState();
  return s.status === 'ready' ? s.session.token : null;
}

export function currentActor(): Actor | null {
  const s = getApiSessionState();
  return s.status === 'ready' ? s.session.actor : null;
}

async function fetchActor(token: string): Promise<Actor> {
  const res = await fetch(`${API_BASE_URL}/api/v1/me`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error?.message ?? `Sign-in failed (${res.status}).`);
  return (body as { actor: Actor }).actor;
}

/** Makes sure the API session belongs to `userId` (dev auth). Concurrent calls share one request. */
export function ensureApiSession(userId: string): void {
  const s = getApiSessionState();
  if ((s.status === 'ready' && s.session.userId === userId) || (s.status === 'loading' && s.userId === userId)) return;
  if (s.status === 'error' && s.userId === userId) return;
  emit({ status: 'loading', userId });
  (async () => {
    const res = await fetch(`${API_BASE_URL}/api/v1/dev/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(body?.error?.message ?? `Sign-in failed (${res.status}).`);
    const token = (body as { token: string }).token;
    const session = { userId, token, actor: await fetchActor(token) };
    persist(session);
    emit({ status: 'ready', session });
  })().catch((e: unknown) => {
    persist(null);
    const message = e instanceof TypeError ? `The Synovra API is not reachable at ${API_BASE_URL}.` : e instanceof Error ? e.message : 'Sign-in failed.';
    emit({ status: 'error', userId, message });
  });
}

/** Uses a token from an identity provider (OIDC mode). */
export async function setToken(token: string): Promise<void> {
  const actor = await fetchActor(token);
  const session = { userId: actor.userId, token, actor };
  persist(session);
  emit({ status: 'ready', session });
}

export function clearApiSession(): void {
  persist(null);
  emit({ status: 'idle' });
}
