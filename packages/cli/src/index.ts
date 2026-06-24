#!/usr/bin/env node

import { parseArgs } from "node:util";
import { availableScenarioNames, createScenarioBundle } from "@afr/demo-sample-agent";
import { StdioMcpProxy } from "@afr/mcp-proxy";
import { SqliteRecorder } from "@afr/recorder";
import { PolicyProfileName, policyProfiles } from "@afr/risk-audit";

function printUsage(): void {
  console.log(`afr

Commands:
  afr demo list
  afr demo seed <scenario> [db-path]
  afr proxy --upstream-command <command> [--upstream-arg <arg>...]
`);
}

async function main(): Promise<void> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      "agent-id": {
        type: "string"
      },
      "agent-name": {
        type: "string"
      },
      "agent-version": {
        type: "string"
      },
      "db-path": {
        type: "string"
      },
      "decision-idle-ms": {
        type: "string"
      },
      debug: {
        type: "boolean"
      },
      "policy-profile": {
        type: "string"
      },
      "upstream-arg": {
        type: "string",
        multiple: true
      },
      "upstream-command": {
        type: "string"
      }
    }
  });

  const [command, subcommand, value, databasePath] = positionals;

  if (!command) {
    printUsage();
    return;
  }

  if (command === "proxy") {
    const policyProfile = (values["policy-profile"] as PolicyProfileName | undefined) ?? "balanced";
    if (!(policyProfile in policyProfiles)) {
      console.error(`Unknown policy profile: ${policyProfile}`);
      process.exitCode = 1;
      return;
    }

    const upstreamCommand = values["upstream-command"];
    if (!upstreamCommand) {
      console.error("Proxy mode requires --upstream-command.");
      printUsage();
      process.exitCode = 1;
      return;
    }

    const proxy = new StdioMcpProxy({
      upstreamCommand,
      upstreamArgs: values["upstream-arg"],
      databasePath:
        values["db-path"] ??
        process.env.AFR_DB_PATH ??
        `${process.env.INIT_CWD ?? process.cwd()}/demo/recorded-data/agent-flight-recorder.sqlite`,
      decisionIdleMs: values["decision-idle-ms"] ? Number(values["decision-idle-ms"]) : undefined,
      policyProfile,
      agent: {
        id: values["agent-id"] ?? process.env.AFR_AGENT_ID ?? "afr_proxy_client",
        name: values["agent-name"] ?? process.env.AFR_AGENT_NAME ?? "AFR Proxy Client",
        version: values["agent-version"] ?? process.env.AFR_AGENT_VERSION ?? "0.1.0"
      },
      debug: values.debug ?? false
    });

    await proxy.run();
    return;
  }

  if (command === "demo" && subcommand === "list") {
    console.log(availableScenarioNames.join("\n"));
    return;
  }

  if (command === "demo" && subcommand === "seed") {
    if (!value || !availableScenarioNames.includes(value as (typeof availableScenarioNames)[number])) {
      console.error("Provide a valid scenario name.");
      printUsage();
      process.exitCode = 1;
      return;
    }

    const recorder = new SqliteRecorder(
      databasePath ?? process.env.AFR_DB_PATH ?? "./demo/recorded-data/agent-flight-recorder.sqlite"
    );
    recorder.insertTraceBundle(createScenarioBundle(value as (typeof availableScenarioNames)[number]));
    recorder.close();
    console.log(`Seeded ${value}`);
    return;
  }

  printUsage();
}

void main();
