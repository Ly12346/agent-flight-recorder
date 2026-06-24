# Agent Flight Recorder + Risk Audit

`Trading infrastructure for AI agents: trace, replay, risk guardrails, anomaly detection, and incident reports.`

Agent Flight Recorder + Risk Audit 是一个面向 AI 交易 Agent 的黑匣子与风控审计层。  
它通过 MCP 代理记录 Agent 的工具调用，把一轮相关调用归并成一条完整决策记录，并提供回放、风控拦截、异常检测、事故报告导出，以及 console / webhook / Telegram 告警适配预览。

## Why This Project

AI 交易 Agent 最大的问题通常不是“不会交易”，而是出了问题之后：

- 没人知道它当时看到了什么
- 没人知道它为什么这么决策
- 没人知道为什么风险没有被及时拦住

这个项目解决的是`可追踪、可解释、可控制`三件事。

## What It Does

- `MCP Trace Stitching`
  把一轮相关的 `tools/call` 请求归并成一条完整决策记录，而不是孤立日志。

- `Replay`
  回放 Agent 当时的输入、判断、动作、策略命中和告警。

- `Risk Audit`
  提供交易前 `allow / warn / block` 风控拦截。

- `Anomaly Detection`
  检测超大仓位、杠杆漂移、低置信度、数据过期、报复性交易等异常模式。

- `Incident Export`
  生成结构化 JSON + Markdown 事故报告。

- `Alert Adapters`
  预览 console / webhook / Telegram 三类告警载荷。

## Best Demo Path

最推荐给评委演示的路径：

1. 打开 `决策中心`
2. 点击 `超大仓位拦截`
3. 展示工具调用、决策摘要、执行动作
4. 展示为什么被风控拦下
5. 展示 `事故报告`
6. 展示 `告警适配器`
7. 切到 `分析` 页面展示异常洞察

补充演示场景：

- `信号冲突审查`
- `过期数据拦截`
- `冷静期违规拦截`

## Demo Scenarios

内置可重复场景：

- `normal-trade`
- `oversized-position`
- `signal-conflict`
- `stale-data`
- `revenge-trading`

## Quick Start

```bash
cd /opt/homebrew/agent-flight-recorder
corepack pnpm install
corepack pnpm build
corepack pnpm demo
```

默认地址：

- Dashboard: `http://127.0.0.1:4173`
- API: `http://127.0.0.1:8787`

## Useful Commands

```bash
corepack pnpm typecheck
corepack pnpm build
corepack pnpm --filter @afr/demo-sample-agent demo all
corepack pnpm --filter @afr/api demo
corepack pnpm --filter @afr/dashboard demo
```

单独种入某个场景：

```bash
node packages/cli/dist/index.js demo seed oversized-position
```

## Real MCP Proxy

你可以把代理挂到一个 stdio MCP server 前面：

```bash
node packages/cli/dist/packages/cli/src/index.js proxy \
  --upstream-command ./bin/brew \
  --upstream-arg mcp-server \
  --policy-profile balanced
```

测试时也可以缩短归并窗口：

```bash
node packages/cli/dist/packages/cli/src/index.js proxy \
  --upstream-command ./bin/brew \
  --upstream-arg mcp-server \
  --decision-idle-ms 1500
```

## Incident Export & Adapters

API 已提供以下接口：

- `GET /replay/:traceId`
- `GET /incidents/:traceId/report`
- `GET /incidents/:traceId/adapters`

其中：

- `report` 返回结构化 JSON + Markdown 事故报告
- `adapters` 返回 console / webhook / Telegram 预览载荷

## Repository Map

- `apps/api`
  HTTP API，提供 traces、replay、alerts、analytics、事故导出和 demo 场景加载接口

- `apps/dashboard`
  React 仪表盘，包含决策中心、告警、策略、分析、事故报告和适配器预览

- `packages/mcp-proxy`
  stdio MCP 代理，支持 trace 记录、归并和交易前拦截

- `packages/trace-core`
  统一事件模型

- `packages/recorder`
  SQLite 记录层

- `packages/replay-engine`
  回放构建器

- `packages/risk-audit`
  风控规则与告警生成

- `packages/anomaly-engine`
  行为基线与异常检测

- `packages/incident-report`
  事故报告导出

- `packages/adapters`
  告警适配器预览

- `demo/sample-agent`
  可重复 demo Agent 和场景

## Submission Notes

如果你正在为比赛提交准备材料，建议同时查看：

- [Architecture](./docs/architecture.md)
- [Demo Script](./docs/demo-script.md)
- [Submission Kit](./docs/submission-kit.md)
