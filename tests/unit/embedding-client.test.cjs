const assert = require("node:assert/strict");

const {
  formatVectorLiteral,
  generateEmbedding,
  generateEmbeddings,
  isConfiguredValue,
  readEmbeddingConfig,
  shouldUseEmbeddings,
} = require("../../search-service/embedding-client.cjs");

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
    await runCase("reads explicit embedding config and fallback aliases", () => {
      assert.deepEqual(
        readEmbeddingConfig({
          OPENAI_API_KEY: "openai-key",
          OPENAI_BASE_URL: "https://proxy.example.test/v1",
          OPENAI_EMBEDDING_MODEL: "embed-test",
          EMBEDDING_DIMENSIONS: "4",
          EMBEDDING_TIMEOUT_MS: "2500",
        }),
        {
          apiKey: "openai-key",
          model: "embed-test",
          baseUrl: "https://proxy.example.test/v1",
          dimensions: 4,
          timeoutMs: 2500,
        },
      );

      assert.equal(shouldUseEmbeddings({ apiKey: "", model: "embed-test" }), false);
      assert.equal(shouldUseEmbeddings({ apiKey: "key", model: "embed-test" }), true);
      assert.equal(isConfiguredValue("your-embedding-api-key"), false);
      assert.equal(shouldUseEmbeddings({ apiKey: "your-embedding-api-key", model: "embed-test" }), false);
    }),
  );

  results.push(
    await runCase("formats Postgres vector literal with finite numbers", () => {
      assert.equal(formatVectorLiteral([1, 0.25, -2]), "[1.000000000,0.2500000000,-2.000000000]");
    }),
  );

  results.push(
    await runCase("generates embeddings through an OpenAI-compatible endpoint", async () => {
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
            data: [
              { embedding: [0.1, 0.2, 0.3] },
              { embedding: [0.4, 0.5, 0.6] },
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
        const embeddings = await generateEmbeddings(["第一段", "第二段"], {
          apiKey: "test-key",
          model: "embed-test",
          baseUrl: "https://embedding.example.test/v1",
          dimensions: 3,
          timeoutMs: 1000,
        });

        assert.deepEqual(embeddings, [
          [0.1, 0.2, 0.3],
          [0.4, 0.5, 0.6],
        ]);
        assert.equal(calls[0].url, "https://embedding.example.test/v1/embeddings");
        assert.equal(calls[0].body.model, "embed-test");
        assert.deepEqual(calls[0].body.input, ["第一段", "第二段"]);
        assert.equal(calls[0].body.dimensions, 3);
        assert.equal(calls[0].init.headers.Authorization, "Bearer test-key");
      } finally {
        globalThis.fetch = previousFetch;
      }
    }),
  );

  results.push(
    await runCase("rejects malformed embedding payloads", async () => {
      const previousFetch = globalThis.fetch;

      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({
            data: [{ embedding: [0.1, "oops"] }],
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );

      try {
        await assert.rejects(
          () =>
            generateEmbedding("query", {
              apiKey: "test-key",
              model: "embed-test",
              baseUrl: "https://embedding.example.test/v1/embeddings",
              dimensions: 2,
              timeoutMs: 1000,
            }),
          /non-finite value/,
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
