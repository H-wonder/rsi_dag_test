#!/usr/bin/env python3
"""Export the 10 main structures into the platform's structures.ts."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
STRUCTS = ROOT / "loop-structures" / "structures"
OUT = ROOT / "rsi-flow-platform" / "src" / "xpages" / "Login" / "test" / "structures.ts"
SKIP = ("ablation.", "transfer.", "skill.", "stress.")


def main() -> None:
    files = [p for p in sorted(STRUCTS.glob("*.json")) if not p.name.startswith(SKIP)]
    lines = [
        "// 由 loop-structures/structures/*.json 生成，供画布演示使用。",
        "// 重新生成：python3 loop-structures/harness/export_platform_structures.py",
        "export const structures: Record<string, any> = {",
    ]
    for path in files:
        data = json.loads(path.read_text())
        task = data["meta"]["task"]
        lines.append(f"  {json.dumps(task)}: {json.dumps(data, ensure_ascii=False, indent=2)},")
    lines.append("};")
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {OUT} ({len(files)} tasks)")


if __name__ == "__main__":
    main()
