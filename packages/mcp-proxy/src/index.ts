import { spawn } from "node:child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { SqliteRecorder } from "@afr/recorder";
import { evaluateActionRisk, evaluateTraceBundle, PolicyProfileName } from "@afr/risk-audit";
import {
  createActionRecord,
  createDecisionSummary,
  createSpanRecord,
  createTraceRecord,
  ActionRecord,
  CreateActionInput,
  CreateDecisionInput,
  JsonObject,
  JsonValue,
  PolicyHit,
  SpanRecord,
  TraceBundle,
  TraceRecord,
  createId
} from "@afr/trace-core";

type FramingMode = "line" | "content-length";
type JsonRpcId = number | string;

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: JsonObject;
  result?: JsonValue;
  error?: JsonObject;
}

interface RpcFrame {
  framing: FramingMode;
  raw: Buffer;
  payload: string;
}

interface ProxyAgentIdentity {
  id: string;
  name: string;
  version: string;
}

export interface ProxySessionInput {
  agentId: string;
  agentName: string;
  agentVersion: string;
  objective: string;
  symbol: string;
  sessionId?: string;
  metadata?: JsonObject;
}

export interface ToolCallInput {
  name: string;
  inputJson?: JsonObject;
  outputJson?: JsonObject;
  errorJson?: JsonObject;
  durationMs?: number;
  startedAt?: string;
}

export interface ProxyActionDraft {
  actionType: CreateActionInput["actionType"];
  symbol: string;
  side: CreateActionInput["side"];
  size: number;
  leverage: number;
  summary: string;
}

export interface StdioProxyOptions {
  upstreamCommand: string;
  upstreamArgs?: string[];
  upstreamEnv?: NodeJS.ProcessEnv;
  databasePath: string;
  decisionIdleMs?: number;
  policyProfile?: PolicyProfileName;
  agent?: Partial<ProxyAgentIdentity>;
  debug?: boolean;
  stderr?: NodeJS.WritableStream;
}

interface PendingToolCall {
  clientFrame: RpcFrame;
  session: ProxyCaptureSession;
  toolName: string;
  requestArgs: JsonObject;
  inferredAction?: ProxyActionDraft;
  startedAt: number;
  startedAtIso: string;
}

interface ActiveTraceGroup {
  session: ProxyCaptureSession;
  lastActivityAt: number;
}

const sensitiveKeyPattern = /(api[-_]?key|secret|token|password|signature|passphrase|authorization)/i;
const actionableToolPattern = /(order|position|trade|open|close|buy|sell)/i;

function normalizeJsonValue(value: unknown, key?: string): JsonValue {
  if (key && sensitiveKeyPattern.test(key)) {
    return "[REDACTED]";
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    if (typeof value === "string" && value.length > 1000) {
      return `${value.slice(0, 997)}...`;
    }

    return value;
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeJsonValue(entry));
  }

  if (value && typeof value === "object") {
    const objectValue = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(objectValue).map(([entryKey, entryValue]) => [
        entryKey,
        normalizeJsonValue(entryValue, entryKey)
      ])
    );
  }

  return String(value);
}

function sanitizeJsonObject(value: unknown): JsonObject {
  const normalized = normalizeJsonValue(value);
  if (normalized && typeof normalized === "object" && !Array.isArray(normalized)) {
    return normalized as JsonObject;
  }

  return {
    value: normalized
  };
}

function getIdKey(id: JsonRpcId): string {
  return `${typeof id}:${String(id)}`;
}

function encodeMessage(message: JsonRpcMessage, framing: FramingMode): Buffer {
  const payload = JSON.stringify(message);
  if (framing === "content-length") {
    return Buffer.from(`Content-Length: ${Buffer.byteLength(payload, "utf8")}\r\n\r\n${payload}`, "utf8");
  }

  return Buffer.from(`${payload}\n`, "utf8");
}

class RpcFrameDecoder {
  private buffer = Buffer.alloc(0);

  push(chunk: Buffer | string): RpcFrame[] {
    const nextChunk = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk;
    this.buffer = Buffer.concat([this.buffer, nextChunk]);

    const frames: RpcFrame[] = [];

    while (this.buffer.length > 0) {
      if (this.buffer[0] === 10 || this.buffer[0] === 13) {
        this.buffer = this.buffer.subarray(1);
        continue;
      }

      if (this.buffer.toString("utf8", 0, Math.min(this.buffer.length, 15)).startsWith("Content-Length:")) {
        const headerEnd = this.buffer.indexOf("\r\n\r\n");
        if (headerEnd === -1) {
          break;
        }

        const headerText = this.buffer.subarray(0, headerEnd).toString("utf8");
        const contentLengthMatch = headerText.match(/Content-Length:\s*(\d+)/i);
        if (!contentLengthMatch) {
          throw new Error("Missing Content-Length header in MCP frame.");
        }

        const bodyLength = Number(contentLengthMatch[1]);
        const frameLength = headerEnd + 4 + bodyLength;
        if (this.buffer.length < frameLength) {
          break;
        }

        const raw = this.buffer.subarray(0, frameLength);
        const payload = this.buffer.subarray(headerEnd + 4, frameLength).toString("utf8");
        frames.push({
          framing: "content-length",
          raw,
          payload
        });
        this.buffer = this.buffer.subarray(frameLength);
        continue;
      }

      const newlineIndex = this.buffer.indexOf("\n");
      if (newlineIndex === -1) {
        break;
      }

      const raw = this.buffer.subarray(0, newlineIndex + 1);
      const payload = raw.toString("utf8").trim();
      this.buffer = this.buffer.subarray(newlineIndex + 1);

      if (payload.length === 0) {
        continue;
      }

      frames.push({
        framing: "line",
        raw,
        payload
      });
    }

    return frames;
  }
}

function pickFirstString(source: JsonObject | undefined, keys: string[], fallback: string): string {
  if (!source) {
    return fallback;
  }

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return fallback;
}

function pickNumber(source: JsonObject | undefined, keys: string[], fallback: number): number {
  if (!source) {
    return fallback;
  }

  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return fallback;
}

function inferActionFromToolCall(toolName: string, args: JsonObject): ProxyActionDraft | undefined {
  const loweredToolName = toolName.toLowerCase();
  const symbol = pickFirstString(args, ["symbol", "pair", "market", "contract"], "UNKNOWN");
  const size = pickNumber(args, ["size", "qty", "quantity", "amount"], 0);
  const leverage = pickNumber(args, ["leverage", "margin"], 1);
  const sideRaw = pickFirstString(args, ["side", "direction"], loweredToolName.includes("sell") ? "short" : "long")
    .toLowerCase();

  if (!actionableToolPattern.test(loweredToolName) || size <= 0) {
    return undefined;
  }

  const side = sideRaw.includes("short") || sideRaw.includes("sell") ? "short" : "long";
  const actionType = loweredToolName.includes("close") ? "close_position" : "open_position";

  return {
    actionType,
    symbol,
    side,
    size,
    leverage,
    summary: `Proxy inferred a ${actionType.replace("_", " ")} request from MCP tool "${toolName}".`
  };
}

function extractObjective(toolName: string, args: JsonObject): string {
  return pickFirstString(
    args,
    ["objective", "goal", "prompt", "instruction", "query"],
    `MCP tools/call for ${toolName}`
  );
}

export class ProxyCaptureSession {
  readonly trace: TraceRecord;
  readonly spans: SpanRecord[] = [];
  readonly policyHits: PolicyHit[] = [];
  readonly alerts: TraceBundle["alerts"] = [];
  decision?: TraceBundle["decision"];
  action?: TraceBundle["action"];

  constructor(input: ProxySessionInput) {
    this.trace = createTraceRecord({
      agent: {
        id: input.agentId,
        name: input.agentName,
        version: input.agentVersion
      },
      objective: input.objective,
      symbol: input.symbol,
      sessionId: input.sessionId,
      metadata: input.metadata
    });
  }

  recordToolCall(input: ToolCallInput): SpanRecord {
    const span = createSpanRecord({
      traceId: this.trace.id,
      kind: "tool_call",
      name: input.name,
      inputJson: input.inputJson,
      outputJson: input.outputJson,
      errorJson: input.errorJson,
      startedAt: input.startedAt,
      durationMs: input.durationMs ?? 0
    });
    this.spans.push(span);
    return span;
  }

  recordDecision(input: Omit<CreateDecisionInput, "traceId">): TraceBundle["decision"] {
    this.decision = createDecisionSummary({
      traceId: this.trace.id,
      ...input
    });
    this.spans.push(
      createSpanRecord({
        traceId: this.trace.id,
        kind: "reasoning_summary",
        name: "decision-summary",
        outputJson: {
          signalsSeen: input.signalsSeen,
          conflictsDetected: input.conflictsDetected,
          chosenHypothesis: input.chosenHypothesis,
          confidence: input.confidence
        },
        durationMs: 0
      })
    );
    return this.decision;
  }

  recordAction(input: Omit<CreateActionInput, "traceId">): ActionRecord {
    this.action = createActionRecord({
      traceId: this.trace.id,
      ...input
    });
    this.spans.push(
      createSpanRecord({
        traceId: this.trace.id,
        kind: "action",
        name: input.actionType,
        outputJson: {
          symbol: input.symbol,
          side: input.side,
          size: input.size,
          leverage: input.leverage,
          status: this.action.status
        },
        durationMs: 0
      })
    );
    return this.action;
  }

  appendPolicyHits(policyHits: PolicyHit[]): void {
    this.policyHits.push(...policyHits);
    for (const hit of policyHits) {
      this.spans.push(
        createSpanRecord({
          traceId: this.trace.id,
          kind: "policy_check",
          name: hit.ruleName,
          outputJson: {
            decision: hit.decision,
            reason: hit.reason,
            details: hit.details
          },
          durationMs: 0
        })
      );
    }
  }

  appendAlerts(alerts: TraceBundle["alerts"]): void {
    this.alerts.push(...alerts);
  }

  ensureDerivedDecisionSummary(): void {
    if (this.decision) {
      return;
    }

    const toolNames = this.spans
      .filter((span) => span.kind === "tool_call")
      .map((span) => span.name);

    if (toolNames.length === 0) {
      return;
    }

    const actionSummary = this.action
      ? `${this.action.actionType} ${this.action.side} ${this.action.size} ${this.action.symbol}`
      : "context gathering without an execution step";
    const riskChecks = this.policyHits.map((hit) => hit.reason);

    this.recordDecision({
      signalsSeen: [...new Set(toolNames)],
      conflictsDetected: [],
      chosenHypothesis: this.action
        ? `Proceed with ${this.action.actionType} after reviewing ${toolNames.length} tool calls`
        : `Gather context from ${toolNames.length} tool calls before the next action`,
      riskChecks: riskChecks.length > 0 ? riskChecks : ["No explicit policy conflicts were recorded."],
      confidence: this.action ? 0.6 : 0.5,
      explanationSummary: `Derived summary: the agent consulted ${toolNames.join(", ")} before ${actionSummary}.`
    });
  }

  snapshot(): TraceBundle {
    return {
      trace: this.trace,
      spans: [...this.spans],
      decision: this.decision,
      action: this.action,
      policyHits: [...this.policyHits],
      alerts: [...this.alerts]
    };
  }

  finalize(status: TraceBundle["trace"]["status"]): TraceBundle {
    const endAt = this.action?.timestamp ?? this.spans.at(-1)?.endedAt ?? this.trace.startedAt;
    this.trace.endedAt = endAt;
    this.trace.status = status;

    return this.snapshot();
  }
}

export class StdioMcpProxy {
  private readonly recorder: SqliteRecorder;
  private readonly clientDecoder = new RpcFrameDecoder();
  private readonly upstreamDecoder = new RpcFrameDecoder();
  private readonly pendingToolCalls = new Map<string, PendingToolCall>();
  private readonly stderr: NodeJS.WritableStream;
  private readonly policyProfile: PolicyProfileName;
  private readonly decisionIdleMs: number;
  private readonly sessionId = createId("session");
  private clientIdentity: ProxyAgentIdentity;
  private activeTraceGroup?: ActiveTraceGroup;
  private idleFlushTimer?: NodeJS.Timeout;
  private upstream?: ChildProcessWithoutNullStreams;

  constructor(private readonly options: StdioProxyOptions) {
    this.recorder = new SqliteRecorder(options.databasePath);
    this.stderr = options.stderr ?? process.stderr;
    this.policyProfile = options.policyProfile ?? "balanced";
    this.decisionIdleMs = options.decisionIdleMs ?? 8000;
    this.clientIdentity = {
      id: options.agent?.id ?? "afr_proxy_client",
      name: options.agent?.name ?? "AFR Proxy Client",
      version: options.agent?.version ?? "0.1.0"
    };
  }

  async run(): Promise<void> {
    this.spawnUpstream();
    this.bindProcessLifecycle();

    process.stdin.on("data", (chunk) => {
      for (const frame of this.clientDecoder.push(chunk)) {
        this.handleClientFrame(frame);
      }
    });
    process.stdin.on("end", () => {
      this.upstream?.stdin.end();
    });
    process.stdin.resume();

    await new Promise<void>((resolve, reject) => {
      this.upstream?.once("exit", (code, signal) => {
        this.flushActiveTrace("completed");
        this.recorder.close();
        if (code === 0 || signal === "SIGTERM" || signal === "SIGINT") {
          resolve();
          return;
        }

        reject(new Error(`Upstream MCP process exited with code ${code ?? "null"}.`));
      });
      this.upstream?.once("error", reject);
    });
  }

  private spawnUpstream(): void {
    this.upstream = spawn(this.options.upstreamCommand, this.options.upstreamArgs ?? [], {
      env: {
        ...process.env,
        ...this.options.upstreamEnv
      },
      stdio: ["pipe", "pipe", "pipe"]
    });

    this.upstream.stdout.on("data", (chunk) => {
      for (const frame of this.upstreamDecoder.push(chunk)) {
        this.handleUpstreamFrame(frame);
      }
    });

    const stderrReader = createInterface({
      input: this.upstream.stderr
    });
    stderrReader.on("line", (line) => {
      this.log(`upstream: ${line}`);
    });
  }

  private bindProcessLifecycle(): void {
    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      process.on(signal, () => {
        this.flushActiveTrace("completed");
        this.upstream?.kill(signal);
      });
    }
  }

  private getOrCreateActiveTrace(toolName: string, requestArgs: JsonObject): ProxyCaptureSession {
    const activeGroup = this.activeTraceGroup;

    if (activeGroup?.session.action) {
      this.flushActiveTrace(activeGroup.session.action.status === "blocked" ? "blocked" : "completed");
    }

    if (!this.activeTraceGroup) {
      this.activeTraceGroup = {
        session: new ProxyCaptureSession({
          agentId: this.clientIdentity.id,
          agentName: this.clientIdentity.name,
          agentVersion: this.clientIdentity.version,
          objective: extractObjective(toolName, requestArgs),
          symbol: pickFirstString(requestArgs, ["symbol", "pair", "market", "contract"], "UNKNOWN"),
          sessionId: this.sessionId,
          metadata: {
            upstreamCommand: this.options.upstreamCommand,
            toolNames: [toolName]
          }
        }),
        lastActivityAt: Date.now()
      };
    } else {
      this.activeTraceGroup.lastActivityAt = Date.now();
      const metadataToolNames = this.activeTraceGroup.session.trace.metadata.toolNames;
      const nextToolNames = Array.isArray(metadataToolNames)
        ? [...metadataToolNames, toolName]
        : [toolName];
      this.activeTraceGroup.session.trace.metadata.toolNames = nextToolNames;
      if (this.activeTraceGroup.session.trace.symbol === "UNKNOWN") {
        this.activeTraceGroup.session.trace.symbol = pickFirstString(
          requestArgs,
          ["symbol", "pair", "market", "contract"],
          this.activeTraceGroup.session.trace.symbol
        );
      }
    }

    this.refreshIdleFlushTimer();
    return this.activeTraceGroup.session;
  }

  private refreshIdleFlushTimer(): void {
    if (this.idleFlushTimer) {
      clearTimeout(this.idleFlushTimer);
    }

    this.idleFlushTimer = setTimeout(() => {
      if (this.hasPendingCallsForActiveTrace()) {
        this.refreshIdleFlushTimer();
        return;
      }

      this.flushActiveTrace("completed");
    }, this.decisionIdleMs);
    this.idleFlushTimer.unref?.();
  }

  private hasPendingCallsForActiveTrace(): boolean {
    const activeSession = this.activeTraceGroup?.session;
    if (!activeSession) {
      return false;
    }

    for (const pending of this.pendingToolCalls.values()) {
      if (pending.session === activeSession) {
        return true;
      }
    }

    return false;
  }

  private flushActiveTrace(status: TraceBundle["trace"]["status"]): void {
    if (this.idleFlushTimer) {
      clearTimeout(this.idleFlushTimer);
      this.idleFlushTimer = undefined;
    }

    const activeGroup = this.activeTraceGroup;
    if (!activeGroup) {
      return;
    }

    const session = activeGroup.session;
    if (session.spans.length === 0) {
      this.activeTraceGroup = undefined;
      return;
    }

    if (status !== "blocked") {
      const auditResult = evaluateTraceBundle(session.snapshot(), this.policyProfile, "posttrade");
      session.appendPolicyHits(auditResult.policyHits);
      session.appendAlerts(auditResult.alerts);
    }

    session.ensureDerivedDecisionSummary();

    this.recorder.insertTraceBundle(session.finalize(status));
    this.activeTraceGroup = undefined;
  }

  private handleClientFrame(frame: RpcFrame): void {
    const message = this.tryParseMessage(frame.payload);
    if (!message) {
      this.forwardToUpstream(frame.raw);
      return;
    }

    if (message.method === "initialize") {
      const params = sanitizeJsonObject(message.params);
      const clientInfo = sanitizeJsonObject(params.clientInfo);
      this.clientIdentity = {
        id: pickFirstString(clientInfo, ["name"], this.clientIdentity.id).replaceAll(" ", "_").toLowerCase(),
        name: pickFirstString(clientInfo, ["name"], this.clientIdentity.name),
        version: pickFirstString(clientInfo, ["version"], this.clientIdentity.version)
      };
    }

    if (message.method === "tools/call" && message.id !== undefined) {
      const params = sanitizeJsonObject(message.params);
      const toolName = pickFirstString(params, ["name"], "unknown-tool");
      const requestArgs = sanitizeJsonObject(params.arguments);
      const session = this.getOrCreateActiveTrace(toolName, requestArgs);
      const inferredAction = inferActionFromToolCall(toolName, requestArgs);

      if (inferredAction) {
        const preflightAction = createActionRecord({
          traceId: session.trace.id,
          actionType: inferredAction.actionType,
          symbol: inferredAction.symbol,
          side: inferredAction.side,
          size: inferredAction.size,
          leverage: inferredAction.leverage,
          summary: inferredAction.summary,
          status: "pending"
        });
        const preflight = evaluateTraceBundle(
          {
            ...session.snapshot(),
            action: preflightAction
          },
          this.policyProfile,
          "pretrade"
        );

        if (preflight.decision === "block") {
          session.recordToolCall({
            name: toolName,
            inputJson: requestArgs,
            errorJson: {
              stage: "pretrade",
              message: preflight.policyHits[0]?.reason ?? "Blocked by pre-trade policy."
            },
            durationMs: 0
          });
          session.recordAction({
            ...inferredAction,
            status: "blocked"
          });
          session.appendPolicyHits(preflight.policyHits);
          session.appendAlerts(preflight.alerts);

          const firstBlockingHit = preflight.policyHits.find((policyHit) => policyHit.decision === "block");
          if (session.action && firstBlockingHit) {
            session.action.blockedByPolicyId = firstBlockingHit.id;
          }

          this.flushActiveTrace("blocked");
          this.writeToClient(
            encodeMessage(
              {
                jsonrpc: "2.0",
                id: message.id,
                error: {
                  code: -32001,
                  message: firstBlockingHit?.reason ?? "Blocked by AFR pre-trade policy.",
                  data: {
                    policyHits: preflight.policyHits.map((policyHit) => ({
                      id: policyHit.id,
                      ruleName: policyHit.ruleName,
                      decision: policyHit.decision,
                      reason: policyHit.reason
                    }))
                  }
                }
              },
              frame.framing
            )
          );
          return;
        }
      }

      this.pendingToolCalls.set(getIdKey(message.id), {
        clientFrame: frame,
        session,
        toolName,
        requestArgs,
        inferredAction,
        startedAt: Date.now(),
        startedAtIso: new Date().toISOString()
      });
    }

    this.forwardToUpstream(frame.raw);
  }

  private handleUpstreamFrame(frame: RpcFrame): void {
    const message = this.tryParseMessage(frame.payload);
    if (message && message.id !== undefined) {
      const pending = this.pendingToolCalls.get(getIdKey(message.id));
      if (pending) {
        this.pendingToolCalls.delete(getIdKey(message.id));

        const errorPayload = message.error ? sanitizeJsonObject(message.error) : undefined;
        const outputPayload = message.result ? sanitizeJsonObject(message.result) : {};

        pending.session.recordToolCall({
          name: pending.toolName,
          inputJson: pending.requestArgs,
          outputJson: outputPayload,
          errorJson: errorPayload,
          durationMs: Date.now() - pending.startedAt,
          startedAt: pending.startedAtIso
        });

        if (pending.inferredAction) {
          pending.session.recordAction({
            ...pending.inferredAction,
            status: message.error ? "failed" : "executed"
          });
          this.flushActiveTrace(message.error ? "failed" : "completed");
        } else {
          this.refreshIdleFlushTimer();
        }
      }
    }

    this.writeToClient(frame.raw);
  }

  private tryParseMessage(payload: string): JsonRpcMessage | null {
    try {
      return JSON.parse(payload) as JsonRpcMessage;
    } catch (error) {
      this.log(`parse error: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  private forwardToUpstream(payload: Buffer): void {
    this.upstream?.stdin.write(payload);
  }

  private writeToClient(payload: Buffer): void {
    process.stdout.write(payload);
  }

  private log(message: string): void {
    if (this.options.debug) {
      this.stderr.write(`[afr-proxy] ${message}\n`);
    }
  }
}
