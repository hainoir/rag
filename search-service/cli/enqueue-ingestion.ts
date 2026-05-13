import { createRequire } from "node:module";

import { enqueueIngestionJob, type IngestionQueueJobKind } from "../ingest/queue.ts";

const require = createRequire(import.meta.url);
require("../load-env.cjs").loadLocalEnv();
const { closeTelemetryPool, recordServiceEvent } = require("../telemetry-store.cjs");

function resolveKind(value: string | undefined): IngestionQueueJobKind {
  if (value === "official" || value === "community" || value === "source") {
    return value;
  }

  throw new Error("Usage: npm run ingest:enqueue -- official|community|source [source-id...]");
}

async function recordQueueEventFailOpen(payload: {
  level: "info" | "error";
  event: string;
  message?: string;
  details?: Record<string, unknown>;
}) {
  try {
    await recordServiceEvent({
      service: "ingestion-enqueue",
      level: payload.level,
      event: payload.event,
      message: payload.message,
      payload: payload.details ?? {},
    });
  } catch {
    // Queueing must stay fail-open for telemetry.
  }
}

async function main() {
  const [kindInput, ...sourceIds] = process.argv.slice(2).filter((entry) => !entry.startsWith("--"));
  const kind = resolveKind(kindInput);
  const job = await enqueueIngestionJob(kind, sourceIds);

  console.log(`queued ingestion job id=${job.id} kind=${job.kind} sources=${job.sourceIds.join(",")}`);
  await recordQueueEventFailOpen({
    level: "info",
    event: "scheduled_ingestion.queued",
    details: {
      jobId: job.id,
      kind: job.kind,
      sourceIds: job.sourceIds,
    },
  });
}

main()
  .catch(async (error) => {
    const message = error instanceof Error ? error.message : String(error);
    await recordQueueEventFailOpen({
      level: "error",
      event: "ingestion_enqueue.failed",
      message,
    });
    console.error(message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeTelemetryPool();
  });
