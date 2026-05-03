import { createRequire } from "node:module";

import { readIngestRuntimeConfig, requireDatabaseUrl, resolveCliSourceIds } from "../ingest/config";
import { runIngestionPipeline } from "../ingest/pipeline";

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
        `skipped=${summary.skippedCount}`,
        `chunks=${summary.chunkCount}`,
        `errors=${summary.errorCount}`,
      ].join(" "),
    );

    if (summary.errors.length > 0) {
      summary.errors.forEach((error) => console.log(`  - ${error}`));
    }
  }

  if (summaries.some((summary) => summary.errorCount > 0)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
