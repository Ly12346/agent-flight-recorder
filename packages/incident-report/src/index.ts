import { AlertSeverity, ReplayArtifact } from "@afr/trace-core";

const actionTypeLabels: Record<string, string> = {
  open_position: "开仓",
  close_position: "平仓",
  hold: "观望",
  block: "拦截"
};

const sideLabels: Record<string, string> = {
  long: "做多",
  short: "做空",
  flat: "空仓"
};

const statusLabels: Record<string, string> = {
  completed: "已完成",
  blocked: "已拦截",
  failed: "失败",
  started: "进行中",
  executed: "已执行"
};

export interface IncidentReport {
  generatedAt: string;
  headline: string;
  summary: string;
  severity: AlertSeverity;
  traceId: string;
  symbol: string;
  status: string;
  objective: string;
  startedAt: string;
  endedAt?: string;
  agent: {
    name?: string;
    version?: string;
  };
  overview: {
    durationMs: number;
    spanCount: number;
    latestAlertSeverity?: AlertSeverity;
  };
  decision?: ReplayArtifact["decision"];
  action?: ReplayArtifact["action"];
  policyHits: ReplayArtifact["policyHits"];
  alerts: ReplayArtifact["alerts"];
  timelineHighlights: Array<{
    at: string;
    title: string;
    summary: string;
    kind: string;
  }>;
}

function severityRank(severity: AlertSeverity): number {
  return {
    info: 1,
    medium: 2,
    high: 3
  }[severity];
}

function inferSeverity(replay: ReplayArtifact): AlertSeverity {
  const fromAlerts = replay.alerts
    .map((alert) => alert.severity)
    .sort((left, right) => severityRank(right) - severityRank(left))[0];

  if (fromAlerts) {
    return fromAlerts;
  }

  if (replay.trace.status === "blocked" || replay.action?.status === "blocked") {
    return "high";
  }

  return "info";
}

export function buildIncidentReport(replay: ReplayArtifact): IncidentReport {
  const severity = inferSeverity(replay);
  const topPolicyReason =
    replay.policyHits[0]?.reason ??
    replay.alerts[0]?.message ??
    "这条决策记录需要结合回放查看更多细节。";

  return {
    generatedAt: new Date().toISOString(),
    headline: `${replay.trace.symbol} 事故报告`,
    summary: topPolicyReason,
    severity,
    traceId: replay.trace.id,
    symbol: replay.trace.symbol,
    status: replay.trace.status,
    objective: replay.trace.objective,
    startedAt: replay.trace.startedAt,
    endedAt: replay.trace.endedAt,
    agent: {
      name: typeof replay.trace.metadata.agentName === "string" ? replay.trace.metadata.agentName : undefined,
      version:
        typeof replay.trace.metadata.agentVersion === "string"
          ? replay.trace.metadata.agentVersion
          : undefined
    },
    overview: {
      durationMs: replay.overview.durationMs,
      spanCount: replay.overview.spanCount,
      latestAlertSeverity: replay.overview.latestAlertSeverity
    },
    decision: replay.decision,
    action: replay.action,
    policyHits: replay.policyHits,
    alerts: replay.alerts,
    timelineHighlights: replay.steps.map((step) => ({
      at: step.at,
      title: step.title,
      summary: step.summary,
      kind: step.kind
    }))
  };
}

export function buildIncidentMarkdown(report: IncidentReport): string {
  const sections = [
    `# ${report.headline}`,
    "",
    `- 严重等级：${report.severity.toUpperCase()}`,
    `- 决策记录 ID：${report.traceId}`,
    `- 交易对：${report.symbol}`,
    `- 状态：${statusLabels[report.status] ?? report.status}`,
    `- 目标：${report.objective}`,
    `- 开始时间：${report.startedAt}`,
    report.endedAt ? `- 结束时间：${report.endedAt}` : undefined,
    report.agent.name ? `- Agent：${report.agent.name}（${report.agent.version ?? "未知版本"}）` : undefined,
    "",
    "## 摘要",
    report.summary,
    "",
    "## 概览",
    `- 持续时间：${report.overview.durationMs}ms`,
    `- Span 数量：${report.overview.spanCount}`,
    report.overview.latestAlertSeverity
      ? `- 最新告警等级：${report.overview.latestAlertSeverity}`
      : undefined,
    "",
    report.decision
      ? [
          "## 决策",
          `- 采用假设：${report.decision.chosenHypothesis}`,
          `- 置信度：${Math.round(report.decision.confidence * 100)}%`,
          `- 已观察信号：${report.decision.signalsSeen.join(", ") || "无"}`,
          `- 冲突项：${report.decision.conflictsDetected.join(", ") || "无"}`,
          ""
        ].join("\n")
      : undefined,
    report.action
      ? [
          "## 动作",
          `- 类型：${actionTypeLabels[report.action.actionType] ?? report.action.actionType}`,
          `- 方向：${sideLabels[report.action.side] ?? report.action.side}`,
          `- 仓位：${report.action.size}`,
          `- 杠杆：${report.action.leverage}`,
          `- 状态：${statusLabels[report.action.status] ?? report.action.status}`,
          ""
        ].join("\n")
      : undefined,
    report.policyHits.length > 0
      ? [
          "## 策略命中",
          ...report.policyHits.map(
            (hit) => `- ${hit.ruleName} [${hit.decision.toUpperCase()}]: ${hit.reason}`
          ),
          ""
        ].join("\n")
      : undefined,
    report.alerts.length > 0
      ? [
          "## 告警",
          ...report.alerts.map(
            (alert) => `- ${alert.title} [${alert.severity.toUpperCase()}]: ${alert.message}`
          ),
          ""
        ].join("\n")
      : undefined,
    "## 时间线重点",
    ...report.timelineHighlights.map(
      (highlight) => `- ${highlight.at} | ${highlight.kind} | ${highlight.title}: ${highlight.summary}`
    )
  ].filter((section): section is string => Boolean(section));

  return sections.join("\n");
}
