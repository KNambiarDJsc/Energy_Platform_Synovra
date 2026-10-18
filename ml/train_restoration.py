"""
Restoration triage: from the point-in-time training view to an evaluation report, or an honest refusal.

Target: did a restoration attempt reach the qualifying grade (label_outcome == 'approved')?
Features: only what was recorded before the attempt started (see server/drizzle/0005 and 0006).

    python ml/train_restoration.py --api http://localhost:4000 --user u_admin
    python ml/train_restoration.py --csv rows.csv

Writes ml/out/<model>-<version>/report.md, model_card.json and (only if every check passed) model.joblib.
A card can be registered in shadow with `npm run ml:register -- <card>` only when every check passed.
Nothing here promotes a model. The checks are in ml/evaluation.py.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import platform
import sys
import urllib.request
from datetime import date
from pathlib import Path

import joblib
import pandas as pd

# Isolated mode (python -I) does not put this folder on the path; this is our own module, so add it.
sys.path.insert(0, str(Path(__file__).resolve().parent))
import evaluation as ev  # noqa: E402

MODEL = "restoration-triage"
HERE = Path(__file__).resolve().parent


def load_rows(args: argparse.Namespace) -> pd.DataFrame:
    if args.csv:
        return pd.read_csv(args.csv)
    login = urllib.request.Request(
        f"{args.api}/api/v1/dev/login", data=json.dumps({"userId": args.user}).encode(), headers={"Content-Type": "application/json"}, method="POST",
    )
    token = json.load(urllib.request.urlopen(login, timeout=30))["token"]
    req = urllib.request.Request(f"{args.api}/api/v1/ml/training-rows", headers={"Authorization": f"Bearer {token}"})
    body = json.load(urllib.request.urlopen(req, timeout=60))
    return pd.DataFrame(body["rows"])


def eligible(df: pd.DataFrame) -> pd.DataFrame:
    """The same rule as the platform's learning loop and the server test that checks them against each other."""
    decided = df["label_outcome"].notna()
    labelled = (df["label_outcome"] == "approved") | df["label_reason_code"].notna()
    has_before = df["before_test_id"].notna() & df["before_capacity_ah"].notna()
    return df[decided & labelled & has_before].copy()


def features(df: pd.DataFrame) -> pd.DataFrame:
    x = pd.DataFrame(index=df.index)
    for col in ["before_capacity_pct_of_rated", "before_internal_resistance_mohm", "before_temperature_c", "age_days", "prior_attempts"]:
        v = pd.to_numeric(df[col], errors="coerce")
        x[f"{col}_missing"] = v.isna().astype(int)  # missing is information, not zero
        x[col] = v.fillna(v.median() if v.notna().any() else 0)
    x = x.join(pd.get_dummies(df["family_id"], prefix="family", dtype=int))
    x = x.join(pd.get_dummies(df["process_version"].fillna("not recorded"), prefix="process", dtype=int))
    return x


def sha256_file(*paths: Path) -> str:
    h = hashlib.sha256()
    for path in paths:
        h.update(path.read_bytes())
    return h.hexdigest()


def snapshot_hash(rows: pd.DataFrame) -> str:
    """Hash of the exact rows and columns the model saw, independent of row order."""
    cols = sorted(rows.columns)
    canon = rows[cols].astype(str).sort_values(by=["attempt_id"]).to_csv(index=False)
    return hashlib.sha256(canon.encode()).hexdigest()


def report_lines(version, all_rows, rows, y, fingerprint, a: ev.Assessment) -> list[str]:
    lines = [
        f"# {MODEL} {version}",
        "",
        f"Source: ml_restoration_attempt_features, {len(all_rows)} attempts, {len(rows)} eligible training rows (fingerprint {fingerprint}).",
        f"Outcomes: {int(y.sum())} qualified, {int((~y).sum())} not qualified. Families: {', '.join(f'{k} ({v})' for k, v in rows['family_id'].value_counts().items())}.",
        f"Process versions: {', '.join(f'{k} ({v})' for k, v in rows['process_version'].fillna('not recorded').value_counts().items())}.",
        "",
        "## Readiness gate",
        "Passed." if a.ready else "**Not passed. No model was trained.**",
        *[f"- {r}" for r in a.readiness_reasons],
        "",
    ]
    if not a.ready:
        return lines + [
            "## What would make it trainable",
            f"- Record at least {ev.MIN_PER_CLASS} attempts of each outcome, with reason codes, across at least {ev.MIN_BATCHES} batches.",
            "- Keep before-tests approved before each attempt starts, so the features stay point-in-time.",
            "- The data in this demonstration is synthetic, so no result from it would describe Synovra's batteries anyway.",
        ]
    g, t = a.grouped, a.time
    lines += ["## Checks", *[f"- {'PASS' if c['passed'] else 'FAIL'} {c['name']}: {c['detail']}" for c in a.checks], ""]
    if g:
        lines += [
            f"## Held out: whole battery-and-batch groups ({g['independent_groups']} independent groups)",
            f"- Balanced accuracy {g['model_balanced_accuracy']} against the rule's {g['baseline_balanced_accuracy']}; ROC AUC {g['roc_auc']}.",
            f"- Model errors {g['model_errors']}; rule errors {g['baseline_errors']}.",
            f"- Reliability (ECE {g['reliability']['ece']}): " + "; ".join(f"{b['bin']} n={b['n']} predicted {b['predicted']} observed {b['observed']}" for b in g["reliability"]["bins"]),
            *[f"- {fam}: {v}" for fam, v in g["per_family"].items()],
            "",
            f"## Later period: {t}",
            "",
            "## Applicability",
            f"- Supported families (at least {ev.MIN_PER_FAMILY} rows): {', '.join(a.applicability['supported_families']) or 'none'}. Out of scope: {', '.join(a.applicability['out_of_scope_families']) or 'none'}.",
            f"- Site holdout: {a.applicability['site_holdout']}.",
            f"- Thresholds (placeholders to agree with engineering): rule +{ev.MIN_MARGIN}, ECE <= {ev.MAX_ECE}, false-pass rate <= {ev.MAX_FALSE_PASS_RATE}, false pass weighted {ev.COST_FALSE_PASS}x a false fail.",
            "",
        ]
    lines += [
        "All checks passed. Registering puts this version in shadow." if a.passed else "Not every check passed: keep the rule.",
        "Promotion to validated needs the deployment gate in docs/ML_PLAN.md and an engineer's sign-off. Reviewer, approver and rollback target are empty on the card until a person fills them.",
    ]
    return lines


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--api", help="API base URL, e.g. http://localhost:4000 (dev sign-in)")
    src.add_argument("--csv", help="CSV export of ml_restoration_attempt_features")
    ap.add_argument("--user", default="u_admin", help="dev user id with administrator access")
    ap.add_argument("--out", default=str(HERE / "out"))
    args = ap.parse_args()

    all_rows = load_rows(args)
    rows = eligible(all_rows).reset_index(drop=True)
    y = rows["label_outcome"].eq("approved")
    fingerprint = hashlib.sha256("|".join(sorted(rows["attempt_id"].astype(str))).encode()).hexdigest()[:16]
    version = f"0.1.0-{date.today():%Y%m%d}-{fingerprint[:6]}"
    x = features(rows)
    a = ev.assess(rows, x, y) if len(rows) else ev.Assessment(ready=False, readiness_reasons=["no eligible training rows"])
    out_dir = Path(args.out) / f"{MODEL}-{version}"
    out_dir.mkdir(parents=True, exist_ok=True)

    lines = report_lines(version, all_rows, rows, y, fingerprint, a)
    report = out_dir / "report.md"
    report.write_text("\n".join(lines) + "\n", encoding="utf-8")
    report_hash = sha256_file(report)

    artifact = None
    if a.passed:
        model = ev._model().fit(x, y)
        artifact = out_dir / "model.joblib"
        joblib.dump({"model": model, "columns": list(x.columns)}, artifact)
    import sklearn

    card = {
        "name": MODEL, "version": version, "baseline": f"Attempt when intake capacity >= {ev.BASELINE_MIN_PCT:.0f}% of rated",
        "training_cohort": f"{len(rows)} eligible attempts, fingerprint {fingerprint}",
        "evaluation_report": f"{report.as_posix()}#sha256={report_hash}",
        "gate": {"passed": a.passed, "reasons": a.reasons},
        "checks": a.checks, "applicability": a.applicability, "grouped_evaluation": a.grouped, "later_period_evaluation": a.time,
        "lineage": {
            "data_snapshot_sha256": snapshot_hash(rows) if len(rows) else None,
            "code_sha256": sha256_file(HERE / "train_restoration.py", HERE / "evaluation.py"),
            "report_sha256": report_hash,
            "artifact": artifact.as_posix() if artifact else None,
            "artifact_sha256": sha256_file(artifact) if artifact else None,
            "python": platform.python_version(), "scikit_learn": sklearn.__version__, "pandas": pd.__version__,
        },
        # Filled by a person, never by this script.
        "review": {"reviewer": None, "approved_by": None, "approved_at": None, "rollback_target": None},
        "training_records": [{"record_kind": "restoration_attempt", "record_id": str(r.attempt_id), "battery_id": str(r.battery_id)} for r in rows.itertuples()],
    }
    (out_dir / "model_card.json").write_text(json.dumps(card, indent=2, default=str), encoding="utf-8")
    print("\n".join(lines))
    print(f"\nWrote {report} and {out_dir / 'model_card.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
