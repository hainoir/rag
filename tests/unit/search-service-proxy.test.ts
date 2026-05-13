import assert from "node:assert/strict";

import { resolveSearchServiceSiblingEndpoint } from "../../src/lib/search/search-service-config.ts";
import { postSearchServiceJson } from "../../src/lib/server/search-service-proxy.ts";

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

async function withEnv<T>(overrides: Record<string, string | undefined>, task: () => Promise<T> | T) {
  const previous = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);

    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return await task();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("derives sibling telemetry endpoints from SEARCH_SERVICE_URL", () => {
  const endpoint = resolveSearchServiceSiblingEndpoint("/api/query-logs", {
    SEARCH_SERVICE_URL: "http://127.0.0.1:8080/api/search",
  } as NodeJS.ProcessEnv);

  assert.equal(endpoint, "http://127.0.0.1:8080/api/query-logs");
});

test("posts JSON with shared auth headers to sibling endpoints", async () => {
  const previousFetch = globalThis.fetch;
  let requestUrl = "";
  let requestInit: RequestInit | undefined;

  globalThis.fetch = (async (input, init) => {
    requestUrl = String(input);
    requestInit = init;
    return new Response(null, { status: 204 });
  }) as typeof fetch;

  try {
    await withEnv(
      {
        SEARCH_SERVICE_URL: "http://127.0.0.1:8080/api/search",
        SEARCH_SERVICE_API_KEY: "test-key",
        SEARCH_SERVICE_AUTH_HEADER: "Authorization",
      },
      async () => {
        await postSearchServiceJson("/api/feedback", { requestId: "req-1" }, 1_000);
      },
    );
  } finally {
    globalThis.fetch = previousFetch;
  }

  assert.equal(requestUrl, "http://127.0.0.1:8080/api/feedback");
  assert.equal(requestInit?.method, "POST");
  assert.equal(new Headers(requestInit?.headers).get("Authorization"), "Bearer test-key");
  assert.equal(requestInit?.body, JSON.stringify({ requestId: "req-1" }));
});

test("throws a clear error when SEARCH_SERVICE_URL is missing", async () => {
  await withEnv(
    {
      SEARCH_SERVICE_URL: undefined,
    },
    async () => {
      await assert.rejects(
        () => postSearchServiceJson("/api/query-logs", { requestId: "req-2" }, 500),
        /SEARCH_SERVICE_URL is not configured\./,
      );
    },
  );
});
