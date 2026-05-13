import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
require("../search-service/load-env.cjs").loadLocalEnv();

const { readEmbeddingConfig, shouldUseEmbeddings } = require("../search-service/embedding-client.cjs");
const { readRerankConfig, shouldUseRerank } = require("../search-service/rerank-client.cjs");

const DEFAULT_K = 10;
const DEFAULT_DATASET_PATHS = {
  seed: new URL("../fixtures/golden-search-evaluation.json", import.meta.url),
  postgres: new URL("../fixtures/golden-search-evaluation.postgres.json", import.meta.url),
  external: new URL("../fixtures/golden-search-evaluation.postgres.json", import.meta.url),
};
const EVAL_MODES = new Set(["seed", "postgres", "external"]);
const EVAL_STRATEGIES = ["lexical", "hybrid", "hybrid_rerank"];
const EVAL_CATEGORIES = new Set(["招生", "教务", "图书馆", "后勤", "学生服务"]);
const SOURCE_SCOPES = new Set(["official", "community"]);
const MATCHER_FIELDS = ["id", "dedupKey", "canonicalUrl", "url", "title", "sourceName"];

function roundMetric(value, digits = 4) {
  if (value === null || value === undefined) {
    return null;
  }

  if (!Number.isFinite(value)) {
    return null;
  }

  return Number(value.toFixed(digits));
}

function parseArgs(argv) {
  const args = {
    datasetPath: null,
    mode: null,
    strategy: null,
    outputDir: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === "--dataset") {
      args.datasetPath = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (value === "--mode") {
      args.mode = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (value === "--strategy") {
      args.strategy = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (value === "--output-dir") {
      args.outputDir = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (!value.startsWith("--") && !args.datasetPath) {
      args.datasetPath = value;
    }
  }

  return args;
}

export function normalizeEvalMode(value) {
  const mode = String(value ?? "").trim().toLowerCase();

  if (!mode) {
    return process.env.SEARCH_EVAL_BASE_URL?.trim() ? "external" : "seed";
  }

  return EVAL_MODES.has(mode) ? mode : "seed";
}

export function resolveRequestedStrategies(mode, rawStrategy) {
  const normalizedMode = normalizeEvalMode(mode);
  const normalized = String(rawStrategy ?? "").trim().toLowerCase();

  if (!normalized || normalized === "all") {
    return normalizedMode === "seed" ? ["lexical"] : [...EVAL_STRATEGIES];
  }

  const requested = normalized
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  assert.ok(requested.length > 0, "At least one evaluation strategy must be provided.");

  requested.forEach((strategy) => {
    assert.ok(EVAL_STRATEGIES.includes(strategy), `Unsupported evaluation strategy: ${strategy}`);
  });

  return [...new Set(requested)];
}

function buildDefaultDatasetUrl(mode) {
  return DEFAULT_DATASET_PATHS[normalizeEvalMode(mode)] ?? DEFAULT_DATASET_PATHS.seed;
}

function resolveDatasetUrl(inputPath, mode) {
  if (!inputPath) {
    return buildDefaultDatasetUrl(mode);
  }

  if (inputPath instanceof URL) {
    return inputPath;
  }

  return new URL(inputPath, `file://${process.cwd().replace(/\\/g, "/")}/`);
}

function validateExpectedSourceMatcher(matcher, label) {
  assert.equal(typeof matcher, "object", `${label} must be an object.`);
  assert.ok(matcher !== null && !Array.isArray(matcher), `${label} must be a plain object.`);

  const definedFields = MATCHER_FIELDS.filter((field) => matcher[field] !== undefined);
  assert.ok(definedFields.length > 0, `${label} must define at least one matcher field.`);

  definedFields.forEach((field) => {
    assert.equal(typeof matcher[field], "string", `${label}.${field} must be a string.`);
    assert.ok(matcher[field].trim(), `${label}.${field} must not be empty.`);
  });

  return matcher;
}

export function normalizeExpectedSourceMatchers(caseItem) {
  const expectedSourceIds = Array.isArray(caseItem.expectedSourceIds) ? caseItem.expectedSourceIds : [];
  const expectedSourceMatchers = Array.isArray(caseItem.expectedSourceMatchers) ? caseItem.expectedSourceMatchers : [];

  return [
    ...expectedSourceIds.map((id) => ({ id })),
    ...expectedSourceMatchers,
  ];
}

export function validateGoldenDataset(dataset) {
  assert.ok(Array.isArray(dataset), "Golden dataset must be an array.");

  dataset.forEach((caseItem, index) => {
    assert.equal(typeof caseItem.id, "string", `case[${index}].id must be a string.`);
    assert.ok(caseItem.id.trim(), `case[${index}].id must not be empty.`);
    assert.equal(typeof caseItem.query, "string", `case[${index}].query must be a string.`);
    assert.ok(caseItem.query.trim(), `case[${index}].query must not be empty.`);
    assert.equal(typeof caseItem.category, "string", `case[${index}].category must be a string.`);
    assert.ok(EVAL_CATEGORIES.has(caseItem.category), `case[${index}].category is not supported.`);
    assert.equal(typeof caseItem.sourceScope, "string", `case[${index}].sourceScope must be a string.`);
    assert.ok(SOURCE_SCOPES.has(caseItem.sourceScope), `case[${index}].sourceScope is not supported.`);
    const expectedSourceIds = caseItem.expectedSourceIds ?? [];
    const expectedSourceMatchers = caseItem.expectedSourceMatchers ?? [];

    assert.ok(Array.isArray(expectedSourceIds), `case[${index}].expectedSourceIds must be an array.`);
    assert.ok(Array.isArray(expectedSourceMatchers), `case[${index}].expectedSourceMatchers must be an array.`);
    assert.equal(typeof caseItem.expectedEmpty, "boolean", `case[${index}].expectedEmpty must be a boolean.`);

    expectedSourceIds.forEach((sourceId, sourceIndex) => {
      assert.equal(typeof sourceId, "string", `case[${index}].expectedSourceIds[${sourceIndex}] must be a string.`);
      assert.ok(sourceId.trim(), `case[${index}].expectedSourceIds[${sourceIndex}] must not be empty.`);
    });

    expectedSourceMatchers.forEach((matcher, matcherIndex) => {
      validateExpectedSourceMatcher(matcher, `case[${index}].expectedSourceMatchers[${matcherIndex}]`);
    });

    const normalizedMatchers = normalizeExpectedSourceMatchers({
      expectedSourceIds,
      expectedSourceMatchers,
    });

    if (caseItem.expectedEmpty) {
      assert.equal(
        normalizedMatchers.length,
        0,
        `case[${index}] cannot define expected sources when expectedEmpty is true.`,
      );
    } else {
      assert.ok(
        normalizedMatchers.length > 0,
        `case[${index}] must define at least one expected source when expectedEmpty is false.`,
      );
    }

    if (caseItem.notes !== undefined) {
      assert.equal(typeof caseItem.notes, "string", `case[${index}].notes must be a string when provided.`);
    }
  });

  return dataset;
}

async function readGoldenDataset(inputPath, mode) {
  const datasetUrl = resolveDatasetUrl(inputPath, mode);
  const content = await fs.readFile(datasetUrl, "utf8");
  const dataset = validateGoldenDataset(JSON.parse(content));

  return {
    dataset,
    datasetUrl,
  };
}

async function requestJson(url) {
  const startedAt = Date.now();
  const response = await fetch(url);

  if (!response.ok) {
    const contentType = response.headers.get("content-type") ?? "";
    let detail;

    try {
      if (contentType.includes("application/json")) {
        const payload = await response.clone().json();
        detail =
          payload?.errorCode ??
          payload?.error ??
          payload?.message ??
          JSON.stringify(payload).slice(0, 240);
      } else {
        detail = (await response.text()).trim().slice(0, 240) || response.statusText;
      }
    } catch {
      detail = response.statusText;
    }

    throw new Error(`Expected ${url} to return 2xx, got ${response.status}: ${detail}`);
  }

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

export function matchesExpectedSource(candidate, matcher) {
  if (!candidate || !matcher) {
    return false;
  }

  return MATCHER_FIELDS.every((field) => {
    if (matcher[field] === undefined) {
      return true;
    }

    return candidate[field] === matcher[field];
  });
}

function describeExpectedMatcher(matcher) {
  if (matcher.id) {
    return `id:${matcher.id}`;
  }

  if (matcher.title && matcher.sourceName) {
    return `${matcher.sourceName} / ${matcher.title}`;
  }

  if (matcher.title) {
    return `title:${matcher.title}`;
  }

  if (matcher.sourceName) {
    return `source:${matcher.sourceName}`;
  }

  if (matcher.dedupKey) {
    return `dedupKey:${matcher.dedupKey}`;
  }

  if (matcher.canonicalUrl) {
    return `canonicalUrl:${matcher.canonicalUrl}`;
  }

  if (matcher.url) {
    return `url:${matcher.url}`;
  }

  return "unknown_matcher";
}

function computeFirstRelevantRank(sources, matchers) {
  const firstRelevantIndex = sources.findIndex((source) => matchers.some((matcher) => matchesExpectedSource(source, matcher)));
  return firstRelevantIndex === -1 ? null : firstRelevantIndex + 1;
}

export function scoreCase(caseItem, response, durationMs, k = DEFAULT_K) {
  const expectedSourceIds = Array.isArray(caseItem.expectedSourceIds) ? caseItem.expectedSourceIds : [];
  const expectedSourceMatchers = Array.isArray(caseItem.expectedSourceMatchers) ? caseItem.expectedSourceMatchers : [];
  const normalizedMatchers = normalizeExpectedSourceMatchers(caseItem);
  const rankedSources = Array.isArray(response.sources) ? response.sources : [];
  const rankedIds = rankedSources.map((source) => source.id);
  const topKSources = rankedSources.slice(0, k);
  const topK = topKSources.map((source) => source.id);
  const relevantTopK = normalizedMatchers.filter((matcher) =>
    topKSources.some((source) => matchesExpectedSource(source, matcher)),
  ).length;
  const firstRelevantRank = computeFirstRelevantRank(rankedSources, normalizedMatchers);
  const relevances = topKSources.map((source) =>
    normalizedMatchers.some((matcher) => matchesExpectedSource(source, matcher)) ? 1 : 0,
  );
  const idealRelevances = Array.from({ length: Math.min(normalizedMatchers.length, k) }, () => 1);
  const idealDcg = dcg(idealRelevances);
  const rankedSourceById = new Map(rankedSources.map((source) => [source.id, source]));
  const evidenceSources =
    response.answer?.evidence?.map((item) => {
      const rankedSource = rankedSourceById.get(item.sourceId);

      return {
        ...rankedSource,
        id: item.sourceId,
        title: item.title ?? rankedSource?.title,
        sourceName: item.sourceName ?? rankedSource?.sourceName,
      };
    }) ?? [];
  const matchedExpectedIds = expectedSourceIds.filter((id) => topK.includes(id));
  const matchedExpectedSources = normalizedMatchers
    .filter((matcher) => topKSources.some((source) => matchesExpectedSource(source, matcher)))
    .map(describeExpectedMatcher);
  const returnedTopSources = topKSources.map((source, index) => ({
    rank: index + 1,
    id: source.id,
    dedupKey: source.dedupKey ?? null,
    title: source.title ?? null,
    sourceName: source.sourceName ?? null,
    canonicalUrl: source.canonicalUrl ?? source.url ?? null,
    type: source.type ?? null,
  }));
  const expectedEvidenceHits = normalizedMatchers.filter((matcher) =>
    evidenceSources.some((candidate) => matchesExpectedSource(candidate, matcher)),
  ).length;
  const retrievalDebug = response.__debug?.retrieval ?? null;
  const rerankBeforeTopSources = Array.isArray(retrievalDebug?.rerank?.beforeTopSources)
    ? retrievalDebug.rerank.beforeTopSources
    : [];
  const rerankAfterTopSources = Array.isArray(retrievalDebug?.rerank?.afterTopSources)
    ? retrievalDebug.rerank.afterTopSources
    : [];
  const rerankBeforeRelevantRank = normalizedMatchers.length
    ? computeFirstRelevantRank(rerankBeforeTopSources, normalizedMatchers)
    : null;
  const rerankAfterRelevantRank = normalizedMatchers.length
    ? computeFirstRelevantRank(rerankAfterTopSources, normalizedMatchers)
    : null;
  const expectedEmpty = caseItem.expectedEmpty;
  const emptyCorrect = expectedEmpty ? response.status === "empty" && rankedIds.length === 0 : null;

  return {
    id: caseItem.id,
    query: caseItem.query,
    category: caseItem.category,
    sourceScope: caseItem.sourceScope,
    notes: caseItem.notes ?? null,
    status: response.status,
    durationMs,
    displayedSourceCount: rankedIds.length,
    retrievedCount:
      typeof response.retrievedCount === "number" && Number.isFinite(response.retrievedCount)
        ? response.retrievedCount
        : rankedIds.length,
    expectedSourceIds,
    expectedSourceMatchers,
    returnedTopIds: topK,
    returnedTopSources,
    matchedExpectedIds,
    matchedExpectedSources,
    recallAt10: expectedEmpty ? (rankedIds.length === 0 ? 1 : 0) : relevantTopK / normalizedMatchers.length,
    reciprocalRank: expectedEmpty ? 0 : firstRelevantRank === null ? 0 : 1 / firstRelevantRank,
    ndcgAt10: idealDcg === 0 ? 0 : dcg(relevances) / idealDcg,
    firstRelevantRank,
    evidenceCoverage: expectedEmpty ? null : expectedEvidenceHits / normalizedMatchers.length,
    expectedEmpty,
    emptyCorrect,
    retrievalDiagnostics:
      retrievalDebug === null
        ? null
        : {
            mode: retrievalDebug.mode ?? null,
            rerankMode: retrievalDebug.rerankMode ?? null,
            candidateCount: retrievalDebug.candidateCount ?? null,
            selectedTopSources: retrievalDebug.selectedTopSources ?? [],
            emptyGate: retrievalDebug.emptyGate ?? null,
            rerank:
              retrievalDebug.rerank == null
                ? null
                : {
                    applied: Boolean(retrievalDebug.rerank.applied),
                    reason: retrievalDebug.rerank.reason ?? null,
                    candidateCount: retrievalDebug.rerank.candidateCount ?? null,
                    beforeTopSources: rerankBeforeTopSources,
                    afterTopSources: rerankAfterTopSources,
                    changedTopOrder: Boolean(retrievalDebug.rerank.changedTopOrder),
                    beforeFirstRelevantRank: rerankBeforeRelevantRank,
                    afterFirstRelevantRank: rerankAfterRelevantRank,
                    improvedFirstRelevantRank:
                      rerankBeforeRelevantRank !== null &&
                      rerankAfterRelevantRank !== null &&
                      rerankAfterRelevantRank < rerankBeforeRelevantRank,
                  },
          },
  };
}

export function summarizeScores(scores) {
  const total = scores.length || 1;
  const nonEmptyScores = scores.filter((item) => !item.expectedEmpty);
  const emptyScores = scores.filter((item) => item.expectedEmpty);
  const evidenceScores = scores.filter((item) => typeof item.evidenceCoverage === "number");
  const denominator = nonEmptyScores.length || 1;

  return {
    cases: scores.length,
    nonEmptyCases: nonEmptyScores.length,
    emptyCases: emptyScores.length,
    recallAt10: roundMetric(nonEmptyScores.reduce((sum, item) => sum + item.recallAt10, 0) / denominator),
    mrr: roundMetric(nonEmptyScores.reduce((sum, item) => sum + item.reciprocalRank, 0) / denominator),
    ndcgAt10: roundMetric(nonEmptyScores.reduce((sum, item) => sum + item.ndcgAt10, 0) / denominator),
    evidenceCoverage:
      evidenceScores.length === 0
        ? null
        : roundMetric(evidenceScores.reduce((sum, item) => sum + item.evidenceCoverage, 0) / evidenceScores.length),
    emptyAccuracy:
      emptyScores.length === 0
        ? null
        : roundMetric(emptyScores.filter((item) => item.emptyCorrect === true).length / emptyScores.length),
    averageLatencyMs: roundMetric(scores.reduce((sum, item) => sum + item.durationMs, 0) / total, 2),
  };
}

export function summarizeByCategory(scores) {
  return Object.fromEntries(
    [...EVAL_CATEGORIES].map((category) => {
      const categoryScores = scores.filter((item) => item.category === category);
      return [category, summarizeScores(categoryScores)];
    }),
  );
}

function summarizeByScopeAndCategory(scores) {
  const officialScores = scores.filter((item) => item.sourceScope === "official");
  const communityScores = scores.filter((item) => item.sourceScope === "community");

  return {
    primarySummary: summarizeScores(officialScores),
    appendixSummary: summarizeScores(communityScores),
    byCategory: Object.fromEntries(
      [...EVAL_CATEGORIES].map((category) => [
        category,
        {
          primary: summarizeScores(
            officialScores.filter((item) => item.category === category),
          ),
          appendix: summarizeScores(
            communityScores.filter((item) => item.category === category),
          ),
        },
      ]),
    ),
  };
}

function summarizeNegativeAnalysis(scores) {
  const failures = scores.filter((item) => item.expectedEmpty && item.emptyCorrect === false);
  const noiseCounts = new Map();
  const sourceCounts = new Map();

  for (const item of failures) {
    const topSource = item.returnedTopSources[0];
    const topNoiseTags = item.retrievalDiagnostics?.emptyGate?.summary?.topNoiseTags ?? [];

    for (const tag of topNoiseTags) {
      noiseCounts.set(tag, (noiseCounts.get(tag) ?? 0) + 1);
    }

    if (topSource?.title) {
      const label = `${topSource.sourceName ?? "unknown"} / ${topSource.title}`;
      sourceCounts.set(label, (sourceCounts.get(label) ?? 0) + 1);
    }
  }

  return {
    failedNegativeCases: failures.length,
    topNoiseTags: [...noiseCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .map(([tag, count]) => ({ tag, count })),
    topFalsePositiveSources: [...sourceCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .map(([label, count]) => ({ label, count })),
  };
}

function summarizeRerankImpact(scores) {
  const rerankCases = scores
    .map((item) => item.retrievalDiagnostics?.rerank)
    .filter((item) => item && item.candidateCount !== null);

  const changedTopOrderCount = rerankCases.filter((item) => item.changedTopOrder).length;
  const improvedFirstRelevantRankCount = rerankCases.filter((item) => item.improvedFirstRelevantRank).length;
  const reasons = new Map();

  for (const item of rerankCases) {
    const reason = item.reason ?? "unknown";
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  }

  return {
    cases: rerankCases.length,
    changedTopOrderCount,
    improvedFirstRelevantRankCount,
    reasons: [...reasons.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([reason, count]) => ({ reason, count })),
  };
}

function hasLocalPackage(packageName) {
  try {
    require.resolve(packageName);
    return true;
  } catch {
    return false;
  }
}

export function checkStrategyAvailability(mode, strategy, env = process.env) {
  const normalizedMode = normalizeEvalMode(mode);

  if (normalizedMode === "seed" && strategy !== "lexical") {
    return {
      available: false,
      reason: "seed_mode_only_supports_lexical",
    };
  }

  if (normalizedMode === "external") {
    return env.SEARCH_EVAL_BASE_URL?.trim()
      ? { available: true }
      : {
          available: false,
          reason: "search_eval_base_url_missing",
        };
  }

  if (normalizedMode === "postgres") {
    if (!env.DATABASE_URL?.trim()) {
      return {
        available: false,
        reason: "database_url_missing",
      };
    }

    if (!hasLocalPackage("pg")) {
      return {
        available: false,
        reason: "pg_dependency_missing",
      };
    }

    if ((strategy === "hybrid" || strategy === "hybrid_rerank") && !shouldUseEmbeddings(readEmbeddingConfig(env))) {
      return {
        available: false,
        reason: "embedding_unconfigured",
      };
    }

    if (strategy === "hybrid_rerank" && !shouldUseRerank(readRerankConfig(env))) {
      return {
        available: false,
        reason: "rerank_unconfigured",
      };
    }
  }

  return {
    available: true,
  };
}

function strategyToEnv(strategy) {
  switch (strategy) {
    case "hybrid":
      return {
        retrievalMode: "hybrid",
        rerankMode: "off",
      };
    case "hybrid_rerank":
      return {
        retrievalMode: "hybrid",
        rerankMode: "on",
      };
    case "lexical":
    default:
      return {
        retrievalMode: "lexical",
        rerankMode: "off",
      };
  }
}

async function withLocalStrategy(mode, strategy, task) {
  const { closePostgresPool } = require("../search-service/server.cjs");
  const previousProvider = process.env.SEARCH_SERVICE_PROVIDER;
  const previousAnswerMode = process.env.SEARCH_ANSWER_MODE;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  const previousRetrievalMode = process.env.SEARCH_RETRIEVAL_MODE;
  const previousRerankMode = process.env.SEARCH_RERANK_MODE;
  const previousSilentLogs = process.env.SEARCH_SERVICE_SILENT_LOGS;
  const strategyEnv = strategyToEnv(strategy);

  process.env.SEARCH_SERVICE_PROVIDER = mode === "postgres" ? "postgres" : "seed";
  process.env.SEARCH_ANSWER_MODE = "extractive";
  process.env.SEARCH_RETRIEVAL_MODE = strategyEnv.retrievalMode;
  process.env.SEARCH_RERANK_MODE = strategyEnv.rerankMode;
  process.env.SEARCH_SERVICE_SILENT_LOGS = "1";

  if (mode === "seed") {
    process.env.DATABASE_URL = "";
  }

  try {
    return await task();
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

    if (previousRetrievalMode === undefined) {
      delete process.env.SEARCH_RETRIEVAL_MODE;
    } else {
      process.env.SEARCH_RETRIEVAL_MODE = previousRetrievalMode;
    }

    if (previousRerankMode === undefined) {
      delete process.env.SEARCH_RERANK_MODE;
    } else {
      process.env.SEARCH_RERANK_MODE = previousRerankMode;
    }

    if (previousSilentLogs === undefined) {
      delete process.env.SEARCH_SERVICE_SILENT_LOGS;
    } else {
      process.env.SEARCH_SERVICE_SILENT_LOGS = previousSilentLogs;
    }

    await closePostgresPool();
  }
}

async function runCases(dataset, baseUrl) {
  const scores = [];

  for (const caseItem of dataset) {
    const { body, durationMs } = await requestJson(
      `${baseUrl}/api/search?q=${encodeURIComponent(caseItem.query)}&limit=${DEFAULT_K}`,
    );

    scores.push(scoreCase(caseItem, body, durationMs));
  }

  return scores;
}

async function runLocalCases(dataset, mode) {
  const { searchPostgres, searchSeed } = require("../search-service/server.cjs");
  const scores = [];

  for (const caseItem of dataset) {
    const startedAt = Date.now();
    const response =
      mode === "postgres"
        ? await searchPostgres(caseItem.query, DEFAULT_K, {
            retrievalMode: process.env.SEARCH_RETRIEVAL_MODE,
            rerankMode: process.env.SEARCH_RERANK_MODE,
          })
        : searchSeed(caseItem.query, DEFAULT_K);

    scores.push(scoreCase(caseItem, response, Date.now() - startedAt));
  }

  return scores;
}

async function evaluateStrategy(dataset, mode, strategy, externalBaseUrl) {
  if (mode === "external") {
    return runCases(dataset, externalBaseUrl.replace(/\/+$/, ""));
  }

  return withLocalStrategy(mode, strategy, () => runLocalCases(dataset, mode));
}

function buildDatasetSummary(dataset, datasetUrl) {
  const officialCases = dataset.filter((item) => item.sourceScope === "official");
  const communityCases = dataset.filter((item) => item.sourceScope === "community");

  return {
    path: fileURLToPath(datasetUrl),
    cases: dataset.length,
    officialCases: officialCases.length,
    communityCases: communityCases.length,
    byCategory: Object.fromEntries(
      [...EVAL_CATEGORIES].map((category) => [
        category,
        {
          official: officialCases.filter((item) => item.category === category).length,
          community: communityCases.filter((item) => item.category === category).length,
        },
      ]),
    ),
  };
}

export function buildMarkdownSummary(report) {
  const lines = [
    "# Search Quality Evaluation",
    "",
    `- Generated At: ${report.generatedAt}`,
    `- Mode: ${report.mode}`,
    `- Primary Scope: ${report.primarySourceScope}`,
    `- Dataset Cases: ${report.dataset.cases} (official ${report.dataset.officialCases}, community ${report.dataset.communityCases})`,
    "",
  ];

  for (const strategy of report.strategies) {
    lines.push(`## ${strategy.name}`);
    lines.push("");
    lines.push(`- Status: ${strategy.status}`);

    if (strategy.reason) {
      lines.push(`- Reason: ${strategy.reason}`);
    }

    if (strategy.status === "completed") {
      lines.push(
        `- Primary Summary: recall@10=${strategy.primarySummary.recallAt10}, mrr=${strategy.primarySummary.mrr}, ndcg@10=${strategy.primarySummary.ndcgAt10}, evidenceCoverage=${strategy.primarySummary.evidenceCoverage}, emptyAccuracy=${strategy.primarySummary.emptyAccuracy}, averageLatencyMs=${strategy.primarySummary.averageLatencyMs}`,
      );
      lines.push(
        `- Community Appendix: recall@10=${strategy.appendixSummary.recallAt10}, mrr=${strategy.appendixSummary.mrr}, ndcg@10=${strategy.appendixSummary.ndcgAt10}, evidenceCoverage=${strategy.appendixSummary.evidenceCoverage}, emptyAccuracy=${strategy.appendixSummary.emptyAccuracy}, averageLatencyMs=${strategy.appendixSummary.averageLatencyMs}`,
      );
      lines.push(
        `- Negative Analysis: failedNegativeCases=${strategy.negativeAnalysis.failedNegativeCases}, topNoiseTags=${strategy.negativeAnalysis.topNoiseTags.map((item) => `${item.tag}:${item.count}`).join(", ") || "none"}`,
      );
      lines.push(
        `- Rerank Impact: cases=${strategy.rerankImpact.cases}, changedTopOrder=${strategy.rerankImpact.changedTopOrderCount}, improvedFirstRelevantRank=${strategy.rerankImpact.improvedFirstRelevantRankCount}`,
      );
      lines.push("- Category Breakdown:");

      for (const category of EVAL_CATEGORIES) {
        const categorySummary = strategy.byCategory[category];
        lines.push(
          `  - ${category}: primary recall@10=${categorySummary.primary.recallAt10}, appendix recall@10=${categorySummary.appendix.recallAt10}`,
        );
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}

async function writeReportArtifacts(report, outputDir) {
  const timestamp = report.generatedAt.replace(/[:.]/g, "-");
  const jsonPath = path.join(outputDir, `search-quality-evaluation-${report.mode}-${timestamp}.json`);
  const markdownPath = path.join(outputDir, `search-quality-evaluation-${report.mode}-${timestamp}.md`);

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.writeFile(markdownPath, `${buildMarkdownSummary(report)}\n`, "utf8");

  return {
    json: jsonPath,
    markdown: markdownPath,
  };
}

export async function runEvaluation({
  datasetPath,
  mode,
  strategy,
  outputDir,
} = {}) {
  const resolvedMode = normalizeEvalMode(mode);
  const { dataset, datasetUrl } = await readGoldenDataset(datasetPath, resolvedMode);
  const requestedStrategies = resolveRequestedStrategies(resolvedMode, strategy);
  const externalBaseUrl = process.env.SEARCH_EVAL_BASE_URL?.trim() ?? "";
  const report = {
    generatedAt: new Date().toISOString(),
    mode: resolvedMode,
    requestedStrategies,
    primarySourceScope: "official",
    appendixSourceScope: "community",
    dataset: buildDatasetSummary(dataset, datasetUrl),
    strategies: [],
  };

  for (const strategyName of requestedStrategies) {
    const availability = checkStrategyAvailability(resolvedMode, strategyName);

    if (!availability.available) {
      report.strategies.push({
        name: strategyName,
        status: "skipped",
        reason: availability.reason,
      });
      continue;
    }

    try {
      const scores = await evaluateStrategy(dataset, resolvedMode, strategyName, externalBaseUrl);
      const summaries = summarizeByScopeAndCategory(scores);

      report.strategies.push({
        name: strategyName,
        status: "completed",
        primarySummary: summaries.primarySummary,
        appendixSummary: summaries.appendixSummary,
        byCategory: summaries.byCategory,
        negativeAnalysis: summarizeNegativeAnalysis(scores),
        rerankImpact: summarizeRerankImpact(scores),
        cases: scores,
      });
    } catch (error) {
      report.strategies.push({
        name: strategyName,
        status: "failed",
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (outputDir) {
    report.writtenFiles = await writeReportArtifacts(report, path.resolve(process.cwd(), outputDir));
  }

  return report;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = await runEvaluation(args);
  console.log(JSON.stringify(report, null, 2));
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : "";

if (entryPath === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    process.exitCode = 1;
  });
}
