# Pilot readiness: what the prototype does against the pilot plan

Written for Karthik Nambiar and whoever reviews the pilot plan with Synovra. It checks each acceptance criterion of the working plan ("Synovra Battery Intelligence: Research, Product, and Implementation Plan", 18 October 2026) against this repository at the commit that adds this file. **Built** means the code does it and a test covers it. **Partial** means part of it. **Gap** means it is not built. Everything runs on synthetic demo data until Synovra supplies real records.

## Acceptance criteria

| Criterion from the plan | Status | What exists, and what is missing |
| --- | --- | --- |
| At least 95% of attempted units have a complete intake-to-decision chain; every exclusion reason-coded | Partial | The Data collection tab counts the chain (registered, approved intake test, restoration attempted, retested and decided with a reason, outcome, value) and lists what is held back. Not built: custody handoffs, weight, and an exclusion register that gives every unit left out a machine-readable reason. |
| Every decision-bearing test record has source, units, timestamps, protocol revision, instrument, calibration, operator, reviewer | Partial | Required by the test form and the bench import; stored with the test. Calibration is a free-text reference: its validity and expiry are not checked, and there is no calibration register. Units are fixed by column name, with a plausibility check; a file with an explicit unit column is not parsed. |
| Every approved release has an engineer-approved protocol and linked reference-test evidence | Partial | Qualification needs an approved after-test and a different engineer; the 85% threshold and the protocol are placeholders (`status: placeholder`). The real protocol and limits must come from Synovra. |
| Unknown units, missing calibration, impossible values, duplicate imports, missing battery IDs are rejected or quarantined | Built | Bench and battery CSV imports quarantine with the reason, skip exact duplicates by file hash and by row, and never convert a unit (`tests/unit/values.test.ts`, `server/tests/pilot.test.ts`). |
| No self-approval or separation-of-duty violation | Built | Service rule and a database check (`tests_separation_of_duties_ck`). |
| No uncontrolled device write | Built | No device connector exists. The Modbus screen is a design plus a simulator that stores nothing. |
| Every recycling movement closes with destination evidence and a certificate, or an open exception | Partial | Recycling records carry consignment, mass and certificate state and the data-collection tab counts missing certificates. Not built: mass-balance reconciliation, carrier and waste-movement documents. |
| Batch economics reconcile to supplied cost and settlement records | Partial | Batch economics, cost entries (unknown is never zero) and value records exist. Not built: reconciliation against an external ledger, and allocation of shared costs per battery (the analyst says so when it compares cost with value). |
| Safety, transport, product-or-waste classification and recycler obligations reviewed by qualified advisors | Not software | Needs Synovra's advisors. The platform records evidence; it does not classify. |
| Can state yield, capacity distribution, cycle time, completeness, contribution versus recycling-only, early returns, each with numerator, denominator, exclusions, uncertainty | Partial | Yield, capacity, completeness and contribution show numerator and denominator; process-version and family comparisons carry 95% intervals and a "too few decisions" warning. Not built: cycle time, and a matched recycling-only comparison. |

## Required records the plan lists, and the gaps

| Record | Status |
| --- | --- |
| Battery identity, QR, serial separate from internal ID, family, rating, source | Built |
| Custody, gross and net mass, jurisdiction | Gap (location and recycling mass exist; custody handoffs and intake mass do not) |
| Test session: protocol, instrument, calibration, load, temperature, cutoff, duration, operator, witness, evidence hash | Built, except calibration uncertainty and calibration expiry |
| String-level versus battery-level results kept apart | Built (a database check) |
| Flooded-specific observations (specific gravity by position, water additions, stratification) | Gap |
| VRLA-specific observations (valve, vent, dehydration, pressure) | Gap |
| Conductance, AC resistance or EIS with its settings | Gap (internal resistance in mΩ is recorded; the method and settings are not) |
| Restoration attempt: process version, batch, lot references, operator, outcome, rework and reject reason | Built (process version per batch, not per attempt) |
| Decision: route, reviewer, assumptions, reason code | Built |
| Commercial events: sale, fee, settlement; actual versus estimate versus allocated | Built for money in and for costs; "estimated" money in is not distinguished from actual |
| Warranty and follow-up: observation window, censoring | Partial (claims exist; observation windows and a failure definition do not) |
| Public and restricted passport views | Partial: customer redaction exists; a public QR view does not (a scan needs sign-in) |

## What the audit found, and what was changed

| Finding | Action |
| --- | --- |
| The ML evaluator held out whole batches only, so a battery re-attempted in another batch could be in both training and test | Rewritten (`ml/evaluation.py`): rows are grouped by the connected components of the battery and batch graph, so both are disjoint at once; leakage is checked on every fold and raises. A later-period test drops any row sharing a battery or batch with training. A site holdout is reported as not possible, because the view has no site column. |
| The gate accepted a bare report reference | The gate now also needs: a margin over the rule, calibration (ECE and Brier against the base rate), a false-pass rate and weighted error cost against the rule, each supported family not worse than the rule, and the later-period test. A family with fewer than 10 rows is marked out of scope. |
| Model artifact, data, code and report were not versioned together | The model card carries hashes of the data snapshot, the code, the report and the fitted artifact, and empty reviewer, approver and rollback fields for a person to fill. Registration refuses a card without valid hashes (`server/src/db/modelCard.ts`). |
| The agent's number check is heuristic | Unchanged, and documented as such. It catches an invented figure; it cannot catch a misread real one (seen in a live run). The deterministic analyst remains the fallback. There is no adversarial test set yet. |
| Pilot-mode defect, found while checking the mock-to-pilot boundary: the bench import created a metadata-only evidence record, which pilot mode refuses, so a pilot commit would have failed | The API now scans and stores the file through the same path as other evidence and the service takes it as the stored evidence. A pilot test covers it. |
| Route clash: `/imports/bench/commit` was matched by `/imports/:id/commit` and returned 404 from the real API; the browser demo hid it | Bench routes moved to `/bench-imports/...`, covered by a pilot test. |
| `server/README.md` listed OIDC, evidence storage, user administration and rate limiting as not done | Table corrected (below). |

## Still open before real records go in

- **Needs Synovra:** the legal entity, chemistry and form factor in scope, approved protocols and numeric limits (flooded and VRLA separately), real reason codes, the claim-to-record evidence pack, and the real data.
- **Not built:** custody and mass, calibration register with expiry, flooded and VRLA observation fields, an exclusion register, mass-balance reconciliation, cycle time, a public passport view, backups with a tested restore drill, and a hosted-model evaluation set for the agent.
- **Not verified:** the identity flow against a real provider (it runs against a mock one); any production deployment; the reported performance claims of the company.
