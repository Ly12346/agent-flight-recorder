# Submission Kit

## Core Links

- Repository
  `https://github.com/Ly12346/agent-flight-recorder`
- Recommended track
  `Trading infrastructure`
- Demo video
  Add your final video link here before submission.

## Recommended Project Title

`Agent Flight Recorder + Risk Audit`

Subtitle:

`A Black Box and Policy Guard for AI Trading Agents`

## One-line Pitch

English:

`Agent Flight Recorder + Risk Audit is a black-box and policy guard for AI trading agents, providing decision tracing, replay, anomaly detection, and pre-trade blocking.`

中文：

`Agent Flight Recorder + Risk Audit 是一个面向 AI 交易 Agent 的黑匣子与风控审计层，提供决策追踪、回放、异常检测和交易前拦截。`

## Short Description

English:

`AI trading agents often fail not because they cannot trade, but because nobody can reconstruct what they saw, why they decided, and why risky behavior was not stopped in time. Agent Flight Recorder + Risk Audit solves this by acting as an infrastructure layer for tracing, replay, policy guardrails, anomaly detection, incident reporting, and alert delivery previews.`

中文：

`AI 交易 Agent 的问题往往不是“不会交易”，而是出了问题后没人知道它当时看到了什么、为什么这么决策，以及为什么风险没有被及时拦下。Agent Flight Recorder + Risk Audit 通过决策追踪、回放、风控护栏、异常检测、事故报告和告警预览来解决这个问题。`

## Long Description

English:

`This project provides infrastructure for AI trading agents rather than another trading bot. Through an MCP proxy, it captures and stitches related tool calls into a single decision trace, then reconstructs the decision chain with replay, applies pre-trade policy guardrails, highlights anomalous behavior such as oversized positions or stale data, and generates incident reports plus alert payload previews. The goal is to make AI trading agents traceable, explainable, and controllable.`

中文：

`这个项目不是另一个交易机器人，而是一层面向 AI 交易 Agent 的基础设施。它通过 MCP 代理抓取并归并相关工具调用，把一轮决策整理成一条完整记录，再通过回放重建决策链路，提供交易前策略拦截、异常行为识别，以及事故报告和告警适配预览。目标是让 AI 交易 Agent 变得可追踪、可解释、可控制。`

## Key Highlights

- `MCP Trace Stitching`
  Group multiple tool calls into a single decision trace.

- `Replay`
  Reconstruct what the agent saw, decided, and attempted.

- `Risk Audit`
  Support `allow / warn / block` before execution.

- `Anomaly Detection`
  Detect oversized positions, leverage drift, stale data, and revenge-trading patterns.

- `Incident Export`
  Generate structured reports and Markdown post-mortems.

- `Alert Adapters`
  Preview payloads for console, webhook, and Telegram.

## Judge Demo Order

Recommended sequence:

1. Open `决策中心`
2. Select `超大仓位拦截`
3. Show replay steps, decision summary, and blocked action
4. Show risk audit and policy hits
5. Show incident report
6. Show adapter previews
7. Switch to `分析`
8. Optionally load `过期数据拦截` or `冷静期违规拦截`

## Recommended Submission Fields

### Project name

`Agent Flight Recorder + Risk Audit`

### Track

`Trading infrastructure`

### Team introduction

English:

`We build infrastructure for AI trading agents: traceability, replay, risk guardrails, anomaly detection, and incident reporting.`

中文：

`我们专注于 AI 交易 Agent 基础设施，提供决策追踪、回放、风控护栏、异常检测和事故报告能力。`

### Why this matters

English:

`AI agents should not remain opaque execution systems. This project makes them traceable, explainable, and controllable.`

中文：

`AI Agent 不应该继续停留在黑箱执行阶段。这个项目的价值在于让它们变得可追踪、可解释、可控制。`

## What To Upload

- GitHub repository link
- Demo video link
- Short project description
- Track selection
- Optional screenshots

## Video Recording Notes

- Keep it between `2` and `3` minutes
- Lead with the `超大仓位拦截` scene
- Do not start with architecture diagrams
- Keep the story focused on:
  `trace -> replay -> risk block -> incident report -> adapters -> analytics`
