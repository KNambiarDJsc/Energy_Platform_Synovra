# Where AI and ML fit, by version

Written for the Synovra technical team and whoever builds the models. It maps each AI/ML idea in the proposed scope (V1–V3 and Future) to the data it needs, the decision it supports, and the exact place it plugs into this codebase.

## The rule that applies to every version

Models and AI sit beside the battery record, never in the approval path.

- Engineers approve tests, qualification and deployment. A model output can be shown next to a decision; it can never make it. The service layer already enforces this: only `battery_engineer` can approve, and the reviewer must differ from the operator and the submitter.
- Every model output is stored with its model version, input time, uncertainty, applicability and source records, and starts in **shadow** mode.
- A model is shown as **validated** only after it passes the deployment gate below. The database refuses a `validated` model version without an evaluation report (`model_versions_validated_needs_evidence_ck`).
- No chemical recipes, safety procedures or equipment control, in any version.

## Integration point (already built)

```
PostgreSQL (V1 tables) ──read-only──▶ ML service (Python, separate process)
                                         │ trains, evaluates, scores
                                         ▼
                              model_versions + predictions tables
                                         │
API (read-only: GET /predictions, POST /predictions/{id}/review)
                                         │
Web app: Intelligence page and the passport "Model estimates" section (already render these fields)
```

The API cannot create or change predictions; it can only record a human's agree/disagree review (`server/src/db/snapshot.ts`). The ML service is a separate deployable with a database role that can read the operational tables and write only `model_versions` and `predictions`. It can be retrained, replaced or switched off without touching the platform.

Prediction contract (`server/src/db/schema.ts`):

| Field | Meaning |
| --- | --- |
| `model_version_id` | Registered model: name, version, status (`shadow`/`validated`/`retired`), baseline rule, training cohort, evaluation report |
| `kind` | `qualification_aid`, `capacity_estimate`, `failure_risk`, `warranty_risk`, `anomaly_detection`, `inventory_planning` |
| `battery_id` / `site_id` | What it is about |
| `input_at` ≤ `predicted_at` | Inputs must exist before the prediction (database check), so no future data leaks in |
| `output` | Label, value with unit, range. Never a bare score |
| `uncertainty`, `applicability` | Interval or calibration statement, and whether this battery is inside the model's supported scope |
| `source_record_ids`, `factors`, `inputs_used` | Which records were used, what drove the output, and what was not available |
| `review_state` | Unreviewed, agreed, disagreed: the feedback used to judge the model in shadow mode |

## V1: Individual passport (now)

**No predictive ML.** V1's job is to create the clean, labelled history every later model depends on. Shipping a model before that history exists would mean training on synthetic or inconsistent data.

What V1 already does instead (deterministic, explainable):

- Data-quality assessment per battery: missing fields, conflicts, possible duplicate identities (`src/domain/lifecycle.ts`).
- Threshold rule check on final tests, labelled as a rule result and never as an approval (`ruleCheck` in `src/services/core.ts`).
- Import validation: unit mix-ups, impossible dates, near-duplicate serials go to quarantine.

ML-relevant work to do in V1, because it decides whether V3 is possible:

1. **Record outcomes as structured labels.** Rejection and rework reasons are free text today. Add reason codes agreed with engineering, for example below threshold, physical damage or failed inspection, so that "not qualified" can become a training label.
2. **Keep decision-time inputs.** Every test already records conditions, instrument and timestamps. Keep it that way, and never overwrite results: corrections are new events, which the database enforces.
3. **Track the battery unit consistently** (12V block vs 2V cell vs string). String-level results are already kept separate, so they never become a per-battery label.

Optional AI assist in V1 (decide with the Synovra team): **document-field extraction**. A language model reads supplier datasheets or scanned test reports and proposes field values for the existing CSV import preview. A person confirms every row; rows the model is unsure about go to quarantine. This removes typing work without the model deciding anything. It needs a decision on sending documents to a model provider, which affects data handling and cost.

## V2: Connected operations

**Rules first, statistics second, ML last.**

| Stage | What | Labelled as | Plugs into |
| --- | --- | --- | --- |
| 1 | Approved alert rules: voltage and temperature limits, missing-data and stale-gateway flags, defined with the technical team | `rule` | Alerts (V2 API), monitoring views |
| 2 | Simple statistical flags: a battery drifting from its string-peer median, or a rising resistance trend | `rule` (documented formula) | Already visualised: the passport's string-peer chart |
| 3 | Anomaly/data-quality model, only once inspections confirm or refute flags | `model_estimate`, shadow | `predictions` with `kind = anomaly_detection` |

Confirmed inspection findings are the labels for stage 3. Without them, an anomaly model cannot be evaluated. Sensor readings are never presented as measured capacity.

## V3: Validated AI/ML

Pick the first task based on which labels exist in enough volume. Agree the minimum with engineering before training; until then the rule stays in place.

| Application | Target (label) | Inputs at decision time | Baseline to beat | Suggested model | Where it shows | Decision it supports |
| --- | --- | --- | --- | --- | --- | --- |
| Restoration qualification | Attempt approved vs rejected/rework | Intake inspection, initial test (OCV, internal resistance, capacity % of rated), family, age, source, batch | Engineer's current intake rule (e.g. initial capacity % cut-off) | Logistic regression, then gradient-boosted trees with calibration | Restoration candidates list (priority) and passport | Processing order: which batteries to attempt first. Not qualification. |
| Capacity / backup estimate | Measured capacity from a reference test under stated conditions | Voltage, internal resistance, temperature, load and charge context | Rated capacity times last approved test % | Regression with prediction intervals (quantile models or conformal) | Passport, labelled as estimate with range | When to schedule a reference test |
| Warranty / failure risk | Time to failure or removal; batteries still running are censored, not "fine" | Qualification results, deployment dates, site, string position, service history, telemetry summaries (V2) | Kaplan-Meier by family / age band | Cox proportional hazards or survival forests | NOC and warranty views | Inspection priority within a stated future window |
| Condition / data-quality flags | Confirmed inspection findings | Calibrated readings, operating state | V2 rules | Classifier on rule features | Alerts, labelled model | Which flags deserve a site visit |

Evaluation, which is required before anything leaves shadow mode:

- **Split by group, not by row.** Hold out whole batteries, whole batches and later time periods, and sites where relevant. Random row splits leak the same battery into training and test.
- Report error, calibration, false alarms and missed events **per battery family and application**, and flag unsupported cases (`applicability.inScope = false`).
- Compare against the baseline rule on the same held-out data. If it does not beat the rule, keep the rule.
- Run in shadow mode on live records. Use the agree/disagree reviews and later outcomes to confirm.

**Deployment gate (shadow → validated):** an evaluation report on held-out groups, beats the baseline, calibrated uncertainty, per-family results, documented failure modes, and written sign-off from the engineering owner. The report reference is stored on the model version, and the database will not accept `validated` without it.

Public battery datasets and research toolkits are useful for experiments. They do not validate a model for this fleet.

## Future platform

| Area | Technique | Note |
| --- | --- | --- |
| Inventory and maintenance forecasting | Time-series forecasting (start with seasonal baselines) | Needs months of deployment and service history |
| Lab, crew and stock scheduling | Constrained optimisation (e.g. OR-Tools), not ML | Inputs: lab capacity, qualified stock, committed orders, travel |
| Restoration / field-outcome comparison | Cohort comparison with like-for-like controls | Answers "does restored stock last as long?" honestly; needs comparison cohorts |
| Assistant | Language model with read-only, role-scoped tools; cites records; drafts only, and a person confirms every write | The UI and its boundaries exist today as a scripted mock. A real one runs server-side with the caller's permissions and no free-form SQL, URLs or equipment control. |
| Document extraction at scale | Language model plus human review | Extends the V1 option to warranty claims and recycling certificates |

Each one should answer a named workload or commercial question from the scope (cost per qualified battery, processing spent on failed attempts, inventory days, warranty cost, reporting effort), not be added because it uses AI.

## Next concrete steps

1. With engineering: agree rejection and rework reason codes, and add them to the test-review and restoration-decision forms (V1).
2. Add read-only point-in-time feature views, starting with one row per restoration attempt holding only data recorded before the attempt started, plus a database role for the ML service (V3 preparation, small).
3. Once enough attempts are decided: build the restoration-qualification baseline and logistic model offline, write the evaluation report, and register version `0.1.0` in shadow mode.
