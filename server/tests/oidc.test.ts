/**
 * Company sign-in end to end: the web app's PKCE client (src/services/http/oidc.ts) against the local
 * mock provider, then the API verifying the token and linking the person by verified email.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { beginSignIn, completeSignIn, SignInError, signOutUrl, type OidcClientConfig, type OidcDeps } from '../../src/services/http/oidc';
import { startMockOidc } from '../scripts/mock-oidc';
import { startServer, type Server } from './helpers';

let idp: Awaited<ReturnType<typeof startMockOidc>>;
let server: Server;
let cfg: OidcClientConfig;

const memoryStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); }, m };
};
const REDIRECT = 'http://localhost:3000/auth/callback';

/** Runs the browser half of the flow: authorize as `email`, return the callback URL the provider redirects to. */
async function authorize(deps: OidcDeps, email: string, next = '/app/tests') {
  const url = new URL(await beginSignIn(cfg, REDIRECT, next, deps));
  url.searchParams.set('login_hint', email);
  const res = await fetch(url, { redirect: 'manual' });
  expect(res.status).toBe(302);
  return res.headers.get('location')!;
}

beforeAll(async () => {
  idp = await startMockOidc();
  server = await startServer({
    env: { AUTH_MODE: 'oidc', OIDC_ISSUER: idp.issuer, OIDC_AUDIENCE: 'synovra-api', OIDC_CLIENT_ID: 'synovra-web' },
  });
  const meta = await (await server.raw('/api/v1/meta')).json();
  cfg = meta.oidc;
});
afterAll(async () => { await server?.close(); await idp?.close(); });

describe('company sign-in (OIDC, Authorization Code + PKCE)', () => {
  it('publishes the public client settings, never a secret', () => {
    expect(cfg).toEqual({ issuer: idp.issuer, clientId: 'synovra-web', scope: 'openid profile email', audience: 'synovra-api', tokenUse: 'access' });
  });

  it('signs a known person in and the API resolves their platform account', async () => {
    const storage = memoryStorage();
    const deps: OidcDeps = { storage, fetchImpl: fetch, now: Date.now };
    const callback = await authorize(deps, 'hamid.rahimi@demo.invalid');
    const result = await completeSignIn(cfg, callback, deps);
    expect(result.next).toBe('/app/tests');
    expect(result.idToken).toBeTruthy();
    expect(result.expiresAt).toBeGreaterThan(Date.now());
    expect(storage.m.size).toBe(0); // the pending state is single-use

    const me = await server.raw('/api/v1/me', { headers: { Authorization: `Bearer ${result.token}` } });
    expect(me.status).toBe(200);
    expect((await me.json()).actor).toMatchObject({ userId: 'u_eng1', role: 'battery_engineer' });

    const out = await signOutUrl(cfg, result.idToken, 'http://localhost:3000/signin');
    expect(out).toContain('/logout?');
    expect(out).toContain('id_token_hint=');
  });

  it('refuses a callback this browser did not start, and a replayed code', async () => {
    const deps: OidcDeps = { storage: memoryStorage(), fetchImpl: fetch, now: Date.now };
    const callback = await authorize(deps, 'hamid.rahimi@demo.invalid');
    const forged = new URL(callback);
    forged.searchParams.set('state', 'attacker-state');
    await expect(completeSignIn(cfg, forged.toString(), deps)).rejects.toBeInstanceOf(SignInError);
    // The pending sign-in was consumed by the failed attempt, so the genuine callback cannot be replayed either.
    await expect(completeSignIn(cfg, callback, deps)).rejects.toThrow(/not the one this browser started/);
  });

  it('refuses a code exchanged without the matching PKCE verifier', async () => {
    const storage = memoryStorage();
    const deps: OidcDeps = { storage, fetchImpl: fetch, now: Date.now };
    const callback = await authorize(deps, 'hamid.rahimi@demo.invalid');
    const [key, raw] = [...storage.m.entries()][0];
    storage.m.set(key, JSON.stringify({ ...JSON.parse(raw), verifier: 'x'.repeat(64) }));
    await expect(completeSignIn(cfg, callback, deps)).rejects.toThrow(/PKCE verification failed/);
  });

  it('expires a sign-in that took too long', async () => {
    let t = Date.now();
    const deps: OidcDeps = { storage: memoryStorage(), fetchImpl: fetch, now: () => t };
    const callback = await authorize(deps, 'hamid.rahimi@demo.invalid');
    t += 11 * 60_000;
    await expect(completeSignIn(cfg, callback, deps)).rejects.toThrow(/took too long/);
  });

  it('does not let an unknown person in, even with a valid token', async () => {
    const deps: OidcDeps = { storage: memoryStorage(), fetchImpl: fetch, now: Date.now };
    const result = await completeSignIn(cfg, await authorize(deps, 'stranger@example.invalid'), deps);
    const me = await server.raw('/api/v1/me', { headers: { Authorization: `Bearer ${result.token}` } });
    expect([401, 403]).toContain(me.status);
  });

  it('rejects a token signed by someone else', async () => {
    const other = await startMockOidc();
    try {
      const otherCfg = { ...cfg, issuer: other.issuer };
      const deps: OidcDeps = { storage: memoryStorage(), fetchImpl: fetch, now: Date.now };
      const url = new URL(await beginSignIn(otherCfg, REDIRECT, '/app', deps));
      url.searchParams.set('login_hint', 'hamid.rahimi@demo.invalid');
      const location = (await fetch(url, { redirect: 'manual' })).headers.get('location')!;
      const result = await completeSignIn(otherCfg, location, deps);
      const me = await server.raw('/api/v1/me', { headers: { Authorization: `Bearer ${result.token}` } });
      expect(me.status).toBe(401);
    } finally {
      await other.close();
    }
  });
});
