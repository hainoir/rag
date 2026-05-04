import assert from "node:assert/strict";
import fs from "node:fs/promises";

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { closePostgresPool, createServer } = require("../search-service/server.cjs");

function listen(server, host) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, () => {
      server.off("error", reject);
      resolve(server.address());
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

async function readDemoQueries() {
  const content = await fs.readFile(new URL("../fixtures/demo-queries.json", import.meta.url), "utf8");
  return JSON.parse(content);
}

async function requestJson(url) {
  const response = await fetch(url);
  assert.equal(response.ok, true, `Expected ${url} to return 2xx, got ${response.status}`);
  return response.json();
}

async function main() {
  const previousProvider = process.env.SEARCH_SERVICE_PROVIDER;
  const previousAnswerMode = process.env.SEARCH_ANSWER_MODE;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const host = "127.0.0.1";
  const server = createServer();

  process.env.SEARCH_SERVICE_PROVIDER = "seed";
  process.env.SEARCH_ANSWER_MODE = "extractive";
  process.env.DATABASE_URL = "";

  try {
    const demoQueries = await readDemoQueries();
    const address = await listen(server, host);
    const baseUrl = `http://${host}:${address.port}`;
    const health = await requestJson(`${baseUrl}/health`);

    assert.equal(health.status, "ok");
    assert.equal(health.provider, "seed");

    for (const demo of demoQueries) {
      const response = await requestJson(
        `${baseUrl}/api/search?q=${encodeURIComponent(demo.query)}&limit=6`,
      );

      assert.ok(
        demo.expectedStatuses.includes(response.status),
        `${demo.id}: expected one of ${demo.expectedStatuses.join(", ")}, got ${response.status}`,
      );
      assert.ok(
        response.sources.length >= demo.minSources,
        `${demo.id}: expected at least ${demo.minSources} source(s), got ${response.sources.length}`,
      );

      if (demo.requiresAnswer) {
        assert.ok(response.answer, `${demo.id}: expected an answer object.`);
        assert.ok(
          response.answer.evidence?.length,
          `${demo.id}: expected answer evidence to be present.`,
        );
      } else {
        assert.equal(response.answer, null, `${demo.id}: expected no generated answer.`);
      }
    }

    console.log(
      `Demo query verification passed: ${demoQueries.length} queries checked against seed search-service.`,
    );
  } finally {
    if (previousProvider === undefined) {
      delete process.env.SEARCH_SERVICE_PROVIDER;
    } else {
      process.env.SEARCH_SERVICE_PROVIDER = previousProvider;
    }

    if (previousAnswerMode === undefined) {
      delete process.env.SEARCH_ANSWER_MODE;
    } else {
      process.env.SEARCH_ANSWER_MODE = previousAnswerMode;
    }

    if (previousDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previousDatabaseUrl;
    }

    if (server.listening) {
      await close(server);
    }

    await closePostgresPool();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
