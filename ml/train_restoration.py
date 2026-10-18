"""
Restoration triage: from the point-in-time training view to an evaluation report, or an honest refusal.

Target: did a restoration attempt reach the qualifying grade (label_outcome == 'approved')?
Features: only what was recorded before the attempt started (see server/drizzle/0005 and 0006).

    python ml/train_restoration.py --api http://localhost:4000 --user u_admin
    python ml/train_restoration.py --csv rows.csv

Writes ml/out/<model>-<version>/report.md and model_card.json. A card can be registered in shadow with
`npm run ml:register -- <card>` only when its readiness gate passed. Nothing here promotes a model.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import urllib.request
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import balanced_accuracy_score, brier_score_loss, roc_auc_score
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

MODEL = "restoration-triage"
# Readiness gate. Agree the real minimums with engineering; these are deliberately cautious placeholders.
MIN_PER_CLASS = 20
MIN_BATCHES = 3
# The simple engineering rule a model must beat: try restoration when the intake test shows at least this much.
BASELINE_MIN_PCT = 50.0
# A model must beat the rule by at least this much balanced accuracy on held-out batches; less is noise.
MIN_MARGIN = 0.02


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


def gate(rows: pd.DataFrame, y: pd.Series) -> tuple[bool, list[str]]:
    reasons = []
    pos, neg = int(y.sum()), int((~y).sum())
    if pos < MIN_PER_CLASS:
        reasons.append(f"{pos} qualified attempts; need at least {MIN_PER_CLASS}")
    if neg < MIN_PER_CLASS:
        reasons.append(f"{neg} attempts that did not qualify; need at least {MIN_PER_CLASS}")
    batches = rows["batch_id"].nunique()
    if batches < MIN_BATCHES:
        reasons.append(f"{batches} batches; need at least {MIN_BATCHES} so evaluation can hold out whole batches")
    return (not reasons, reasons)


def evaluate(rows: pd.DataFrame, x: pd.DataFrame, y: pd.Series) -> dict:
    """Hold out whole batches, never single rows: the same battery or batch must not sit in training and test."""
    groups = rows["batch_id"]
    folds = GroupKFold(n_splits=min(5, groups.nunique()))
    model_p = np.zeros(len(y))
    for train, test in folds.split(x, y, groups):
        m = make_pipeline(StandardScaler(), LogisticRegression(class_weight="balanced", max_iter=1000))
        m.fit(x.iloc[train], y.iloc[train])
        model_p[test] = m.predict_proba(x.iloc[test])[:, 1]
    base = (pd.to_numeric(rows["before_capacity_pct_of_rated"], errors="coerce") >= BASELINE_MIN_PCT).to_numpy()
    out = {
        "model_balanced_accuracy": round(balanced_accuracy_score(y, model_p >= 0.5), 3),
        "baseline_balanced_accuracy": round(balanced_accuracy_score(y, base), 3),
        "model_brier": round(brier_score_loss(y, model_p), 3),
        "model_roc_auc": round(roc_auc_score(y, model_p), 3) if y.nunique() == 2 else None,
        "per_family": {},
    }
    for fam, idx in rows.groupby("family_id").groups.items():
        mask = rows.index.isin(idx)
        if y[mask].nunique() == 2:
            out["per_family"][fam] = {"n": int(mask.sum()), "model_balanced_accuracy": round(balanced_accuracy_score(y[mask], model_p[mask] >= 0.5), 3)}
        else:
            out["per_family"][fam] = {"n": int(mask.sum()), "note": "only one outcome in this family: not evaluable"}
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--api", help="API base URL, e.g. http://localhost:4000 (dev sign-in)")
    src.add_argument("--csv", help="CSV export of ml_restoration_attempt_features")
    ap.add_argument("--user", default="u_admin", help="dev user id with administrator access")
    ap.add_argument("--out", default=str(Path(__file__).parent / "out"))
    args = ap.parse_args()

    all_rows = load_rows(args)
    rows = eligible(all_rows).reset_index(drop=True)
    y = rows["label_outcome"].eq("approved")
    ids = sorted(rows["attempt_id"].astype(str))
    fingerprint = hashlib.sha256("|".join(ids).encode()).hexdigest()[:16]
    version = f"0.1.0-{date.today():%Y%m%d}-{fingerprint[:6]}"
    passed, reasons = gate(rows, y)
    out_dir = Path(args.out) / f"{MODEL}-{version}"
    out_dir.mkdir(parents=True, exist_ok=True)

    lines = [
        f"# {MODEL} {version}",
        "",
        f"Source: ml_restoration_attempt_features, {len(all_rows)} attempts, {len(rows)} eligible training rows (fingerprint {fingerprint}).",
        f"Outcomes: {int(y.sum())} qualified, {int((~y).sum())} not qualified. Families: {', '.join(f'{k} ({v})' for k, v in rows['family_id'].value_counts().items())}.",
        f"Process versions: {', '.join(f'{k} ({v})' for k, v in rows['process_version'].fillna('not recorded').value_counts().items())}.",
        "",
        "## Readiness gate",
        "Passed." if passed else "**Not passed. No model was trained.**",
        *[f"- {r}" for r in reasons],
        "",
    ]
    metrics = None
    if passed:
        metrics = evaluate(rows, features(rows), y)
        beats = metrics["model_balanced_accuracy"] - metrics["baseline_balanced_accuracy"] >= MIN_MARGIN
        lines += [
            "## Evaluation (whole batches held out)",
            f"- Model balanced accuracy {metrics['model_balanced_accuracy']} against the baseline rule's {metrics['baseline_balanced_accuracy']}.",
            f"- Brier score {metrics['model_brier']}; ROC AUC {metrics['model_roc_auc']}.",
            *[f"- {fam}: {v}" for fam, v in metrics["per_family"].items()],
            "",
            f"Beats the baseline by at least {MIN_MARGIN}." if beats else f"Not at least {MIN_MARGIN} better than the baseline rule: keep the rule.",
            "",
            "Registering puts this version in shadow. Promotion to validated needs the deployment gate in docs/ML_PLAN.md and an engineer's sign-off.",
        ]
    else:
        lines += [
            "## What would make it trainable",
            f"- Record at least {MIN_PER_CLASS} attempts of each outcome, with reason codes, across at least {MIN_BATCHES} batches.",
            "- Keep before-tests approved before each attempt starts, so the features stay point-in-time.",
            "- The data in this demonstration is synthetic, so no result from it would describe Synovra's batteries anyway.",
        ]
    report = out_dir / "report.md"
    report.write_text("\n".join(lines) + "\n", encoding="utf-8")
    card = {
        "name": MODEL, "version": version, "baseline": f"Attempt when intake capacity >= {BASELINE_MIN_PCT:.0f}% of rated",
        "training_cohort": f"{len(rows)} eligible attempts, fingerprint {fingerprint}",
        "evaluation_report": str(report.as_posix()), "gate": {"passed": passed, "reasons": reasons}, "metrics": metrics,
        "beats_baseline": bool(metrics and metrics["model_balanced_accuracy"] - metrics["baseline_balanced_accuracy"] >= MIN_MARGIN),
        "training_records": [{"record_kind": "restoration_attempt", "record_id": str(r.attempt_id), "battery_id": str(r.battery_id)} for r in rows.itertuples()],
    }
    (out_dir / "model_card.json").write_text(json.dumps(card, indent=2), encoding="utf-8")
    print("\n".join(lines))
    print(f"\nWrote {report} and {out_dir / 'model_card.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
