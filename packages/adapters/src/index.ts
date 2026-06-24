import { AlertSeverity, JsonObject, JsonValue, ReplayArtifact } from "@afr/trace-core";

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

export type AdapterChannel = "console" | "webhook" | "telegram";

export interface AlertAdapterPreview {
  channel: AdapterChannel;
  title: string;
  summary: string;
  contentType: "text/plain" | "application/json" | "text/markdown";
  destinationHint: string;
  payload: string | JsonObject;
}

function severityRank(severity: AlertSeverity): number {
  return {
    info: 1,
    medium: 2,
    high: 3
  }[severity];
}

function inferSeverity(replay: ReplayArtifact): AlertSeverity {
  const alertSeverity = replay.alerts
    .map((alert) => alert.severity)
    .sort((left, right) => severityRank(right) - severityRank(left))[0];

  if (alertSeverity) {
    return alertSeverity;
  }

  if (replay.trace.status === "blocked" || replay.action?.status === "blocked") {
    return "high";
  }

  return "info";
}

function baseAlertSummary(replay: ReplayArtifact): string {
  const policySummary =
    replay.policyHits[0]?.reason ??
    replay.alerts[0]?.message ??
    "未记录明确的策略原因。";

  return `${replay.trace.symbol} ${statusLabels[replay.trace.status] ?? replay.trace.status} - ${policySummary}`;
}

function basePayload(replay: ReplayArtifact): JsonObject {
  const severity = inferSeverity(replay);

  return {
    traceId: replay.trace.id,
    symbol: replay.trace.symbol,
    status: replay.trace.status,
    severity,
    objective: replay.trace.objective,
    startedAt: replay.trace.startedAt,
    action: replay.action
      ? {
          actionType: replay.action.actionType,
          side: replay.action.side,
          size: replay.action.size,
          leverage: replay.action.leverage,
          status: replay.action.status
        }
      : null,
    topPolicyHit: replay.policyHits[0]
      ? {
          ruleName: replay.policyHits[0].ruleName,
          decision: replay.policyHits[0].decision,
          reason: replay.policyHits[0].reason
        }
      : null,
    topAlert: replay.alerts[0]
      ? {
          title: replay.alerts[0].title,
          message: replay.alerts[0].message,
          severity: replay.alerts[0].severity
        }
      : null
  };
}

function buildConsolePreview(replay: ReplayArtifact): AlertAdapterPreview {
  const lines = [
    "[AFR 告警]",
    `决策记录：${replay.trace.id}`,
    `交易对：${replay.trace.symbol}`,
    `状态：${statusLabels[replay.trace.status] ?? replay.trace.status}`,
    `摘要：${baseAlertSummary(replay)}`
  ];

  if (replay.action) {
    lines.push(
      `动作：${actionTypeLabels[replay.action.actionType] ?? replay.action.actionType} ${sideLabels[replay.action.side] ?? replay.action.side} ${replay.action.size} ${replay.action.symbol} @ ${replay.action.leverage}x`
    );
  }

  return {
    channel: "console",
    title: "控制台告警预览",
    summary: "适合本地日志和终端提醒的纯文本摘要。",
    contentType: "text/plain",
    destinationHint: "stdout / stderr / 本地日志系统",
    payload: lines.join("\n")
  };
}

function buildWebhookPreview(replay: ReplayArtifact): AlertAdapterPreview {
  return {
    channel: "webhook",
    title: "Webhook 载荷预览",
    summary: "适合通用 Webhook 集成的结构化 JSON 载荷。",
    contentType: "application/json",
    destinationHint: "POST 到你的告警 Webhook 地址",
    payload: {
      event: "afr.incident.alert",
      generatedAt: new Date().toISOString(),
      replayUrl: `/replay/${replay.trace.id}`,
      incident: basePayload(replay)
    }
  };
}

function telegramEscape(value: string): string {
  return value.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, "\\$1");
}

function buildTelegramPreview(replay: ReplayArtifact): AlertAdapterPreview {
  const payload = [
    "*AFR 事故告警*",
    `*决策记录：* \`${telegramEscape(replay.trace.id)}\``,
    `*交易对：* ${telegramEscape(replay.trace.symbol)}`,
    `*状态：* ${telegramEscape(statusLabels[replay.trace.status] ?? replay.trace.status)}`,
    `*摘要：* ${telegramEscape(baseAlertSummary(replay))}`
  ].join("\n");

  return {
    channel: "telegram",
    title: "Telegram 消息预览",
    summary: "可直接用于 Telegram Bot API 的 Markdown 消息体。",
    contentType: "text/markdown",
    destinationHint: "Telegram Bot API sendMessage",
    payload
  };
}

export function buildAlertAdapterPreviews(replay: ReplayArtifact): AlertAdapterPreview[] {
  return [
    buildConsolePreview(replay),
    buildWebhookPreview(replay),
    buildTelegramPreview(replay)
  ];
}

export function normalizeAdapterPayload(payload: string | JsonObject): JsonValue {
  return payload;
}
