import { createRequire } from "node:module";

import type { SearchResponse } from "../../src/lib/search/types.ts";
import { readIngestRuntimeConfig, requireDatabaseUrl, resolveCliSourceIds } from "../ingest/config.ts";
import { PostgresStore } from "../ingest/postgres-store.ts";

const require = createRequire(import.meta.url);
require("../load-env.cjs").loadLocalEnv();

const {
  closePostgresPool,
  searchPostgres,
}: {
  closePostgresPool: () => Promise<void>;
  searchPostgres: (query: string, limit: number) => Promise<SearchResponse>;
} = require("../server.cjs");

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function assertCondition(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const config = readIngestRuntimeConfig();
  const sourceIds = resolveCliSourceIds(process.argv.slice(2));
  const minimumHealthySources = Math.min(
    parsePositiveInteger(process.env.SEARCH_SMOKE_MIN_SOURCES, 3),
    sourceIds.length,
  );
  const hitQuery = process.env.SEARCH_SMOKE_HIT_QUERY ?? "图书馆";
  const emptyQuery = process.env.SEARCH_SMOKE_EMPTY_QUERY ?? "明天校园集市几点开始";
  const store = new PostgresStore(requireDatabaseUrl(config));

  try {
    const rows = await store.inspectSources(sourceIds);
    const healthyRows = rows.filter((row) => {
      return row.documentCount > 0 && row.latestChunkCount > 0 && row.lastStatus !== "failed";
    });

    assertCondition(
      healthyRows.length >= minimumHealthySources,
      `Expected at least ${minimumHealthySources} healthy sources, found ${healthyRows.length}. Run npm run ingest:official first.`,
    );

    const hitResponse = await searchPostgres(hitQuery, 3);

    assertCondition(
      hitResponse.status === "ok" || hitResponse.status === "partial",
      `Expected query "${hitQuery}" to return ok/partial, got ${hitResponse.status}.`,
    );
    assertCondition(hitResponse.sources.length > 0, `Expected query "${hitQuery}" to return at least one source.`);

    const emptyResponse = await searchPostgres(emptyQuery, 3);

    assertCondition(
      emptyResponse.status === "empty" && emptyResponse.sources.length === 0,
      `Expected query "${emptyQuery}" to return empty, got ${emptyResponse.status} with ${emptyResponse.sources.length} sources.`,
    );

    console.log(
      [
        "Postgres smoke passed:",
        `healthySources=${healthyRows.length}/${rows.length}`,
        `hitQuery="${hitQuery}"`,
        `hitSources=${hitResponse.sources.length}`,
        `emptyQuery="${emptyQuery}"`,
      ].join(" "),
    );
  } finally {
    await store.close();
    await closePostgresPool();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
