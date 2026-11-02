import { createRequire } from "node:module";

import { readIngestRuntimeConfig, requireDatabaseUrl } from "../ingest/config.ts";
import { toErrorMessage } from "../ingest/errors.ts";
import {
  formatIngestionJobExitLine,
  formatIngestionJobWarningLines,
  readIngestionJobFailurePolicy,
  resolveIngestionJobExit,
} from "../ingest/job-status.ts";
import { runIngestionPipeline } from "../ingest/pipeline.ts";
import { DEFAULT_COMMUNITY_SOURCE_IDS } from "../ingest/types.ts";

const require = createRequire(import.meta.url);
require("../load-env.cjs").loadLocalEnv();

function splitCsv(value: string | undefined) {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function main() {
  requireDatabaseUrl(readIngestRuntimeConfig());

  const sourceIds = process.argv.slice(2).filter((entry) => !entry.startsWith("--"));
  const envSourceIds = splitCsv(process.env.INGEST_COMMUNITY_SOURCE_IDS);
  const selectedSourceIds =
    sourceIds.length > 0 ? sourceIds : envSourceIds.length > 0 ? envSourceIds : [...DEFAULT_COMMUNITY_SOURCE_IDS];
  const summaries = await runIngestionPipeline(selectedSourceIds);

  for (const summary of summaries) {
    console.log(
      [
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

  const decision = resolveIngestionJobExit(summaries, readIngestionJobFailurePolicy());
  console.log(formatIngestionJobExitLine(decision));
  formatIngestionJobWarningLines(decision).forEach((line) => console.log(line));
  process.exitCode = decision.exitCode;
}

main().catch((error) => {
  console.error(toErrorMessage(error));
  process.exitCode = 1;
});
