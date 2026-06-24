import {
  AlertRecord,
  createId,
  isoNow,
  PolicyDecision,
  PolicyHit,
  TraceBundle
} from "@afr/trace-core";

export type PolicyProfileName = "safe" | "balanced" | "aggressive";
export type RiskAuditMode = "pretrade" | "posttrade";
export const defaultPolicyProfileName: PolicyProfileName = "balanced";

export interface PolicyProfile {
  name: PolicyProfileName;
  maxPositionSize: number;
  maxLeverage: number;
  minConfidence: number;
}

export interface RiskRuleDescriptor {
  id: string;
  name: string;
  category: "execution" | "reasoning" | "reliability";
  defaultDecision: PolicyDecision;
  description: string;
}

export interface ActionRiskInput {
  traceId: string;
  size: number;
  leverage: number;
}

export interface RiskAuditResult {
  decision: PolicyDecision;
  policyHits: PolicyHit[];
  alerts: AlertRecord[];
}

export const policyProfiles: Record<PolicyProfileName, PolicyProfile> = {
  safe: {
    name: "safe",
    maxPositionSize: 0.25,
    maxLeverage: 3,
    minConfidence: 0.65
  },
  balanced: {
    name: "balanced",
    maxPositionSize: 1,
    maxLeverage: 5,
    minConfidence: 0.55
  },
  aggressive: {
    name: "aggressive",
    maxPositionSize: 2,
    maxLeverage: 10,
    minConfidence: 0.45
  }
};

export const riskRuleCatalog: RiskRuleDescriptor[] = [
  {
    id: "position-size-limit",
    name: "仓位上限",
    category: "execution",
    defaultDecision: "block",
    description: "当请求仓位超过当前策略档位时，直接拦截或标记。"
  },
  {
    id: "leverage-limit",
    name: "杠杆上限",
    category: "execution",
    defaultDecision: "block",
    description: "当请求杠杆超过当前策略档位时，直接拦截或标记。"
  },
  {
    id: "signal-conflict-review",
    name: "信号冲突审查",
    category: "reasoning",
    defaultDecision: "warn",
    description: "当决策摘要中存在互相冲突的市场信号时发出警告。"
  },
  {
    id: "confidence-floor",
    name: "最低置信度",
    category: "reasoning",
    defaultDecision: "warn",
    description: "当决策置信度低于当前策略档位阈值时发出警告。"
  },
  {
    id: "tool-error-review",
    name: "工具错误审查",
    category: "reliability",
    defaultDecision: "warn",
    description: "当一个或多个工具调用返回错误载荷时发出警告。"
  },
  {
    id: "stale-data-guard",
    name: "过期数据护栏",
    category: "reliability",
    defaultDecision: "block",
    description: "当决策依赖过期市场数据或分析结果时直接拦截。"
  },
  {
    id: "cooldown-violation",
    name: "冷静期违规",
    category: "execution",
    defaultDecision: "block",
    description: "在连续亏损或冷静期仍尝试下单时直接拦截。"
  }
];

export function listPolicyProfiles(): PolicyProfile[] {
  return Object.values(policyProfiles);
}

function createPolicyHit(
  traceId: string,
  ruleId: string,
  ruleName: string,
  decision: PolicyDecision,
  reason: string,
  details: PolicyHit["details"]
): PolicyHit {
  return {
    id: createId("policy"),
    traceId,
    ruleId,
    ruleName,
    decision,
    reason,
    timestamp: isoNow(),
    details
  };
}

function createAlert(
  traceId: string,
  severity: AlertRecord["severity"],
  title: string,
  message: string,
  source: string
): AlertRecord {
  return {
    id: createId("alert"),
    traceId,
    severity,
    title,
    message,
    createdAt: isoNow(),
    source
  };
}

export function evaluateActionRisk(
  input: ActionRiskInput,
  profileName: PolicyProfileName = defaultPolicyProfileName,
  mode: RiskAuditMode = "pretrade"
): RiskAuditResult {
  const profile = policyProfiles[profileName];
  const hits: PolicyHit[] = [];
  const alerts: AlertRecord[] = [];
  const actionDecision: PolicyDecision = mode === "pretrade" ? "block" : "warn";
  const actionSeverity: AlertRecord["severity"] = mode === "pretrade" ? "high" : "medium";
  const actionVerb = mode === "pretrade" ? "blocked" : "flagged";

  if (input.size > profile.maxPositionSize) {
    hits.push(
      createPolicyHit(
        input.traceId,
        "position-size-limit",
        "仓位上限",
        actionDecision,
        `Requested size ${input.size} exceeds ${profile.maxPositionSize}`,
        {
          requestedSize: input.size,
          limit: profile.maxPositionSize
        }
      )
    );
    alerts.push(
      createAlert(
        input.traceId,
        actionSeverity,
        mode === "pretrade" ? "仓位已拦截" : "仓位待审查",
        `因为请求仓位 ${input.size} 超出 ${profile.name} 档位上限，所以该动作已${actionVerb === "blocked" ? "拦截" : "标记"}。`,
        "risk-audit"
      )
    );
  }

  if (input.leverage > profile.maxLeverage) {
    hits.push(
      createPolicyHit(
        input.traceId,
        "leverage-limit",
        "杠杆上限",
        actionDecision,
        `Requested leverage ${input.leverage} exceeds ${profile.maxLeverage}`,
        {
          requestedLeverage: input.leverage,
          limit: profile.maxLeverage
        }
      )
    );
    alerts.push(
      createAlert(
        input.traceId,
        actionSeverity,
        mode === "pretrade" ? "杠杆限制触发" : "杠杆待审查",
        `因为请求杠杆 ${input.leverage} 超出策略阈值，所以该动作已${actionVerb === "blocked" ? "拦截" : "标记"}。`,
        "risk-audit"
      )
    );
  }

  return {
    decision: hits.some((hit) => hit.decision === "block")
      ? "block"
      : hits.some((hit) => hit.decision === "warn")
        ? "warn"
        : "allow",
    policyHits: hits,
    alerts
  };
}

export function evaluateTraceBundle(
  bundle: TraceBundle,
  profileName: PolicyProfileName = defaultPolicyProfileName,
  mode: RiskAuditMode = "pretrade"
): RiskAuditResult {
  const profile = policyProfiles[profileName];
  const hits: PolicyHit[] = [];
  const alerts: AlertRecord[] = [];

  if (bundle.action) {
    const actionRisk = evaluateActionRisk(
      {
        traceId: bundle.trace.id,
        size: bundle.action.size,
        leverage: bundle.action.leverage
      },
      profileName,
      mode
    );
    hits.push(...actionRisk.policyHits);
    alerts.push(...actionRisk.alerts);
  }

  if (bundle.decision && bundle.decision.conflictsDetected.length > 0) {
    hits.push(
      createPolicyHit(
        bundle.trace.id,
        "signal-conflict-review",
        "信号冲突审查",
        "warn",
        `Conflicting signals detected: ${bundle.decision.conflictsDetected.join(", ")}`,
        {
          conflictsDetected: bundle.decision.conflictsDetected
        }
      )
    );
    alerts.push(
      createAlert(
        bundle.trace.id,
        "medium",
        "信号冲突审查",
        "这条决策记录存在冲突输入，建议在回放中进一步审查。",
        "risk-audit"
      )
    );
  }

  if (bundle.decision && bundle.decision.confidence < profile.minConfidence) {
    hits.push(
      createPolicyHit(
        bundle.trace.id,
        "confidence-floor",
        "最低置信度",
        "warn",
        `当前置信度 ${bundle.decision.confidence} 低于阈值 ${profile.minConfidence}`,
        {
          confidence: bundle.decision.confidence,
          minimumConfidence: profile.minConfidence
        }
      )
    );
    alerts.push(
      createAlert(
        bundle.trace.id,
        "medium",
        "低置信度决策",
        "模型置信度低于当前策略档位阈值。",
        "risk-audit"
      )
    );
  }

  const hasErroredSpan = bundle.spans.some((span) => span.errorJson && Object.keys(span.errorJson).length > 0);
  if (hasErroredSpan) {
    hits.push(
      createPolicyHit(
        bundle.trace.id,
        "tool-error-review",
        "工具错误审查",
        "warn",
        "一个或多个工具调用返回了错误载荷。",
        {}
      )
    );
    alerts.push(
      createAlert(
        bundle.trace.id,
        "medium",
        "工具错误审查",
        "由于工具调用出现错误，建议回放审查这条决策记录。",
        "risk-audit"
      )
    );
  }

  const staleDataSpan = bundle.spans.find((span) => {
    if (span.kind !== "tool_call") {
      return false;
    }

    const staleFlag = span.outputJson.stale;
    const dataAgeMinutes = span.outputJson.dataAgeMinutes;
    const snapshotAgeMinutes = span.outputJson.snapshotAgeMinutes;

    return (
      staleFlag === true ||
      (typeof dataAgeMinutes === "number" && dataAgeMinutes > 30) ||
      (typeof snapshotAgeMinutes === "number" && snapshotAgeMinutes > 30)
    );
  });

  if (staleDataSpan) {
    hits.push(
      createPolicyHit(
        bundle.trace.id,
        "stale-data-guard",
        "过期数据护栏",
        "block",
        `工具 "${staleDataSpan.name}" 在决策时输出的数据已经过期。`,
        {
          tool: staleDataSpan.name,
          output: staleDataSpan.outputJson
        }
      )
    );
    alerts.push(
      createAlert(
        bundle.trace.id,
        "high",
        "过期数据已拦截",
        "由于一个或多个市场输入已经过期，该动作被直接拦截。",
        "risk-audit"
      )
    );
  }

  const revengeSignalDetected = Boolean(
    bundle.decision &&
      (bundle.decision.signalsSeen.includes("近期连续亏损") ||
        bundle.decision.signalsSeen.includes("报复性冲动") ||
        bundle.decision.conflictsDetected.includes("冷静期违规") ||
        bundle.decision.riskChecks.some((riskCheck) =>
          /cooldown|loss streak|revenge/i.test(riskCheck)
        ))
  );

  if (revengeSignalDetected) {
    hits.push(
      createPolicyHit(
        bundle.trace.id,
        "cooldown-violation",
        "冷静期违规",
        "block",
        "由于 Agent 看起来在亏损后的冷静期内继续交易，该动作被拦截。",
        {
          conflictsDetected: bundle.decision?.conflictsDetected ?? [],
          riskChecks: bundle.decision?.riskChecks ?? []
        }
      )
    );
    alerts.push(
      createAlert(
        bundle.trace.id,
        "high",
        "冷静期违规",
        "由于 Agent 尝试进行报复性交易风格的入场，该动作被拦截。",
        "risk-audit"
      )
    );
  }

  return {
    decision: hits.some((hit) => hit.decision === "block")
      ? "block"
      : hits.some((hit) => hit.decision === "warn")
        ? "warn"
        : "allow",
    policyHits: hits,
    alerts
  };
}
