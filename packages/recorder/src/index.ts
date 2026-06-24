import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  AlertRecord,
  buildTraceOverview,
  DecisionSummary,
  JsonObject,
  OverviewStats,
  PolicyHit,
  TraceBundle,
  TraceOverview
} from "@afr/trace-core";
import { schemaStatements } from "./schema.js";

type DbRow = Record<string, unknown>;

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string" || value.length === 0) {
    return fallback;
  }

  return JSON.parse(value) as T;
}

export class SqliteRecorder {
  private readonly db: DatabaseSync;

  constructor(private readonly databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.db = new DatabaseSync(databasePath);
    this.db.exec("PRAGMA journal_mode = WAL");

    for (const statement of schemaStatements) {
      this.db.exec(statement);
    }
  }

  get path(): string {
    return this.databasePath;
  }

  insertTraceBundle(bundle: TraceBundle): void {
    this.db.exec("BEGIN");

    try {
      this.db
        .prepare(
          `INSERT OR REPLACE INTO traces (
            id, agent_id, session_id, objective, symbol, started_at, ended_at, status, metadata_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          bundle.trace.id,
          bundle.trace.agentId,
          bundle.trace.sessionId,
          bundle.trace.objective,
          bundle.trace.symbol,
          bundle.trace.startedAt,
          bundle.trace.endedAt ?? null,
          bundle.trace.status,
          JSON.stringify(bundle.trace.metadata)
        );

      this.db.prepare("DELETE FROM spans WHERE trace_id = ?").run(bundle.trace.id);
      this.db.prepare("DELETE FROM policy_hits WHERE trace_id = ?").run(bundle.trace.id);
      this.db.prepare("DELETE FROM alerts WHERE trace_id = ?").run(bundle.trace.id);
      this.db.prepare("DELETE FROM decisions WHERE trace_id = ?").run(bundle.trace.id);
      this.db.prepare("DELETE FROM actions WHERE trace_id = ?").run(bundle.trace.id);

      const insertSpan = this.db.prepare(
        `INSERT INTO spans (
          id, trace_id, parent_span_id, kind, name, started_at, ended_at, duration_ms, input_json, output_json, error_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const span of bundle.spans) {
        insertSpan.run(
          span.id,
          span.traceId,
          span.parentSpanId ?? null,
          span.kind,
          span.name,
          span.startedAt,
          span.endedAt,
          span.durationMs,
          JSON.stringify(span.inputJson),
          JSON.stringify(span.outputJson),
          span.errorJson ? JSON.stringify(span.errorJson) : null
        );
      }

      if (bundle.decision) {
        this.db
          .prepare(
            `INSERT INTO decisions (
              trace_id, signals_seen_json, conflicts_detected_json, chosen_hypothesis, risk_checks_json, confidence, explanation_summary
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            bundle.decision.traceId,
            JSON.stringify(bundle.decision.signalsSeen),
            JSON.stringify(bundle.decision.conflictsDetected),
            bundle.decision.chosenHypothesis,
            JSON.stringify(bundle.decision.riskChecks),
            bundle.decision.confidence,
            bundle.decision.explanationSummary
          );
      }

      if (bundle.action) {
        this.db
          .prepare(
            `INSERT INTO actions (
              trace_id, id, action_type, symbol, side, size, leverage, status, summary, timestamp, blocked_by_policy_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            bundle.action.traceId,
            bundle.action.id,
            bundle.action.actionType,
            bundle.action.symbol,
            bundle.action.side,
            bundle.action.size,
            bundle.action.leverage,
            bundle.action.status,
            bundle.action.summary,
            bundle.action.timestamp,
            bundle.action.blockedByPolicyId ?? null
          );
      }

      const insertPolicyHit = this.db.prepare(
        `INSERT INTO policy_hits (
          id, trace_id, rule_id, rule_name, decision, reason, timestamp, details_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const hit of bundle.policyHits) {
        insertPolicyHit.run(
          hit.id,
          hit.traceId,
          hit.ruleId,
          hit.ruleName,
          hit.decision,
          hit.reason,
          hit.timestamp,
          JSON.stringify(hit.details)
        );
      }

      const insertAlert = this.db.prepare(
        `INSERT INTO alerts (
          id, trace_id, severity, title, message, created_at, source
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      for (const alert of bundle.alerts) {
        insertAlert.run(
          alert.id,
          alert.traceId,
          alert.severity,
          alert.title,
          alert.message,
          alert.createdAt,
          alert.source
        );
      }

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  listTraceOverviews(limit?: number): TraceOverview[] {
    const overviewQuery = `SELECT
      traces.id,
      traces.objective,
      traces.symbol,
      traces.status,
      traces.started_at,
      traces.ended_at,
      COUNT(spans.id) AS span_count
    FROM traces
    LEFT JOIN spans ON spans.trace_id = traces.id
    GROUP BY traces.id
    ORDER BY traces.started_at DESC${limit ? "\nLIMIT ?" : ""}`;

    const traceRows = this.db
      .prepare(overviewQuery)
      .all(...(limit ? [limit] : [])) as DbRow[];

    const alertRows = this.db
      .prepare(
        `SELECT trace_id, severity
        FROM alerts
        ORDER BY created_at DESC`
      )
      .all() as DbRow[];
    const latestAlertSeverityByTrace = new Map<string, TraceOverview["latestAlertSeverity"]>();

    for (const row of alertRows) {
      const traceId = String(row.trace_id);
      if (!latestAlertSeverityByTrace.has(traceId)) {
        latestAlertSeverityByTrace.set(traceId, row.severity as TraceOverview["latestAlertSeverity"]);
      }
    }

    return traceRows.map((row) => ({
      id: String(row.id),
      objective: String(row.objective),
      symbol: String(row.symbol),
      status: row.status as TraceOverview["status"],
      startedAt: String(row.started_at),
      durationMs: Math.max(
        0,
        Date.parse(String(row.ended_at ?? row.started_at)) - Date.parse(String(row.started_at))
      ),
      spanCount: Number(row.span_count),
      latestAlertSeverity: latestAlertSeverityByTrace.get(String(row.id))
    }));
  }

  listAlerts(limit = 50): AlertRecord[] {
    const rows = this.db
      .prepare(
        `SELECT id, trace_id, severity, title, message, created_at, source
        FROM alerts
        ORDER BY created_at DESC
        LIMIT ?`
      )
      .all(limit) as DbRow[];

    return rows.map((row) => ({
      id: String(row.id),
      traceId: String(row.trace_id),
      severity: row.severity as AlertRecord["severity"],
      title: String(row.title),
      message: String(row.message),
      createdAt: String(row.created_at),
      source: String(row.source)
    }));
  }

  getOverviewStats(): OverviewStats {
    const counts = this.db
      .prepare(
        `SELECT
          COUNT(*) AS trace_count,
          SUM(CASE WHEN status = 'blocked' THEN 1 ELSE 0 END) AS blocked_count,
          COUNT(DISTINCT symbol) AS active_symbols
        FROM traces`
      )
      .get() as DbRow;
    const alertCountRow = this.db.prepare("SELECT COUNT(*) AS count FROM alerts").get() as DbRow;

    return {
      traceCount: Number(counts.trace_count ?? 0),
      blockedCount: Number(counts.blocked_count ?? 0),
      alertCount: Number(alertCountRow.count ?? 0),
      activeSymbols: Number(counts.active_symbols ?? 0)
    };
  }

  getTraceBundle(traceId: string): TraceBundle | null {
    const traceRow = this.db
      .prepare(
        `SELECT id, agent_id, session_id, objective, symbol, started_at, ended_at, status, metadata_json
        FROM traces
        WHERE id = ?`
      )
      .get(traceId) as DbRow | undefined;

    if (!traceRow) {
      return null;
    }

    const spanRows = this.db
      .prepare(
        `SELECT id, trace_id, parent_span_id, kind, name, started_at, ended_at, duration_ms, input_json, output_json, error_json
        FROM spans
        WHERE trace_id = ?
        ORDER BY started_at ASC`
      )
      .all(traceId) as DbRow[];
    const decisionRow = this.db
      .prepare(
        `SELECT trace_id, signals_seen_json, conflicts_detected_json, chosen_hypothesis, risk_checks_json, confidence, explanation_summary
        FROM decisions
        WHERE trace_id = ?`
      )
      .get(traceId) as DbRow | undefined;
    const actionRow = this.db
      .prepare(
        `SELECT trace_id, id, action_type, symbol, side, size, leverage, status, summary, timestamp, blocked_by_policy_id
        FROM actions
        WHERE trace_id = ?`
      )
      .get(traceId) as DbRow | undefined;
    const policyRows = this.db
      .prepare(
        `SELECT id, trace_id, rule_id, rule_name, decision, reason, timestamp, details_json
        FROM policy_hits
        WHERE trace_id = ?
        ORDER BY timestamp ASC`
      )
      .all(traceId) as DbRow[];
    const alertRows = this.db
      .prepare(
        `SELECT id, trace_id, severity, title, message, created_at, source
        FROM alerts
        WHERE trace_id = ?
        ORDER BY created_at ASC`
      )
      .all(traceId) as DbRow[];

    const decision = decisionRow
      ? ({
          traceId: String(decisionRow.trace_id),
          signalsSeen: parseJson<string[]>(decisionRow.signals_seen_json, []),
          conflictsDetected: parseJson<string[]>(decisionRow.conflicts_detected_json, []),
          chosenHypothesis: String(decisionRow.chosen_hypothesis),
          riskChecks: parseJson<string[]>(decisionRow.risk_checks_json, []),
          confidence: Number(decisionRow.confidence),
          explanationSummary: String(decisionRow.explanation_summary)
        } satisfies DecisionSummary)
      : undefined;

    return {
      trace: {
        id: String(traceRow.id),
        agentId: String(traceRow.agent_id),
        sessionId: String(traceRow.session_id),
        objective: String(traceRow.objective),
        symbol: String(traceRow.symbol),
        startedAt: String(traceRow.started_at),
        endedAt: traceRow.ended_at ? String(traceRow.ended_at) : undefined,
        status: traceRow.status as TraceBundle["trace"]["status"],
        metadata: parseJson<JsonObject>(traceRow.metadata_json, {})
      },
      spans: spanRows.map((row) => ({
        id: String(row.id),
        traceId: String(row.trace_id),
        parentSpanId: row.parent_span_id ? String(row.parent_span_id) : undefined,
        kind: row.kind as TraceBundle["spans"][number]["kind"],
        name: String(row.name),
        startedAt: String(row.started_at),
        endedAt: String(row.ended_at),
        durationMs: Number(row.duration_ms),
        inputJson: parseJson<JsonObject>(row.input_json, {}),
        outputJson: parseJson<JsonObject>(row.output_json, {}),
        errorJson: row.error_json ? parseJson<JsonObject>(row.error_json, {}) : undefined
      })),
      decision,
      action: actionRow
        ? {
            id: String(actionRow.id),
            traceId: String(actionRow.trace_id),
            actionType: actionRow.action_type as NonNullable<TraceBundle["action"]>["actionType"],
            symbol: String(actionRow.symbol),
            side: actionRow.side as NonNullable<TraceBundle["action"]>["side"],
            size: Number(actionRow.size),
            leverage: Number(actionRow.leverage),
            status: actionRow.status as NonNullable<TraceBundle["action"]>["status"],
            summary: String(actionRow.summary),
            timestamp: String(actionRow.timestamp),
            blockedByPolicyId: actionRow.blocked_by_policy_id
              ? String(actionRow.blocked_by_policy_id)
              : undefined
          }
        : undefined,
      policyHits: policyRows.map((row) => ({
        id: String(row.id),
        traceId: String(row.trace_id),
        ruleId: String(row.rule_id),
        ruleName: String(row.rule_name),
        decision: row.decision as PolicyHit["decision"],
        reason: String(row.reason),
        timestamp: String(row.timestamp),
        details: parseJson<JsonObject>(row.details_json, {})
      })),
      alerts: alertRows.map((row) => ({
        id: String(row.id),
        traceId: String(row.trace_id),
        severity: row.severity as AlertRecord["severity"],
        title: String(row.title),
        message: String(row.message),
        createdAt: String(row.created_at),
        source: String(row.source)
      }))
    };
  }

  listTraceBundles(limit?: number): TraceBundle[] {
    const overviews = this.listTraceOverviews(limit);
    return overviews
      .map((overview) => this.getTraceBundle(overview.id))
      .filter((bundle): bundle is TraceBundle => bundle !== null);
  }

  seedTraceBundle(bundle: TraceBundle): TraceOverview {
    this.insertTraceBundle(bundle);
    return buildTraceOverview(bundle);
  }

  deleteTracesByMetadataSource(source: string): void {
    const traceRows = this.db
      .prepare(
        `SELECT id
        FROM traces
        WHERE json_extract(metadata_json, '$.source') = ?`
      )
      .all(source) as DbRow[];

    if (traceRows.length === 0) {
      return;
    }

    this.db.exec("BEGIN");

    try {
      const deleteSpans = this.db.prepare("DELETE FROM spans WHERE trace_id = ?");
      const deletePolicyHits = this.db.prepare("DELETE FROM policy_hits WHERE trace_id = ?");
      const deleteAlerts = this.db.prepare("DELETE FROM alerts WHERE trace_id = ?");
      const deleteDecisions = this.db.prepare("DELETE FROM decisions WHERE trace_id = ?");
      const deleteActions = this.db.prepare("DELETE FROM actions WHERE trace_id = ?");
      const deleteTrace = this.db.prepare("DELETE FROM traces WHERE id = ?");

      for (const row of traceRows) {
        const traceId = String(row.id);
        deleteSpans.run(traceId);
        deletePolicyHits.run(traceId);
        deleteAlerts.run(traceId);
        deleteDecisions.run(traceId);
        deleteActions.run(traceId);
        deleteTrace.run(traceId);
      }

      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    this.db.close();
  }
}
