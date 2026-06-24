import { buildTraceOverview, ReplayArtifact, ReplayStep, TraceBundle } from "@afr/trace-core";

const actionLabels: Record<string, string> = {
  open_position: "开仓",
  close_position: "平仓",
  hold: "观望",
  block: "拦截"
};

const decisionLabels: Record<string, string> = {
  allow: "放行",
  warn: "警告",
  block: "拦截"
};

export function buildReplay(bundle: TraceBundle): ReplayArtifact {
  const steps: ReplayStep[] = [
    ...bundle.spans.map((span) => ({
      id: span.id,
      at: span.startedAt,
      kind: span.kind,
      title: span.kind === "action" ? (actionLabels[span.name] ?? span.name) : span.name,
      summary:
        span.kind === "tool_call"
          ? `工具调用完成，耗时 ${span.durationMs}ms`
          : `步骤完成，耗时 ${span.durationMs}ms`,
      details: {
        input: span.inputJson,
        output: span.outputJson,
        error: span.errorJson ?? null
      }
    })),
    ...bundle.policyHits.map((hit) => ({
      id: hit.id,
      at: hit.timestamp,
      kind: "policy_hit" as const,
      title: hit.ruleName,
      summary: `${decisionLabels[hit.decision] ?? hit.decision}：${hit.reason}`,
      details: hit.details
    })),
    ...bundle.alerts.map((alert) => ({
      id: alert.id,
      at: alert.createdAt,
      kind: "alert" as const,
      title: alert.title,
      summary: alert.message,
      details: {
        severity: alert.severity,
        source: alert.source
      }
    }))
  ].sort((left, right) => Date.parse(left.at) - Date.parse(right.at));

  return {
    trace: bundle.trace,
    overview: buildTraceOverview(bundle),
    steps,
    decision: bundle.decision,
    action: bundle.action,
    policyHits: bundle.policyHits,
    alerts: bundle.alerts
  };
}
