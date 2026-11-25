#!/usr/bin/env python3
"""Rebuild results/before-after.csv from results/<task>.json (latest run per task)."""

from __future__ import annotations

import csv
import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
RESULTS = REPO / "results"
FIELDS = ["task", "domain", "pattern", "baseline_score", "structured_score",
          "assertions_passed", "assertions_total", "iterations", "elapsed_seconds"]


def main() -> None:
    rows = []
    for path in sorted(RESULTS.glob("*.json")):
        if path.name.startswith("stress.") or path.name == "before-after.csv":
            continue
        data = json.loads(path.read_text())
        if "run" not in data or "score" not in data:
            continue
        rows.append({k: data.get(k) for k in FIELDS})
    rows.sort(key=lambda r: r["task"])
    with (RESULTS / "before-after.csv").open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)
    print(f"wrote {len(rows)} rows")
    for r in rows:
        print(f"| {r['task']} | {r['baseline_score']} | {r['structured_score']} | "
              f"{r['assertions_passed']}/{r['assertions_total']} | {r['iterations']} |")


if __name__ == "__main__":
    main()
