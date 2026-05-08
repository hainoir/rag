import { createRequire } from "node:module";

import { enqueueIngestionJob, type IngestionQueueJobKind } from "../ingest/queue.ts";

const require = createRequire(import.meta.url);
require("../load-env.cjs").loadLocalEnv();

function resolveKind(value: string | undefined): IngestionQueueJobKind {
  if (value === "official" || value === "community" || value === "source") {
    return value;
  }

  throw new Error("Usage: npm run ingest:enqueue -- official|community|source [source-id...]");
}

async function main() {
  const [kindInput, ...sourceIds] = process.argv.slice(2).filter((entry) => !entry.startsWith("--"));
  const kind = resolveKind(kindInput);
  const job = await enqueueIngestionJob(kind, sourceIds);

  console.log(`queued ingestion job id=${job.id} kind=${job.kind} sources=${job.sourceIds.join(",")}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
