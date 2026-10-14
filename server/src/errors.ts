/**
 * Error contract: every failure is `{ "error": { "code", "message", "details" } }`.
 * Domain errors from the shared service layer map to 403/404/409/422; database integrity
 * violations (the second line of defence) map to 409 so a race can never produce a 500.
 */
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../src/domain/permissions';
import { ScannerUnavailableError } from './evidence/scan';

export class AuthError extends Error {
  constructor(public status: 401 | 403, message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export class FeatureDisabledError extends Error {
  constructor(public feature: string) {
    super(`${feature} is not enabled on this deployment.`);
    this.name = 'FeatureDisabledError';
  }
}

export class RateLimitError extends Error {
  constructor(public retryAfterSeconds: number) {
    super('Too many requests. Wait a moment and try again.');
    this.name = 'RateLimitError';
  }
}

export interface ErrorBody {
  error: { code: string; message: string; details: string[] };
}

const PG_INTEGRITY: Record<string, string> = {
  '23505': 'A record with the same key already exists, or the slot/battery already has an open assignment.',
  '23514': 'The change breaks a data integrity rule.',
  '23503': 'The change refers to a record that does not exist.',
  '23001': 'This record is append-only and cannot be changed.',
};

export function toHttpError(e: unknown): { status: number; body: ErrorBody } {
  const body = (code: string, message: string, details: string[] = []): ErrorBody => ({ error: { code, message, details } });
  if (e instanceof AuthError) return { status: e.status, body: body(e.status === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN', e.message) };
  if (e instanceof FeatureDisabledError) return { status: 404, body: body('FEATURE_DISABLED', e.message) };
  if (e instanceof ForbiddenError) return { status: 403, body: body(e.code, e.message, [String(e.permission)]) };
  if (e instanceof NotFoundError) return { status: 404, body: body(e.code, e.message) };
  if (e instanceof ConflictError) return { status: 409, body: body(e.code, e.message) };
  if (e instanceof ValidationError) return { status: 422, body: body(e.code, e.message, e.issues) };
  if (e instanceof RateLimitError) return { status: 429, body: body('RATE_LIMITED', e.message) };
  if (e instanceof ScannerUnavailableError) {
    return { status: 503, body: body('UNAVAILABLE', 'Uploads are paused because the malware scanner is unavailable. Nothing was stored. Try again shortly.') };
  }
  const pg = e as { code?: string; constraint?: string };
  if (typeof pg?.code === 'string' && PG_INTEGRITY[pg.code]) {
    return { status: 409, body: body('CONFLICT', PG_INTEGRITY[pg.code], pg.constraint ? [pg.constraint] : []) };
  }
  return { status: 500, body: body('INTERNAL', 'Something went wrong on the server. The change was not saved.') };
}
