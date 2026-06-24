import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";
import {
  buildAnalyticsSnapshot,
  detectAnomalies
} from "@afr/anomaly-engine";
import {
  buildAlertAdapterPreviews
} from "@afr/adapters";
import { availableScenarioNames, createScenarioBundle } from "@afr/demo-sample-agent";
import {
  buildIncidentMarkdown,
  buildIncidentReport
} from "@afr/incident-report";
import { SqliteRecorder } from "@afr/recorder";
import { buildReplay } from "@afr/replay-engine";
import {
  defaultPolicyProfileName,
  listPolicyProfiles,
  riskRuleCatalog
} from "@afr/risk-audit";

const host = process.env.AFR_API_HOST ?? "127.0.0.1";
const port = Number(process.env.AFR_API_PORT ?? 8787);
const rootDirectory = process.env.INIT_CWD ?? process.cwd();
const databasePath =
  process.env.AFR_DB_PATH ?? resolve(rootDirectory, "demo/recorded-data/agent-flight-recorder.sqlite");

const recorder = new SqliteRecorder(databasePath);

if (recorder.listTraceOverviews(1).length === 0) {
  for (const scenarioName of availableScenarioNames) {
    recorder.insertTraceBundle(createScenarioBundle(scenarioName));
  }
}

function reseedDemoScenarios(): void {
  recorder.deleteTracesByMetadataSource("sample-agent");
  for (const scenarioName of availableScenarioNames) {
    recorder.insertTraceBundle(createScenarioBundle(scenarioName));
  }
}

function sendJson(response: ServerResponse, statusCode: number, data: unknown): void {
  response.writeHead(statusCode, {
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-origin": "*",
    "content-type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(data, null, 2));
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Uint8Array[] = [];

  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

const server = createServer(async (request, response) => {
  if (!request.url || !request.method) {
    sendJson(response, 400, { error: "Missing request metadata." });
    return;
  }

  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  const url = new URL(request.url, `http://${host}:${port}`);
  const pathParts = url.pathname.split("/").filter(Boolean);

  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, {
      ok: true,
      host,
      port,
      databasePath
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/traces") {
    sendJson(response, 200, recorder.listTraceOverviews());
    return;
  }

  if (request.method === "GET" && url.pathname === "/traces/recent") {
    const traces = recorder.listTraceOverviews(8);
    sendJson(response, 200, traces);
    return;
  }

  if (request.method === "GET" && url.pathname === "/alerts") {
    sendJson(response, 200, recorder.listAlerts());
    return;
  }

  if (request.method === "GET" && url.pathname === "/policies") {
    sendJson(response, 200, {
      activeProfile: defaultPolicyProfileName,
      profiles: listPolicyProfiles(),
      rules: riskRuleCatalog
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/demo/scenarios") {
    sendJson(response, 200, {
      scenarios: availableScenarioNames
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/stats/overview") {
    sendJson(response, 200, recorder.getOverviewStats());
    return;
  }

  if (request.method === "GET" && url.pathname === "/analytics/summary") {
    sendJson(response, 200, buildAnalyticsSnapshot(recorder.listTraceBundles()));
    return;
  }

  if (request.method === "GET" && url.pathname === "/analytics/anomalies") {
    sendJson(response, 200, detectAnomalies(recorder.listTraceBundles()));
    return;
  }

  if (request.method === "GET" && pathParts[0] === "traces" && pathParts[1]) {
    const bundle = recorder.getTraceBundle(pathParts[1]);
    if (!bundle) {
      sendJson(response, 404, { error: "Trace not found." });
      return;
    }

    sendJson(response, 200, bundle);
    return;
  }

  if (request.method === "GET" && pathParts[0] === "replay" && pathParts[1]) {
    const bundle = recorder.getTraceBundle(pathParts[1]);
    if (!bundle) {
      sendJson(response, 404, { error: "Trace not found." });
      return;
    }

    sendJson(response, 200, buildReplay(bundle));
    return;
  }

  if (request.method === "GET" && pathParts[0] === "incidents" && pathParts[1] && pathParts[2] === "report") {
    const bundle = recorder.getTraceBundle(pathParts[1]);
    if (!bundle) {
      sendJson(response, 404, { error: "Trace not found." });
      return;
    }

    const replay = buildReplay(bundle);
    const report = buildIncidentReport(replay);
    sendJson(response, 200, {
      report,
      markdown: buildIncidentMarkdown(report)
    });
    return;
  }

  if (request.method === "GET" && pathParts[0] === "incidents" && pathParts[1] && pathParts[2] === "adapters") {
    const bundle = recorder.getTraceBundle(pathParts[1]);
    if (!bundle) {
      sendJson(response, 404, { error: "Trace not found." });
      return;
    }

    sendJson(response, 200, buildAlertAdapterPreviews(buildReplay(bundle)));
    return;
  }

  if (request.method === "POST" && url.pathname === "/demo/load-scenario") {
    const body = (await readBody(request)) as { name?: string };
    if (!body.name || !availableScenarioNames.includes(body.name as (typeof availableScenarioNames)[number])) {
      sendJson(response, 400, {
        error: "Invalid scenario name.",
        availableScenarioNames
      });
      return;
    }

    reseedDemoScenarios();
    const bundle = recorder.getTraceBundle(
      {
        "normal-trade": "demo_trace_normal_trade",
        "oversized-position": "demo_trace_oversized_position",
        "signal-conflict": "demo_trace_signal_conflict",
        "stale-data": "demo_trace_stale_data",
        "revenge-trading": "demo_trace_revenge_trading"
      }[body.name as (typeof availableScenarioNames)[number]]
    );

    if (!bundle) {
      sendJson(response, 500, { error: "Failed to reload demo scenario." });
      return;
    }

    sendJson(response, 201, buildReplay(bundle));
    return;
  }

  sendJson(response, 404, { error: "Route not found." });
});

server.listen(port, host, () => {
  console.log(`AFR API listening on http://${host}:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    recorder.close();
    server.close();
  });
}
