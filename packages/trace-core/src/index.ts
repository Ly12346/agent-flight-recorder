import { randomUUID } from "node:crypto";

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = {
  [key: string]: JsonValue;
};

export type TraceStatus = "started" | "completed" | "blocked" | "failed";
export type SpanKind =
  | "tool_call"
  | "reasoning_summary"
  | "market_snapshot"
  | "action"
  | "policy_check";
export type PolicyDecision = "allow" | "warn" | "block";
export type AlertSeverity = "info" | "medium" | "high";
export type ActionType = "open_position" | "close_position" | "hold" | "block";
export type PositionSide = "long" | "short" | "flat";
export type ActionStatus = "pending" | "executed" | "blocked" | "failed";

export interface AgentIdentity {
  id: string;
  name: string;
  version: string;
}

export interface SessionRecord {
  id: string;
  agentId: string;
  startedAt: string;
}

export interface TraceRecord {
  id: string;
  agentId: string;
  sessionId: string;
  objective: string;
  symbol: string;
  startedAt: string;
  endedAt?: string;
  status: TraceStatus;
  metadata: JsonObject;
}

export interface SpanRecord {
  id: string;
  traceId: string;
  parentSpanId?: string;
  kind: SpanKind;
  name: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  inputJson: JsonObject;
  outputJson: JsonObject;
  errorJson?: JsonObject;
}

export interface DecisionSummary {
  traceId: string;
  signalsSeen: string[];
  conflictsDetected: string[];
  chosenHypothesis: string;
  riskChecks: string[];
  confidence: number;
  explanationSummary: string;
}

export interface ActionRecord {
  id: string;
  traceId: string;
  actionType: ActionType;
  symbol: string;
  side: PositionSide;
  size: number;
  leverage: number;
  status: ActionStatus;
  summary: string;
  timestamp: string;
  blockedByPolicyId?: string;
}

export interface PolicyRule {
  id: string;
  name: string;
  decision: PolicyDecision;
  description: string;
}

export interface PolicyHit {
  id: string;
  traceId: string;
  ruleId: string;
  ruleName: string;
  decision: PolicyDecision;
  reason: string;
  timestamp: string;
  details: JsonObject;
}

export interface AlertRecord {
  id: string;
  traceId: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  createdAt: string;
  source: string;
}

export interface TraceBundle {
  trace: TraceRecord;
  spans: SpanRecord[];
  decision?: DecisionSummary;
  action?: ActionRecord;
  policyHits: PolicyHit[];
  alerts: AlertRecord[];
}

export interface TraceOverview {
  id: string;
  objective: string;
  symbol: string;
  status: TraceStatus;
  startedAt: string;
  durationMs: number;
  spanCount: number;
  latestAlertSeverity?: AlertSeverity;
}

export interface ReplayStep {
  id: string;
  at: string;
  kind: SpanKind | "policy_hit" | "alert";
  title: string;
  summary: string;
  details: JsonObject;
}

export interface ReplayArtifact {
  trace: TraceRecord;
  overview: TraceOverview;
  steps: ReplayStep[];
  decision?: DecisionSummary;
  action?: ActionRecord;
  policyHits: PolicyHit[];
  alerts: AlertRecord[];
}

export interface OverviewStats {
  traceCount: number;
  blockedCount: number;
  alertCount: number;
  activeSymbols: number;
}

export interface CreateTraceInput {
  agent: AgentIdentity;
  objective: string;
  symbol: string;
  sessionId?: string;
  metadata?: JsonObject;
}

export interface CreateSpanInput {
  traceId: string;
  kind: SpanKind;
  name: string;
  inputJson?: JsonObject;
  outputJson?: JsonObject;
  errorJson?: JsonObject;
  parentSpanId?: string;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
}

export interface CreateDecisionInput extends Omit<DecisionSummary, "traceId"> {
  traceId: string;
}

export interface CreateActionInput
  extends Omit<ActionRecord, "id" | "timestamp" | "status"> {
  traceId: string;
  status?: ActionStatus;
  timestamp?: string;
}

export function createId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

export function isoNow(): string {
  return new Date().toISOString();
}

export function createTraceRecord(input: CreateTraceInput): TraceRecord {
  const startedAt = isoNow();

  return {
    id: createId("trace"),
    agentId: input.agent.id,
    sessionId: input.sessionId ?? createId("session"),
    objective: input.objective,
    symbol: input.symbol,
    startedAt,
    status: "started",
    metadata: {
      agentName: input.agent.name,
      agentVersion: input.agent.version,
      ...input.metadata
    }
  };
}

export function createSpanRecord(input: CreateSpanInput): SpanRecord {
  const startedAt = input.startedAt ?? isoNow();
  const endedAt =
    input.endedAt ?? new Date(Date.parse(startedAt) + (input.durationMs ?? 0)).toISOString();
  const durationMs =
    input.durationMs ?? Math.max(0, Date.parse(endedAt) - Date.parse(startedAt));

  return {
    id: createId("span"),
    traceId: input.traceId,
    parentSpanId: input.parentSpanId,
    kind: input.kind,
    name: input.name,
    startedAt,
    endedAt,
    durationMs,
    inputJson: input.inputJson ?? {},
    outputJson: input.outputJson ?? {},
    errorJson: input.errorJson
  };
}

export function createDecisionSummary(input: CreateDecisionInput): DecisionSummary {
  return {
    traceId: input.traceId,
    signalsSeen: input.signalsSeen,
    conflictsDetected: input.conflictsDetected,
    chosenHypothesis: input.chosenHypothesis,
    riskChecks: input.riskChecks,
    confidence: input.confidence,
    explanationSummary: input.explanationSummary
  };
}

export function createActionRecord(input: CreateActionInput): ActionRecord {
  return {
    id: createId("action"),
    traceId: input.traceId,
    actionType: input.actionType,
    symbol: input.symbol,
    side: input.side,
    size: input.size,
    leverage: input.leverage,
    status: input.status ?? "executed",
    summary: input.summary,
    timestamp: input.timestamp ?? isoNow(),
    blockedByPolicyId: input.blockedByPolicyId
  };
}

export function buildTraceOverview(bundle: TraceBundle): TraceOverview {
  const endAt = bundle.trace.endedAt ?? bundle.action?.timestamp ?? bundle.trace.startedAt;
  const latestAlert = bundle.alerts.at(-1);

  return {
    id: bundle.trace.id,
    objective: bundle.trace.objective,
    symbol: bundle.trace.symbol,
    status: bundle.trace.status,
    startedAt: bundle.trace.startedAt,
    durationMs: Math.max(0, Date.parse(endAt) - Date.parse(bundle.trace.startedAt)),
    spanCount: bundle.spans.length,
    latestAlertSeverity: latestAlert?.severity
  };
}
