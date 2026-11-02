import assert from "node:assert/strict";
import http from "node:http";

import { readIngestRuntimeConfig } from "../ingest/config.ts";
import { formatErrorDetail, toErrorMessage } from "../ingest/errors.ts";
import { fetchHtml } from "../ingest/http.ts";
import {
  formatIngestionJobExitLine,
  formatIngestionJobWarningLines,
  isNetworkUnreachableMessage,
  readIngestUnreachableExit,
  readIngestionJobFailurePolicy,
  resolveIngestionJobExit,
} from "../ingest/job-status.ts";
import { computeRetryDelayMs, isRetryableIngestError, runWithRetry } from "../ingest/retry.ts";

type RunCase = (name: string, task: () => Promise<void> | void) => Promise<boolean>;

function networkFailure() {
  return Object.assign(new TypeError("fetch failed"), {
    cause: Object.assign(new Error("getaddrinfo ENOTFOUND www.tjcu.edu.cn"), {
      code: "ENOTFOUND",
      errno: -3008,
    }),
  });
}

export async function runIngestResilienceCases(runCase: RunCase) {
  const results: boolean[] = [];

  results.push(
    await runCase("fetch failures keep cause, code, errno, and name", () => {
      const detail = formatErrorDetail(networkFailure());

      assert.match(detail, /fetch failed/);
      assert.match(detail, /name=TypeError/);
      assert.match(detail, /getaddrinfo ENOTFOUND www\.tjcu\.edu\.cn/);
      assert.match(detail, /code=ENOTFOUND/);
      assert.match(detail, /errno=-3008/);

      const aggregate = Object.assign(new TypeError("fetch failed"), {
        cause: Object.assign(
          new AggregateError([
            Object.assign(new Error("connect ECONNREFUSED 203.0.113.10:443"), {
              code: "ECONNREFUSED",
              errno: -111,
            }),
          ]),
          { code: "ECONNREFUSED" },
        ),
      });
      const aggregateDetail = formatErrorDetail(aggregate);

      assert.match(aggregateDetail, /code=ECONNREFUSED/);
      assert.match(aggregateDetail, /errno=-111/);
      assert.match(aggregateDetail, /connect ECONNREFUSED 203\.0\.113\.10:443/);
    }),
  );

  results.push(
    await runCase("fetchHtml surfaces the underlying network cause", async () => {
      const previousFetch = globalThis.fetch;
      const config = readIngestRuntimeConfig({
        INGEST_HTTP_TIMEOUT_MS: "1000",
      });

      globalThis.fetch = (async () => {
        throw networkFailure();
      }) as typeof fetch;

      try {
        await assert.rejects(fetchHtml("https://www.tjcu.edu.cn/", config), (error: unknown) => {
          const message = toErrorMessage(error);

          assert.match(message, /fetch failed/);
          assert.match(message, /name=TypeError/);
          assert.match(message, /code=ENOTFOUND/);
          assert.match(message, /errno=-3008/);
          assert.match(message, /www\.tjcu\.edu\.cn/);
          assert.equal(`List page failed for https://www.tjcu.edu.cn/: ${message}`.includes("code=ENOTFOUND"), true);
          return true;
        });
      } finally {
        globalThis.fetch = previousFetch;
      }
    }),
  );

  results.push(
    await runCase("fetchHtml names caller timeouts separately from transport errors", async () => {
      const previousFetch = globalThis.fetch;
      const config = readIngestRuntimeConfig({
        INGEST_HTTP_TIMEOUT_MS: "20",
      });

      globalThis.fetch = ((_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          const abort = () => {
            reject(Object.assign(new Error("The operation was aborted"), { name: "AbortError" }));
          };

          if (init?.signal?.aborted) {
            abort();
            return;
          }

          init?.signal?.addEventListener("abort", abort, { once: true });
        })) as typeof fetch;

      try {
        await assert.rejects(fetchHtml("https://lib.tjcu.edu.cn/", config), (error: unknown) => {
          const message = toErrorMessage(error);

          assert.match(message, /Fetch timed out after 20ms/);
          assert.match(message, /name=AbortError/);
          return true;
        });
      } finally {
        globalThis.fetch = previousFetch;
      }
    }),
  );

  results.push(
    await runCase("fetchHtml labels a stalled response body as a timeout", async () => {
      const server = http.createServer((_request, response) => {
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.write("<html><body>");
      });

      await new Promise<void>((resolve) => {
        server.listen(0, "127.0.0.1", () => resolve());
      });

      const address = server.address();

      if (!address || typeof address === "string") {
        throw new Error("stall server did not bind a port");
      }

      const config = readIngestRuntimeConfig({
        INGEST_HTTP_TIMEOUT_MS: "100",
      });

      try {
        await assert.rejects(fetchHtml(`http://127.0.0.1:${address.port}/notice.htm`, config), (error: unknown) => {
          const message = toErrorMessage(error);

          assert.match(message, /Fetch timed out after 100ms/);
          assert.match(message, /name=AbortError/);
          assert.equal(isRetryableIngestError(error), true);
          return true;
        });
      } finally {
        await new Promise<void>((resolve) => {
          server.close(() => resolve());
        });
      }
    }),
  );

  results.push(
    await runCase("retry defaults back off exponentially and skip deterministic failures", async () => {
      const config = readIngestRuntimeConfig({});

      assert.equal(config.retryAttempts, 5);
      assert.equal(config.retryDelayMs, 1000);
      assert.equal(config.retryMaxDelayMs, 8000);
      assert.deepEqual(
        [2, 3, 4, 5].map((attempt) => computeRetryDelayMs(attempt, config.retryDelayMs, config.retryMaxDelayMs)),
        [1000, 2000, 4000, 8000],
      );
      assert.equal(computeRetryDelayMs(8, 1000, 8000), 8000);
      assert.equal(
        isRetryableIngestError(new Error("Unexpected response status 503 for https://www.tjcu.edu.cn/")),
        true,
      );
      assert.equal(
        isRetryableIngestError(new Error("Unexpected response status 404 for https://www.tjcu.edu.cn/")),
        false,
      );
      assert.equal(isRetryableIngestError(new Error("MODERATION_BLOCKED:https://example.test:flagged")), false);
      assert.equal(
        isRetryableIngestError(new Error("No article content extracted for https://www.tjcu.edu.cn/a.htm")),
        false,
      );

      const delays: number[] = [];
      let calls = 0;
      const value = await runWithRetry(
        async () => {
          calls += 1;

          if (calls < 3) {
            throw networkFailure();
          }

          return "ok";
        },
        { retryAttempts: 5, retryDelayMs: 1000, retryMaxDelayMs: 8000 },
        undefined,
        async (ms) => {
          delays.push(ms);
        },
      );

      assert.equal(value, "ok");
      assert.equal(calls, 3);
      assert.deepEqual(delays, [1000, 2000]);

      let blockedCalls = 0;

      await assert.rejects(
        runWithRetry(
          async () => {
            blockedCalls += 1;
            throw new Error("No chunks generated from cleaned markdown.");
          },
          { retryAttempts: 5, retryDelayMs: 1000, retryMaxDelayMs: 8000 },
          undefined,
          async () => {
            throw new Error("deterministic ingest errors must not sleep");
          },
        ),
        /No chunks generated/,
      );
      assert.equal(blockedCalls, 1);
    }),
  );

  results.push(
    await runCase("partial source success exits 0 unless every source fails", () => {
      const failedFetch = {
        sourceId: "tjcu-library",
        errorCount: 3,
        storedCount: 0,
        dedupedCount: 0,
      };
      const stored = {
        sourceId: "tjcu-main-notices",
        errorCount: 0,
        storedCount: 4,
        dedupedCount: 1,
      };
      const partialStore = {
        sourceId: "tjcu-academic-affairs",
        errorCount: 1,
        storedCount: 2,
        dedupedCount: 0,
      };
      const allFailed = resolveIngestionJobExit(
        [
          failedFetch,
          { ...failedFetch, sourceId: "tjcu-main-notices" },
          { ...failedFetch, sourceId: "tjcu-academic-affairs" },
          { ...failedFetch, sourceId: "tjcu-undergrad-admissions" },
        ],
        "all-sources",
      );
      const mixed = resolveIngestionJobExit([failedFetch, stored, partialStore], "all-sources");
      const strict = resolveIngestionJobExit([failedFetch, stored], "any-error");
      const clean = resolveIngestionJobExit([stored], "all-sources");
      const empty = resolveIngestionJobExit([], "all-sources");

      assert.equal(allFailed.status, "failed");
      assert.equal(allFailed.exitCode, 1);
      assert.deepEqual(allFailed.failedSourceIds, [
        "tjcu-library",
        "tjcu-main-notices",
        "tjcu-academic-affairs",
        "tjcu-undergrad-admissions",
      ]);
      assert.equal(mixed.status, "partial");
      assert.equal(mixed.exitCode, 0);
      assert.deepEqual(mixed.failedSourceIds, ["tjcu-library"]);
      assert.deepEqual(mixed.okSourceIds, ["tjcu-main-notices", "tjcu-academic-affairs"]);
      assert.match(formatIngestionJobExitLine(mixed), /job_status=partial/);
      assert.match(formatIngestionJobExitLine(mixed), /exit=0/);
      assert.equal(strict.exitCode, 1);
      assert.equal(strict.status, "partial");
      assert.equal(clean.exitCode, 0);
      assert.equal(clean.status, "succeeded");
      assert.equal(empty.exitCode, 1);
      assert.equal(empty.status, "failed");
      assert.equal(readIngestionJobFailurePolicy({}), "all-sources");
      assert.equal(readIngestionJobFailurePolicy({ INGEST_JOB_FAILURE_POLICY: "any" }), "any-error");
      assert.equal(readIngestionJobFailurePolicy({ INGEST_JOB_FAILURE_POLICY: "any-error" }), "any-error");
    }),
  );

  results.push(
    await runCase("all network-only source failures soft-fail with an Actions warning", () => {
      const sources = ["tjcu-main-notices", "tjcu-library", "tjcu-academic-affairs", "tjcu-undergrad-admissions"].map(
        (sourceId) => ({
          sourceId,
          errorCount: 1,
          storedCount: 0,
          dedupedCount: 0,
          errors: ["fetch failed: ETIMEDOUT"],
        }),
      );
      const soft = resolveIngestionJobExit(sources, "all-sources", "soft");
      const strict = resolveIngestionJobExit(sources, "any-error", "soft");
      const fail = resolveIngestionJobExit(
        sources,
        "all-sources",
        readIngestUnreachableExit({ INGEST_UNREACHABLE_EXIT: "fail" }),
      );

      assert.equal(soft.status, "unreachable");
      assert.equal(soft.exitCode, 0);
      assert.deepEqual(formatIngestionJobWarningLines(soft), ["::warning::all sources unreachable from runner"]);
      assert.equal(strict.status, "unreachable");
      assert.equal(strict.exitCode, 1);
      assert.equal(fail.status, "unreachable");
      assert.equal(fail.exitCode, 1);
      assert.equal(readIngestUnreachableExit({}), "soft");
    }),
  );

  results.push(
    await runCase("pipeline network errors with no discovered URLs resolve as unreachable", () => {
      const sourceId = "tjcu-main-notices";
      const networkError =
        "List page failed for https://www.tjcu.edu.cn/xxgk/tzgg.htm: fetch failed (name=TypeError); cause: connect ETIMEDOUT 203.0.113.1:443 (code=ETIMEDOUT)";
      const timeoutError =
        "List page failed for https://www.tjcu.edu.cn/xxgk/tzgg.htm: Fetch timed out after 20ms: The operation was aborted (name=AbortError)";
      const noDetailsError = "No detail URLs discovered for tjcu-main-notices.";
      assert.equal(isNetworkUnreachableMessage("name=AbortError"), true);
      assert.equal(isNetworkUnreachableMessage("Fetch timed out after 20ms"), true);
      const summary = (errors: string[]) => ({
        sourceId,
        errorCount: errors.length,
        storedCount: 0,
        dedupedCount: 0,
        errors,
      });

      for (const networkMessage of [networkError, timeoutError]) {
        const decision = resolveIngestionJobExit([summary([networkMessage, noDetailsError])], "all-sources", "soft");
        assert.equal(decision.status, "unreachable");
        assert.equal(decision.exitCode, 0);
      }

      const mixed = resolveIngestionJobExit(
        [summary([networkError, "Detail page parse failed for https://www.tjcu.edu.cn/notice.htm", noDetailsError])],
        "all-sources",
        "soft",
      );
      assert.equal(mixed.status, "failed");
      assert.equal(mixed.exitCode, 1);
      assert.equal(resolveIngestionJobExit([summary([noDetailsError])], "all-sources", "soft").status, "failed");
    }),
  );

  results.push(
    await runCase("mixed network and parse failures remain hard failures", () => {
      const source = { errorCount: 1, storedCount: 0, dedupedCount: 0 };
      const decision = resolveIngestionJobExit(
        [
          { ...source, sourceId: "network", errors: ["ENETUNREACH"] },
          { ...source, sourceId: "parse", errors: ["invalid HTML markup"] },
        ],
        "all-sources",
        "soft",
      );
      assert.equal(decision.status, "failed");
      assert.equal(decision.exitCode, 1);
      assert.deepEqual(formatIngestionJobWarningLines(decision), []);
      assert.equal(isNetworkUnreachableMessage("ETIMEDOUT"), true);
      assert.equal(isNetworkUnreachableMessage("enetunreach"), true);
      assert.equal(isNetworkUnreachableMessage("Fetch Failed"), true);
      assert.equal(isNetworkUnreachableMessage("invalid HTML markup"), false);
      assert.equal(
        resolveIngestionJobExit(
          [{ ...source, sourceId: "mixed-errors", errors: ["ETIMEDOUT", "invalid HTML markup"] }],
          "all-sources",
          "soft",
        ).status,
        "failed",
      );
      assert.equal(
        resolveIngestionJobExit(
          [{ ...source, sourceId: "empty-errors", errors: [], networkOnly: true }],
          "all-sources",
          "soft",
        ).status,
        "failed",
      );
    }),
  );

  return results;
}
