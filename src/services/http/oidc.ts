/**
 * Company sign-in: OpenID Connect Authorization Code flow with PKCE, for a public browser client.
 *
 * 1. `beginSignIn` stores a one-time state, nonce and PKCE verifier in sessionStorage and returns the
 *    identity provider's authorize URL.
 * 2. The provider signs the person in and redirects to /auth/callback with `code` and `state`.
 * 3. `completeSignIn` checks the state, exchanges the code (with the verifier) at the token endpoint,
 *    checks the ID token's issuer, audience and nonce, and returns the token the API expects.
 *
 * No client secret exists in the browser. The API independently verifies every token's signature,
 * issuer, audience and expiry against the provider's published keys, so nothing here is trusted by
 * the server; these checks protect the person signing in (wrong provider, replayed or mixed-up responses).
 */

export interface OidcClientConfig {
  issuer: string;
  clientId: string;
  scope: string;
  /** API audience, sent as `audience` (needed by some providers to issue an API access token). */
  audience: string;
  tokenUse: 'access' | 'id';
}

interface Discovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  end_session_endpoint?: string;
}

interface Pending { state: string; nonce: string; verifier: string; next: string; redirectUri: string; createdAt: number }

export interface SignInResult { token: string; idToken: string | null; expiresAt: number; next: string }

export interface OidcDeps {
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  fetchImpl: typeof fetch;
  now: () => number;
}

const PENDING_KEY = 'synovra-oidc-pending';
const PENDING_TTL_MS = 10 * 60_000;

const defaultDeps = (): OidcDeps => ({ storage: window.sessionStorage, fetchImpl: (...a) => fetch(...a), now: Date.now });

function base64url(bytes: Uint8Array): string {
  let s = '';
  bytes.forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(bytes = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function pkceChallenge(verifier: string): Promise<string> {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
}

const discoveries = new Map<string, Promise<Discovery>>();

export function discover(issuer: string, fetchImpl: typeof fetch): Promise<Discovery> {
  const cached = discoveries.get(issuer);
  if (cached) return cached;
  const url = `${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
  const p = fetchImpl(url)
    .then(async (res) => {
      if (!res.ok) throw new Error(`status ${res.status}`);
      const d = (await res.json()) as Discovery;
      // The document must describe the issuer we were configured with (mix-up protection).
      if (d.issuer.replace(/\/$/, '') !== issuer.replace(/\/$/, '')) throw new Error('issuer mismatch');
      return d;
    })
    .catch((e: unknown) => {
      discoveries.delete(issuer);
      throw new Error(`Cannot reach your organisation's sign-in service (${e instanceof Error ? e.message : 'network error'}).`);
    });
  discoveries.set(issuer, p);
  return p;
}

/** Only same-origin app paths may be the destination after sign-in. */
export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith('/app') && !next.startsWith('//') ? next : '/app/overview';
}

export async function beginSignIn(cfg: OidcClientConfig, redirectUri: string, next: string, deps: OidcDeps = defaultDeps()): Promise<string> {
  const d = await discover(cfg.issuer, deps.fetchImpl);
  const pending: Pending = { state: randomString(), nonce: randomString(), verifier: randomString(48), next: safeNext(next), redirectUri, createdAt: deps.now() };
  deps.storage.setItem(PENDING_KEY, JSON.stringify(pending));
  const url = new URL(d.authorization_endpoint);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: cfg.clientId,
    redirect_uri: redirectUri,
    scope: cfg.scope,
    state: pending.state,
    nonce: pending.nonce,
    code_challenge: await pkceChallenge(pending.verifier),
    code_challenge_method: 'S256',
    ...(cfg.tokenUse === 'access' ? { audience: cfg.audience } : {}),
  }).toString();
  return url.toString();
}

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const part = jwt.split('.')[1];
  if (!part) throw new Error('malformed token');
  const json = atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '='));
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(json, (c) => c.charCodeAt(0)))) as Record<string, unknown>;
}

export class SignInError extends Error {}

/** Handles the redirect back from the identity provider. `callbackUrl` is the full URL of /auth/callback. */
export async function completeSignIn(cfg: OidcClientConfig, callbackUrl: string, deps: OidcDeps = defaultDeps()): Promise<SignInResult> {
  const params = new URL(callbackUrl).searchParams;
  const raw = deps.storage.getItem(PENDING_KEY);
  deps.storage.removeItem(PENDING_KEY); // one use only, whatever happens next
  if (params.get('error')) {
    throw new SignInError(params.get('error_description') || `Your organisation's sign-in service refused the request (${params.get('error')}).`);
  }
  const pending = raw ? (JSON.parse(raw) as Pending) : null;
  if (!pending || pending.state !== params.get('state')) throw new SignInError('This sign-in link is not the one this browser started. Start again.');
  if (deps.now() - pending.createdAt > PENDING_TTL_MS) throw new SignInError('The sign-in took too long. Start again.');
  const code = params.get('code');
  if (!code) throw new SignInError('The sign-in service did not return an authorisation code.');

  const d = await discover(cfg.issuer, deps.fetchImpl);
  const res = await deps.fetchImpl(d.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', code, redirect_uri: pending.redirectUri, client_id: cfg.clientId, code_verifier: pending.verifier,
    }).toString(),
  });
  const body = (await res.json().catch(() => null)) as { access_token?: string; id_token?: string; expires_in?: number; error_description?: string; error?: string } | null;
  if (!res.ok || !body) throw new SignInError(body?.error_description ?? `The sign-in service did not issue a token (${body?.error ?? res.status}).`);

  if (body.id_token) {
    const claims = decodeJwtPayload(body.id_token);
    const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (String(claims.iss).replace(/\/$/, '') !== cfg.issuer.replace(/\/$/, '')) throw new SignInError('The ID token came from an unexpected issuer.');
    if (!aud.includes(cfg.clientId)) throw new SignInError('The ID token was issued for a different application.');
    if (claims.nonce !== pending.nonce) throw new SignInError('The ID token does not belong to this sign-in. Start again.');
  } else if (cfg.tokenUse === 'id') {
    throw new SignInError('The sign-in service did not return an ID token.');
  }
  const token = cfg.tokenUse === 'id' ? body.id_token! : body.access_token;
  if (!token) throw new SignInError('The sign-in service did not return an access token for the platform API.');
  const exp = Number(decodeJwtPayloadSafe(token).exp);
  const expiresAt = Number.isFinite(exp) && exp > 0 ? exp * 1000 : deps.now() + (body.expires_in ?? 3600) * 1000;
  return { token, idToken: body.id_token ?? null, expiresAt, next: pending.next };
}

function decodeJwtPayloadSafe(jwt: string): Record<string, unknown> {
  try {
    return decodeJwtPayload(jwt);
  } catch {
    return {}; // opaque access token: rely on expires_in
  }
}

/** Where to send the browser to end the provider session too, if the provider supports it. */
export async function signOutUrl(cfg: OidcClientConfig, idToken: string | null, postLogoutRedirectUri: string, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  try {
    const d = await discover(cfg.issuer, fetchImpl);
    if (!d.end_session_endpoint) return null;
    const url = new URL(d.end_session_endpoint);
    url.search = new URLSearchParams({
      client_id: cfg.clientId, post_logout_redirect_uri: postLogoutRedirectUri, ...(idToken ? { id_token_hint: idToken } : {}),
    }).toString();
    return url.toString();
  } catch {
    return null;
  }
}
