const assert = require("node:assert/strict");

const {
  isConfiguredValue,
  readRerankConfig,
  rerankDocuments,
  shouldUseRerank,
} = require("../../search-service/rerank-client.cjs");

async function runCase(name, task) {
  try {
    await task();
    console.log(`PASS ${name}`);
    return true;
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    return false;
  }
}

async function main() {
  const results = [];

  results.push(
    await runCase("reads rerank config and keeps default off", () => {
      const config = readRerankConfig({
        RERANK_API_KEY: "key",
        RERANK_MODEL: "cross-encoder",
        RERANK_BASE_URL: "https://rerank.example.test/v1",
        RERANK_TOP_K: "12",
        RERANK_TIMEOUT_MS: "3000",
      });

      assert.deepEqual(config, {
        apiKey: "key",
        model: "cross-encoder",
        baseUrl: "https://rerank.example.test/v1",
        topK: 12,
        timeoutMs: 3000,
      });
      assert.equal(shouldUseRerank(config), true);
      assert.equal(shouldUseRerank({ ...config, apiKey: "" }), false);
      assert.equal(isConfiguredValue("your-rerank-model"), false);
      assert.equal(
        shouldUseRerank({
          apiKey: "your-rerank-api-key",
          model: "your-rerank-model",
          baseUrl: "https://your-rerank-provider.example.com/v1",
          topK: 12,
          timeoutMs: 3000,
        }),
        false,
      );
    }),
  );

  results.push(
    await runCase("uses conservative rerank defaults when env is missing", () => {
      const config = readRerankConfig({});

      assert.equal(config.topK, 8);
      assert.equal(config.timeoutMs, 25000);
      assert.equal(shouldUseRerank(config), false);
    }),
  );

  results.push(
    await runCase("reranks documents through a cross-encoder endpoint", async () => {
      const previousFetch = globalThis.fetch;
      const calls = [];

      globalThis.fetch = async (url, init) => {
        calls.push({
          url,
          init,
          body: JSON.parse(init.body),
        });

        return new Response(
          JSON.stringify({
            results: [
              { index: 1, relevance_score: 0.92 },
              { index: 0, relevance_score: 0.41 },
            ],
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      };

      try {
        const results = await rerankDocuments("图书馆借书", ["doc-a", "doc-b"], {
          apiKey: "key",
          model: "cross-encoder",
          baseUrl: "https://rerank.example.test/v1",
          topK: 20,
          timeoutMs: 1000,
        });

        assert.deepEqual(results, [
          { index: 1, relevanceScore: 0.92 },
          { index: 0, relevanceScore: 0.41 },
        ]);
        assert.equal(calls[0].url, "https://rerank.example.test/v1/rerank");
        assert.deepEqual(calls[0].body.documents, ["doc-a", "doc-b"]);
        assert.equal(calls[0].body.top_n, 2);
      } finally {
        globalThis.fetch = previousFetch;
      }
    }),
  );

  results.push(
    await runCase("marks disabled rerank models with a specific error code", async () => {
      const previousFetch = globalThis.fetch;

      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({
            code: 30003,
            message: "Model disabled.",
            data: null,
          }),
          {
            status: 403,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );

      try {
        await assert.rejects(
          () =>
            rerankDocuments("图书馆借书", ["doc-a"], {
              apiKey: "key",
              model: "cross-encoder",
              baseUrl: "https://rerank.example.test/v1",
              topK: 20,
              timeoutMs: 1000,
            }),
          (error) => error instanceof Error && error.code === "model_disabled",
        );
      } finally {
        globalThis.fetch = previousFetch;
      }
    }),
  );

  if (results.some((passed) => !passed)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
