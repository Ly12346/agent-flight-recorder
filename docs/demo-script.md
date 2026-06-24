# Demo Script

## Goal

Show that the same agent can be safe or unsafe, and that the platform explains and blocks the unsafe path.

## Suggested flow

1. Open the dashboard and show the overview counts.
2. Click the blocked oversized position trace.
3. Explain the tool calls and the decision summary.
4. Show the policy hit that blocked the action.
5. Open the incident report section and mention that the trace can be exported as Markdown for post-mortems.
6. Show the adapter previews for console, webhook, and Telegram payloads.
7. Switch to the signal conflict trace to show a `warn` path instead of a block.
8. Load `stale-data` or `revenge-trading` from the scenario toolbar to demonstrate a second incident type without changing code.
