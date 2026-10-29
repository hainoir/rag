import { createRequire } from "node:module";

import { readIngestRuntimeConfig, requireDatabaseUrl, resolveCliSourceIds } from "../ingest/config.ts";
import { toErrorMessage } from "../ingest/errors.ts";
import {
  formatIngestionJobExitLine,
  readIngestionJobFailurePolicy,
  resolveIngestionJobExit,
} from "../ingest/job-status.ts";
import { runIngestionPipeline } from "../ingest/pipeline.ts";

const require = createRequire(import.meta.url);
require("../load-env.cjs").loadLocalEnv();

async function main() {
  const config = readIngestRuntimeConfig();
  requireDatabaseUrl(config);

  const sourceIds = resolveCliSourceIds(process.argv.slice(2));
  const summaries = await runIngestionPipeline(sourceIds);

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
  process.exitCode = decision.exitCode;
}

main().catch((error) => {
  console.error(toErrorMessage(error));
  process.exitCode = 1;
});
