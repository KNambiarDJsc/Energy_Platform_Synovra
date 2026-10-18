# API adapter: from the in-browser mock to a real backend

**Status:** proposal. None of the endpoints below exist yet. This document maps every call the UI makes today to a suggested HTTP endpoint, so a backend (for example FastAPI + PostgreSQL + object storage + OIDC) can be built against a fixed contract and swapped in without touching page code.

## How the swap works

All UI data access goes through `getServices()` in `src/services/index.ts`, which returns the `Services` object typed in `src/services/types.ts`. Pages never touch the store.

1. Write `src/services/http/*.ts` implementing each interface with `fetch` calls (same method names and return types).
2. Return those from `createServices` (or a new `createHttpServices`) behind a flag such as `NEXT_PUBLIC_DATA_SOURCE=http`.
3. Keep `src/services/mock/*` for tests and offline demos. `tests/unit/services.test.ts` is the behavioural specification the real API must satisfy.

## Rules the backend must enforce (not the browser)

These are enforced today in `src/services/core.ts` and the mock repositories. In production the browser checks are only for display; the server is the authority.

- **Authorisation per call** — `authorize(ctx, permission)` with the role → permission map in `src/domain/permissions.ts`; tenant and site scoping on every read and write; denied attempts written to the audit log.
- **Separation of duties** — the engineer who approves a test or restoration attempt cannot be the operator who recorded it. Administrators cannot approve qualification.
- **Rule result ≠ approval** — the threshold check is advisory; only an explicit human approval with a reason changes state.
- **Lifecycle transitions** — only those allowed by `src/domain/lifecycle.ts`.
- **Assignment overlap** — no two open assignments for the same slot or battery (`insertAssignment`). Use a database exclusion constraint, not only application code.
- **Idempotent import** — a file whose content hash has been committed before creates nothing.
- **Unknown is not zero** — nullable money and measurements stay `null` end to end.
- **Corrections keep history** — store previous and new value with actor, time and reason.
- **Outcomes say why** — rejecting or sending back a test, and rejecting or reworking a restoration attempt, needs a reason code as well as the written reason. The code is the training label (`docs/ML_PLAN.md`).
- **Customer redaction** — remove costs, process notes, lot references and audit history server-side; never send and hide.
- **QR reference is a lookup key** — lookups return a battery id only if the caller is already allowed to see it.

## Endpoint map (proposed)

All paths under `/api/v1`. Bearer token from the identity provider; tenant from the token, never from the request body.

### Batteries — `BatteryRepository`
| Method | Proposed endpoint |
| --- | --- |
| `list(filters)` | `GET /batteries?q=&state=&site=&quality=&manufacturer=` |
| `facets()` | `GET /batteries/facets` |
| `get(id)` | `GET /batteries/{id}/passport` |
| `lookupByPublicRef(ref)` | `GET /lookup?ref=` |
| `create(input)` | `POST /batteries` (returns warnings, e.g. possible duplicate) |
| `correct(input)` | `POST /batteries/{id}/corrections` |
| `reissueLabel(id, reason)` | `POST /batteries/{id}/labels:reissue` |
| `exportCsv(ids)` | `GET /batteries/export.csv?ids=` |
| `families()` | `GET /battery-families` |

### Imports — `ImportService`
| `templates()` | `GET /import-templates` |
| --- | --- |
| `preview({fileName,text,templateId})` | `POST /imports` (multipart upload → job in `previewed` state) |
| `commit(jobId)` | `POST /imports/{id}:commit` |
| `list()` | `GET /imports` |

### Tests — `TestRepository`
| `list(filter)` / `get(id)` | `GET /tests?status=&batteryId=` / `GET /tests/{id}` |
| --- | --- |
| `protocols()` | `GET /test-protocols` |
| `create(input)` | `POST /tests` |
| `submit` / `startReview` | `POST /tests/{id}:submit` / `POST /tests/{id}:start-review` |
| `approve` / `reject` / `requestRework` | `POST /tests/{id}:approve` (body: `reason`) etc. `reject` and `requestRework` also need `reasonCode` (`src/domain/outcomes.ts`) |
| `attachEvidence(id, file)` | `POST /tests/{id}/evidence` (upload to object storage, store metadata + hash) |

### Restoration — `RestorationRepository`
| `batches()` / `batchResults(id)` | `GET /restoration/batches` / `GET /restoration/batches/{id}/results` |
| --- | --- |
| `economics(id, scenario)` | `POST /restoration/batches/{id}/economics` (scenario is user input; never stored as fact) |
| `attempts(filter)` | `GET /restoration/attempts?batchId=&batteryId=&status=` |
| `markCandidate(batteryId, reason)` | `POST /batteries/{id}:mark-restoration-candidate` |
| `createAttempt` / `addNote` / `addEvidence` | `POST /restoration/attempts`, `POST /restoration/attempts/{id}/notes`, `.../evidence` |
| `submitForReview` / `decide` | `POST /restoration/attempts/{id}:submit`, `POST /restoration/attempts/{id}:decide` (body: `decision`, `reason`, and `reasonCode` for rework or rejection) |

### Deployments — `DeploymentRepository`
| `inventory()` / `deployable()` | `GET /inventory`, `GET /inventory/deployable` |
| --- | --- |
| `sites()` | `GET /sites?include=slots` |
| `validate(input)` | `POST /assignments:validate` (compatibility checks, no write) |
| `move` / `reserve` / `returnFromSite` | `POST /assignments`, `POST /reservations`, `POST /assignments/{id}:close` |

### Telemetry — `TelemetryRepository` (the Synovra cloud and sensor platform)
| `gateways()` / `sensors()` | `GET /gateways`, `GET /sensors` |
| --- | --- |
| `series(batteryId, metric, range)` | `GET /telemetry/series?batteryId=&metric=&from=&to=` |
| `summary(batteryId)` / `stringPeers` | `GET /telemetry/batteries/{id}/summary`, `GET /telemetry/strings/{id}/peers` |
| `fleet()` / `snapshotAt()` | `GET /telemetry/fleet` (response carries `snapshotAt`) |

Every reading must carry a **value kind** (`measured`, `rule`, `model_estimate`, `unknown`) and a timestamp, so the UI can keep showing stale and inferred data honestly. Sensor-to-slot mapping needs its own verified/unverified state.

### Alerts and tasks — `AlertRepository`
| `list` / `get` | `GET /alerts`, `GET /alerts/{id}` |
| --- | --- |
| `acknowledge` / `assign` / `start` / `resolve` / `close` | `POST /alerts/{id}:acknowledge` etc. |
| `tasks` / `createTask` / `updateTask` | `GET /tasks`, `POST /tasks`, `PATCH /tasks/{id}` |
| `confirmDraft(draftId)` | `POST /drafts/{id}:confirm` |
| `assignees()` | `GET /users?assignable=true` |

### Intelligence — `PredictionRepository`
| `list()` | `GET /predictions` (each with model name/version, input and prediction time, uncertainty, applicability, source record ids, review state) |
| --- | --- |
| `review(id, decision, reason)` | `POST /predictions/{id}:review` |

### Insights — `InsightsRepository`

| Method | Endpoint |
| --- | --- |
| `dataSources()` | `GET /insights/data-sources` (each source's status: in use, simulated, not connected or reference only; record counts and data-quality issues) |
| `learning()` | `GET /insights/learning` (restoration attempts on their way to training rows, exclusions with reasons, label mix, row fingerprint) |
| `recovery()` | `GET /insights/recovery` (needs `report.internal`; costs only with `cost.read`; a figure without verified inputs is `not_calculated`) |
| `runAgent(kind, { batteryId, periodDays })` | `GET /insights/agents/{data_steward,battery_investigator,recovery_decision,recovery_analyst}?batteryId=&periodDays=` (read-only; findings cite records) |
| `routeInputs(batteryId)` | `GET /batteries/{id}/route-inputs` (prefilled calculator inputs, each with its source; costs only with `cost.read`) |
| `ask(question, { batteryId })` | `POST /insights/ask` (routes to one capability; returns the tools called, the report, and whether the records were insufficient; the question is audited) |

### Reports — `ReportRepository`
| `templates` / `scopes` | `GET /report-templates`, `GET /report-scopes` |
| --- | --- |
| `list` / `get` | `GET /reports`, `GET /reports/{id}` |
| `generate(input)` | `POST /reports` (server renders, watermarks, stores evidence refs) |
| `approve(id, reason)` | `POST /reports/{id}:approve` |
| `exportCsv(id)` | `GET /reports/{id}/export.csv` |

### Assistant — `AssistantService`
| `ask(prompt, context)` | `POST /assistant/ask` — server-side, tool-restricted, read-only queries scoped to the caller; returns cited record ids and optional drafts |
| --- | --- |
| `confirmDraft(id)` | `POST /drafts/{id}:confirm` — the only path from assistant output to a write |

No free-form SQL, no URLs, no equipment control and no cross-tenant reads, regardless of the model used.

### Administration and overview
| `AdminRepository.users / tenants / sites / families / protocols / sensorMappings / importTemplates / notifications` | `GET /admin/...` |
| --- | --- |
| `setNotification` / `setUserActive` | `PATCH /admin/notifications/{id}`, `PATCH /admin/users/{id}` |
| `audit(filter)` | `GET /audit-events?entity=&actor=&from=&to=` |
| `resetDemo()` | demo only — **do not implement** in production |
| `OverviewRepository.get()` | `GET /overview` |

## Error contract

The mock throws `ForbiddenError`, `NotFoundError`, `ConflictError` and `ValidationError` (defined in `src/domain/permissions.ts`). Map them to HTTP 403, 404, 409 and 422 with `{ "error": { "code", "message", "details" } }`, and have the HTTP adapter re-throw the same classes so `errorMessage()` and the toasts keep working unchanged.
