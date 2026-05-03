import { createRequire } from "node:module";

import { readIngestRuntimeConfig, requireDatabaseUrl } from "../ingest/config.ts";
import { PostgresStore } from "../ingest/postgres-store.ts";

const require = createRequire(import.meta.url);
require("../load-env.cjs").loadLocalEnv();

async function main() {
  const config = readIngestRuntimeConfig();
  const store = new PostgresStore(requireDatabaseUrl(config));

  try {
    await store.initSchema();
    console.log("Search storage schema initialized successfully.");
  } finally {
    await store.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
