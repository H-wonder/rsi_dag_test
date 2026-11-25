#!/usr/bin/env python3
"""Run one structure against the backend, then read the bridge score.

Examples:
  python3 harness/run_structure.py \
    --structure structures/hr.monday_onboarding_pipeline.json --restart-bridge
"""

from __future__ import annotations

import argparse
import csv
import json
import subprocess
import sys
import time
import urllib.request
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]          # multi_agent/
REPO = ROOT / "loop-structures"
BASELINE = ROOT / "automationbench-baseline" / "reports" / "medium-max-60.compact.json"
BRIDGE_SCRIPT = ROOT / "automationbench-baseline"
FLOW_ID = "@com.horsecoder.common.whuTalent.flowTesting.core/FLOW_RUN"


def http_json(url: str, payload: dict | None = None, timeout: int = 300) -> dict:
    data = None if payload is None else json.dumps(payload).encode()
    headers = {} if payload is None else {"Content-Type": "application/json"}
    req = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def wait_health(bridge: str, seconds: int = 90) -> None:
    deadline = time.time() + seconds
    while time.time() < deadline:
        try:
            if http_json(bridge + "/health", timeout=3).get("ok"):
                return
        except Exception:
            pass
        time.sleep(1)
    raise SystemExit(f"bridge 未就绪: {bridge}")


def start_bridge(task: str, domain: str, port: int) -> subprocess.Popen:
    proc = subprocess.Popen(
        ["uv", "run", "--project", "../datasets/AutomationBench", "python",
         "scripts/world_bridge.py", "--domain", domain, "--task", task, "--port", str(port)],
        cwd=str(BRIDGE_SCRIPT),
        stdout=open(f"/tmp/bridge-{task.replace('.', '-')}.log", "w"),
        stderr=subprocess.STDOUT,
    )
    wait_health(f"http://127.0.0.1:{port}")
    return proc


def baseline_score(task: str) -> float | None:
    if not BASELINE.exists():
        return None
    data = json.loads(BASELINE.read_text())
    for item in data.get("tasks", []):
        if item.get("name") == task:
            return item.get("score")
    return None


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--structure", required=True)
    ap.add_argument("--backend", default="http://127.0.0.1:39910")
    ap.add_argument("--bridge", default="http://127.0.0.1:8765")
    ap.add_argument("--restart-bridge", action="store_true")
    args = ap.parse_args()

    path = Path(args.structure).resolve()
    structure = json.loads(path.read_text())
    meta = structure.get("meta", {})
    task = meta.get("task")
    benchmark_task = meta.get("benchmark") or task
    domain = meta.get("domain")
    if not task or not benchmark_task or not domain:
        raise SystemExit("structure.meta 需要 task 和 domain")

    structure.setdefault("meta", {})["bridge"] = args.bridge
    bridge_proc = None
    if args.restart_bridge:
        port = int(args.bridge.rsplit(":", 1)[-1])
        bridge_proc = start_bridge(benchmark_task, domain, port)

    try:
        started = time.time()
        payload = {"flowId": FLOW_ID,
                   "params": {"structure": json.dumps(structure, ensure_ascii=False)}}
        response = http_json(args.backend + "/api/engine/flow", payload)
        run = json.loads(response["data"]["value"]["result"])
        elapsed = round(time.time() - started, 2)

        score = http_json(args.bridge + "/score")
        loops = run.get("loops", {})
        iterations = sum(v.get("iterations", 0) for v in loops.values())
        failed_assertions = [
            a for a in score.get("assertion_results", [])
            if not a.get("passed") and not a.get("excluded")
        ]

        record = {
            "task": task,
            "benchmark": benchmark_task,
            "domain": domain,
            "pattern": meta.get("pattern"),
            "structure": str(path.relative_to(REPO)),
            "baseline_score": baseline_score(benchmark_task),
            "structured_score": score.get("score"),
            "assertions_passed": score.get("assertions_passed"),
            "assertions_total": score.get("assertions_total"),
            "iterations": iterations,
            "elapsed_seconds": elapsed,
            "run": run,
            "score": score,
            "timestamp": datetime.now().isoformat(timespec="seconds"),
        }

        out = REPO / "results" / f"{task}.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

        csv_path = REPO / "results" / "before-after.csv"
        fields = ["task", "domain", "pattern", "baseline_score", "structured_score",
                  "assertions_passed", "assertions_total", "iterations", "elapsed_seconds"]
        rows = []
        if csv_path.exists():
            with csv_path.open(newline="", encoding="utf-8") as fh:
                rows = [r for r in csv.DictReader(fh) if r.get("task") != task]
        rows.append({k: str(record.get(k)) for k in fields})
        with csv_path.open("w", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=fields)
            writer.writeheader()
            writer.writerows(rows)

        print(json.dumps({
            "task": task,
            "status": run.get("status"),
            "error": run.get("error"),
            "baseline": record["baseline_score"],
            "score": record["structured_score"],
            "assertions": f"{record['assertions_passed']}/{record['assertions_total']}",
            "iterations": iterations,
            "failed_assertions": [a["type"] for a in failed_assertions],
            "elapsed": elapsed,
        }, ensure_ascii=False))
    finally:
        if bridge_proc is not None:
            bridge_proc.terminate()
            try:
                bridge_proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                bridge_proc.kill()


if __name__ == "__main__":
    main()
