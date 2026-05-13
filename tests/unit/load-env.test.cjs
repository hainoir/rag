const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { loadLocalEnv } = require("../../search-service/load-env.cjs");

function test(name, task) {
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

function withEnv(keys, task) {
  const snapshot = new Map(keys.map((key) => [key, process.env[key]]));

  try {
    for (const key of keys) {
      delete process.env[key];
    }

    return task();
  } finally {
    for (const [key, value] of snapshot.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function createTempEnvDir() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "rag-load-env-"));
  fs.writeFileSync(path.join(tempDir, ".env.local"), "RAG_TEST_LOCAL=local\n", "utf8");
  fs.writeFileSync(path.join(tempDir, ".env"), "RAG_TEST_FALLBACK=fallback\n", "utf8");
  return tempDir;
}

test("skips env file loading when SEARCH_SERVICE_DISABLE_ENV_FILE is enabled", () => {
  const tempDir = createTempEnvDir();

  withEnv(["RAG_TEST_LOCAL", "RAG_TEST_FALLBACK"], () => {
    loadLocalEnv(tempDir, {
      SEARCH_SERVICE_DISABLE_ENV_FILE: "1",
    });

    assert.equal(process.env.RAG_TEST_LOCAL, undefined);
    assert.equal(process.env.RAG_TEST_FALLBACK, undefined);
  });
});

test("loads .env.local and .env without overriding existing values", () => {
  const tempDir = createTempEnvDir();

  withEnv(["RAG_TEST_LOCAL", "RAG_TEST_FALLBACK"], () => {
    process.env.RAG_TEST_LOCAL = "preset";
    loadLocalEnv(tempDir, {});

    assert.equal(process.env.RAG_TEST_LOCAL, "preset");
    assert.equal(process.env.RAG_TEST_FALLBACK, "fallback");
  });
});
