import { startTransition, useEffect, useState } from "react";

type TraceOverview = {
  id: string;
  objective: string;
  symbol: string;
  status: "started" | "completed" | "blocked" | "failed";
  startedAt: string;
  durationMs: number;
  spanCount: number;
  latestAlertSeverity?: "info" | "medium" | "high";
};

type AlertRecord = {
  id: string;
  traceId: string;
  severity: "info" | "medium" | "high";
  title: string;
  message: string;
  createdAt: string;
  source: string;
};

type OverviewStats = {
  traceCount: number;
  blockedCount: number;
  alertCount: number;
  activeSymbols: number;
};

type AnalyticsSnapshot = {
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
};

type AnomalyInsight = {
  id: string;
  traceId: string;
  title: string;
  description: string;
  severity: "info" | "medium" | "high";
  score: number;
  category: "execution" | "reasoning" | "latency" | "policy";
  metrics: Record<string, number | string>;
};

type ReplayStep = {
  id: string;
  at: string;
  kind: string;
  title: string;
  summary: string;
  details: Record<string, unknown>;
};

type ReplayArtifact = {
  trace: {
    id: string;
    objective: string;
    symbol: string;
    status: "started" | "completed" | "blocked" | "failed";
    startedAt: string;
    endedAt?: string;
    metadata: Record<string, unknown>;
  };
  overview: TraceOverview;
  steps: ReplayStep[];
  decision?: {
    signalsSeen: string[];
    conflictsDetected: string[];
    chosenHypothesis: string;
    riskChecks: string[];
    confidence: number;
    explanationSummary: string;
  };
  action?: {
    actionType: string;
    symbol: string;
    side: string;
    size: number;
    leverage: number;
    status: string;
    summary: string;
    blockedByPolicyId?: string;
  };
  policyHits: Array<{
    id: string;
    ruleName: string;
    decision: string;
    reason: string;
    details: Record<string, unknown>;
  }>;
  alerts: AlertRecord[];
};

type IncidentReport = {
  generatedAt: string;
  headline: string;
  summary: string;
  severity: "info" | "medium" | "high";
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
    latestAlertSeverity?: "info" | "medium" | "high";
  };
};

type IncidentReportPayload = {
  report: IncidentReport;
  markdown: string;
};

type AdapterPreview = {
  channel: "console" | "webhook" | "telegram";
  title: string;
  summary: string;
  contentType: "text/plain" | "application/json" | "text/markdown";
  destinationHint: string;
  payload: string | Record<string, unknown>;
};

type PolicyProfile = {
  name: string;
  maxPositionSize: number;
  maxLeverage: number;
  minConfidence: number;
};

type RiskRuleDescriptor = {
  id: string;
  name: string;
  category: "execution" | "reasoning" | "reliability";
  defaultDecision: "allow" | "warn" | "block";
  description: string;
};

type PoliciesPayload = {
  activeProfile: string;
  profiles: PolicyProfile[];
  rules: RiskRuleDescriptor[];
};

type ScenariosPayload = {
  scenarios: string[];
};

type ViewName = "incident" | "alerts" | "policies" | "analytics";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8787";
const viewLabels: Record<ViewName, string> = {
  incident: "决策中心",
  alerts: "告警",
  policies: "策略",
  analytics: "分析"
};
const severityLabels: Record<AlertRecord["severity"], string> = {
  info: "提示",
  medium: "关注",
  high: "高危"
};
const stepKindLabels: Record<string, string> = {
  tool_call: "工具调用",
  reasoning_summary: "决策摘要",
  action: "动作",
  policy_check: "策略检查",
  policy_hit: "策略命中",
  alert: "告警"
};
const statusLabels: Record<TraceOverview["status"], string> = {
  started: "进行中",
  completed: "已完成",
  blocked: "已拦截",
  failed: "失败"
};
const profileLabels: Record<string, string> = {
  safe: "稳健",
  balanced: "平衡",
  aggressive: "激进"
};
const categoryLabels: Record<string, string> = {
  execution: "执行",
  reasoning: "推理",
  reliability: "可靠性",
  latency: "延迟",
  policy: "策略"
};
const decisionLabels: Record<string, string> = {
  allow: "放行",
  warn: "警告",
  block: "拦截"
};
const scenarioLabels: Record<string, string> = {
  "normal-trade": "基线正常交易",
  "oversized-position": "超大仓位拦截",
  "signal-conflict": "信号冲突审查",
  "stale-data": "过期数据拦截",
  "revenge-trading": "冷静期违规拦截"
};
const actionStatusLabels: Record<string, string> = {
  pending: "待执行",
  executed: "已执行",
  blocked: "已拦截",
  failed: "失败",
  unknown: "未知"
};

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, init);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  return `${(durationMs / 1000).toFixed(2)}s`;
}

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString();
}

function DetailJson({ value }: { value: Record<string, unknown> }) {
  return <pre className="detail-json">{JSON.stringify(value, null, 2)}</pre>;
}

function AdapterPayload({ payload }: { payload: string | Record<string, unknown> }) {
  if (typeof payload === "string") {
    return <pre className="detail-json">{payload}</pre>;
  }

  return <DetailJson value={payload} />;
}

function SeverityBadge({ severity }: { severity: AlertRecord["severity"] }) {
  return <span className={`badge severity-${severity}`}>{severityLabels[severity]}</span>;
}

function StatusBadge({ status }: { status: TraceOverview["status"] | ReplayArtifact["trace"]["status"] }) {
  return <span className={`badge status-${status}`}>{statusLabels[status]}</span>;
}

export function App() {
  const [activeView, setActiveView] = useState<ViewName>("incident");
  const [traces, setTraces] = useState<TraceOverview[]>([]);
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [policies, setPolicies] = useState<PoliciesPayload | null>(null);
  const [scenarios, setScenarios] = useState<string[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsSnapshot | null>(null);
  const [anomalies, setAnomalies] = useState<AnomalyInsight[]>([]);
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);
  const [replay, setReplay] = useState<ReplayArtifact | null>(null);
  const [incidentReport, setIncidentReport] = useState<IncidentReportPayload | null>(null);
  const [adapterPreviews, setAdapterPreviews] = useState<AdapterPreview[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [replayError, setReplayError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isReplayLoading, setIsReplayLoading] = useState(false);
  const [loadingScenario, setLoadingScenario] = useState<string | null>(null);

  async function loadOverview(preferredTraceId?: string): Promise<void> {
    setIsRefreshing(true);
    setError(null);

    try {
      const [
        nextTraces,
        nextAlerts,
        nextStats,
        nextPolicies,
        nextScenarios,
        nextAnalytics,
        nextAnomalies
      ] = await Promise.all([
        fetchJson<TraceOverview[]>("/traces"),
        fetchJson<AlertRecord[]>("/alerts"),
        fetchJson<OverviewStats>("/stats/overview"),
        fetchJson<PoliciesPayload>("/policies"),
        fetchJson<ScenariosPayload>("/demo/scenarios"),
        fetchJson<AnalyticsSnapshot>("/analytics/summary"),
        fetchJson<AnomalyInsight[]>("/analytics/anomalies")
      ]);

      setTraces(nextTraces);
      setAlerts(nextAlerts);
      setStats(nextStats);
      setPolicies(nextPolicies);
      setScenarios(nextScenarios.scenarios);
      setAnalytics(nextAnalytics);
      setAnomalies(nextAnomalies);

      const traceIds = new Set(nextTraces.map((trace) => trace.id));
      const nextSelectedTraceId =
        preferredTraceId && traceIds.has(preferredTraceId)
          ? preferredTraceId
          : selectedTraceId && traceIds.has(selectedTraceId)
            ? selectedTraceId
            : nextTraces[0]?.id ?? null;

      startTransition(() => {
        setSelectedTraceId(nextSelectedTraceId);
      });
    } catch (caughtError: unknown) {
      setError(caughtError instanceof Error ? caughtError.message : "未知错误");
    } finally {
      setIsRefreshing(false);
    }
  }

  useEffect(() => {
    void loadOverview();
  }, []);

  useEffect(() => {
    if (!selectedTraceId) {
      setReplay(null);
      setIncidentReport(null);
      setAdapterPreviews([]);
      return;
    }

    setIsReplayLoading(true);
    setReplayError(null);

    void Promise.all([
      fetchJson<ReplayArtifact>(`/replay/${selectedTraceId}`),
      fetchJson<IncidentReportPayload>(`/incidents/${selectedTraceId}/report`),
      fetchJson<AdapterPreview[]>(`/incidents/${selectedTraceId}/adapters`)
    ])
      .then(([nextReplay, nextIncidentReport, nextAdapterPreviews]) => {
        setReplay(nextReplay);
        setIncidentReport(nextIncidentReport);
        setAdapterPreviews(nextAdapterPreviews);
      })
      .catch((caughtError: unknown) => {
        setReplayError(caughtError instanceof Error ? caughtError.message : "未知错误");
      })
      .finally(() => {
        setIsReplayLoading(false);
      });
  }, [selectedTraceId]);

  async function handleLoadScenario(name: string): Promise<void> {
    setLoadingScenario(name);
    setError(null);

    try {
      const createdReplay = await fetchJson<ReplayArtifact>("/demo/load-scenario", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ name })
      });

      setReplay(createdReplay);
      startTransition(() => {
        setActiveView("incident");
        setSelectedTraceId(createdReplay.trace.id);
      });

      await loadOverview(createdReplay.trace.id);
    } catch (caughtError: unknown) {
      setError(caughtError instanceof Error ? caughtError.message : "未知错误");
    } finally {
      setLoadingScenario(null);
    }
  }

  const selectedTrace = traces.find((trace) => trace.id === selectedTraceId) ?? null;

  return (
    <main className="app-shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Agent Flight Recorder + Risk Audit</p>
          <h1>{viewLabels[activeView]}</h1>
          <p className="subcopy">
            逐步查看每一次工具调用，回放完整决策上下文，并直观看到哪些风控护栏拦下了高风险动作。
          </p>
        </div>

        <nav className="view-switcher" aria-label="仪表盘分区">
          {(["incident", "alerts", "policies", "analytics"] as ViewName[]).map((view) => (
            <button
              key={view}
              className={`view-pill ${activeView === view ? "is-active" : ""}`}
              type="button"
              onClick={() => setActiveView(view)}
            >
              {viewLabels[view]}
            </button>
          ))}
        </nav>
      </section>

      <section className="toolbar panel">
        <div>
          <h2>演示场景</h2>
          <p>一键加载可复现的决策记录，用于评委演示和内部验收。</p>
        </div>
        <div className="toolbar-actions">
          {scenarios.map((scenario) => (
            <button
              key={scenario}
              className="scenario-button"
              type="button"
              disabled={loadingScenario === scenario}
              onClick={() => {
                void handleLoadScenario(scenario);
              }}
            >
              {loadingScenario === scenario
                ? `正在加载 ${scenarioLabels[scenario] ?? scenario}...`
                : (scenarioLabels[scenario] ?? scenario)}
            </button>
          ))}
          <button
            className="refresh-button"
            type="button"
            disabled={isRefreshing}
            onClick={() => {
              void loadOverview(selectedTraceId ?? undefined);
            }}
          >
            {isRefreshing ? "正在刷新..." : "刷新数据"}
          </button>
        </div>
      </section>

      {error ? <p className="error-banner">{error}</p> : null}

      <section className="stats-grid">
        <article className="stat-card">
          <span>决策记录数</span>
          <strong>{stats?.traceCount ?? "-"}</strong>
        </article>
        <article className="stat-card">
          <span>高风险拦截数</span>
          <strong>{stats?.blockedCount ?? "-"}</strong>
        </article>
        <article className="stat-card">
          <span>告警事件数</span>
          <strong>{stats?.alertCount ?? "-"}</strong>
        </article>
        <article className="stat-card">
          <span>交易对数量</span>
          <strong>{stats?.activeSymbols ?? "-"}</strong>
        </article>
      </section>

      {activeView === "incident" ? (
        <section className="incident-layout">
          <aside className="panel incident-list-panel">
            <div className="panel-header">
              <div>
                <h2>决策记录</h2>
                <p>选择一条决策记录，查看它的完整回放。</p>
              </div>
              <span>{traces.length} 条记录</span>
            </div>

            <ul className="trace-list">
              {traces.map((trace) => (
                <li key={trace.id}>
                  <button
                    className={`trace-button ${selectedTraceId === trace.id ? "is-selected" : ""} status-${trace.status}`}
                    type="button"
                    onClick={() => {
                      startTransition(() => {
                        setSelectedTraceId(trace.id);
                      });
                    }}
                  >
                    <div className="trace-header">
                      <strong>{trace.symbol}</strong>
                      <StatusBadge status={trace.status} />
                    </div>
                    <p>{trace.objective}</p>
                    <div className="trace-meta">
                      <span>{formatTimestamp(trace.startedAt)}</span>
                      <span>{trace.spanCount} spans</span>
                      <span>{formatDuration(trace.durationMs)}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <section className="replay-stack">
            <article className="panel replay-overview">
              <div className="panel-header">
                <div>
                  <h2>回放详情</h2>
                  <p>{selectedTrace ? selectedTrace.objective : "请选择一条决策记录查看。"}</p>
                </div>
                {selectedTrace ? <StatusBadge status={selectedTrace.status} /> : null}
              </div>

              {replayError ? <p className="error-banner">{replayError}</p> : null}
              {isReplayLoading ? <p className="empty-state">正在加载回放...</p> : null}

              {!isReplayLoading && replay ? (
                <>
                  <div className="overview-grid">
                    <article className="detail-card">
                      <span className="detail-label">决策记录</span>
                      <strong>{replay.trace.id}</strong>
                      <p>{replay.trace.symbol}</p>
                      <p>{formatTimestamp(replay.trace.startedAt)}</p>
                    </article>
                    <article className="detail-card">
                      <span className="detail-label">决策</span>
                      <strong>{replay.decision?.chosenHypothesis ?? "没有结构化决策摘要"}</strong>
                      <p>
                        置信度：
                        {replay.decision ? `${Math.round(replay.decision.confidence * 100)}%` : "-"}
                      </p>
                    </article>
                    <article className="detail-card">
                      <span className="detail-label">动作</span>
                      <strong>{replay.action?.actionType ?? "没有动作"}</strong>
                      <p>
                        {replay.action
                          ? `${replay.action.side} ${replay.action.size} ${replay.action.symbol} @ ${replay.action.leverage}x`
                          : "没有执行载荷"}
                      </p>
                    </article>
                  </div>

                  <div className="replay-grid">
                    <article className="detail-panel">
                      <div className="detail-panel-header">
                        <h3>决策摘要</h3>
                      </div>
                      {replay.decision ? (
                        <>
                          <p className="detail-text">{replay.decision.explanationSummary}</p>
                          <div className="chip-row">
                            {replay.decision.signalsSeen.map((signal) => (
                              <span key={signal} className="chip chip-positive">
                                {signal}
                              </span>
                            ))}
                            {replay.decision.conflictsDetected.map((conflict) => (
                              <span key={conflict} className="chip chip-warning">
                                {conflict}
                              </span>
                            ))}
                          </div>
                          <ul className="detail-list">
                            {replay.decision.riskChecks.map((riskCheck) => (
                              <li key={riskCheck}>{riskCheck}</li>
                            ))}
                          </ul>
                        </>
                      ) : (
                        <p className="empty-state">这条决策记录没有结构化决策摘要。</p>
                      )}
                    </article>

                    <article className="detail-panel">
                      <div className="detail-panel-header">
                        <h3>风险审计</h3>
                      </div>
                      {replay.policyHits.length > 0 ? (
                        <ul className="policy-hit-list">
                          {replay.policyHits.map((hit) => (
                            <li key={hit.id} className={`policy-hit decision-${hit.decision}`}>
                              <div className="policy-hit-header">
                                <strong>{hit.ruleName}</strong>
                                <span className={`badge decision-${hit.decision}`}>{decisionLabels[hit.decision] ?? hit.decision}</span>
                              </div>
                              <p>{hit.reason}</p>
                              <DetailJson value={hit.details} />
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="empty-state">这条决策记录没有命中任何策略规则。</p>
                      )}
                    </article>
                  </div>

                  <article className="panel timeline-panel">
                    <div className="panel-header">
                      <div>
                        <h2>取证时间线</h2>
                        <p>按时间顺序展示所有 Span、策略事件和告警。</p>
                      </div>
                      <span>{replay.steps.length} 个步骤</span>
                    </div>
                    <ul className="timeline-list">
                      {replay.steps.map((step) => (
                        <li key={step.id} className={`timeline-item kind-${step.kind}`}>
                          <div className="timeline-copy">
                            <div className="timeline-header">
                              <strong>{step.title}</strong>
                              <span>{stepKindLabels[step.kind] ?? step.kind}</span>
                            </div>
                            <p>{step.summary}</p>
                            <span className="timeline-time">{formatTimestamp(step.at)}</span>
                          </div>
                          <DetailJson value={step.details} />
                        </li>
                      ))}
                    </ul>
                  </article>

                  <div className="report-grid">
                    <article className="panel incident-report-panel">
                      <div className="panel-header">
                        <div>
                          <h2>事故报告</h2>
                          <p>可导出的事故摘要，适合复盘、交接和评委演示。</p>
                        </div>
                      </div>

                      {incidentReport ? (
                        <>
                          <div className="detail-card report-card">
                            <span className="detail-label">Headline</span>
                            <strong>{incidentReport.report.headline}</strong>
                            <p>{incidentReport.report.summary}</p>
                            <p>{formatTimestamp(incidentReport.report.generatedAt)}</p>
                          </div>
                          <pre className="detail-json">{incidentReport.markdown}</pre>
                        </>
                      ) : (
                        <p className="empty-state">这条决策记录还没有可用的事故报告。</p>
                      )}
                    </article>

                    <article className="panel adapter-panel">
                      <div className="panel-header">
                        <div>
                          <h2>告警适配器</h2>
                          <p>预览这起事故在控制台、Webhook 和 Telegram 中会呈现成什么样。</p>
                        </div>
                      </div>

                      {adapterPreviews.length > 0 ? (
                        <ul className="adapter-list">
                          {adapterPreviews.map((adapter) => (
                            <li key={adapter.channel} className="adapter-item">
                              <div className="adapter-header">
                                <strong>{adapter.title}</strong>
                                <span className="badge adapter-channel">{adapter.channel === "console" ? "控制台" : adapter.channel === "webhook" ? "Webhook" : "Telegram"}</span>
                              </div>
                              <p>{adapter.summary}</p>
                              <p>{adapter.destinationHint}</p>
                              <AdapterPayload payload={adapter.payload} />
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="empty-state">这条决策记录还没有可用的适配器预览。</p>
                      )}
                    </article>
                  </div>
                </>
              ) : null}

              {!isReplayLoading && !replay ? (
                <p className="empty-state">请选择一条决策记录查看回放。</p>
              ) : null}
            </article>
          </section>
        </section>
      ) : null}

      {activeView === "alerts" ? (
        <section className="panel alerts-panel">
            <div className="panel-header">
              <div>
                <h2>告警流</h2>
                <p>查看所有风控告警，并一键回到对应的决策记录。</p>
              </div>
              <span>{alerts.length} 条告警</span>
          </div>

          <ul className="alert-feed">
            {alerts.map((alert) => (
              <li key={alert.id} className={`alert-feed-item severity-${alert.severity}`}>
                <div className="alert-feed-copy">
                  <div className="alert-feed-header">
                    <strong>{alert.title}</strong>
                    <SeverityBadge severity={alert.severity} />
                  </div>
                  <p>{alert.message}</p>
                  <span>{formatTimestamp(alert.createdAt)}</span>
                </div>
                <button
                  className="trace-link-button"
                  type="button"
                  onClick={() => {
                    startTransition(() => {
                      setActiveView("incident");
                      setSelectedTraceId(alert.traceId);
                    });
                  }}
                >
                  打开回放
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {activeView === "policies" ? (
        <section className="policy-layout">
          <article className="panel profile-panel">
            <div className="panel-header">
              <div>
                <h2>策略档位</h2>
                <p>默认风控护栏会基于这些档位决定交易是放行、警告还是拦截。</p>
              </div>
              <span>当前档位：{policies ? (profileLabels[policies.activeProfile] ?? policies.activeProfile) : "-"}</span>
            </div>

            <div className="profile-grid">
              {policies?.profiles.map((profile) => (
                <article
                  key={profile.name}
                  className={`profile-card ${policies.activeProfile === profile.name ? "is-active" : ""}`}
                >
                  <span className="detail-label">{profileLabels[profile.name] ?? profile.name}</span>
                  <strong>最大仓位 {profile.maxPositionSize} BTC</strong>
                  <p>最大杠杆 {profile.maxLeverage}x</p>
                  <p>最低置信度 {Math.round(profile.minConfidence * 100)}%</p>
                </article>
              ))}
            </div>
          </article>

          <article className="panel rules-panel">
            <div className="panel-header">
              <div>
                <h2>规则目录</h2>
                <p>展示当前审计层会检查什么，以及每条规则的默认处理方式。</p>
              </div>
              <span>{policies?.rules.length ?? 0} 条规则</span>
            </div>

            <div className="rules-grid">
              {policies?.rules.map((rule) => (
                <article key={rule.id} className="rule-card">
                  <div className="rule-card-header">
                    <strong>{rule.name}</strong>
                    <span className={`badge decision-${rule.defaultDecision}`}>{decisionLabels[rule.defaultDecision] ?? rule.defaultDecision}</span>
                  </div>
                  <p>{rule.description}</p>
                  <div className="rule-meta">
                    <span>{categoryLabels[rule.category] ?? rule.category}</span>
                    <span>{rule.id}</span>
                  </div>
                </article>
              ))}
            </div>
          </article>
        </section>
      ) : null}

      {activeView === "analytics" ? (
        <section className="analytics-layout">
          <article className="panel analytics-overview-panel">
            <div className="panel-header">
              <div>
                <h2>行为基线</h2>
                <p>基于当前录到的决策记录统计得出，并会在加载新场景时自动刷新。</p>
              </div>
              <span>已分析 {analytics?.traceCount ?? 0} 条记录</span>
            </div>

            <div className="analytics-grid">
              <article className="detail-card">
                <span className="detail-label">平均工具延迟</span>
                <strong>{analytics ? formatDuration(analytics.avgLatencyMs) : "-"}</strong>
                <p>统计范围为全部工具调用。</p>
              </article>
              <article className="detail-card">
                <span className="detail-label">平均仓位</span>
                <strong>{analytics ? `${analytics.avgPositionSize.toFixed(2)} BTC` : "-"}</strong>
                <p>统计范围为所有执行和被拦截的动作。</p>
              </article>
              <article className="detail-card">
                <span className="detail-label">平均杠杆</span>
                <strong>{analytics ? `${analytics.avgLeverage.toFixed(2)}x` : "-"}</strong>
                <p>统计范围为全部动作载荷。</p>
              </article>
              <article className="detail-card">
                <span className="detail-label">平均置信度</span>
                <strong>{analytics ? `${Math.round(analytics.avgConfidence * 100)}%` : "-"}</strong>
                <p>统计范围为全部结构化决策摘要。</p>
              </article>
            </div>
          </article>

          <article className="panel anomaly-panel">
            <div className="panel-header">
              <div>
                <h2>异常洞察</h2>
                <p>从当前行为基线中挑出最值得关注的偏离项。</p>
              </div>
              <span>{anomalies.length} 条洞察</span>
            </div>

            {anomalies.length > 0 ? (
              <ul className="anomaly-list">
                {anomalies.map((anomaly) => (
                  <li key={anomaly.id} className={`anomaly-item severity-${anomaly.severity}`}>
                    <div className="anomaly-copy">
                      <div className="anomaly-header">
                        <strong>{anomaly.title}</strong>
                        <div className="anomaly-badges">
                          <SeverityBadge severity={anomaly.severity} />
                          <span className="badge anomaly-category">{categoryLabels[anomaly.category] ?? anomaly.category}</span>
                        </div>
                      </div>
                      <p>{anomaly.description}</p>
                      <span>评分：{anomaly.score}</span>
                    </div>

                    <div className="anomaly-actions">
                      <DetailJson value={anomaly.metrics} />
                      <button
                        className="trace-link-button"
                        type="button"
                        onClick={() => {
                          startTransition(() => {
                            setActiveView("incident");
                            setSelectedTraceId(anomaly.traceId);
                          });
                        }}
                      >
                        查看记录
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty-state">暂时没有检测到异常。</p>
            )}
          </article>

          <div className="analytics-detail-grid">
            <article className="panel analytics-list-panel">
              <div className="panel-header">
                <div>
                  <h2>工具使用分布</h2>
                  <p>当前最常用的工具和分析技能。</p>
                </div>
              </div>
              {analytics && analytics.toolUsage.length > 0 ? (
                <ul className="metric-list">
                  {analytics.toolUsage.map((item) => (
                    <li key={item.tool} className="metric-item">
                      <strong>{item.tool}</strong>
                      <span>{item.count}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-state">暂时没有工具使用数据。</p>
              )}
            </article>

            <article className="panel analytics-list-panel">
              <div className="panel-header">
                <div>
                  <h2>动作状态分布</h2>
                  <p>已执行、已拦截、失败等动作状态的分布。</p>
                </div>
              </div>
              {analytics && analytics.actionByStatus.length > 0 ? (
                <ul className="metric-list">
                  {analytics.actionByStatus.map((item) => (
                    <li key={item.status} className="metric-item">
                      <strong>{actionStatusLabels[item.status] ?? item.status}</strong>
                      <span>{item.count}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-state">暂时没有动作状态数据。</p>
              )}
            </article>

            <article className="panel analytics-list-panel">
              <div className="panel-header">
                <div>
                  <h2>交易对分布</h2>
                  <p>当前 Agent 最常交互的市场。</p>
                </div>
              </div>
              {analytics && analytics.symbolUsage.length > 0 ? (
                <ul className="metric-list">
                  {analytics.symbolUsage.map((item) => (
                    <li key={item.symbol} className="metric-item">
                      <strong>{item.symbol}</strong>
                      <span>{item.count}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty-state">暂时没有交易对分布数据。</p>
              )}
            </article>
          </div>
        </section>
      ) : null}
    </main>
  );
}
