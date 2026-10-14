# Synovra API (server/)

The backend for the V1 pilot scope: battery identity and passport, intake and CSV import, tests and engineering review, restoration and batch economics, inventory and deployments, reports, administration and audit. It is a Node/TypeScript service (Hono) on PostgreSQL (Drizzle ORM), built so the hosting and identity choices can change later without touching business rules.

## Run it

```bash
npm install

# Local, no Docker: embedded PostgreSQL (PGlite) stored in ./.data/pglite, synthetic demo data
npm run server:dev                      # http://localhost:4000, reloads on change

# Production-style build
npm run server:build && npm run server:start

# Real PostgreSQL in Docker (Postgres 16 + the API)
docker compose up --build

# Point the web app at the API
NEXT_PUBLIC_DATA_SOURCE=http NEXT_PUBLIC_API_BASE_URL=http://localhost:4000 npm run build && npm start
```

Health: `GET /health` (process up), `GET /ready` (database reachable). Deployment info: `GET /api/v1/meta`.

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | unset → embedded PGlite | PostgreSQL connection string. Required when `NODE_ENV=production`. |
| `PGLITE_DIR` | `./.data/pglite` | Embedded database directory (`memory://` for in-memory). |
| `DATA_MODE` | `demo` | `demo`: synthetic seed loaded on first start, records labelled synthetic. `pilot`: starts empty, no synthetic labels, no demo reset. |
| `AUTH_MODE` | `dev` | `dev`: `POST /api/v1/dev/login` issues a token for any user (local only; refused in production unless `ALLOW_DEV_AUTH=true`). `oidc`: bearer tokens from your identity provider. |
| `DEV_JWT_SECRET` | random per process | Signing key for dev tokens. Required for dev auth in production. |
| `OIDC_ISSUER`, `OIDC_AUDIENCE`, `OIDC_JWKS_URL` | — | Identity provider settings for `AUTH_MODE=oidc`. JWKS URL is discovered from the issuer if omitted. |
| `CORS_ORIGINS` | `http://localhost:3000` | Comma-separated web origins allowed to call the API. |
| `FEATURE_INTELLIGENCE` | on in demo, off in pilot | Serve model outputs from the `predictions` table. |
| `SEED_ON_START` | on in demo | Load the synthetic seed when the database is empty. |
| `PORT` | `4000` | |

## Pilot setup

A pilot database starts empty. Load reference data (operator tenant, users, battery families, placeholder protocols, import templates, sites) from a JSON file, then batteries arrive through intake and CSV import with a full audit trail:

```bash
cp server/pilot-bootstrap.example.json server/pilot-bootstrap.json   # replace every REPLACE value
DATA_MODE=pilot DATABASE_URL=... npm run db:bootstrap -- server/pilot-bootstrap.json
```

Bootstrap refuses operational records, refuses a non-empty database, and requires one administrator and at least two engineers, because a test can never be approved by the person who recorded or submitted it.

## How it works

```
request → authenticate (dev JWT or OIDC) → one transaction:
    resolve user from the users table (role, site scope, active)
    load records (from the in-memory cache when the data version is unchanged)
    run the shared service method from src/services   ← the same code the unit tests and the browser demo use
    write only what changed; bump the data version
  → JSON, or { error: { code, message, details } } with 401/403/404/409/422
```

- **One set of business rules.** Authorisation, site scope, separation of duties, lifecycle transitions, unknown-is-not-zero, customer redaction and idempotent import live in `src/services` and run unchanged on the server. The browser cannot bypass them: in HTTP mode the browser only renders what the API returns.
- **Database rules underneath** (`src/db/schema.ts`, `drizzle/`): one open assignment per slot and per battery, one restoration attempt in progress per battery, battery- vs string-level tests exclusive, an approved test's reviewer differs from its operator and submitter, money is NULL or non-negative, a validated model needs an evaluation report, and lifecycle events and the audit log are append-only (triggers).
- **Writers are serialised** with a transaction-scoped advisory lock, so two people racing for one slot get one success and one 409. Readers use a consistent snapshot and never wait.
- **Refused requests are audited.** A denied or invalid action still commits its audit entry; nothing else from a failed request is written.
- **Record cache.** Each request needs the V1 tables. They are cached in process and reused while the `data_version` counter (bumped by every write, in the same transaction) is unchanged, so several API instances behind a load balancer stay consistent.

Measured on this machine (embedded PGlite on disk, synthetic seed of about 950 records): reads 50–120 ms, writes about 350 ms. A real PostgreSQL server is faster. Each request currently works on the whole record set, which suits a pilot (hundreds to low thousands of batteries). When volumes grow, move the hot reads (register list, passport, overview) to dedicated SQL queries behind the same endpoints; the HTTP contract does not change.

## API

All routes are under `/api/v1`; the full list is in `src/app.ts` and `docs/API_ADAPTER.md`. The browser adapter in `src/services/http` calls exactly these routes, and `tests/adapter.test.ts` checks them against each other.

Not served yet, on purpose: monitoring/telemetry, alerts and tasks (V2, needs the sensor and cloud contract) and the assistant (V3). Those routes answer `404 FEATURE_DISABLED` and the UI hides those areas in HTTP mode.

## Tests

```bash
npm run test:server                       # embedded PostgreSQL, about 40 s
TEST_DATABASE_URL=postgres://synovra:synovra-local-only@localhost:5432/synovra npm run test:server   # real PostgreSQL (docker compose up db)
```

`api.test.ts` mirrors the behavioural spec in `tests/unit/services.test.ts` over HTTP and adds persistence, authentication, audit of refused requests, concurrent writers, cache invalidation and the database rules. `pilot.test.ts` covers pilot mode and bootstrap. `adapter.test.ts` runs the browser adapter against the routes.

## Operations

```bash
npm run db:generate      # after editing src/db/schema.ts: writes a new SQL migration to server/drizzle
npm run db:migrate       # applies pending migrations (the server also does this on start)
npm run db:seed          # demo mode only: load the synthetic seed (add -- --force to replace data)
```

## Not done yet (before a production pilot)

| Item | Why it matters |
| --- | --- |
| OIDC sign-in in the web app | The API verifies OIDC tokens today; the web app still needs the redirect flow (Authorization Code + PKCE) for the chosen provider. |
| Evidence file storage | Evidence is metadata only. Needs object storage (S3-compatible), upload size and type limits, malware scan, SHA-256 checksums and retention. |
| User administration | Users come from bootstrap; the admin screen can deactivate but not create users or change roles. |
| Run against real PostgreSQL in CI | Tests run on embedded PostgreSQL here; the `TEST_DATABASE_URL` path exists but has not been run on this machine (Docker was not running). |
| Rate limiting, request IDs, metrics, alerting on errors | Standard production hygiene; log lines are already structured JSON with per-phase timings. |
| Backups and restore drill, migration rollback plan | Required before real records are the only copy. |
| Next.js 15 upgrade and a security review | See the root README's known limitations. |
