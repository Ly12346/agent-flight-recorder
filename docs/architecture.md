# Architecture

## Flow

1. An agent sends MCP tool calls through the proxy layer.
2. The proxy groups related tool calls into an active decision trace and turns each call into a span.
3. The recorder persists traces, decisions, actions, policy hits, and alerts in SQLite.
4. The replay engine rebuilds the decision chain for a single trace.
5. The risk audit package assigns `allow`, `warn`, or `block`.
6. The anomaly engine derives baseline analytics and behavior drift insights from recorded traces.
7. The incident-report and adapters packages shape replay data into exportable reports and delivery payloads.
8. The API exposes the data to the dashboard and external hooks.

## Current implementation split

- `@afr/trace-core` owns the canonical event contract.
- `@afr/mcp-proxy` owns capture sessions and trace assembly.
  It now supports grouped multi-call stitching with idle flush.
- `@afr/recorder` owns SQLite storage and retrieval.
- `@afr/replay-engine` owns replay shaping.
- `@afr/risk-audit` owns policy profiles and alert creation.
- `@afr/anomaly-engine` owns baseline metrics and anomaly insights.
- `@afr/incident-report` owns exportable incident summaries and Markdown generation.
- `@afr/adapters` owns channel-specific alert payload previews.
- `@afr/demo-sample-agent` owns deterministic scenarios for demo stability.

## Planned expansion

- Expand the current stdio JSON-RPC proxy into richer multi-call trace stitching against Bitget MCP.
- Add request redaction and tool allowlists.
- Split `risk-audit` into policy and anomaly submodules if scope grows.
- Introduce a richer dashboard data model for incident detail and trace comparison.
