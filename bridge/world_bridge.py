#!/usr/bin/env python3
"""Local HTTP bridge between rsi-flow (Java) and an AutomationBench WorldState.

The Java ToolNode cannot import the Python benchmark, so this process owns one
task's WorldState and exposes a tiny JSON API:

    GET  /health              -> {"ok": true, "task": "..."}
    GET  /task                -> prompt / tools / task_name
    POST /tool                -> {"name": "api_fetch", "arguments": {...}}
    GET  /score               -> partial credit + assertion results
    GET  /state               -> current WorldState JSON (debug)

Run with the benchmark environment:
    cd automationbench-baseline
    uv run --project ../datasets/AutomationBench python scripts/world_bridge.py \
        --domain sales --task sales.multi_hop_lookup --port 8765
"""

from __future__ import annotations

import argparse
import json
import threading
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from automationbench.domains import get_domain_dataset
from automationbench.rubric import partial_credit
from automationbench.runner import compute_allowed_services
from automationbench.schema.world import WorldState
from automationbench.tools.api import api_fetch, api_search, base64_encode


class World:
    def __init__(self, domain: str, task_name: str) -> None:
        dataset = get_domain_dataset(domain)
        found = None
        for row in dataset:
            info = json.loads(row["info"])
            if info.get("task_name") == task_name:
                found = (row, info)
                break
        if found is None:
            raise SystemExit(f"task not found: {domain}/{task_name}")
        self.row, self.info = found
        self.task_name = task_name
        self.initial_state = self.info["initial_state"]
        self.world = WorldState(**self.initial_state)
        self.world.meta.allowed_services = compute_allowed_services(
            self.initial_state,
            self.info.get("assertions", []),
            self.info.get("zapier_tools", []),
        )
        self.lock = threading.Lock()

    def prompt_text(self) -> str:
        prompt = self.row.get("prompt") or []
        if isinstance(prompt, list):
            return "\n".join(
                str(part.get("content", "")) if isinstance(part, dict) else str(part)
                for part in prompt
            )
        return str(prompt)

    def call_tool(self, name: str, arguments: dict) -> str:
        if name == "api_search":
            return api_search(
                arguments.get("query", ""),
                int(arguments.get("top_k", 5)),
            )
        if name == "api_fetch":
            return api_fetch(
                self.world,
                arguments.get("method", "GET"),
                arguments.get("url", ""),
                arguments.get("params"),
                arguments.get("body"),
            )
        if name == "base64_encode":
            return base64_encode(arguments.get("text", ""))
        raise ValueError(f"unsupported tool: {name}")

    def score(self) -> dict:
        state = {
            "world": self.world,
            "info": self.info,
            "initial_state": self.initial_state,
        }
        score = partial_credit(state)
        assertions = state.get("_assertion_results", [])
        passed = sum(1 for a in assertions if a.get("passed") and not a.get("excluded"))
        total = sum(1 for a in assertions if not a.get("excluded"))
        return {
            "score": score,
            "task_completed_correctly": 1.0 if score == 1.0 else 0.0,
            "assertions_passed": passed,
            "assertions_total": total,
            "assertion_results": assertions,
        }


def make_handler(world: World):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):
            return

        def _send(self, status: int, payload) -> None:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            try:
                if self.path == "/health":
                    self._send(200, {"ok": True, "task": world.task_name})
                elif self.path == "/task":
                    self._send(
                        200,
                        {
                            "task_name": world.task_name,
                            "prompt": world.prompt_text(),
                            "tools": world.info.get("zapier_tools", []),
                            "assertions_total": len(world.info.get("assertions", [])),
                        },
                    )
                elif self.path == "/score":
                    with world.lock:
                        self._send(200, world.score())
                elif self.path == "/state":
                    with world.lock:
                        self._send(200, world.world.model_dump(mode="json"))
                else:
                    self._send(404, {"error": "not found"})
            except Exception as exc:
                self._send(500, {"error": str(exc), "trace": traceback.format_exc()})

        def do_POST(self):
            try:
                length = int(self.headers.get("Content-Length", "0"))
                payload = json.loads(self.rfile.read(length) or b"{}")
                if self.path != "/tool":
                    self._send(404, {"error": "not found"})
                    return
                name = payload.get("name")
                arguments = payload.get("arguments") or {}
                with world.lock:
                    result = world.call_tool(name, arguments)
                self._send(200, {"result": result})
            except Exception as exc:
                self._send(500, {"error": str(exc), "trace": traceback.format_exc()})

    return Handler


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--domain", required=True)
    parser.add_argument("--task", required=True)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()

    world = World(args.domain, args.task)
    server = ThreadingHTTPServer((args.host, args.port), make_handler(world))
    print(
        f"world bridge: {args.task} on http://{args.host}:{args.port}",
        flush=True,
    )
    server.serve_forever()


if __name__ == "__main__":
    main()
