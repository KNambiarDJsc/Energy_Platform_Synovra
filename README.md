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

For demos, always use the production server. In development mode Next.js compiles each route on its first visit, which makes sidebar clicks take several seconds; the production build switches pages in roughly 100–250 ms.

The demo database lives in the browser (in memory, mirrored to `localStorage` key `synovra-demo-db-v3`). Clear site data to reset it. The demo clock is fixed at **2026-10-13 05:00 UTC** so the seed stays consistent.

## Route map

| Route | Purpose | Who sees it |
| --- | --- | --- |
| `/` | Public landing page | everyone |
| `/signin` | Choose a demo role (no real authentication) | everyone |
| `/app/overview` | Fleet position, attention list | all roles |
| `/app/batteries`, `/app/batteries/[id]` | Register and the battery passport (10 tabs) | all roles, redacted for customers |
| `/app/scan?ref=` / `?label=` | QR/label lookup, then passport | all roles |
| `/app/intake` | Single registration, CSV import (preview → commit) | lab, engineer |
| `/app/tests` | Test sessions, evidence, engineering review | lab, engineer, others read-only |
| `/app/restoration` | Candidates, batches, attempts, review, batch economics | lab, engineer, finance |
| `/app/inventory` | Inventory groups and family summary | most roles |
| `/app/deployments` | Compatibility checks, assignment, overlap prevention, removal | field, engineer, NOC |
| `/app/monitoring` | Synthetic telemetry with measured / rule / model / unknown / stale labels | field, engineer, NOC, admin |
| `/app/alerts` | Alerts and service tasks (`?alert=`, `?tab=tasks`) | field, engineer, NOC, customer (read) |
| `/app/reports` | Six report templates, scope, period, watermark, approval | most roles |
| `/app/intelligence` | Demonstration model outputs with provenance | engineer, NOC, finance, admin |
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

- **Tokens** (Tailwind): navy/teal brand, neutral surfaces, semantic status colours (approved, pending, critical, info, muted) each with a 50/700 pair for text contrast.
- **Status is never colour alone**: every badge pairs an icon with a text label (`Badge.tsx`: lifecycle, test, approval, severity, alert state, data quality, warranty, freshness, value kind, synthetic tag).
- **Typography**: one sans family, tabular numerals for measurements, monospace for identifiers.
- **Tables** (`DataTable`): sortable columns, right-aligned numerics, columns hide by breakpoint, and below `md` the table renders as a card list.
- **Overlays**: modal becomes a bottom sheet on phones; drawers for record detail; Radix focus management.
- **Navigation**: sidebar on `lg+`, drawer menu below, and a bottom bar (Overview, Batteries, Alerts, More) on phones.
- **States**: loading skeletons, empty states with the next action, error and access-restricted states with plain-language messages.

### Data-model summary

Battery (identity, `publicRef`, aliases, retired refs) → family (rated values, chemistry) → test sessions and string tests (protocol revision, readings, evidence, status) → restoration attempts and batches (attempt belongs to the same battery identity; replacement creates a new one) → assignments (slot, dates, overlap-guarded) → telemetry summary → alerts and tasks → costs (nullable amounts; unknown ≠ zero) → warranty → recycling → evidence files → audit events (including corrections that keep the previous value). Predictions carry model name/version, input and prediction timestamps, uncertainty, applicability, source records and review state.

## Behaviour worth knowing

- **QR reference is a lookup key only.** Scanning it never grants access; the signed-in role decides what is shown.
- **Rule result ≠ approval.** A test can meet the placeholder threshold and still be unapproved. Only a person with the engineer role approves, and the reviewer cannot be the operator who recorded the test.
- **Unknown stays unknown.** Missing costs, mass, resistance and readings render as "Unknown" or "Not recorded" and are excluded from totals (totals are labelled as minimums).
- **Customer redaction** hides internal costs, margins, process notes, lot references and audit history, and the passport says what was withheld.
- **Assistant** is a scripted mock: it cites records, only drafts actions, requires confirmation, and refuses SQL, URLs, equipment control and cross-tenant requests.

## Test results (this build)

| Check | Result |
| --- | --- |
| `tsc --noEmit` | clean |
| `next lint` | no warnings or errors |
| Unit tests | 42 passed (2 files) |
| `next build` | succeeds, 19 pages |
| Playwright | 38 passed: 18 desktop flows at 1440 px, 5 mobile at 390 px, 15 accessibility audits |
| Accessibility | axe-core, WCAG 2.1 A/AA rules, zero violations on landing, sign-in, every app route, passport tabs, alert drawer and assistant |
| Page switch time | about 100–250 ms per sidebar click on the production build (measured in Chromium) |

E2E coverage: landing copy and banner, no unsupported claims, role switching, battery creation, duplicate-serial acknowledgement, CSV preview/commit and idempotent re-import, test review with required reason, lab-operator and administrator restrictions, customer redaction and blocked routes, finance costs with unknown values, alert acknowledgement, assistant boundaries and draft confirmation, unknown QR reference, deployment compatibility checks, empty/not-found states, intelligence labelling, and 390 px no-horizontal-scroll across every app route.

## What is synthetic or unconnected

| Area | State in this build | What a real integration needs |
| --- | --- | --- |
| Backend / database | Browser memory + `localStorage`; no server | API implementing `src/services/types.ts` (e.g. REST under `/api/v1`), a relational store, migrations, multi-user concurrency |
| Identity | Role picker; no passwords or tokens | OIDC/SSO, user provisioning, server-side authorisation (the service-layer rules are the specification) |
| Sensors / gateways | Generated telemetry; `sensorSerial` and mapping quality are fictional | Ingestion API, device registry, string/slot mapping verification, freshness rules from real cadence |
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
