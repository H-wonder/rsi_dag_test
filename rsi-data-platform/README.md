# rsi-data-platform

第三轮的 rsi-flow 前端。负责：

- 任务选择器（`?task=<task>`）；
- 结构 JSON → 画布（`test/buildTest.tsx`）；
- 点“运行” → `getView` → POST `/flowTesting-core/api/engine/flow`；
- 结果面板：`status | score | assertions` + `loops`。

## 环境

- Node.js 24（建议用 nvm）
- pnpm 9
- 后端 `../rsi-data-spring-boot` 在 `:39910`
- 画布库 `../rsi-data-visual`（随总仓库提供，不要改名/移动）

## 安装与启动

```bash
pnpm install --frozen-lockfile
pnpm dev
```

打开：

```text
http://localhost:3000/?task=hr.monday_onboarding_pipeline
```

`next.config.ts` 把 `/flowTesting-core/*` 代理到
`http://localhost:39910/*`，并设置了 `proxyTimeout=300000`，避免发票题
约 100 秒的模型调用被 30 秒截断。

## 构建

```bash
pnpm build
```

注意：项目配置了 `output: 'export'`，生产静态导出不会带 dev 代理；
需要联调时用 `pnpm dev`。

## React 19 兼容补丁

`@horsecoder/visual-core` 依赖的 `rc-util / rc-trigger / rc-align` 会读取
React 19 已移除的 `element.ref`。仓库里的 `patches/` 通过
`package.json` 的 `pnpm.patchedDependencies` 自动应用，`pnpm install` 后生效。

## 跑完整任务

前端只负责展示和触发。实际执行还需要：

1. 后端 `:39910`；
2. AutomationBench bridge `:8765`；
3. 结构 JSON（总仓库 `structures/`）。

启动顺序、bridge 命令和任务表见总仓库
[README](../README.md) 的“如何运行 / bridge 启动方式”。

## 目录

```text
src/xpages/Login/index.tsx            运行逻辑/结果面板
src/xpages/Login/test/buildTest.tsx   结构 JSON → 画布
src/xpages/Login/test/structures.ts   12 题结构（生成文件）
src/flows/.../Run/index.ts            flowRunFacade
patches/                              React 19 兼容补丁
```
