export const severityLabels = {
  info: "Info",
  medium: "Review",
  high: "Blocker"
} as const;

export const statusLabels = {
  started: "Started",
  completed: "Completed",
  blocked: "Blocked",
  failed: "Failed"
} as const;

export function formatDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  return `${(durationMs / 1000).toFixed(2)}s`;
}

export function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString();
}
