# Submission Kit

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

## Key Highlights

- `MCP Trace Stitching`
  Group multiple tool calls into one coherent decision trace.

- `Replay`
  Reconstruct the chain of what the agent saw, decided, and attempted.

- `Risk Audit`
  Support `allow / warn / block` before execution.

- `Anomaly Detection`
  Detect oversized positions, leverage drift, stale data, and revenge-trading patterns.

- `Incident Export`
  Generate structured reports and Markdown summaries for post-mortems.

## Recommended Demo Order

1. Open the dashboard landing page.
2. Select `oversized-position`.
3. Show trace steps, decision summary, and blocked action.
4. Show the policy hits that blocked the trade.
5. Open the incident report panel.
6. Show adapter previews for console, webhook, and Telegram.
7. Switch to `analytics` to show anomaly insights.
8. Optionally load `stale-data` or `revenge-trading` as a second incident type.

## Track Fit

Recommended track:

`Trading infrastructure`

Why:

- This project is not another trading bot.
- It improves trust, observability, replayability, and controllability for AI trading agents.
- It can sit under any agent that uses MCP tools or trading skills.

## Submission Checklist

- GitHub repository
- Short project description
- Demo video link
- Demo script
- Screenshots / GIFs of the main dashboard flow
- Clear run instructions in the repository root
