import { createRequire } from "node:module";

import { readIngestRuntimeConfig, requireDatabaseUrl, resolveCliSourceIds } from "../ingest/config.ts";
import { PostgresStore } from "../ingest/postgres-store.ts";

const require = createRequire(import.meta.url);
require("../load-env.cjs").loadLocalEnv();

async function main() {
  const config = readIngestRuntimeConfig();
  const store = new PostgresStore(requireDatabaseUrl(config));

  try {
    const sourceIds = resolveCliSourceIds(process.argv.slice(2));
    const rows = await store.inspectSources(sourceIds);

    if (rows.length === 0) {
      console.log("No ingestion sources found.");
      return;
    }

    for (const row of rows) {
      console.log(
        [
          `source=${row.sourceId}`,
          `runs=${row.runCount}`,
          `fetched=${row.fetchedCount}`,
          `stored=${row.storedCount}`,
          `deduped=${row.dedupedCount}`,
          `chunks=${row.chunkCount}`,
          `documents=${row.documentCount}`,
          `latestVersionChunks=${row.latestChunkCount}`,
          `lastStatus=${row.lastStatus ?? "n/a"}`,
          `lastRunAt=${row.lastStartedAt ?? "n/a"}`,
        ].join(" "),
      );
    }
  } finally {
    await store.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
