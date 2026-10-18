"""
External benchmark: profile the public OPzS 1200 Ah charge/discharge dataset.

Dataset: Rocha-Henriquez, Aguasca Colomo, Mendez. "Experimental Dataset of Charge and Discharge Patterns in a
1200Ah OpzS Battery Bank". Zenodo, 2025. DOI 10.5281/zenodo.17252822. Licence CC BY 4.0 (attribution required).

What this is for: exercising the ingestion pipeline on a real bench export (semicolons, decimal commas,
Latin-1 headers, local timestamps) and extracting controlled discharges as capacity measurements. It is
NOT Synovra's data and is never mixed into Synovra's records or training set (docs/research/datasets.md).

    python ml/benchmarks/opzs_profile.py            downloads into ml/.data/opzs (gitignored), writes ml/out/opzs/
"""
from __future__ import annotations

import argparse
import io
import re
import json
import sys
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

import pandas as pd

RECORD = "https://zenodo.org/records/17252822/files/"
CELLS = [f"Cell {i}.zip" for i in range(1, 7)]
RATED_AH = 1200.0
CUTOFF_V = 1.80  # per cell; the C10 end voltage for OPzS cells in the dataset description's discharge profiles


def download(data_dir: Path) -> list[Path]:
    data_dir.mkdir(parents=True, exist_ok=True)
    paths = []
    for name in CELLS:
        target = data_dir / name
        if not target.exists():
            url = RECORD + urllib.parse.quote(name) + "?download=1"
            print(f"Downloading {name} (CC BY 4.0, Zenodo 10.5281/zenodo.17252822)")
            with urllib.request.urlopen(url, timeout=120) as r:
                target.write_bytes(r.read())
        paths.append(target)
    return paths


# Header patterns, matched after collapsing spaces and lower-casing. The real files use about 40 variants
# (V1..V6 per cell, "I (A)", "I(A)" or "Current", "(Ah)" or "Ah", stray empty columns), so each column
# is identified by an explicit rule with its unit, never by position.
HEADER_RULES = [
    ("t", re.compile(r"^timestamp$")),
    ("volts", re.compile(r"^v\d \(v\)$")),
    ("temp_c", re.compile(r"^t\d \(.?c\)$")),
    ("amps", re.compile(r"^(i ?\(a\)|current)$")),
    ("ah_counter", re.compile(r"^\(?ah\)?$")),
    ("soc", re.compile(r"^% ?soc$")),
]


def read_export(raw: bytes) -> tuple[pd.DataFrame, str]:
    """The bench export as it is: ';' separated, decimal comma, Latin-1, day-first timestamps. Nothing guessed."""
    df = pd.read_csv(io.BytesIO(raw), sep=";", decimal=",", encoding="latin-1", dtype=str)
    df = df.loc[:, [c for c in df.columns if not str(c).startswith("Unnamed")]]
    # Rows of nothing but separators are padding left by the spreadsheet, not readings. Counted, then dropped.
    padding = int(df.isna().all(axis=1).sum())
    df = df[~df.isna().all(axis=1)]
    df.attrs["padding_rows"] = padding
    header = ";".join(df.columns)
    rename = {}
    for c in df.columns:
        key = re.sub(r"\s+", " ", str(c)).strip().lower()
        for name, rule in HEADER_RULES:
            if rule.match(key):
                rename[c] = name
                break
    df = df.rename(columns=rename)[[v for v in rename.values()]]
    df["t"] = pd.to_datetime(df["t"], format="%d/%m/%Y %H:%M", errors="coerce")
    for c in ["volts", "temp_c", "amps", "ah_counter"]:
        if c in df:
            df[c] = pd.to_numeric(df[c].str.replace(",", ".", regex=False).str.replace("%", "", regex=False), errors="coerce")
    return df, header


def discharges(df: pd.DataFrame) -> list[dict]:
    """Continuous runs of discharge current (< -1 A). Capacity is integrated current, not the export's counter."""
    out = []
    if "amps" not in df: return out
    d = df.dropna(subset=["t", "amps", "volts"]).reset_index(drop=True)
    on = d["amps"] < -1.0
    run_id = (on != on.shift()).cumsum()
    for _, seg in d[on].groupby(run_id[on]):
        if len(seg) < 30:  # ignore pulses shorter than 30 minutes
            continue
        dt_h = seg["t"].diff().dt.total_seconds().div(3600).fillna(1 / 60).clip(upper=5 / 60)
        ah = float((-seg["amps"] * dt_h).sum())
        out.append({
            "start": seg["t"].iloc[0].isoformat(), "hours": round(len(seg) / 60, 1), "mean_current_a": round(float(-seg["amps"].mean()), 1),
            "ah_delivered": round(ah, 1), "pct_of_rated": round(100 * ah / RATED_AH, 1),
            "end_voltage_v": round(float(seg["volts"].iloc[-1]), 3), "reached_cutoff": bool(seg["volts"].min() <= CUTOFF_V + 0.005),
            "temp_rise_c": round(float(seg["temp_c"].max() - seg["temp_c"].iloc[0]), 2) if "temp_c" in seg else None,
        })
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    root = Path(__file__).resolve().parents[1]
    ap.add_argument("--data", default=str(root / ".data" / "opzs"))
    ap.add_argument("--out", default=str(root / "out" / "opzs"))
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    summary, quality = [], []
    headers: set[str] = set()
    for zpath in download(Path(args.data)):
        cell = zpath.stem
        with zipfile.ZipFile(zpath) as z:
            for info in z.infolist():
                if not info.filename.lower().endswith(".csv"):
                    continue
                df, header = read_export(z.read(info))
                headers.add(header)
                missing_cols = [c for c in ["t", "volts", "amps"] if c not in df]
                if missing_cols:
                    quality.append({"cell": cell, "file": info.filename, "rows": len(df), "bad_timestamps": None, "gaps_over_2_min": None, "missing_values": None, "unmapped": ",".join(missing_cols)})
                    continue
                profile = info.filename.split(" - ")[-1].removesuffix(".csv")
                gaps = int((df["t"].diff().dt.total_seconds() > 120).sum()) if "t" in df else None
                quality.append({"cell": cell, "file": profile, "rows": len(df), "padding_rows": df.attrs.get("padding_rows", 0), "bad_timestamps": int(df["t"].isna().sum()), "gaps_over_2_min": gaps,
                                "soc_over_100": int((pd.to_numeric(df["soc"].str.replace(",", ".", regex=False).str.rstrip("%"), errors="coerce") > 100).sum()) if "soc" in df else None,
                                "missing_values": int(df[[c for c in ["volts", "temp_c", "amps"] if c in df]].isna().sum().sum())})
                for d in discharges(df):
                    summary.append({"cell": cell, "profile": profile, **d})

    s = pd.DataFrame(summary)
    q = pd.DataFrame(quality)
    s.to_csv(out / "discharges.csv", index=False)
    q.to_csv(out / "quality.csv", index=False)
    # A C10 discharge for a 1200 Ah cell runs at about 120 A. These runs end on a schedule, not at the cut-off.
    c10 = s[(s["mean_current_a"] >= 100) & (s["hours"] >= 9.5)] if len(s) else s
    full = c10[c10["reached_cutoff"]] if len(c10) else c10
    lines = [
        "# OPzS 1200 Ah public dataset: ingestion and discharge profile",
        "",
        "Source: Zenodo DOI 10.5281/zenodo.17252822, CC BY 4.0. External benchmark only; not Synovra data.",
        "",
        f"- Header variants seen: {len(headers)}. Each column was mapped by an explicit rule; files with an unmapped required column are listed in quality.csv, not guessed.",
        f"- Files read: {len(q)} across {q['cell'].nunique() if len(q) else 0} cells, {int(q['rows'].sum()) if len(q) else 0} rows.",
        f"- Empty padding rows dropped: {int(q['padding_rows'].sum()) if len(q) else 0}. Unparseable timestamps after that: {int(q['bad_timestamps'].sum()) if len(q) else 0}; gaps over 2 minutes: {int(q['gaps_over_2_min'].sum()) if len(q) else 0}.",
        f"- Rows where the exported '%SOC' column exceeds 100%: {int(q['soc_over_100'].fillna(0).sum()) if len(q) else 0}, in {int((q['soc_over_100'].fillna(0) > 0).sum()) if len(q) else 0} files. It appears to track cumulative charge against 1200 Ah, not state of charge, so derived columns are not trusted; capacity is integrated from current.",
        f"- Discharge runs of 30 minutes or more: {len(s)}. Full C10 runs (about 120 A for 10 hours): {len(c10)}, of which reached {CUTOFF_V} V: {len(full)}.",
    ]
    if len(c10):
        per = c10.groupby("cell").agg(runs=("ah_delivered", "count"), delivered=("ah_delivered", "max"), end_v=("end_voltage_v", "min")).reset_index()
        lines += ["", "## C10 discharges: Ah delivered before the run was stopped", "",
                  "The runs stop after about 10 hours, above the cut-off voltage, so these are lower bounds on capacity, not capacity tests to cut-off.",
                  "The six cells are in series, so the same current flows through each: amp-hours delivered are identical by construction, and differences between cells show only in their voltages. A string-level result is never a per-cell capacity.", "",
                  "| Cell | C10 runs | Most delivered | % of rated | Lowest end voltage |", "| --- | --- | --- | --- | --- |"]
        lines += [f"| {r.cell} | {r.runs} | {r.delivered} Ah | {round(100 * r.delivered / RATED_AH, 1)}% | {r.end_v} V |" for _, r in per.iterrows()]
    lines += [
        "",
        "## What this shows for Synovra's pipeline",
        "- A real bench export needs explicit parsing rules: separator, decimal mark, encoding, day-first dates, units in the header,",
        "  and dozens of header spellings for the same column. A fixed bench-export template saves this work at every site.",
        "  The bench import refuses unknown formats rather than guessing.",
        "- Capacity is integrated from current over time and compared with rated capacity at a stated rate and cut-off,",
        "  which is how the platform's capacity tests are defined.",
        "- Six controlled cells are not a returned-battery population: no restoration step, no outcomes, so nothing here trains a triage model.",
    ]
    (out / "report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (out / "summary.json").write_text(json.dumps({"discharges": len(s), "c10_to_cutoff": len(full), "files": len(q)}, indent=2), encoding="utf-8")
    print("\n".join(lines))
    print(f"\nWrote {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
