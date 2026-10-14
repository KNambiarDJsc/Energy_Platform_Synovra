/**
 * Fetch wrapper for the Synovra API. Turns the server's error contract
 * `{ error: { code, message, details } }` back into the domain error classes, so toasts,
 * inline form errors and `errorMessage()` behave exactly as they do with the in-browser mock.
 */
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/domain/permissions';
import { API_BASE_URL } from '@/lib/runtime';
import { clearApiSession, currentToken } from './session';

interface ErrorBody { error?: { code?: string; message?: string; details?: string[] } }

function toError(status: number, body: ErrorBody | null): Error {
  const code = body?.error?.code;
  const message = body?.error?.message ?? `Request failed (${status}).`;
  const details = body?.error?.details ?? [];
  let err: Error;
  switch (code) {
    case 'FORBIDDEN': err = new ForbiddenError(details[0] ?? 'unknown', message); break;
    case 'NOT_FOUND': err = new NotFoundError('Record'); break;
    case 'VALIDATION': err = new ValidationError(message, details); break;
    case 'CONFLICT':
    case 'FEATURE_DISABLED': err = new ConflictError(message); break;
    default: err = new Error(message);
  }
  err.message = message;
  return err;
}

export async function request<T>(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<T> {
  const token = currentToken();
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/v1${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error(`The Synovra API is not reachable at ${API_BASE_URL}. Check that it is running.`);
  }
  const data = (await res.json().catch(() => null)) as unknown;
  if (res.status === 401) {
    // Expired or revoked token: drop it so the app returns to sign-in.
    clearApiSession();
  }
  if (!res.ok) throw toError(res.status, data as ErrorBody | null);
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  patch: <T>(path: string, body: unknown = {}) => request<T>('PATCH', path, body),
};

/** Builds a query string, leaving out empty values. */
export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}
