# ML pipeline

Runs outside the app, on an ordinary CPU. Reads Synovra's records only through the point-in-time view `ml_restoration_attempt_features`; writes a report and a model card. Public data is profiled separately and never mixed in.

```bash
pip install -r ml/requirements.txt

# 1. Restoration triage: readiness gate, then (only if it passes) grouped evaluation against a simple rule
npm run server:dev                                   # API on :4000
python -I ml/train_restoration.py --api http://localhost:4000 --user u_admin
#    -> ml/out/restoration-triage-<version>/report.md and model_card.json

# 2. Register a passing card in shadow (stop the dev server first if it uses the embedded database)
npm run ml:register -- ml/out/restoration-triage-<version>/model_card.json

# 3. External benchmark: the public OPzS 1200 Ah dataset (CC BY 4.0), downloaded into ml/.data (gitignored)
python -I ml/benchmarks/opzs_profile.py              # -> ml/out/opzs/report.md, discharges.csv, quality.csv
```

## What each step refuses to do

| Step | Refuses when | Why |
| --- | --- | --- |
| Readiness gate | Fewer than 20 attempts of either outcome, or fewer than 3 batches | Too few labels to evaluate; whole batches must be held out |
| Evaluation | Model is not at least 0.02 balanced accuracy better than the rule "attempt when intake capacity ≥ 50% of rated" | A smaller margin is noise: keep the rule |
| Registration | The card's gate did not pass, or it names no training records | Lineage (`model_training_records`) is what makes corrections and unlearning traceable |
| Promotion | Always | Registration is shadow only; `validated` needs the deployment gate in `docs/ML_PLAN.md` and an engineer's sign-off |

## Current result on the demo data

28 eligible rows, 26 qualified and 2 not. **The gate does not pass, so no model is trained.** That is the correct outcome: synthetic yields are high, and nothing trained on them would describe Synovra's batteries.

## What the public OPzS data taught the pipeline

- 110 files from one bench used **31 different header spellings** for the same columns, plus semicolons, decimal commas, Latin-1 and day-first dates. Columns are mapped by explicit rules; unknown formats are refused, not guessed. A fixed bench-export template saves this at every site.
- 23,055 rows were empty spreadsheet padding.
- The exported `%SOC` column exceeds 100% in most files (it tracks cumulative charge), so derived columns are not trusted and capacity is integrated from current.
- C10 runs stop after ten hours, above the 1.80 V cut-off: about 1,211 Ah delivered, a lower bound, not a capacity test to cut-off.
- The six cells are in series, so amp-hours are identical for each; cells differ only in voltage. A string-level result is never a per-cell capacity.
