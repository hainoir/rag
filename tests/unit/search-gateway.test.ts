import assert from "node:assert/strict";

import {
  buildSearchCacheKey,
  checkSearchRateLimit,
  readCachedSearchResponse,
  writeCachedSearchResponse,
  type KeyValueStore,
} from "../../src/lib/search/search-gateway.ts";
import type { SearchResponse } from "../../src/lib/search/types.ts";

function test(name: string, task: () => void | Promise<void>) {
  Promise.resolve()
    .then(task)
    .then(() => {
      console.log(`PASS ${name}`);
    })
    .catch((error) => {
      console.error(`FAIL ${name}`);
      console.error(error instanceof Error ? error.stack ?? error.message : String(error));
      process.exitCode = 1;
    });
}

function createMemoryStore(): KeyValueStore & {
  values: Map<string, string>;
  counts: Map<string, number>;
} {
  const values = new Map<string, string>();
  const counts = new Map<string, number>();

  return {
    values,
    counts,
    async get(key) {
      return values.get(key) ?? null;
    },
    async set(key, value) {
      values.set(key, value);
    },
    async increment(key) {
      const nextValue = (counts.get(key) ?? 0) + 1;
      counts.set(key, nextValue);

      return nextValue;
    },
  };
}

const sampleResponse: SearchResponse = {
  query: "图书馆借书",
  status: "ok",
  answer: null,
  sources: [],
  relatedQuestions: [],
  retrievedCount: 0,
  resultGeneratedAt: "2026-05-07T00:00:00.000Z",
};

test("normalizes cache keys for stable equivalent queries", () => {
  assert.equal(
    buildSearchCacheKey("  图书馆   借书  ", "test"),
    buildSearchCacheKey("图书馆 借书", "test"),
  );
  assert.notEqual(buildSearchCacheKey("图书馆 借书", "test"), buildSearchCacheKey("宿舍 报修", "test"));
});

test("bypasses cache and rate limit when store is absent", async () => {
  const cached = await readCachedSearchResponse(null, "图书馆借书");
  const rateLimit = await checkSearchRateLimit(null, "127.0.0.1", {
    cacheTtlSeconds: 60,
    keyPrefix: "test",
    rateLimitMax: 1,
    rateLimitWindowSeconds: 60,
  });

  await writeCachedSearchResponse(null, "图书馆借书", sampleResponse);

  assert.deepEqual(cached, {
    enabled: false,
    response: null,
  });
  assert.deepEqual(rateLimit, {
    enabled: false,
    allowed: true,
    count: 0,
    limit: 1,
  });
});

test("reads valid cached responses and ignores invalid cached payloads", async () => {
  const store = createMemoryStore();
  const config = {
    cacheTtlSeconds: 60,
    keyPrefix: "test",
    rateLimitMax: 10,
    rateLimitWindowSeconds: 60,
  };

  await writeCachedSearchResponse(store, "图书馆借书", sampleResponse, config);
  assert.deepEqual(await readCachedSearchResponse(store, "图书馆借书", config), {
    enabled: true,
    response: sampleResponse,
  });

  store.values.set(buildSearchCacheKey("bad", "test"), JSON.stringify({ query: "bad" }));
  assert.deepEqual(await readCachedSearchResponse(store, "bad", config), {
    enabled: true,
    response: null,
  });
});

test("blocks requests after the configured rate limit is exceeded", async () => {
  const store = createMemoryStore();
  const config = {
    cacheTtlSeconds: 60,
    keyPrefix: "test",
    rateLimitMax: 2,
    rateLimitWindowSeconds: 60,
  };

  assert.deepEqual(await checkSearchRateLimit(store, "127.0.0.1", config), {
    enabled: true,
    allowed: true,
    count: 1,
    limit: 2,
  });
  assert.deepEqual(await checkSearchRateLimit(store, "127.0.0.1", config), {
    enabled: true,
    allowed: true,
    count: 2,
    limit: 2,
  });
  assert.deepEqual(await checkSearchRateLimit(store, "127.0.0.1", config), {
    enabled: true,
    allowed: false,
    count: 3,
    limit: 2,
  });
});
