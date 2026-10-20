# Synovra Battery Intelligence Platform — demonstration

A front-end demonstration of a lead-acid battery lifecycle platform: intake → testing → restoration → qualification → inventory → deployment → monitoring → warranty → recycling, with a **battery passport** as the central record.

> **Synthetic demonstration data. No live customer, cloud or sensor connection.**
> Every record, name, reading and prediction in this build is generated locally. Nothing here is a real customer, a real saving, a certification or a validated model result.

## Run it

```bash
npm install
npm run build && npm start   # demo at http://localhost:3000 — use this for showing the product
npm run dev                  # development only; compiles each page on first visit (slow first clicks)
npm run typecheck
npm run lint
npm test                     # unit tests (Vitest)
npx playwright install chromium   # first time only
npm run test:e2e             # builds into .next-e2e and serves on :3100; safe while dev/start is running
```

### Run the whole stack

```bash
docker compose -f deploy/compose.yml up -d --build   # PostgreSQL, object storage, API, web, proxy
node deploy/smoke.mjs http://localhost:8088           # end-to-end check through the public address
```

Open `http://localhost:8088` (set `SYNOVRA_PORT` to change it). This uses dev sign-in and demo data; see `docs/architecture.md` ("The deployable stack", "Pluggability: the seams") for what to change for a pilot. CI (`.github/workflows/ci.yml`) runs lint, types, unit, API (PGlite and PostgreSQL), Python, browser and this stack check.

For demos, always use the production server. In development mode Next.js compiles each route on its first visit, which makes sidebar clicks take several seconds; the production build switches pages in roughly 100–250 ms.

The demo database lives in the browser (in memory, mirrored to `localStorage` key `synovra-demo-db-v4`). Clear site data to reset it. The demo clock is fixed at **2026-10-13 05:00 UTC** so the seed stays consistent.

## Route map

| Route | Purpose | Who sees it |
| --- | --- | --- |
| `/` | Public landing page | everyone |
| `/signin` | Choose a demo role (no real authentication) | everyone |
| `/app/overview` | Fleet position, attention list | all roles |
| `/app/batteries`, `/app/batteries/[id]` | Register; each battery opens on a deep dive (illustration, five lenses, vitals with provenance, what changed since your last visit) above the full passport (10 tabs). `?lens=` and `?tab=` are kept in the address | all roles, redacted for customers |
| `/app/scan?ref=` / `?label=` | QR/label lookup, then passport | all roles |
| `/app/intake` | Single registration, CSV import (preview → commit) | lab, engineer |
| `/app/tests` | Test sessions, evidence, engineering review | lab, engineer, others read-only |
| `/app/restoration` | Candidates, batches, attempts, review, batch economics | lab, engineer, finance |
| `/app/inventory` | Inventory groups and family summary | most roles |
| `/app/deployments` | Compatibility checks, assignment, overlap prevention, removal | field, engineer, NOC |
| `/app/monitoring` | Synthetic telemetry with measured / rule / model / unknown / stale labels | field, engineer, NOC, admin |
| `/app/alerts` | Alerts and service tasks (`?alert=`, `?tab=tasks`) | field, engineer, NOC, customer (read) |
| `/app/reports` | Six report templates, scope, period, watermark, approval | most roles |
| `/app/intelligence` | Data collection pipeline (default), data sources, the learning loop, model outputs, read-only agents and machine connections (`?view=`) | engineer, NOC, finance, admin |
| `/app/admin` | Users, mappings, templates, audit | administrator |

Roles: Lab operator, Battery engineer, Field technician, NOC/service manager, Finance/business owner, Customer/auditor, Platform administrator. Permissions are enforced in the **service layer** (`src/services/core.ts`, `authorize()`), not only by hiding navigation. Denied attempts are written to the audit log.

## Architecture

```
src/domain      types, permissions, lifecycle state machine, Zod schemas, CSV parsing   (pure, no I/O)
src/data        seed generator and in-browser store (overlap guard, audit, persistence)
src/services    typed service interfaces + mock implementations (the integration boundary)
src/components  ui primitives, app shell, passport parts
src/app         Next.js App Router pages (client components over TanStack Query)
tests/unit      Vitest: services, RBAC, seed integrity
tests/e2e       Playwright: desktop 1440 and mobile 390
```

UI code only calls the interfaces in `src/services/types.ts`. Swapping `createServices(store, getActor)` for HTTP clients is the intended replacement point. No part of the UI imports the store directly.

### Design system summary

- **Tokens** (Tailwind): a warm canvas and ink; copper for actions, links and attention; patina teal for information and data; night for the few dark surfaces; semantic status colours (approved, pending, critical, info, muted) each with a 50/700 pair. Every text pairing is at least 4.5:1.
- **Status is never colour alone**: every badge pairs an icon with a text label (`Badge.tsx`: lifecycle, test, approval, severity, alert state, data quality, warranty, freshness, value kind, synthetic tag).
- **Typography**: a serif (Newsreader) for titles and the figure a person reads first, with its unit set smaller; Inter for data, tables and controls; tabular numerals for measurements; slashed zeros for identifiers.
- **Tables** (`DataTable`): sortable columns, right-aligned numerics, columns hide by breakpoint, and below `md` the table renders as a card list.
- **Overlays**: modal becomes a bottom sheet on phones; drawers for record detail; Radix focus management.
- **Navigation**: sidebar on `lg+`, drawer menu below, and a bottom bar (Overview, Batteries, Alerts, More) on phones.
- **States**: loading skeletons, empty states with the next action, error and access-restricted states with plain-language messages.

### Data-model summary

Battery (identity, `publicRef`, aliases, retired refs) → family (rated values, chemistry) → test sessions and string tests (protocol revision, readings, evidence, status, reason code when rejected or sent back) → restoration attempts and batches (attempt belongs to the same battery identity; replacement creates a new one; rework and rejection carry a reason code) → assignments (slot, dates, overlap-guarded) → telemetry summary → alerts and tasks → costs (nullable amounts; unknown ≠ zero) → warranty → recycling → evidence files → audit events (including corrections that keep the previous value). Predictions carry model name/version, input and prediction timestamps, uncertainty, applicability, source records and review state.

## Documentation

| Document | For |
| --- | --- |
| `docs/architecture.md` | Components, workflow, data boundaries, deployment, ML and agent operations, threat model, known unknowns |
| `docs/ML_PLAN.md` | Which models, on which labels, by version; learning versus unlearning; compute |
| `docs/customer-ux-data-map.md` | Every item the customer demo shows, mapped to its field, unit, source, scope, timing, checks and whether it is real, synthetic or a future dependency |
| `docs/customer-ux-alignment.md` | The customer-experience vision and the data strategy mapped onto the prototype: built, partial, deliberately not built, and what data unlocks the rest |
| `docs/pilot-readiness.md` | The pilot plan's acceptance criteria checked against the code: built, partial, gap |
| `docs/research/papers.md` | What the battery and agent research supports here, and what it does not; unverified citations listed separately |
| `docs/research/datasets.md` | Public datasets, their licences, and the rule that they never enter Synovra's records |
| `ml/README.md` | The training pipeline, its readiness gate, registration, and the public OPzS benchmark |
| `docs/API_ADAPTER.md`, `server/README.md` | API contract, server setup and operations |

## Behaviour worth knowing

- **QR reference is a lookup key only.** Scanning it never grants access; the signed-in role decides what is shown.
- **Rule result ≠ approval.** A test can meet the placeholder threshold and still be unapproved. Only a person with the engineer role approves, and the reviewer cannot be the operator who recorded the test.
- **Outcomes say why.** Rejecting or sending back a test, and rejecting or reworking a restoration attempt, needs a reason code as well as a written reason. The batch panel and batch report count them; they are the training labels in `docs/ML_PLAN.md`. The codes are a placeholder list until engineering agrees the final one (`src/domain/outcomes.ts`).
- **Every value says where it came from.** On the deep dive each figure carries its source: simulated, measured, stale, tested on a date, inferred, or not measured. Ambient temperature, current and state of charge are shown as not measured because nothing measures them. There is no health or plate-health score.
- **The illustration is not the battery.** It is drawn for the unit type (12 V block or 2 V cell). Its tint follows the one measured block temperature; cell temperatures are not measured.
- **Revive, test or recycle is arithmetic you can see.** The route calculator (deep dive → Outlook) prefills what the records hold, says where each number came from, and suggests nothing until the missing inputs are entered. No sale price is recorded anywhere, so a person always enters one. The chance of reaching a saleable grade is an observed family rate with its sample size, not a prediction.
- **One question box, four capabilities.** Intelligence → Agents → Ask the analyst routes a question to data quality, battery evidence, recovery decision or process learning. It lists the tools it called, cites the records, and says "the records cannot answer this yet" when that is the truth.
- **Money in is recorded per battery.** Sales, fees and recycler settlements live next to costs (Costs and value tab; finance records them). They are never edited, amounts stay out of the timeline, and the demo figures are invented. Contribution per battery and cost-versus-value are calculated from them.
- **Bench results arrive by CSV too.** Intake → Import bench results checks every row against its battery, quarantines doubtful rows with the reason (a capacity in mAh, a missing calibration, an unknown battery), and submits the rest as tests for an engineer's review. Never approved on import.
- **An agent on a local model.** Intelligence → Agents can run a goal on a model served by Ollama on this machine. It plans read-only look-ups, shows each one, and flags any number it wrote that no tool returned. Without Ollama, the rule-based analyst still answers.
- **Agents read, cite and stop.** The three agents on Intelligence are fixed rules that read the records you may see, cite them and list what is missing. They cannot write, control equipment or decide a battery's route.
- **Unknown stays unknown.** Missing costs, mass, resistance and readings render as "Unknown" or "Not recorded" and are excluded from totals (totals are labelled as minimums).
- **Customer redaction** hides internal costs, margins, process notes, lot references and audit history, and the passport says what was withheld.
- **Assistant** is a scripted mock: it cites records, only drafts actions, requires confirmation, and refuses SQL, URLs, equipment control and cross-tenant requests.

## Test results (this build)

| Check | Result |
| --- | --- |
| `tsc --noEmit` | clean |
| `next lint` | no warnings or errors |
| `next build` | succeeds, 19 pages |
| Unit and server tests | 73 unit (6 files), 88 server (9 files) and 11 Python evaluation tests, on embedded PostgreSQL and on real PostgreSQL 16.4 in Docker, including the route arithmetic, the analyst's routing and "cannot answer" cases, the ML views, the ML role's permissions, and a check that the app and the database count the same training rows |
| Playwright | 53 passed: 28 desktop flows at 1440 px, 5 mobile at 390 px, 20 accessibility audits |
| Accessibility | axe-core, WCAG 2.1 A/AA rules, zero violations on landing, sign-in, every app route and Intelligence view, every passport tab and deep-dive lens, alert drawer and assistant. Audits wait for transitions to settle before measuring contrast |
| Page switch time | about 100–250 ms per sidebar click on the production build (measured in Chromium) |

E2E coverage: landing copy and banner, no unsupported claims, role switching, battery creation, duplicate-serial acknowledgement, CSV preview/commit and idempotent re-import, test review with required reason, reason codes required for test rework and restoration rework (and counted on the batch), lab-operator and administrator restrictions, customer redaction and blocked routes, finance costs with unknown values, alert acknowledgement, assistant boundaries and draft confirmation, unknown QR reference, deployment compatibility checks, empty/not-found states, intelligence labelling, and 390 px no-horizontal-scroll across every app route.

## What is synthetic or unconnected

| Area | State in this build | What a real integration needs |
| --- | --- | --- |
| Backend / database | Browser memory + `localStorage`; no server | API implementing `src/services/types.ts` (e.g. REST under `/api/v1`), a relational store, migrations, multi-user concurrency |
| Identity | Role picker; no passwords or tokens | OIDC/SSO, user provisioning, server-side authorisation (the service-layer rules are the specification) |
| Sensors / gateways | Generated telemetry; `sensorSerial` and mapping quality are fictional | Ingestion API, device registry, string/slot mapping verification, freshness rules from real cadence |
| Chargers and test machines (Modbus RTU/TCP) | A connector design screen marked not connected, and an in-browser simulator with its own register map; simulated readings are not stored | Authorised access, connection settings, the manufacturer's register map, and a dated battery-to-channel mapping |
| Cloud (Synovra's sensor cloud) | Not connected, no assumptions about its API | Agree the readings, device and alert contracts; replace `services/mock/telemetry.ts` and `alerts.ts` |
| Models | Rule-based placeholder outputs labelled "Demonstration output — not validated for production decisions." | Model registry, validation evidence, shadow-mode evaluation before any decision use |
| File storage | Evidence "files" are metadata only | Object storage, virus scan, retention |
| Notifications / email | None | Delivery service, escalation policy |
| Customers, savings, certifications | None invented | Real customer records and any claims supported by evidence |
| Test protocol and 85% threshold | **Placeholder**, labelled as demo criterion | Customer/standard-approved protocol and acceptance criteria owned by engineering |
| Reports | Generated in the browser, watermarked, not legally controlled documents | Server-side rendering, signed storage, approval records |
| Manufacturer names | Fictional and marked "(fictional)" | Real catalogue |

## Known limitations

- Single-browser state: two people cannot see each other's changes.
- Restoration yield in the seed is high because it is generated; it is labelled synthetic and must not be read as a performance claim.
- The reference documents use different product naming; this build uses "Synovra Battery Intelligence" per the brief and intentionally does not reproduce internal annex numbers.
- Accessibility is covered by automated axe checks (WCAG 2.1 AA) and keyboard flows; a manual screen-reader pass with real assistive-technology users has not been done.
- `npm audit` still reports advisories against Next.js 14.x (self-hosted image optimizer, rewrites, RSC DoS). This demo uses no image optimizer, rewrites or server data fetching, and the fixes are only in Next 15+/16, which is a major upgrade not done here. Do not host this build as a public production service without that upgrade.
