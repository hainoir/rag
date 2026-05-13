import { createRequire } from "node:module";

import { dequeueIngestionJob } from "../ingest/queue.ts";
import { runIngestionPipeline } from "../ingest/pipeline.ts";

const require = createRequire(import.meta.url);
require("../load-env.cjs").loadLocalEnv();
const { closeTelemetryPool, recordServiceEvent } = require("../telemetry-store.cjs");

function hasFlag(flag: string) {
  return process.argv.includes(flag);
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function summarizeJobPayload(job: { id: string; kind: string; sourceIds: string[] }, summaries: Awaited<ReturnType<typeof runIngestionPipeline>>) {
  return {
    jobId: job.id,
    kind: job.kind,
    sourceIds: job.sourceIds,
    summaries: summaries.map((summary) => ({
      sourceId: summary.sourceId,
      fetchedCount: summary.fetchedCount,
      storedCount: summary.storedCount,
      dedupedCount: summary.dedupedCount,
      skippedCount: summary.skippedCount,
      staleCount: summary.staleCount,
      chunkCount: summary.chunkCount,
      errorCount: summary.errorCount,
      errors: summary.errors,
    })),
  };
}

async function recordIngestionEventFailOpen(payload: {
  level: "info" | "error";
  event: string;
  message?: string;
  details?: Record<string, unknown>;
}) {
  try {
    await recordServiceEvent({
      service: "ingestion-worker",
      level: payload.level,
      event: payload.event,
      message: payload.message,
      payload: payload.details ?? {},
    });
  } catch {
    // Telemetry must never block ingestion work.
  }
}

async function processOneJob() {
  const job = await dequeueIngestionJob();

  if (!job) {
    console.log("ingestion queue empty");
    return false;
  }

  console.log(`processing ingestion job id=${job.id} kind=${job.kind} sources=${job.sourceIds.join(",")}`);
  await recordIngestionEventFailOpen({
    level: "info",
    event: "scheduled_ingestion.started",
    details: {
      jobId: job.id,
      kind: job.kind,
      sourceIds: job.sourceIds,
    },
  });

  const summaries = await runIngestionPipeline(job.sourceIds);

  for (const summary of summaries) {
    console.log(
      [
        `job=${job.id}`,
        `source=${summary.sourceId}`,
        `fetched=${summary.fetchedCount}`,
        `stored=${summary.storedCount}`,
        `deduped=${summary.dedupedCount}`,
        `stale=${summary.staleCount}`,
        `skipped=${summary.skippedCount}`,
        `chunks=${summary.chunkCount}`,
        `errors=${summary.errorCount}`,
      ].join(" "),
    );

    if (summary.errors.length > 0) {
      summary.errors.forEach((error) => console.log(`  - ${error}`));
    }
  }

  const hasFatalFailure = summaries.some(
    (summary) => summary.errorCount > 0 && summary.storedCount === 0 && summary.dedupedCount === 0,
  );
  const hasAnyFailure = summaries.some((summary) => summary.errorCount > 0);

  await recordIngestionEventFailOpen({
    level: hasAnyFailure ? "error" : "info",
    event: hasAnyFailure ? "scheduled_ingestion.failed" : "scheduled_ingestion.completed",
    details: summarizeJobPayload(job, summaries),
  });

  if (hasFatalFailure) {
    process.exitCode = 1;
  }

  return true;
}

async function main() {
  const once = hasFlag("--once");
  const idleSleepMs = parsePositiveInteger(process.env.INGEST_WORKER_IDLE_SLEEP_MS, 10_000);

  if (once) {
    await processOneJob();
    return;
  }

  for (;;) {
    const processed = await processOneJob();

    if (!processed) {
      await new Promise((resolve) => {
        setTimeout(resolve, idleSleepMs);
      });
    }
  }
}

main()
  .catch(async (error) => {
    const message = error instanceof Error ? error.message : String(error);
    await recordIngestionEventFailOpen({
      level: "error",
      event: "ingestion_worker.failed",
      message,
    });
    console.error(message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeTelemetryPool();
  });
