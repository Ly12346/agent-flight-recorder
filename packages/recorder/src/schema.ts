export const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS traces (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    objective TEXT NOT NULL,
    symbol TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    status TEXT NOT NULL,
    metadata_json TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS spans (
    id TEXT PRIMARY KEY,
    trace_id TEXT NOT NULL,
    parent_span_id TEXT,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT NOT NULL,
    duration_ms INTEGER NOT NULL,
    input_json TEXT NOT NULL,
    output_json TEXT NOT NULL,
    error_json TEXT,
    FOREIGN KEY(trace_id) REFERENCES traces(id)
  )`,
  `CREATE TABLE IF NOT EXISTS decisions (
    trace_id TEXT PRIMARY KEY,
    signals_seen_json TEXT NOT NULL,
    conflicts_detected_json TEXT NOT NULL,
    chosen_hypothesis TEXT NOT NULL,
    risk_checks_json TEXT NOT NULL,
    confidence REAL NOT NULL,
    explanation_summary TEXT NOT NULL,
    FOREIGN KEY(trace_id) REFERENCES traces(id)
  )`,
  `CREATE TABLE IF NOT EXISTS actions (
    trace_id TEXT PRIMARY KEY,
    id TEXT NOT NULL,
    action_type TEXT NOT NULL,
    symbol TEXT NOT NULL,
    side TEXT NOT NULL,
    size REAL NOT NULL,
    leverage REAL NOT NULL,
    status TEXT NOT NULL,
    summary TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    blocked_by_policy_id TEXT,
    FOREIGN KEY(trace_id) REFERENCES traces(id)
  )`,
  `CREATE TABLE IF NOT EXISTS policy_hits (
    id TEXT PRIMARY KEY,
    trace_id TEXT NOT NULL,
    rule_id TEXT NOT NULL,
    rule_name TEXT NOT NULL,
    decision TEXT NOT NULL,
    reason TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    details_json TEXT NOT NULL,
    FOREIGN KEY(trace_id) REFERENCES traces(id)
  )`,
  `CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY,
    trace_id TEXT NOT NULL,
    severity TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL,
    source TEXT NOT NULL,
    FOREIGN KEY(trace_id) REFERENCES traces(id)
  )`
];
