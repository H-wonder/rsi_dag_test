# 代码快照：backend + platform

这个目录是为了方便评审**不切换四个仓库**也能直接读代码。它不是新的源码仓库，
而是从两个实际改动的仓库里复制出来的相关文件快照。

- 快照日期：2026-11-26
- backend：`rsi-flow-spring-boot`，分支 `feature-wonder`，commit `cf5fa94`
- platform：`rsi-flow-platform`，分支 `feature-wonder`，commit `03d139a`
- `rsi-flow` 引擎：**没有改**
- `rsi-flow-visual`：源码没有改；React 19 兼容补丁在 platform 的 `patches/` 里

> 权威代码在各自仓库的分支上；如果快照和仓库不一致，以仓库为准。

## 目录

```text
code/
├── backend/     rsi-flow-spring-boot 的相关文件
├── platform/    rsi-flow-platform 的相关文件
└── bridge/      automationbench-baseline/scripts/world_bridge.py
```

## backend 文件

| 文件 | 来源 | 说明 |
|---|---|---|
| `Run/code/FlowCodeRun.java` | 学长 `dev_examples` 骨架 + 我们修改 | 接收 structure，调用解释器，取 `/score`，写回 result |
| `Run/structure/StructureExecutor.java` | 我们新增 | 解释器：解析/校验/节点分发（18 个 case） |
| `Run/structure/LoopRunner.java` | 我们新增 | 循环执行：帧/终止/预算/状态/checkpoint（带详细注释） |
| `Run/structure/NodeSupport.java` | 我们新增 | 数组、数字、item 绑定、checkpoint 落盘 |
| `Run/structure/Expr.java` | 我们新增 | JEXL 求值 + `{{}}` 模板 |
| `Run/structure/BridgeClient.java` | 我们新增 | 调 bridge `/tool` 与 `/score` |
| `Run/structure/ModelClient.java` | 我们新增 | `extract` 的 OpenAI 兼容调用 |
| `Skill/code/FlowCodeFetch.java` | 我们新增 | `FLOW_SKILL_FETCH` 的代码节点 |
| `flow/Skills/flow-skill-fetch.json` | 我们新增 | 把 fetch 注册成 flow |
| `flow/Run/flow-run.json` | 学长 `dev_examples` | `FLOW_RUN` 的入口 flow，未改 |

阅读顺序建议：

```text
FlowCodeRun
  → StructureExecutor.run / executeNode
    → doTool / doBranch / doRows / doJoin / doFilter / doMap / doAggregate
    → doExtract
    → LoopRunner.run
      → NodeSupport / Expr
    → BridgeClient
```

## bridge

| 文件 | 来源 | 说明 |
|---|---|---|
| `bridge/world_bridge.py` | `automationbench-baseline` | 持有 AutomationBench WorldState，提供 `/tool`、`/score`、`/state`；Java 与 Python 的适配层 |

启动方式（一道题一个进程，在四项目工作区）：

```bash
cd automationbench-baseline
uv run --project ../datasets/AutomationBench python scripts/world_bridge.py \
  --domain hr --task hr.monday_onboarding_pipeline --port 8765
curl -s http://127.0.0.1:8765/health
```

完整的任务/domain 表、切题、重跑、端口占用和 `/score` 调试见
[../README.md](../README.md) 的“2. 起 bridge（重点）”。

## platform 文件

| 文件 | 来源 | 说明 |
|---|---|---|
| `src/xpages/Login/index.tsx` | 我们修改 | 任务下拉、运行按钮、getView→结构、结果面板、首次 setView 顺序 |
| `src/xpages/Login/wrapper.tsx` | 模板原有 | 页面入口（`'use client'`） |
| `src/xpages/Login/types.tsx` | 模板原有 | 页面 props 类型 |
| `src/xpages/Login/index.module.css` | 模板原有 | 页面样式 |
| `src/xpages/Login/handler/handler/diagramHandler.ts` | 模板原有 | 对 `VisualDiagram` ref 的 `getView/setView` 封装 |
| `src/xpages/Login/test/buildTest.tsx` | 我们新增 | 结构 JSON → 画布 elements/links（body 边 `edge:false`） |
| `src/xpages/Login/test/structures.ts` | 生成文件（快照） | 12 题结构数据；由 harness 从 `structures/*.json` 生成 |
| `src/flows/.../Run/index.ts` | 原有 | `flowRunFacade` 的 HTTP 封装 |
| `src/utils/axios/index.ts` | 模板原有 | axios 实例与响应拦截器（`value.result`） |
| `src/components/StandardModelEntity/wrapper.tsx` | 模板原有 | 画布节点渲染包装 |
| `src/components/StandardModelLink/wrapper.tsx` | 模板原有 | 画布连线渲染包装 |
| `next.config.ts` | 我们修改 | dev 代理 `/flowTesting-core` → `:39910`；`proxyTimeout=300s` |
| `package.json` | 我们修改 | `pnpm.patchedDependencies`，指向 React 19 兼容补丁 |
| `patches/rc-*.patch` | 我们新增 | `rc-util/rc-trigger/rc-align` 改读 `props.ref` |

`src/xpages/Login/test/structures.ts` 是 3025 行的生成文件，这里放了一份快照方便直接读平台数据；
它的权威源仍是：

```bash
python3 loop-structures/harness/export_platform_structures.py
```

从 `loop-structures/structures/*.json` 生成；如果快照过期，以脚本重新生成的结果为准。

## 如何放回原仓库

如果需要在原仓库里复现，按目录对应复制即可：

```bash
# backend
cp -r code/backend/core-flow rsi-flow-spring-boot/

# platform
cp -r code/platform/src rsi-flow-platform/
cp code/platform/next.config.ts code/platform/package.json rsi-flow-platform/
cp -r code/platform/patches rsi-flow-platform/
```

platform 复制后需要：

```bash
cd rsi-flow-platform
pnpm install --frozen-lockfile   # 应用 patches/ 里的补丁
pnpm dev
```

backend 构建：

```bash
cd rsi-flow-spring-boot
../scripts/mvn-rsi.sh -DskipTests package
```

## 没有放进来的东西

- `rsi-flow` 引擎：未改，不需要评审 diff；
- `rsi-flow-visual` 源码：未改；只有 platform 的 pnpm patch；
- `structures.ts` 的源：`structures/*.json`（快照已包含生成结果）；
- harness、文档、结果、报告：在仓库根目录，不在 `code/`；
- 任何密钥/`.env`/数据库密码：不进入仓库。

## 代码与文档的对应

- 逐行走读：[../docs/12-code-walkthrough.md](../docs/12-code-walkthrough.md)
- 循环语义：[../docs/01-loop-design.md](../docs/01-loop-design.md)
- 节点分层：[../docs/02-node-taxonomy.md](../docs/02-node-taxonomy.md)
- 平台闭环：[../docs/07-platform.md](../docs/07-platform.md)
- 报告：[../reports/Round3-Loop-Structures-Report.pdf](../reports/Round3-Loop-Structures-Report.pdf)
