export type IngestionSourceExitSummary = {
  sourceId: string;
  errorCount: number;
  storedCount: number;
  dedupedCount: number;
  errors?: string[];
  networkOnly?: boolean;
};

export type IngestionJobFailurePolicy = "all-sources" | "any-error";

export type IngestionJobExit = {
  exitCode: 0 | 1;
  status: "succeeded" | "partial" | "failed" | "unreachable";
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

export function isNetworkUnreachableMessage(message: string): boolean {
  return /ETIMEDOUT|ENETUNREACH|EHOSTUNREACH|ECONNREFUSED|ECONNRESET|EAI_AGAIN|ENOTFOUND|fetch failed/i.test(message);
}

export function readIngestUnreachableExit(env: Record<string, string | undefined> = process.env): "fail" | "soft" {
  return String(env.INGEST_UNREACHABLE_EXIT ?? "")
    .trim()
    .toLowerCase() === "fail"
    ? "fail"
    : "soft";
}

function isNetworkOnlySourceRun(summary: IngestionSourceExitSummary): boolean {
  if (!isFailedSourceRun(summary)) return false;
  if (summary.errors !== undefined) {
    return summary.errors.length > 0 && summary.errors.every(isNetworkUnreachableMessage);
  }
  return summary.networkOnly === true;
}

export function resolveIngestionJobExit(
  summaries: IngestionSourceExitSummary[],
  policy: IngestionJobFailurePolicy = "all-sources",
  unreachableExit: "fail" | "soft" = readIngestUnreachableExit(),
): IngestionJobExit {
  const failedSourceIds = summaries.filter((summary) => isFailedSourceRun(summary)).map((summary) => summary.sourceId);
  const okSourceIds = summaries.filter((summary) => !isFailedSourceRun(summary)).map((summary) => summary.sourceId);
  const anyError = summaries.some((summary) => summary.errorCount > 0);
  const allFailed = summaries.length > 0 && failedSourceIds.length === summaries.length;
  const status: IngestionJobExit["status"] =
    allFailed && summaries.every(isNetworkOnlySourceRun)
      ? "unreachable"
      : summaries.length === 0 || allFailed
        ? "failed"
        : anyError
          ? "partial"
          : "succeeded";
  const exitCode: 0 | 1 =
    summaries.length === 0
      ? 1
      : policy === "any-error"
        ? anyError
          ? 1
          : 0
        : status === "failed" || (status === "unreachable" && unreachableExit === "fail")
          ? 1
          : 0;

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

export function formatIngestionJobWarningLines(decision: IngestionJobExit): string[] {
  return decision.status === "unreachable" ? ["::warning::all sources unreachable from runner"] : [];
}
