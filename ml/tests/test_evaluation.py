"""Run: python -I -m unittest discover -s ml/tests -t ml   (from the repository root)"""
import sys
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import evaluation as ev  # noqa: E402
import train_restoration as tr  # noqa: E402


def frame(n=160, batteries=40, batches=8, signal=1.0, seed=1, families=("f1", "f3")):
    """Attempts over batteries and batches. A battery belongs to one batch and may be attempted more than once
    there (rework), as in the lab; batches run one after another."""
    rng = np.random.default_rng(seed)
    cap = rng.uniform(30, 90, n)
    p = 1 / (1 + np.exp(-(signal * (cap - 55) / 8)))
    y = rng.random(n) < p
    bat = rng.integers(0, batteries, n)
    batch = bat % batches
    when = pd.Timestamp("2026-01-01") + pd.to_timedelta(batch * 10 + rng.integers(0, 10, n), unit="D")
    return pd.DataFrame({
        "attempt_id": [f"a{i}" for i in range(n)], "battery_id": [f"b{b}" for b in bat], "batch_id": [f"RB{b}" for b in batch],
        "features_as_of": when.astype(str),
        "family_id": [families[b % len(families)] for b in bat], "process_version": ["P v1" if b % 3 else "P v2" for b in bat],
        "label_outcome": np.where(y, "approved", "rejected"), "label_reason_code": np.where(y, None, "below_capacity_threshold"),
        "before_test_id": "t", "before_capacity_ah": cap * 2, "before_capacity_pct_of_rated": cap,
        "before_internal_resistance_mohm": rng.uniform(3, 6, n), "before_temperature_c": 25.0, "age_days": rng.integers(300, 1500, n), "prior_attempts": 0,
    })


class Groups(unittest.TestCase):
    def test_joins_batteries_and_batches(self):
        df = pd.DataFrame({"battery_id": ["a", "a", "b", "c"], "batch_id": ["x", "y", "y", "z"]})
        g = ev.joint_groups(df)
        self.assertEqual(g[0], g[1])  # battery a spans batches x and y
        self.assertEqual(g[1], g[2])  # batch y holds a and b
        self.assertNotEqual(g[3], g[0])

    def test_leakage_is_detected(self):
        df = frame()
        with self.assertRaises(ev.LeakageError):
            ev.assert_disjoint(df, np.arange(0, 100), np.arange(60, 160))

    def test_folds_never_share_a_battery_or_batch(self):
        df = frame()
        rows = tr.eligible(df).reset_index(drop=True)
        y = rows["label_outcome"].eq("approved")
        ev.grouped_oof(rows, tr.features(rows), y)  # raises LeakageError if any fold overlaps


class Connected(unittest.TestCase):
    def test_a_fully_connected_graph_cannot_be_held_out_and_says_so(self):
        df = frame(n=200, batteries=30, batches=6)
        df["batch_id"] = [f"RB{i % 6}" for i in range(len(df))]  # every battery now appears in many batches
        rows = tr.eligible(df).reset_index(drop=True)
        with self.assertRaises(ValueError):
            ev.grouped_oof(rows, tr.features(rows), rows["label_outcome"].eq("approved"))
        a = ev.assess(rows, tr.features(rows), rows["label_outcome"].eq("approved"))
        self.assertFalse(a.passed)
        self.assertEqual(a.checks[0]["name"], "grouped evaluation")


class NoLeakageFromIdentity(unittest.TestCase):
    def test_labels_tied_to_battery_identity_score_near_chance(self):
        """Each battery has a fixed outcome unrelated to its features. A row-level split would memorise the battery;
        a battery-disjoint split cannot, so balanced accuracy must stay near 0.5."""
        rng = np.random.default_rng(3)
        df = frame(n=300, batteries=60, signal=0.0)
        fate = {b: rng.random() < 0.5 for b in df["battery_id"].unique()}
        y = df["battery_id"].map(fate)
        df["label_outcome"] = np.where(y, "approved", "rejected")
        df["label_reason_code"] = np.where(y, None, "below_capacity_threshold")
        df["before_internal_resistance_mohm"] = df["battery_id"].map(lambda b: hash(b) % 1000 / 100)  # an identity fingerprint
        rows = tr.eligible(df).reset_index(drop=True)
        yy = rows["label_outcome"].eq("approved")
        p, _ = ev.grouped_oof(rows, tr.features(rows), yy)
        from sklearn.metrics import balanced_accuracy_score
        self.assertLess(balanced_accuracy_score(yy, p >= 0.5), 0.65)


class Gate(unittest.TestCase):
    def test_small_data_is_refused_before_any_training(self):
        df = frame(n=40)
        rows = tr.eligible(df).reset_index(drop=True)
        a = ev.assess(rows, tr.features(rows), rows["label_outcome"].eq("approved"))
        self.assertFalse(a.passed)
        self.assertIsNone(a.grouped)
        self.assertTrue(any("need at least" in r for r in a.readiness_reasons))

    def test_noise_does_not_pass_even_with_enough_rows(self):
        df = frame(n=400, batteries=120, signal=0.0, seed=5)
        rows = tr.eligible(df).reset_index(drop=True)
        a = ev.assess(rows, tr.features(rows), rows["label_outcome"].eq("approved"))
        self.assertTrue(a.ready)
        self.assertFalse(a.passed)
        self.assertTrue(any(not c["passed"] for c in a.checks))

    def test_a_family_with_too_few_rows_is_out_of_scope(self):
        df = frame(n=400, batteries=120, signal=1.0, seed=2)
        rare = df["battery_id"].value_counts().index[-1]  # the battery with the fewest attempts
        df.loc[df["battery_id"] == rare, "family_id"] = "f9"
        rows = tr.eligible(df).reset_index(drop=True)
        a = ev.assess(rows, tr.features(rows), rows["label_outcome"].eq("approved"))
        self.assertIn("f9", a.applicability["out_of_scope_families"])
        self.assertIn("single lab", a.applicability["site_holdout"])


class Errors(unittest.TestCase):
    def test_false_pass_counts_and_cost(self):
        y = pd.Series([True, True, False, False, False])
        e = ev.false_pass(y, np.array([True, False, True, True, False]))
        self.assertEqual((e["false_pass"], e["false_fail"]), (2, 1))
        self.assertEqual(e["weighted_cost"], ev.COST_FALSE_PASS * 2 + ev.COST_FALSE_FAIL)

    def test_a_perfectly_calibrated_forecast_has_low_error(self):
        rng = np.random.default_rng(0)
        p = rng.random(4000)
        y = pd.Series(rng.random(4000) < p)
        self.assertLess(ev.reliability(y, p)["ece"], 0.05)


class Time(unittest.TestCase):
    def test_later_rows_share_nothing_with_training(self):
        df = frame(n=300, batteries=200, batches=30)
        rows = tr.eligible(df).reset_index(drop=True)
        y = rows["label_outcome"].eq("approved")
        t = ev.time_holdout(rows, tr.features(rows), y)
        self.assertGreaterEqual(t["dropped_for_overlap"], 0)
        if t["evaluable"]:
            self.assertGreaterEqual(t["test_rows"], ev.MIN_TIME_TEST_ROWS)


if __name__ == "__main__":
    unittest.main()
