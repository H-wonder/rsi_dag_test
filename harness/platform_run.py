#!/usr/bin/env python3
"""Run every structure through the rsi-flow-platform UI (headless Firefox).

Requires:
- backend on :39910 (platform dev proxy target)
- platform dev server on :3000
- geckodriver in PATH

For each structure: start its bridge, open /?task=<task>, click 运行,
read /score, save screenshot to results/platform-<task>.png.
"""

from __future__ import annotations

import argparse
import base64
import os
import csv
import json
import subprocess
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REPO = ROOT / "loop-structures"
BRIDGE_CWD = ROOT / "automationbench-baseline"
PLATFORM = "http://localhost:3000"
BACKEND = "http://127.0.0.1:39910"
BRIDGE = "http://127.0.0.1:8765"
FLOW_ID = "@com.horsecoder.common.whuTalent.flowTesting.core/FLOW_RUN"


def http_json(url: str, payload: dict | None = None, timeout: int = 120) -> dict:
    data = None if payload is None else json.dumps(payload).encode()
    headers = {} if payload is None else {"Content-Type": "application/json"}
    req = urllib.request.Request(url, data=data, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())


def wait_health(url: str, seconds: int = 90) -> None:
    deadline = time.time() + seconds
    while time.time() < deadline:
        try:
            if http_json(url + "/health", timeout=3).get("ok"):
                return
        except Exception:
            pass
        time.sleep(1)
    raise SystemExit(f"bridge not ready: {url}")


def start_bridge(task: str, domain: str) -> subprocess.Popen:
    return subprocess.Popen(
        ["uv", "run", "--project", "../datasets/AutomationBench", "python",
         "scripts/world_bridge.py", "--domain", domain, "--task", task, "--port", "8765"],
        cwd=str(BRIDGE_CWD),
        stdout=open(f"/tmp/platform-bridge-{task}.log", "w"),
        stderr=subprocess.STDOUT,
    )


def stop_bridge(proc: subprocess.Popen) -> None:
    try:
        proc.terminate()
        proc.wait(timeout=10)
    except (ProcessLookupError, PermissionError):
        pass
    except subprocess.TimeoutExpired:
        try:
            proc.kill()
        except (ProcessLookupError, PermissionError):
            pass


def wait_for_score(bridge: str, seconds: int) -> dict:
    """Poll /score until it reaches 1.0 (or timeout), for slow LLM structures."""
    deadline = time.time() + seconds
    last = {}
    while time.time() < deadline:
        try:
            last = http_json(bridge + "/score", timeout=10)
            if last.get("score") == 1.0:
                return last
        except Exception:
            pass
        time.sleep(2)
    return last


class Driver:
    def __init__(self) -> None:
        self.proc = subprocess.Popen(["geckodriver", "--port", os.environ.get("GECKODRIVER_PORT", "4455")],
                                     stdout=open("/tmp/geckodriver-platform.log", "w"),
                                     stderr=subprocess.STDOUT)
        time.sleep(2)
        session = self._post("/session", {
            "capabilities": {"alwaysMatch": {
                "browserName": "firefox",
                "moz:firefoxOptions": {"args": ["-headless"]},
            }}
        })
        self.sid = session["value"]["sessionId"]
        self.port = os.environ.get("GECKODRIVER_PORT", "4455")
        self.base = f"http://127.0.0.1:{self.port}/session/{self.sid}"

    def _post(self, path: str, payload: dict) -> dict:
        req = urllib.request.Request(self.base + path if hasattr(self, "base") else f"http://127.0.0.1:{os.environ.get('GECKODRIVER_PORT', '4455')}" + path,
                                     data=json.dumps(payload).encode(),
                                     headers={"Content-Type": "application/json"},
                                     method="POST")
        with urllib.request.urlopen(req, timeout=120) as resp:
            return json.loads(resp.read().decode())

    def get(self, path: str) -> dict:
        with urllib.request.urlopen(self.base + path, timeout=120) as resp:
            return json.loads(resp.read().decode())

    def navigate(self, url: str) -> None:
        self._post("/url", {"url": url})

    def click_run(self) -> str:
        script = ("const b=[...document.querySelectorAll('button')]"
                  ".find(x=>x.innerText.replace(/\\s/g,'').includes('运行'));"
                  "if(!b) return 'no-button'; b.click(); return 'clicked';")
        result = self._post("/execute/sync", {"script": script, "args": []})
        return result.get("value")

    def screenshot(self, path: Path) -> None:
        data = self.get("/screenshot")
        path.write_bytes(base64.b64decode(data["value"]))

    def close(self) -> None:
        try:
            req = urllib.request.Request(self.base, method="DELETE")
            urllib.request.urlopen(req, timeout=30).read()
        except Exception:
            pass
        try:
            self.proc.terminate()
        except (ProcessLookupError, PermissionError):
            pass


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default="",
                    help="comma-separated task names; default = every non-stress structure")
    ap.add_argument("--append", action="store_true", help="append rows to platform-runs.csv")
    ap.add_argument("--score-timeout", type=int, default=300,
                    help="seconds to wait for a 1.0 score after clicking 运行")
    args = ap.parse_args()

    only = {x.strip() for x in args.only.split(",") if x.strip()}
    structures = []
    for p in sorted((REPO / "structures").glob("*.json")):
        if p.name.startswith("stress."):
            continue
        data = json.loads(p.read_text())
        if only and data["meta"]["task"] not in only:
            continue
        structures.append(p)
    driver = Driver()
    rows = []
    try:
        for path in structures:
            structure = json.loads(path.read_text())
            task = structure["meta"]["task"]
            domain = structure["meta"]["domain"]
            subprocess.run(["fuser", "-k", "8765/tcp"], capture_output=True)
            proc = start_bridge(task, domain)
            try:
                wait_health(BRIDGE)
                driver.navigate(f"{PLATFORM}/?task={task}")
                time.sleep(4)
                clicked = driver.click_run()
                time.sleep(3)
                score = wait_for_score(BRIDGE, args.score_timeout)
                shot = REPO / "results" / f"platform-{task}.png"
                driver.screenshot(shot)
                row = {
                    "task": task,
                    "clicked": clicked,
                    "score": score.get("score"),
                    "assertions": f"{score.get('assertions_passed')}/{score.get('assertions_total')}",
                    "screenshot": str(shot.relative_to(REPO)),
                }
                rows.append(row)
                print(json.dumps(row, ensure_ascii=False))
            finally:
                stop_bridge(proc)
    finally:
        driver.close()

    csv_path = REPO / "results" / "platform-runs.csv"
    mode = "a" if args.append and csv_path.exists() else "w"
    with csv_path.open(mode, newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=["task", "clicked", "score", "assertions", "screenshot"])
        if mode == "w":
            writer.writeheader()
        writer.writerows(rows)


if __name__ == "__main__":
    main()
