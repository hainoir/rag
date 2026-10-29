export type IngestionSourceExitSummary = {
  sourceId: string;
  errorCount: number;
  storedCount: number;
  dedupedCount: number;
};

export type IngestionJobFailurePolicy = "all-sources" | "any-error";

export type IngestionJobExit = {
  exitCode: 0 | 1;
  status: "succeeded" | "partial" | "failed";
  policy: IngestionJobFailurePolicy;
  failedSourceIds: string[];
  okSourceIds: string[];
};

export function readIngestionJobFailurePolicy(
  env: Record<string, string | undefined> = process.env,
): IngestionJobFailurePolicy {
  const raw = String(env.INGEST_JOB_FAILURE_POLICY ?? "all-sources")
    .trim()
    .toLowerCase();

  if (raw === "any-error" || raw === "any") {
    return "any-error";
  }

  return "all-sources";
}

export function isFailedSourceRun(summary: IngestionSourceExitSummary) {
  return summary.errorCount > 0 && summary.storedCount === 0 && summary.dedupedCount === 0;
}

export function resolveIngestionJobExit(
  summaries: IngestionSourceExitSummary[],
  policy: IngestionJobFailurePolicy = "all-sources",
): IngestionJobExit {
  const failedSourceIds = summaries.filter((summary) => isFailedSourceRun(summary)).map((summary) => summary.sourceId);
  const okSourceIds = summaries.filter((summary) => !isFailedSourceRun(summary)).map((summary) => summary.sourceId);
  const anyError = summaries.some((summary) => summary.errorCount > 0);
  const status: IngestionJobExit["status"] =
    summaries.length === 0 || failedSourceIds.length === summaries.length
      ? "failed"
      : anyError
        ? "partial"
        : "succeeded";
  const exitCode: 0 | 1 =
    summaries.length === 0 ? 1 : policy === "any-error" ? (anyError ? 1 : 0) : status === "failed" ? 1 : 0;

  return {
    exitCode,
    status,
    policy,
    failedSourceIds,
    okSourceIds,
  };
}

export function formatIngestionJobExitLine(decision: IngestionJobExit) {
  return [
    `job_status=${decision.status}`,
    `policy=${decision.policy}`,
    `ok=${decision.okSourceIds.join(",") || "-"}`,
    `failed=${decision.failedSourceIds.join(",") || "-"}`,
    `exit=${decision.exitCode}`,
  ].join(" ");
}
