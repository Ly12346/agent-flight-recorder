import { resolve } from "node:path";
import { ProxyCaptureSession } from "@afr/mcp-proxy";
import { SqliteRecorder } from "@afr/recorder";
import { evaluateTraceBundle, PolicyProfileName } from "@afr/risk-audit";

export const availableScenarioNames = [
  "normal-trade",
  "oversized-position",
  "signal-conflict",
  "stale-data",
  "revenge-trading"
] as const;

export type ScenarioName = (typeof availableScenarioNames)[number];

const scenarioTraceIds: Record<ScenarioName, string> = {
  "normal-trade": "demo_trace_normal_trade",
  "oversized-position": "demo_trace_oversized_position",
  "signal-conflict": "demo_trace_signal_conflict",
  "stale-data": "demo_trace_stale_data",
  "revenge-trading": "demo_trace_revenge_trading"
};

const scenarioSessionIds: Record<ScenarioName, string> = {
  "normal-trade": "demo_session_normal_trade",
  "oversized-position": "demo_session_oversized_position",
  "signal-conflict": "demo_session_signal_conflict",
  "stale-data": "demo_session_stale_data",
  "revenge-trading": "demo_session_revenge_trading"
};

function createBaseSession(name: ScenarioName) {
  const session = new ProxyCaptureSession({
    agentId: "agent_demo_alpha",
    agentName: "演示版 BTC 宏观交易 Agent",
    agentVersion: "0.1.0",
    objective: "使用分析技能和保守风控护栏交易 BTCUSDT。",
    symbol: "BTCUSDT",
    sessionId: scenarioSessionIds[name],
    metadata: {
      source: "sample-agent",
      scenarioName: name
    }
  });

  session.trace.id = scenarioTraceIds[name];

  return session;
}

export function createScenarioBundle(
  name: ScenarioName,
  profileName: PolicyProfileName = "balanced"
) {
  const session = createBaseSession(name);

  switch (name) {
    case "normal-trade":
      session.recordToolCall({
        name: "sentiment-analyst",
        inputJson: {
          symbol: "BTCUSDT"
        },
        outputJson: {
          fearGreedIndex: 44,
          sentiment: "中性"
        },
        durationMs: 480
      });
      session.recordToolCall({
        name: "technical-analysis",
        inputJson: {
          symbol: "BTCUSDT",
          timeframe: "1h"
        },
        outputJson: {
          trend: "看多",
          breakout: true
        },
        durationMs: 650
      });
      session.recordDecision({
        signalsSeen: ["看多趋势", "区间突破"],
        conflictsDetected: [],
        chosenHypothesis: "趋势延续概率较高",
        riskChecks: ["仓位在档位限制内", "杠杆在档位限制内"],
        confidence: 0.74,
        explanationSummary: "趋势和突破信号一致，因此 Agent 选择小仓位做多。"
      });
      session.recordAction({
        actionType: "open_position",
        symbol: "BTCUSDT",
        side: "long",
        size: 0.2,
        leverage: 2,
        summary: "开一个小仓位 BTC 多单。"
      });
      break;
    case "oversized-position":
      session.recordToolCall({
        name: "macro-news",
        inputJson: {
          symbol: "BTCUSDT"
        },
        outputJson: {
          summary: "ETF 资金流叙事仍然偏正面。"
        },
        durationMs: 530
      });
      session.recordToolCall({
        name: "technical-analysis",
        inputJson: {
          symbol: "BTCUSDT",
          timeframe: "4h"
        },
        outputJson: {
          trend: "看多",
          volatility: "高"
        },
        durationMs: 710
      });
      session.recordDecision({
        signalsSeen: ["看多趋势", "高波动"],
        conflictsDetected: [],
        chosenHypothesis: "动量足以支持激进入场",
        riskChecks: ["波动率偏高"],
        confidence: 0.61,
        explanationSummary: "Agent 想趁着动量放大仓位激进入场。"
      });
      session.recordAction({
        actionType: "open_position",
        symbol: "BTCUSDT",
        side: "long",
        size: 2.5,
        leverage: 7,
        summary: "开一个大仓位 BTC 多单。"
      });
      break;
    case "signal-conflict":
      session.recordToolCall({
        name: "sentiment-analyst",
        inputJson: {
          symbol: "BTCUSDT"
        },
        outputJson: {
          fearGreedIndex: 22,
          sentiment: "极度恐惧"
        },
        durationMs: 410
      });
      session.recordToolCall({
        name: "technical-analysis",
        inputJson: {
          symbol: "BTCUSDT",
          timeframe: "1h"
        },
        outputJson: {
          trend: "看多",
          breakout: true
        },
        durationMs: 605
      });
      session.recordDecision({
        signalsSeen: ["极度恐惧", "看多突破"],
        conflictsDetected: ["情绪与技术面冲突"],
        chosenHypothesis: "技术动量强于情绪恐慌",
        riskChecks: ["执行前需要审查信号冲突"],
        confidence: 0.51,
        explanationSummary: "Agent 倾向做多，但当前信号之间并不一致。"
      });
      session.recordAction({
        actionType: "open_position",
        symbol: "BTCUSDT",
        side: "long",
        size: 0.4,
        leverage: 3,
        summary: "突破后谨慎开一个 BTC 多单。"
      });
      break;
    case "stale-data":
      session.recordToolCall({
        name: "market-snapshot",
        inputJson: {
          symbol: "BTCUSDT"
        },
        outputJson: {
          price: 68120,
          dataAgeMinutes: 47,
          stale: true
        },
        durationMs: 390
      });
      session.recordToolCall({
        name: "technical-analysis",
        inputJson: {
          symbol: "BTCUSDT",
          timeframe: "1h"
        },
        outputJson: {
          trend: "看多",
          snapshotAgeMinutes: 44
        },
        durationMs: 520
      });
      session.recordDecision({
        signalsSeen: ["看多趋势", "市场快照过期"],
        conflictsDetected: [],
        chosenHypothesis: "趋势仍偏积极，但数据已经过期",
        riskChecks: ["市场快照已超过时效阈值", "下单前必须刷新"],
        confidence: 0.66,
        explanationSummary: "形态看起来可以交易，但底层市场快照已经过期。"
      });
      session.recordAction({
        actionType: "open_position",
        symbol: "BTCUSDT",
        side: "long",
        size: 0.3,
        leverage: 2,
        summary: "尝试使用过期市场数据开多单。"
      });
      break;
    case "revenge-trading":
      session.recordToolCall({
        name: "portfolio-state",
        inputJson: {
          symbol: "BTCUSDT"
        },
        outputJson: {
          recentLossStreak: 3,
          pnl24h: -1280,
          cooldownActive: true
        },
        durationMs: 300
      });
      session.recordToolCall({
        name: "technical-analysis",
        inputJson: {
          symbol: "BTCUSDT",
          timeframe: "15m"
        },
        outputJson: {
          trend: "看多",
          breakout: true,
          volatility: "高"
        },
        durationMs: 460
      });
      session.recordDecision({
        signalsSeen: ["近期连续亏损", "报复性冲动", "看多突破"],
        conflictsDetected: ["冷静期违规"],
        chosenHypothesis: "这次突破可以快速弥补最近亏损",
        riskChecks: ["当前仍在冷静期", "连续亏损超过阈值"],
        confidence: 0.57,
        explanationSummary: "Agent 在刚经历亏损后，试图立即追一个快速回血的交易。"
      });
      session.recordAction({
        actionType: "open_position",
        symbol: "BTCUSDT",
        side: "long",
        size: 0.5,
        leverage: 3,
        summary: "在冷静期内尝试开一笔回血交易。"
      });
      break;
  }

  const result = evaluateTraceBundle(
    {
      trace: session.trace,
      spans: session.spans,
      decision: session.decision,
      action: session.action,
      policyHits: [],
      alerts: []
    },
    profileName
  );

  session.appendPolicyHits(result.policyHits);
  session.appendAlerts(result.alerts);

  if (result.decision === "block" && session.action) {
    session.action.status = "blocked";
    session.action.blockedByPolicyId = result.policyHits.find((hit) => hit.decision === "block")?.id;
  }

  return session.finalize(result.decision === "block" ? "blocked" : "completed");
}

export function seedScenario(databasePath: string, name: ScenarioName): void {
  const recorder = new SqliteRecorder(databasePath);
  recorder.insertTraceBundle(createScenarioBundle(name));
  recorder.close();
}

function main(): void {
  const rootDirectory = process.env.INIT_CWD ?? process.cwd();
  const databasePath =
    process.env.AFR_DB_PATH ??
    resolve(rootDirectory, "demo/recorded-data/agent-flight-recorder.sqlite");
  const scenario = process.argv[2];
  const recorder = new SqliteRecorder(databasePath);

  if (!scenario || scenario === "all") {
    for (const scenarioName of availableScenarioNames) {
      recorder.insertTraceBundle(createScenarioBundle(scenarioName));
    }
    recorder.close();
    console.log(`Seeded ${availableScenarioNames.length} scenarios into ${databasePath}`);
    return;
  }

  if (!availableScenarioNames.includes(scenario as ScenarioName)) {
    recorder.close();
    console.error(`Unknown scenario: ${scenario}`);
    process.exitCode = 1;
    return;
  }

  recorder.insertTraceBundle(createScenarioBundle(scenario as ScenarioName));
  recorder.close();
  console.log(`Seeded scenario "${scenario}" into ${databasePath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
