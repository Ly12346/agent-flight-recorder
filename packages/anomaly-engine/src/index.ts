import { TraceBundle } from "@afr/trace-core";

export type AnomalySeverity = "info" | "medium" | "high";

export interface AnomalyInsight {
  id: string;
  traceId: string;
  title: string;
  description: string;
  severity: AnomalySeverity;
  score: number;
  category: "execution" | "reasoning" | "latency" | "policy";
  metrics: Record<string, number | string>;
}

export interface AnalyticsSnapshot {
  traceCount: number;
  actionCount: number;
  blockedCount: number;
  avgLatencyMs: number;
  avgPositionSize: number;
  avgLeverage: number;
  avgConfidence: number;
  toolUsage: Array<{
    tool: string;
    count: number;
  }>;
  actionByStatus: Array<{
    status: string;
    count: number;
  }>;
  symbolUsage: Array<{
    symbol: string;
    count: number;
  }>;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  return Number((total / values.length).toFixed(2));
}

function countBy<T extends string>(values: T[]): Array<{ key: T; count: number }> {
  const counts = new Map<T, number>();

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count);
}

export function buildAnalyticsSnapshot(bundles: TraceBundle[]): AnalyticsSnapshot {
  const actionBundles = bundles.filter((bundle) => bundle.action);
  const actionSizes = actionBundles
    .map((bundle) => bundle.action?.size ?? 0)
    .filter((size) => Number.isFinite(size) && size > 0);
  const leverages = actionBundles
    .map((bundle) => bundle.action?.leverage ?? 0)
    .filter((leverage) => Number.isFinite(leverage) && leverage > 0);
  const confidences = bundles
    .map((bundle) => bundle.decision?.confidence ?? 0)
    .filter((confidence) => Number.isFinite(confidence) && confidence > 0);
  const toolDurations = bundles.flatMap((bundle) =>
    bundle.spans.filter((span) => span.kind === "tool_call").map((span) => span.durationMs)
  );

  return {
    traceCount: bundles.length,
    actionCount: actionBundles.length,
    blockedCount: bundles.filter((bundle) => bundle.trace.status === "blocked").length,
    avgLatencyMs: average(toolDurations),
    avgPositionSize: average(actionSizes),
    avgLeverage: average(leverages),
    avgConfidence: average(confidences),
    toolUsage: countBy(
      bundles.flatMap((bundle) =>
        bundle.spans.filter((span) => span.kind === "tool_call").map((span) => span.name)
      )
    ).map(({ key, count }) => ({
      tool: key,
      count
    })),
    actionByStatus: countBy(
      actionBundles.map((bundle) => bundle.action?.status ?? "未知")
    ).map(({ key, count }) => ({
      status: key,
      count
    })),
    symbolUsage: countBy(bundles.map((bundle) => bundle.trace.symbol)).map(({ key, count }) => ({
      symbol: key,
      count
    }))
  };
}

export function detectAnomalies(bundles: TraceBundle[]): AnomalyInsight[] {
  const actionBundles = bundles.filter((bundle) => bundle.action);
  const baselinePositionSize = average(
    actionBundles.map((bundle) => bundle.action?.size ?? 0).filter((size) => size > 0)
  );
  const baselineLeverage = average(
    actionBundles.map((bundle) => bundle.action?.leverage ?? 0).filter((leverage) => leverage > 0)
  );
  const baselineLatency = average(
    bundles.flatMap((bundle) =>
      bundle.spans.filter((span) => span.kind === "tool_call").map((span) => span.durationMs)
    )
  );

  const insights: AnomalyInsight[] = [];

  for (const bundle of bundles) {
    const action = bundle.action;
    const averageToolLatency = average(
      bundle.spans.filter((span) => span.kind === "tool_call").map((span) => span.durationMs)
    );

    if (action && baselinePositionSize > 0 && action.size > baselinePositionSize * 1.8) {
      insights.push({
        id: `${bundle.trace.id}:position-size-drift`,
        traceId: bundle.trace.id,
        title: "仓位漂移",
        description: `这次仓位为 ${action.size}，明显高于当前观察到的平均值 ${baselinePositionSize}。`,
        severity: action.status === "blocked" ? "high" : "medium",
        score: Number((action.size / baselinePositionSize).toFixed(2)),
        category: "execution",
        metrics: {
          requestedSize: action.size,
          baselinePositionSize
        }
      });
    }

    if (action && baselineLeverage > 0 && action.leverage > baselineLeverage * 1.5) {
      insights.push({
        id: `${bundle.trace.id}:leverage-drift`,
        traceId: bundle.trace.id,
        title: "杠杆漂移",
        description: `请求杠杆 ${action.leverage} 高于当前观察到的平均值 ${baselineLeverage}。`,
        severity: action.status === "blocked" ? "high" : "medium",
        score: Number((action.leverage / baselineLeverage).toFixed(2)),
        category: "execution",
        metrics: {
          requestedLeverage: action.leverage,
          baselineLeverage
        }
      });
    }

    if (bundle.decision && bundle.decision.conflictsDetected.length > 0) {
      insights.push({
        id: `${bundle.trace.id}:signal-conflict`,
        traceId: bundle.trace.id,
        title: "信号冲突",
        description: `这次决策使用了互相冲突的信号：${bundle.decision.conflictsDetected.join(", ")}。`,
        severity: "medium",
        score: bundle.decision.conflictsDetected.length,
        category: "reasoning",
        metrics: {
          conflictCount: bundle.decision.conflictsDetected.length,
          confidence: bundle.decision.confidence
        }
      });
    }

    if (bundle.decision && bundle.decision.confidence < 0.58) {
      insights.push({
        id: `${bundle.trace.id}:low-confidence`,
        traceId: bundle.trace.id,
        title: "低置信度决策",
        description: `当前采用的假设置信度只有 ${(bundle.decision.confidence * 100).toFixed(0)}%。`,
        severity: "medium",
        score: Number((1 - bundle.decision.confidence).toFixed(2)),
        category: "reasoning",
        metrics: {
          confidence: bundle.decision.confidence
        }
      });
    }

    if (baselineLatency > 0 && averageToolLatency > baselineLatency * 1.75) {
      insights.push({
        id: `${bundle.trace.id}:latency-spike`,
        traceId: bundle.trace.id,
        title: "工具延迟尖峰",
        description: `当前平均工具延迟 ${averageToolLatency}ms，高于观察到的基线 ${baselineLatency}ms。`,
        severity: "medium",
        score: Number((averageToolLatency / baselineLatency).toFixed(2)),
        category: "latency",
        metrics: {
          averageToolLatency,
          baselineLatency
        }
      });
    }

    if (bundle.trace.status === "blocked") {
      insights.push({
        id: `${bundle.trace.id}:blocked-action`,
        traceId: bundle.trace.id,
        title: "执行被拦截",
        description: "这条 Trace 尝试执行的动作被策略护栏拦截了。",
        severity: "high",
        score: 1,
        category: "policy",
        metrics: {
          policyHitCount: bundle.policyHits.length,
          alertCount: bundle.alerts.length
        }
      });
    }

    const staleSignalDetected = bundle.spans.some((span) => {
      if (span.kind !== "tool_call") {
        return false;
      }

      return (
        span.outputJson.stale === true ||
        (typeof span.outputJson.dataAgeMinutes === "number" && span.outputJson.dataAgeMinutes > 30) ||
        (typeof span.outputJson.snapshotAgeMinutes === "number" &&
          span.outputJson.snapshotAgeMinutes > 30)
      );
    });

    if (staleSignalDetected) {
      insights.push({
        id: `${bundle.trace.id}:stale-data`,
        traceId: bundle.trace.id,
        title: "检测到过期数据",
        description: "在动作发生前，一个或多个工具调用返回了过期的市场上下文。",
        severity: "high",
        score: 1,
        category: "latency",
        metrics: {
          toolCallCount: bundle.spans.filter((span) => span.kind === "tool_call").length
        }
      });
    }

    const revengeSignalDetected = Boolean(
      bundle.decision &&
        (bundle.decision.signalsSeen.includes("近期连续亏损") ||
          bundle.decision.signalsSeen.includes("报复性冲动") ||
          bundle.decision.conflictsDetected.includes("冷静期违规"))
    );

    if (revengeSignalDetected) {
      insights.push({
        id: `${bundle.trace.id}:revenge-pattern`,
        traceId: bundle.trace.id,
        title: "报复性交易模式",
        description: "这条 Trace 在新开仓之前包含连续亏损或冷静期违规信号。",
        severity: "high",
        score: 1,
        category: "policy",
        metrics: {
          confidence: bundle.decision?.confidence ?? 0,
          conflictCount: bundle.decision?.conflictsDetected.length ?? 0
        }
      });
    }
  }

  return insights.sort((left, right) => {
    const severityRank = {
      high: 3,
      medium: 2,
      info: 1
    };
    return severityRank[right.severity] - severityRank[left.severity] || right.score - left.score;
  });
}
