/**
 * Authentication. Two modes:
 *
 * - `dev`: POST /api/v1/dev/login issues a short-lived HS256 token for a chosen user id. For local
 *   development and demos only; refused in production unless explicitly allowed (see config.ts).
 * - `oidc`: bearer tokens from any OpenID Connect provider (Entra ID, Google, Auth0, Keycloak...),
 *   verified against the provider's published keys, issuer and audience. No secrets are stored here.
 *
 * Authentication only says who the caller is. What they may do is decided per call by the shared
 * service layer (`authorize()` and scope checks), with the role and site scope from the users table.
 */
import { createRemoteJWKSet, jwtVerify, SignJWT, type JWTVerifyGetKey } from 'jose';
import type { Config } from './config';
import { AuthError } from './errors';

export type Principal =
  | { kind: 'dev'; userId: string }
  | { kind: 'oidc'; subject: string; email: string | null };

const DEV_ISSUER = 'synovra-dev';
const DEV_AUDIENCE = 'synovra-api';

export async function issueDevToken(config: Pick<Config, 'devJwtSecret'>, userId: string, ttlSeconds = 8 * 3600): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuer(DEV_ISSUER)
    .setAudience(DEV_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(config.devJwtSecret);
}

export function createAuthenticator(config: Pick<Config, 'authMode' | 'devJwtSecret' | 'oidc'>) {
  let jwks: JWTVerifyGetKey | null = null;

  async function oidcKeys(): Promise<JWTVerifyGetKey> {
    if (jwks) return jwks;
    const oidc = config.oidc!;
    let url = oidc.jwksUrl;
    if (!url) {
      const res = await fetch(new URL('.well-known/openid-configuration', oidc.issuer.endsWith('/') ? oidc.issuer : `${oidc.issuer}/`));
      if (!res.ok) throw new Error(`OIDC discovery failed: ${res.status}`);
      url = ((await res.json()) as { jwks_uri: string }).jwks_uri;
    }
    jwks = createRemoteJWKSet(new URL(url));
    return jwks;
  }

  return async function authenticate(authorization: string | undefined): Promise<Principal> {
    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) throw new AuthError(401, 'Sign in required.');
    try {
      if (config.authMode === 'dev') {
        const { payload } = await jwtVerify(token, config.devJwtSecret, { issuer: DEV_ISSUER, audience: DEV_AUDIENCE, algorithms: ['HS256'] });
        if (!payload.sub) throw new Error('missing subject');
        return { kind: 'dev', userId: payload.sub };
      }
      const oidc = config.oidc!;
      const { payload } = await jwtVerify(token, await oidcKeys(), { issuer: oidc.issuer, audience: oidc.audience });
      if (!payload.sub) throw new Error('missing subject');
      const email = typeof payload.email === 'string' && payload.email_verified !== false ? payload.email : null;
      return { kind: 'oidc', subject: payload.sub, email };
    } catch {
      throw new AuthError(401, 'Your session is invalid or has expired. Sign in again.');
    }
  };
}
