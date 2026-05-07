import assert from "node:assert/strict";
import fs from "node:fs/promises";

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { closePostgresPool, createServer } = require("../search-service/server.cjs");

const DEFAULT_K = 10;

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

async function readGoldenDataset() {
  const inputPath = process.argv[2]
    ? new URL(process.argv[2], `file://${process.cwd()}/`)
    : new URL("../fixtures/golden-search-evaluation.json", import.meta.url);
  const content = await fs.readFile(inputPath, "utf8");
  const dataset = JSON.parse(content);

  assert.ok(Array.isArray(dataset), "Golden dataset must be an array.");
  dataset.forEach((caseItem, index) => {
    assert.equal(typeof caseItem.id, "string", `case[${index}].id must be a string.`);
    assert.equal(typeof caseItem.query, "string", `case[${index}].query must be a string.`);
    assert.ok(Array.isArray(caseItem.expectedSourceIds), `case[${index}].expectedSourceIds must be an array.`);
  });

  return dataset;
}

async function requestJson(url) {
  const startedAt = Date.now();
  const response = await fetch(url);

  assert.equal(response.ok, true, `Expected ${url} to return 2xx, got ${response.status}`);

  return {
    body: await response.json(),
    durationMs: Date.now() - startedAt,
  };
}

function dcg(relevances) {
  return relevances.reduce((total, relevance, index) => {
    return total + (Math.pow(2, relevance) - 1) / Math.log2(index + 2);
  }, 0);
}

function scoreCase(caseItem, response, durationMs, k = DEFAULT_K) {
  const expected = new Set(caseItem.expectedSourceIds);
  const rankedIds = response.sources.map((source) => source.id);
  const topK = rankedIds.slice(0, k);
  const relevantTopK = topK.filter((id) => expected.has(id)).length;
  const firstRelevantIndex = rankedIds.findIndex((id) => expected.has(id));
  const relevances = topK.map((id) => (expected.has(id) ? 1 : 0));
  const idealRelevances = Array.from({ length: Math.min(expected.size, k) }, () => 1);
  const idealDcg = dcg(idealRelevances);
  const evidenceIds = new Set(response.answer?.evidence?.map((item) => item.sourceId) ?? []);
  const expectedEvidenceHits = Array.from(expected).filter((id) => evidenceIds.has(id)).length;
  const expectedEmpty = expected.size === 0;
  const emptyCorrect = expectedEmpty ? response.status === "empty" && response.sources.length === 0 : null;

  return {
    id: caseItem.id,
    query: caseItem.query,
    status: response.status,
    durationMs,
    retrievedCount: response.sources.length,
    recallAtK: expectedEmpty ? (response.sources.length === 0 ? 1 : 0) : relevantTopK / expected.size,
    reciprocalRank: expectedEmpty ? 0 : firstRelevantIndex === -1 ? 0 : 1 / (firstRelevantIndex + 1),
    ndcgAtK: idealDcg === 0 ? 0 : dcg(relevances) / idealDcg,
    firstRelevantRank: firstRelevantIndex === -1 ? null : firstRelevantIndex + 1,
    evidenceCoverage: expectedEmpty ? null : expectedEvidenceHits / expected.size,
    expectedEmpty,
    emptyCorrect,
  };
}

function summarize(scores) {
  const total = scores.length || 1;
  const nonEmptyScores = scores.filter((item) => !item.expectedEmpty);
  const emptyScores = scores.filter((item) => item.expectedEmpty);
  const evidenceScores = scores.filter((item) => typeof item.evidenceCoverage === "number");
  const denominator = nonEmptyScores.length || 1;

  return {
    cases: scores.length,
    nonEmptyCases: nonEmptyScores.length,
    emptyCases: emptyScores.length,
    recallAt10: nonEmptyScores.reduce((sum, item) => sum + item.recallAtK, 0) / denominator,
    mrr: nonEmptyScores.reduce((sum, item) => sum + item.reciprocalRank, 0) / denominator,
    ndcgAt10: nonEmptyScores.reduce((sum, item) => sum + item.ndcgAtK, 0) / denominator,
    evidenceCoverage:
      evidenceScores.length === 0
        ? null
        : evidenceScores.reduce((sum, item) => sum + item.evidenceCoverage, 0) / evidenceScores.length,
    emptyAccuracy:
      emptyScores.length === 0
        ? null
        : emptyScores.filter((item) => item.emptyCorrect === true).length / emptyScores.length,
    averageLatencyMs: scores.reduce((sum, item) => sum + item.durationMs, 0) / total,
  };
}

async function main() {
  const dataset = await readGoldenDataset();
  const previousProvider = process.env.SEARCH_SERVICE_PROVIDER;
  const previousAnswerMode = process.env.SEARCH_ANSWER_MODE;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const externalBaseUrl = process.env.SEARCH_EVAL_BASE_URL;
  const host = "127.0.0.1";
  const server = externalBaseUrl ? null : createServer();

  if (!externalBaseUrl) {
    process.env.SEARCH_SERVICE_PROVIDER = "seed";
    process.env.SEARCH_ANSWER_MODE = "extractive";
    process.env.DATABASE_URL = "";
  }

  try {
    const baseUrl = externalBaseUrl
      ? externalBaseUrl.replace(/\/+$/, "")
      : `http://${host}:${(await listen(server, host)).port}`;
    const scores = [];

    for (const caseItem of dataset) {
      const { body, durationMs } = await requestJson(
        `${baseUrl}/api/search?q=${encodeURIComponent(caseItem.query)}&limit=${DEFAULT_K}`,
      );

      scores.push(scoreCase(caseItem, body, durationMs));
    }

    const summary = summarize(scores);
    console.log(JSON.stringify({ summary, scores }, null, 2));
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

    if (server?.listening) {
      await close(server);
    }

    await closePostgresPool();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
