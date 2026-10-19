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
| `LLM_PROVIDER` | `ollama` | Where the agent's model runs: `ollama` (this machine) or `openai` (any OpenAI-compatible server). |
| `OLLAMA_URL`, `OLLAMA_MODEL` | `http://localhost:11434`, first suitable installed model | For `LLM_PROVIDER=ollama`. |
| `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` | — | For `LLM_PROVIDER=openai`. Tool results, which contain record contents, are sent to this URL. |
| `BENCH_PROFILES_FILE` | unset | JSON array of extra bench export layouts (see `src/domain/benchProfile.ts`). An invalid file stops start-up. |
| `RATE_LIMIT_PER_MINUTE`, `RATE_LIMIT_WRITES_PER_MINUTE`, `RATE_LIMIT_ANONYMOUS_PER_MINUTE` | `600`, `120`, `60` | Per-user and anonymous limits; raise them only to load-test. |

### Measuring scale

```bash
DATABASE_URL=postgres://… npx tsx server/scripts/scale-seed.ts 5000   # into an empty throwaway database
node server/scripts/load-test.mjs http://localhost:4100 6             # one at a time, then 8 at once
```

Results and the limits found are in `docs/architecture.md`, "What was measured, and where it stops".

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
- **Database rules underneath** (`src/db/schema.ts`, `drizzle/`): one open assignment per slot and per battery, one restoration attempt in progress per battery, battery- vs string-level tests exclusive, an approved test's reviewer differs from its operator and submitter, a rejected or reworked test or attempt has a reason code, money is NULL or non-negative, a validated model needs an evaluation report, and lifecycle events and the audit log are append-only (triggers).
- **Writers are serialised** with a transaction-scoped advisory lock, so two people racing for one slot get one success and one 409. Readers use a consistent snapshot and never wait.
- **Refused requests are audited.** A denied or invalid action still commits its audit entry; nothing else from a failed request is written.
- **Record cache.** Each request needs the V1 tables. They are cached in process and reused while the `data_version` counter (bumped by every write, in the same transaction) is unchanged, so several API instances behind a load balancer stay consistent.

Measured on this machine (embedded PGlite on disk, synthetic seed of about 950 records): reads 50–120 ms, writes about 350 ms. A real PostgreSQL server is faster. Each request currently works on the whole record set, which suits a pilot (hundreds to low thousands of batteries). When volumes grow, move the hot reads (register list, passport, overview) to dedicated SQL queries behind the same endpoints; the HTTP contract does not change.

## API

All routes are under `/api/v1`; the full list is in `src/app.ts` and `docs/API_ADAPTER.md`. The browser adapter in `src/services/http` calls exactly these routes, and `tests/adapter.test.ts` checks them against each other.

Not served yet, on purpose: monitoring/telemetry, alerts and tasks (V2, needs the sensor and cloud contract) and the assistant (V3). Those routes answer `404 FEATURE_DISABLED` and the UI hides those areas in HTTP mode.

## ML data access

The ML service never reads the operational tables. Migrations create two read-only views for it (`drizzle/0005_ml_views.sql`):

- `ml_restoration_attempt_features`: one row per restoration attempt. Features come only from records that existed when the attempt started; labels are the decision, its reason code and the approved after-test.
- `ml_model_review_flags`: model versions to review because a battery they were trained on was corrected, or because new attempts have a family, protocol revision or instrument the model never saw.

Give the service its database role once per environment, as an administrator:

```bash
psql "$ADMIN_DATABASE_URL" -f server/sql/ml_service_role.sql
psql "$ADMIN_DATABASE_URL" -c "CREATE ROLE synovra_ml_service LOGIN PASSWORD '…' IN ROLE synovra_ml"
```

The role reads only those views and can only insert model versions, their training records (`model_training_records`) and predictions. See `docs/ML_PLAN.md`.

## Tests

```bash
npm run test:server                       # embedded PostgreSQL, about 40 s
TEST_DATABASE_URL=postgres://synovra:synovra-local-only@localhost:5432/synovra npm run test:server   # real PostgreSQL (docker compose up db)
```

`api.test.ts` mirrors the behavioural spec in `tests/unit/services.test.ts` over HTTP and adds persistence, authentication, audit of refused requests, concurrent writers, cache invalidation and the database rules. `pilot.test.ts` covers pilot mode and bootstrap. `ml.test.ts` covers the ML views (no future data in features), the review flags and the ML role's limits. `adapter.test.ts` runs the browser adapter against the routes.

## Operations

```bash
npm run db:generate      # after editing src/db/schema.ts: writes a new SQL migration to server/drizzle
npm run db:migrate       # applies pending migrations (the server also does this on start)
npm run db:seed          # demo mode only: load the synthetic seed (add -- --force to replace data)
```

## Not done yet (before a production pilot)

| Item | Why it matters |
| --- | --- |
| OIDC against a real identity provider | The API verifies OIDC tokens and the web app has the Authorization Code + PKCE redirect (`src/services/http/oidc.ts`, `src/app/auth/callback`). Both are tested against a mock provider only. |
| Evidence retention and a real malware scanner | Uploads are size- and type-checked, checksummed (SHA-256) and stored by content address; the scanner is a hook (`EVIDENCE_SCAN=none` by default). Retention rules are not set. |
| Run against real PostgreSQL in CI | The server tests pass on PostgreSQL 16.4 in Docker (`TEST_DATABASE_URL`, run by hand). Not yet in CI. |
| Production observability | Request IDs, rate limits, Prometheus metrics and error alerts exist; they need wiring to Synovra's monitoring. |
| Backups and restore drill, migration rollback plan | Not done. Required before real records are the only copy. |
| Security review | Not done. |
| Next.js 15 upgrade and a security review | See the root README's known limitations. |
