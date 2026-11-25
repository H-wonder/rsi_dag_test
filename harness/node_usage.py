#!/usr/bin/env python3
"""Node usage across the 10 main structures (excluding ablations/transfers/stress)."""

from __future__ import annotations

import json
from collections import Counter, defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]


def main() -> None:
    usage: dict[str, set[str]] = defaultdict(set)
    total = 0
    tasks = 0
    for path in sorted((REPO / "structures").glob("*.json")):
        if path.name.startswith(("ablation.", "transfer.", "stress.")):
            continue
        data = json.loads(path.read_text())
        task = data["meta"]["task"]
        tasks += 1
        for node in data["nodes"]:
            usage[node["type"]].add(task)
            total += 1

    print(f"tasks={tasks} nodes={total} types={len(usage)}\n")
    print("| 节点类型 | 任务数 | 占比 |")
    print("|---|---|---|")
    for node_type, users in sorted(usage.items(), key=lambda kv: (-len(kv[1]), kv[0])):
        print(f"| `{node_type}` | {len(users)} | {len(users)/tasks:.0%} |")

    reused = sum(1 for users in usage.values() if len(users) >= 2)
    print(f"\n复用率（≥2 题使用的类型）：{reused}/{len(usage)} = {reused/len(usage):.0%}")
    single = [(t, u) for t, u in usage.items() if len(u) == 1]
    if single:
        print("只在一题使用的类型：", ", ".join(t for t, _ in single))


if __name__ == "__main__":
    main()
