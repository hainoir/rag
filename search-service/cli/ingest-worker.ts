import { createRequire } from "node:module";

import { dequeueIngestionJob } from "../ingest/queue.ts";
import { runIngestionPipeline } from "../ingest/pipeline.ts";

const require = createRequire(import.meta.url);
require("../load-env.cjs").loadLocalEnv();

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

async function processOneJob() {
  const job = await dequeueIngestionJob();

  if (!job) {
    console.log("ingestion queue empty");
    return false;
  }

  console.log(`processing ingestion job id=${job.id} kind=${job.kind} sources=${job.sourceIds.join(",")}`);
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
  }

  if (summaries.some((summary) => summary.errorCount > 0)) {
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

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
