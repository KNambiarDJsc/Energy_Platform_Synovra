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
PostgreSQL (V1 tables)
        │ ml_* views: read-only, point in time        server/drizzle/0005_ml_views.sql
        ▼
ML service (Python, separate process, role synovra_ml)
        │ trains, evaluates, scores
        ▼
model_versions + model_training_records + predictions  (INSERT only)
        │
API (read-only: GET /predictions, POST /predictions/{id}/review)
        │
Web app: Intelligence page and the passport "Model estimates" section (already render these fields)
```

The API cannot create or change predictions; it can only record a human's agree/disagree review (`server/src/db/snapshot.ts`). The ML service is a separate deployable. Its database role (`server/sql/ml_service_role.sql`) reads only the `ml_*` views, not users, costs, evidence, audit or any operational table. It can only insert into `model_versions`, `model_training_records` and `predictions`, and cannot update or delete anything, so it cannot promote its own model to `validated` or rewrite a prediction after a person has reviewed it. `server/tests/ml.test.ts` checks these limits. The service can be retrained, replaced or switched off without touching the platform.

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

Training lineage (`model_training_records`): one row per record a model version was trained on (`record_kind`, `record_id`, and the `battery_id` it belongs to). The ML service writes these when it registers a version. They make corrections and withdrawals traceable to models (next section).

## Learning, adapting and unlearning

"Learning" covers four different things here. Only the first three are in scope.

| Capability | What it means here | Where it lives |
| --- | --- | --- |
| Learn about each battery | New tests, attempts, decisions, deployments and returns are added to the battery's record. Nothing is overwritten: a correction is a new event that keeps the previous value. | `battery_events` (append-only, enforced by trigger), `tests`, `restoration_attempts` |
| Learn across batteries | Compare outcomes by family, intake condition, lot and protocol, then train models on the same rows. Rejection and rework carry a reason code, so "not qualified" says why. | `ml_restoration_attempt_features`; "Why attempts did not qualify" on the Restoration page and in the batch report |
| Notice when patterns change | A model is flagged for review when an attempt arrives from a family, before-test protocol revision or instrument it never saw in training, or when a battery it learned from has its serial or manufacture date corrected. The flag goes to a person; nothing retrains or retires itself. Drift in outcome rates (for example reject rate per family) is the ML service's monitoring job, reported in its per-family evaluation. | `ml_model_review_flags` |
| Remove a record's influence | Retrain without the record, register the new version in shadow, and retire the old one once the replacement passes the gate. `model_training_records` lists every version that used the record. Trained models are never edited in place, and the platform does not claim certified "machine unlearning": that is a separate research problem with open verification questions, and ordinary corrections do not need it. | `model_training_records`, `model_versions.status = 'retired'` |

The same steps apply when a record has to be withdrawn, for example the wrong battery, a data-sharing request, or evidence found to be invalid. Removing a record from the operational history itself is a retention-policy decision that has not been made yet; the history is append-only by design.

The point-in-time view `ml_restoration_attempt_features` has one row per restoration attempt:

- **Features**: only what was recorded before the attempt started (`features_as_of`): battery family and rating, age, the lot references entered when the attempt opened, the number of earlier attempts, and the before-test readings, protocol and instrument. A before-test approved only after the attempt started is dropped, not used.
- **Labels** (`label_*`): the decision (`approved`, `rejected`, `rework`), its reason code, and the approved after-test as a percentage of rated capacity. Open attempts have empty labels, so the same view serves training (decided rows) and scoring (open rows).
- Corrected battery fields show their current value. Any model trained before the correction appears in `ml_model_review_flags`.

The Intelligence page shows this loop live (Learning loop view): the same eligibility rules in `trainingStatus` (`src/services/mock/insights.ts`), with every excluded row given a reason and a fingerprint of the eligible row ids. `server/tests/ml.test.ts` checks that the page and the database view count the same rows, so the two definitions cannot drift apart.

## V1: Individual passport (now)

**No predictive ML.** V1's job is to create the clean, labelled history every later model depends on. Shipping a model before that history exists would mean training on synthetic or inconsistent data.

What V1 already does instead (deterministic, explainable):

- Data-quality assessment per battery: missing fields, conflicts, possible duplicate identities (`src/domain/lifecycle.ts`).
- Threshold rule check on final tests, labelled as a rule result and never as an approval (`ruleCheck` in `src/services/core.ts`).
- Import validation: unit mix-ups, impossible dates, near-duplicate serials go to quarantine.

ML-relevant work to do in V1, because it decides whether V3 is possible:

1. **Record outcomes as structured labels.** Done, with a placeholder list. Rejecting or reworking a restoration attempt, and rejecting or sending back a test, needs a reason code as well as the written reason. The service layer enforces it, and so do database checks (`attempts_reason_code_ck`, `tests_reason_code_ck`). The codes are in `src/domain/outcomes.ts`: capacity below threshold, internal resistance too high, physical damage, failed inspection, after-test not usable, and other. **Engineering still has to agree the final list.** Rows decided before codes existed keep their free-text reason and count as "no reason code".
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
| Revive or recycle | Realised net value per battery: sale price minus attributable processing cost, against recycling recovery | As for restoration qualification, plus cost entries known at intake | Batch economics at today's yield and costs (Restoration page scenario) | Qualification probability times a value scenario; a separate value model only once sale prices are recorded | Restoration candidates | Which batteries are worth attempting. **Needs a per-battery sale price, which is not recorded today** |

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

## Compute: CPU first

Nothing planned for V1–V3 needs a GPU: not the database, CSV ingestion, rules, data-quality checks or economics, and not logistic regression, gradient-boosted trees or survival models on structured battery records. At pilot volumes (thousands of batteries, tens of thousands of tests and attempts) these models train in seconds to minutes on an ordinary CPU. XGBoost and LightGBM can train on a GPU; that is an option, not a requirement.

Rent GPU time only for a demonstrated workload, for example:

- deep models on high-rate time-series telemetry, if Synovra's own equipment produces continuous readings (V2);
- image inspection (photos of plates, terminals or cases);
- hosting a large language model yourself instead of calling a provider's API (assistant, document extraction).

What decides it is data shape, sampling rate, training frequency and latency, not battery count. Agents follow the same rule as models: the assistant stays read-only, cites records and only drafts. No agent controls chargers, changes restoration recipes or routes batteries.

## Next concrete steps

1. Done, with placeholders: reason codes on the test-review and restoration-decision forms. **With engineering: replace the placeholder codes in `src/domain/outcomes.ts` with the agreed list** (V1).
2. Done: the point-in-time view `ml_restoration_attempt_features`, the review flags `ml_model_review_flags`, and the ML service role `server/sql/ml_service_role.sql`.
3. Done: money in per battery (`value_records`: sales, fees, recycler settlements) and a process version per batch. The training view now carries `process_version` as a feature and `label_value_aed` as a label.
4. Done: the training pipeline (`ml/train_restoration.py`). It reads the view, applies a readiness gate (at least 20 attempts of each outcome across at least 3 batches), evaluates on held-out batches against the rule "attempt when intake capacity ≥ 50%", requires a 0.02 margin, and writes a model card that `npm run ml:register` puts in shadow with its training records. **On the demo data the gate does not pass (2 failures), so no model is trained, which is correct.**
5. With Synovra: real records. The first concrete request is an anonymised export linking battery IDs to intake tests, treatment, retests, costs and money in.
