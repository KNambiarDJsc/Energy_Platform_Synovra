/**
 * A local OpenID Connect provider for development and tests. NOT for any real deployment.
 *
 * Implements just enough of OIDC for the web app's Authorization Code + PKCE flow:
 * discovery, /authorize (a page that asks which demo email to sign in as), /token (checks the
 * PKCE verifier), /jwks and /logout. Tokens are RS256-signed with a key generated at start-up.
 *
 *   npm run oidc:mock          # listens on http://localhost:4010
 *
 * Point the API at it:  AUTH_MODE=oidc OIDC_ISSUER=http://localhost:4010 OIDC_AUDIENCE=synovra-api OIDC_CLIENT_ID=synovra-web
 */
import { createHash, randomBytes } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose';

export interface MockOidcOptions {
  port?: number;
  /** Emails offered on the sign-in page. Defaults to the demo seed's engineer and technician. */
  emails?: string[];
  tokenTtlSeconds?: number;
}

interface Grant { clientId: string; redirectUri: string; challenge: string; nonce: string | null; email: string; audience: string | null; expires: number }

const b64url = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

async function body(req: IncomingMessage): Promise<URLSearchParams> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
}

export async function startMockOidc(opts: MockOidcOptions = {}): Promise<{ issuer: string; server: Server; close: () => Promise<void> }> {
  const emails = opts.emails ?? ['hamid.rahimi@demo.invalid', 'rania.khoury@demo.invalid', 'tariq.aziz@demo.invalid'];
  const ttl = opts.tokenTtlSeconds ?? 3600;
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid: 'mock-1', alg: 'RS256', use: 'sig' };
  const grants = new Map<string, Grant>();
  let issuer = '';

  const send = (res: ServerResponse, status: number, data: unknown, headers: Record<string, string> = {}) => {
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    res.writeHead(status, {
      'Content-Type': typeof data === 'string' ? 'text/html; charset=utf-8' : 'application/json',
      'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Cache-Control': 'no-store', ...headers,
    });
    res.end(text);
  };
  const sign = (claims: Record<string, unknown>, aud: string, sub: string) =>
    new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'mock-1' }).setIssuer(issuer).setAudience(aud)
      .setSubject(sub).setIssuedAt().setExpirationTime(`${ttl}s`).sign(privateKey);

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', issuer);
      if (req.method === 'OPTIONS') return send(res, 204, '');
      if (url.pathname === '/.well-known/openid-configuration') {
        return send(res, 200, {
          issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks`,
          end_session_endpoint: `${issuer}/logout`, response_types_supported: ['code'], code_challenge_methods_supported: ['S256'],
          id_token_signing_alg_values_supported: ['RS256'], subject_types_supported: ['public'],
        });
      }
      if (url.pathname === '/jwks') return send(res, 200, { keys: [jwk] });
      if (url.pathname === '/authorize') {
        const q = url.searchParams;
        if (q.get('response_type') !== 'code' || q.get('code_challenge_method') !== 'S256' || !q.get('code_challenge') || !q.get('redirect_uri') || !q.get('client_id')) {
          return send(res, 400, { error: 'invalid_request', error_description: 'Authorization Code with S256 PKCE is required.' });
        }
        const email = q.get('login_hint') ?? q.get('email');
        if (!email) {
          const hidden = [...q.entries()].map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join('');
          const options = emails.map((e) => `<button name="email" value="${esc(e)}">${esc(e)}</button>`).join('');
          return send(res, 200, `<!doctype html><meta name="viewport" content="width=device-width"><title>Mock sign-in</title>
<body style="font:16px system-ui;margin:40px auto;max-width:520px;padding:0 16px;color:#112b40">
<h1 style="font-size:24px">Mock identity provider</h1><p>Local development only. Choose who to sign in as.</p>
<form method="get" action="/authorize" style="display:grid;gap:8px">${hidden}${options}</form></body>`);
        }
        const code = b64url(randomBytes(24));
        grants.set(code, {
          clientId: q.get('client_id')!, redirectUri: q.get('redirect_uri')!, challenge: q.get('code_challenge')!,
          nonce: q.get('nonce'), email, audience: q.get('audience'), expires: Date.now() + 60_000,
        });
        const back = new URL(q.get('redirect_uri')!);
        back.searchParams.set('code', code);
        if (q.get('state')) back.searchParams.set('state', q.get('state')!);
        return send(res, 302, '', { Location: back.toString() });
      }
      if (url.pathname === '/token' && req.method === 'POST') {
        const f = await body(req);
        const code = f.get('code') ?? '';
        const g = grants.get(code);
        grants.delete(code); // one use
        if (!g || g.expires < Date.now()) return send(res, 400, { error: 'invalid_grant', error_description: 'Unknown or expired code.' });
        if (f.get('grant_type') !== 'authorization_code' || f.get('client_id') !== g.clientId || f.get('redirect_uri') !== g.redirectUri) {
          return send(res, 400, { error: 'invalid_grant', error_description: 'Client or redirect URI does not match.' });
        }
        const verifier = f.get('code_verifier') ?? '';
        if (b64url(createHash('sha256').update(verifier).digest()) !== g.challenge) {
          return send(res, 400, { error: 'invalid_grant', error_description: 'PKCE verification failed.' });
        }
        const sub = `mock|${createHash('sha256').update(g.email).digest('hex').slice(0, 16)}`;
        const idToken = await sign({ email: g.email, email_verified: true, ...(g.nonce ? { nonce: g.nonce } : {}) }, g.clientId, sub);
        const accessToken = await sign({ email: g.email, email_verified: true, scope: 'openid profile email' }, g.audience ?? g.clientId, sub);
        return send(res, 200, { access_token: accessToken, id_token: idToken, token_type: 'Bearer', expires_in: ttl });
      }
      if (url.pathname === '/logout') {
        const to = url.searchParams.get('post_logout_redirect_uri');
        return to ? send(res, 302, '', { Location: to }) : send(res, 200, '<p>Signed out of the mock provider.</p>');
      }
      return send(res, 404, { error: 'not_found' });
    } catch (e) {
      return send(res, 500, { error: 'server_error', error_description: String(e) });
    }
  });

  await new Promise<void>((resolve) => server.listen(opts.port ?? 0, '127.0.0.1', resolve));
  const addr = server.address();
  issuer = `http://localhost:${typeof addr === 'object' && addr ? addr.port : opts.port}`;
  return { issuer, server, close: () => new Promise((r) => server.close(() => r())) };
}

// Run directly: npm run oidc:mock
if (process.argv[1] && /mock-oidc\.[cm]?[tj]s$/.test(process.argv[1])) {
  startMockOidc({ port: Number(process.env.MOCK_OIDC_PORT ?? 4010) }).then(({ issuer }) => {
    console.log(`Mock OIDC provider at ${issuer} (development only)`);
    console.log('API:  AUTH_MODE=oidc OIDC_ISSUER=' + issuer + ' OIDC_AUDIENCE=synovra-api OIDC_CLIENT_ID=synovra-web');
  });
}
