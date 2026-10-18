"""
Evaluation for restoration triage. Pure functions, no I/O, so each rule can be tested on its own.

What "held out" means here
- Battery-disjoint AND batch-disjoint at once: rows are grouped by the connected components of the
  battery/batch graph, so a battery re-attempted in a later batch can never sit in training while another of
  its attempts is in test, and no batch is split. Leakage is checked on every fold and raises if found.
- Later-period: train on the earlier attempts, test on the later ones, dropping any test row whose battery or
  batch also appears in training.
- Site: the training view has no site (one lab). Add the column before multi-site data; until then the report
  says the site holdout was not possible.

Thresholds below are cautious PLACEHOLDERS to agree with engineering. Costs in particular are unitless
weights for "a false pass costs this many false fails", not money.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import balanced_accuracy_score, brier_score_loss, roc_auc_score
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

MIN_PER_CLASS = 20
MIN_BATCHES = 3
MIN_PER_FAMILY = 10
BASELINE_MIN_PCT = 50.0
MIN_MARGIN = 0.02
MAX_ECE = 0.10
MAX_FALSE_PASS_RATE = 0.15
COST_FALSE_PASS = 3.0
COST_FALSE_FAIL = 1.0
FAMILY_TOLERANCE = 0.05
# Later-period test: superiority is shown on the grouped split; here the model only has to not be materially worse.
LATER_TOLERANCE = 0.02
MIN_TIME_TEST_ROWS = 10


class LeakageError(RuntimeError):
    """A battery or batch appeared on both sides of a split."""


def joint_groups(rows: pd.DataFrame) -> np.ndarray:
    """Group id per row: connected components of the battery/batch graph (union-find)."""
    parent: dict[str, str] = {}

    def find(a: str) -> str:
        parent.setdefault(a, a)
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for b, h in zip(rows["battery_id"].astype(str), rows["batch_id"].astype(str)):
        ra, rb = find(f"b:{b}"), find(f"h:{h}")
        if ra != rb:
            parent[ra] = rb
    roots = [find(f"b:{b}") for b in rows["battery_id"].astype(str)]
    codes = {r: i for i, r in enumerate(dict.fromkeys(roots))}
    return np.array([codes[r] for r in roots])


def assert_disjoint(rows: pd.DataFrame, train: np.ndarray, test: np.ndarray) -> None:
    for col in ("battery_id", "batch_id"):
        shared = set(rows.iloc[train][col].astype(str)) & set(rows.iloc[test][col].astype(str))
        if shared:
            raise LeakageError(f"{col} {sorted(shared)[:3]} is in both training and test")


def _model() -> object:
    return make_pipeline(StandardScaler(), LogisticRegression(class_weight="balanced", max_iter=1000))


def grouped_oof(rows: pd.DataFrame, x: pd.DataFrame, y: pd.Series, n_splits: int = 5) -> tuple[np.ndarray, int]:
    """Out-of-fold probabilities with battery- and batch-disjoint folds. Returns (probabilities, groups)."""
    groups = joint_groups(rows)
    n_groups = len(set(groups))
    if n_groups < 3:
        raise ValueError(f"only {n_groups} independent groups after joining batteries and batches; cannot hold them out")
    p = np.zeros(len(y))
    for train, test in GroupKFold(n_splits=min(n_splits, n_groups)).split(x, y, groups):
        assert_disjoint(rows, train, test)
        if y.iloc[train].nunique() < 2:
            raise ValueError("a training fold has only one outcome")
        m = _model().fit(x.iloc[train], y.iloc[train])
        p[test] = m.predict_proba(x.iloc[test])[:, 1]
    return p, n_groups


def time_holdout(rows: pd.DataFrame, x: pd.DataFrame, y: pd.Series, frac: float = 0.3) -> dict:
    """Train on earlier attempts, test on later ones that share no battery or batch with the training set."""
    t = pd.to_datetime(rows["features_as_of"], utc=True, errors="coerce")
    order = np.argsort(t.to_numpy())
    cut = int(len(order) * (1 - frac))
    train, test = order[:cut], order[cut:]
    seen_b = set(rows.iloc[train]["battery_id"].astype(str))
    seen_h = set(rows.iloc[train]["batch_id"].astype(str))
    keep = np.array([i for i in test if str(rows.iloc[i]["battery_id"]) not in seen_b and str(rows.iloc[i]["batch_id"]) not in seen_h], dtype=int)
    out = {"train_rows": int(len(train)), "test_rows": int(len(keep)), "dropped_for_overlap": int(len(test) - len(keep))}
    if len(keep) < MIN_TIME_TEST_ROWS or y.iloc[keep].nunique() < 2 or y.iloc[train].nunique() < 2:
        out["evaluable"] = False
        out["note"] = f"{len(keep)} later rows with no overlap; need at least {MIN_TIME_TEST_ROWS} with both outcomes"
        return out
    assert_disjoint(rows, train, keep)
    m = _model().fit(x.iloc[train], y.iloc[train])
    p = m.predict_proba(x.iloc[keep])[:, 1]
    base = baseline_pass(rows.iloc[keep])
    out.update(
        evaluable=True,
        model_balanced_accuracy=round(balanced_accuracy_score(y.iloc[keep], p >= 0.5), 3),
        baseline_balanced_accuracy=round(balanced_accuracy_score(y.iloc[keep], base), 3),
    )
    return out


def baseline_pass(rows: pd.DataFrame) -> np.ndarray:
    return (pd.to_numeric(rows["before_capacity_pct_of_rated"], errors="coerce") >= BASELINE_MIN_PCT).to_numpy()


def reliability(y: pd.Series, p: np.ndarray, bins: int = 5) -> dict:
    """Expected calibration error and the bins behind it, so the curve can be read, not just trusted."""
    edges = np.linspace(0, 1, bins + 1)
    idx = np.clip(np.digitize(p, edges[1:-1]), 0, bins - 1)
    rows, ece = [], 0.0
    for b in range(bins):
        m = idx == b
        if m.any():
            gap = abs(float(y[m].mean()) - float(p[m].mean()))
            ece += gap * m.mean()
            rows.append({"bin": f"{edges[b]:.1f}-{edges[b + 1]:.1f}", "n": int(m.sum()), "predicted": round(float(p[m].mean()), 3), "observed": round(float(y[m].mean()), 3)})
    return {"ece": round(float(ece), 3), "bins": rows}


def false_pass(y: pd.Series, passed: np.ndarray) -> dict:
    """A false pass sends a battery that would not qualify into restoration; a false fail withholds one that would have."""
    yv = y.to_numpy().astype(bool)
    fp, fn = int((passed & ~yv).sum()), int((~passed & yv).sum())
    neg, pos = int((~yv).sum()), int(yv.sum())
    return {
        "false_pass": fp, "false_fail": fn,
        "false_pass_rate": round(fp / neg, 3) if neg else None, "false_fail_rate": round(fn / pos, 3) if pos else None,
        "weighted_cost": round(COST_FALSE_PASS * fp + COST_FALSE_FAIL * fn, 1),
    }


@dataclass
class Assessment:
    ready: bool
    readiness_reasons: list[str]
    grouped: dict | None = None
    time: dict | None = None
    checks: list[dict] = field(default_factory=list)
    applicability: dict = field(default_factory=dict)

    @property
    def passed(self) -> bool:
        return self.ready and bool(self.checks) and all(c["passed"] for c in self.checks)

    @property
    def reasons(self) -> list[str]:
        return self.readiness_reasons + [f"{c['name']}: {c['detail']}" for c in self.checks if not c["passed"]]


def readiness(rows: pd.DataFrame, y: pd.Series) -> tuple[bool, list[str]]:
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


def assess(rows: pd.DataFrame, x: pd.DataFrame, y: pd.Series) -> Assessment:
    ok, reasons = readiness(rows, y)
    a = Assessment(ready=ok, readiness_reasons=reasons)
    if not ok:
        return a

    fam_counts = rows["family_id"].value_counts()
    supported = [f for f, n in fam_counts.items() if n >= MIN_PER_FAMILY]
    a.applicability = {
        "supported_families": supported,
        "out_of_scope_families": [f for f in fam_counts.index if f not in supported],
        "site_holdout": "not available: the training view has no site column (single lab)",
    }
    try:
        p, n_groups = grouped_oof(rows, x, y)
    except (ValueError, LeakageError) as e:
        a.checks.append({"name": "grouped evaluation", "passed": False, "detail": str(e)})
        return a

    base = baseline_pass(rows)
    model_pass = p >= 0.5
    g = {
        "independent_groups": n_groups,
        "model_balanced_accuracy": round(balanced_accuracy_score(y, model_pass), 3),
        "baseline_balanced_accuracy": round(balanced_accuracy_score(y, base), 3),
        "brier": round(brier_score_loss(y, p), 3),
        "brier_constant": round(brier_score_loss(y, np.full(len(y), float(y.mean()))), 3),
        "roc_auc": round(roc_auc_score(y, p), 3),
        "reliability": reliability(y, p),
        "model_errors": false_pass(y, model_pass),
        "baseline_errors": false_pass(y, base),
        "per_family": {},
    }
    for fam in fam_counts.index:
        m = (rows["family_id"] == fam).to_numpy()
        if fam in supported and y[m].nunique() == 2:
            g["per_family"][fam] = {
                "n": int(m.sum()), "model_balanced_accuracy": round(balanced_accuracy_score(y[m], model_pass[m]), 3),
                "baseline_balanced_accuracy": round(balanced_accuracy_score(y[m], base[m]), 3),
            }
        else:
            g["per_family"][fam] = {"n": int(m.sum()), "note": "out of scope: too few rows or one outcome" if fam not in supported else "one outcome only"}
    a.grouped = g
    a.time = time_holdout(rows, x, y)

    add = lambda name, passed, detail: a.checks.append({"name": name, "passed": bool(passed), "detail": detail})
    margin = g["model_balanced_accuracy"] - g["baseline_balanced_accuracy"]
    add("beats the rule", margin >= MIN_MARGIN, f"balanced accuracy {g['model_balanced_accuracy']} vs rule {g['baseline_balanced_accuracy']} (need +{MIN_MARGIN})")
    add("calibration", g["reliability"]["ece"] <= MAX_ECE and g["brier"] < g["brier_constant"],
        f"ECE {g['reliability']['ece']} (max {MAX_ECE}); Brier {g['brier']} vs {g['brier_constant']} for the base rate")
    me, be = g["model_errors"], g["baseline_errors"]
    add("false passes", (me["false_pass_rate"] or 0) <= MAX_FALSE_PASS_RATE and me["weighted_cost"] <= be["weighted_cost"],
        f"false-pass rate {me['false_pass_rate']} (max {MAX_FALSE_PASS_RATE}); weighted error cost {me['weighted_cost']} vs rule {be['weighted_cost']}")
    worse = [f for f, v in g["per_family"].items() if "model_balanced_accuracy" in v and v["model_balanced_accuracy"] < v["baseline_balanced_accuracy"] - FAMILY_TOLERANCE]
    add("every supported family", not worse and bool(supported), f"worse than the rule by more than {FAMILY_TOLERANCE} in: {', '.join(worse) or 'none'}; supported families: {', '.join(supported) or 'none'}")
    t = a.time
    if t.get("evaluable"):
        add("later period", t["model_balanced_accuracy"] - t["baseline_balanced_accuracy"] >= -LATER_TOLERANCE,
            f"later {t['test_rows']} rows: model {t['model_balanced_accuracy']} vs rule {t['baseline_balanced_accuracy']} (not worse by more than {LATER_TOLERANCE})")
    else:
        add("later period", False, t["note"])
    return a
