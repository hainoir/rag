import assert from "node:assert/strict";

import {
  checkStrategyAvailability,
  matchesExpectedSource,
  normalizeExpectedSourceMatchers,
  resolveRequestedStrategies,
  scoreCase,
  summarizeByCategory,
  summarizeScores,
  validateGoldenDataset,
} from "../../scripts/evaluate-search.mjs";

function test(name: string, task: () => void) {
  try {
    task();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  }
}

test("validates v2 golden dataset cases", () => {
  const dataset = validateGoldenDataset([
    {
      id: "official-case",
      query: "图书馆借书需要什么证件",
      category: "图书馆",
      sourceScope: "official",
      expectedSourceIds: ["official-library-borrow-guide"],
      expectedEmpty: false,
    },
    {
      id: "negative-case",
      query: "图书馆打印店会员卡怎么办",
      category: "图书馆",
      sourceScope: "official",
      expectedSourceIds: [],
      expectedEmpty: true,
      notes: "negative",
    },
    {
      id: "postgres-case",
      query: "图书馆自习座位怎么预约",
      category: "图书馆",
      sourceScope: "official",
      expectedSourceMatchers: [
        {
          dedupKey: "seat-guide",
          title: "座位预约系统使用说明",
          sourceName: "天津商业大学图书馆",
        },
      ],
      expectedEmpty: false,
    },
  ]);

  assert.equal(dataset.length, 3);
  assert.throws(
    () =>
      validateGoldenDataset([
        {
          id: "bad-case",
          query: "bad",
          category: "图书馆",
          sourceScope: "official",
          expectedSourceIds: ["unexpected"],
          expectedEmpty: true,
        },
      ]),
    /cannot define expected sources/,
  );
  assert.throws(
    () =>
      validateGoldenDataset([
        {
          id: "bad-matcher",
          query: "bad",
          category: "图书馆",
          sourceScope: "official",
          expectedSourceMatchers: [{}],
          expectedEmpty: false,
        },
      ]),
    /must define at least one matcher field/,
  );
});

test("resolves strategy defaults per mode", () => {
  assert.deepEqual(resolveRequestedStrategies("seed"), ["lexical"]);
  assert.deepEqual(resolveRequestedStrategies("postgres"), ["lexical", "hybrid", "hybrid_rerank"]);
  assert.deepEqual(resolveRequestedStrategies("postgres", "lexical,hybrid"), ["lexical", "hybrid"]);
});

test("checks local strategy availability with explicit skip reasons", () => {
  assert.deepEqual(checkStrategyAvailability("seed", "hybrid"), {
    available: false,
    reason: "seed_mode_only_supports_lexical",
  });
  assert.deepEqual(
    checkStrategyAvailability("postgres", "hybrid", {
      DATABASE_URL: "",
    } as NodeJS.ProcessEnv),
    {
      available: false,
      reason: "database_url_missing",
    },
  );
  assert.deepEqual(checkStrategyAvailability("external", "lexical", {} as NodeJS.ProcessEnv), {
    available: false,
    reason: "search_eval_base_url_missing",
  });
});

test("scores retrieval cases and summarizes primary metrics", () => {
  const hit = scoreCase(
    {
      id: "hit",
      query: "图书馆借书需要什么证件",
      category: "图书馆",
      sourceScope: "official",
      expectedSourceIds: ["official-library-borrow-guide"],
      expectedEmpty: false,
    },
    {
      status: "ok",
      retrievedCount: 2,
      sources: [
        { id: "official-library-borrow-guide" },
        { id: "official-library-seat-booking" },
      ],
      answer: {
        evidence: [{ sourceId: "official-library-borrow-guide" }],
      },
    },
    120,
  );
  const matcherHit = scoreCase(
    {
      id: "matcher-hit",
      query: "图书馆自习座位怎么预约",
      category: "图书馆",
      sourceScope: "official",
      expectedSourceMatchers: [
        {
          dedupKey: "seat-guide",
          title: "座位预约系统使用说明",
          sourceName: "天津商业大学图书馆",
        },
      ],
      expectedEmpty: false,
    },
    {
      status: "ok",
      retrievedCount: 2,
      sources: [
        {
          id: "postgres-uuid-1",
          dedupKey: "seat-guide",
          title: "座位预约系统使用说明",
          sourceName: "天津商业大学图书馆",
        },
        {
          id: "postgres-uuid-2",
          dedupKey: "other",
          title: "其他结果",
          sourceName: "天津商业大学图书馆",
        },
      ],
      answer: {
        evidence: [
          {
            sourceId: "postgres-uuid-1",
            title: "座位预约系统使用说明",
            sourceName: "天津商业大学图书馆",
          },
        ],
      },
    },
    90,
  );
  const miss = scoreCase(
    {
      id: "miss",
      query: "图书馆打印店会员卡怎么办",
      category: "图书馆",
      sourceScope: "official",
      expectedSourceIds: [],
      expectedEmpty: true,
    },
    {
      status: "empty",
      retrievedCount: 0,
      sources: [],
      answer: null,
    },
    80,
  );

  const summary = summarizeScores([hit, matcherHit, miss]);
  const byCategory = summarizeByCategory([hit, matcherHit, miss]);

  assert.equal(hit.firstRelevantRank, 1);
  assert.equal(matcherHit.firstRelevantRank, 1);
  assert.equal(matcherHit.evidenceCoverage, 1);
  assert.deepEqual(matcherHit.matchedExpectedIds, []);
  assert.deepEqual(matcherHit.matchedExpectedSources, ["天津商业大学图书馆 / 座位预约系统使用说明"]);
  assert.equal(hit.evidenceCoverage, 1);
  assert.equal(miss.emptyCorrect, true);
  assert.equal(summary.cases, 3);
  assert.equal(summary.nonEmptyCases, 2);
  assert.equal(summary.emptyCases, 1);
  assert.equal(summary.recallAt10, 1);
  assert.equal(summary.emptyAccuracy, 1);
  assert.equal(byCategory["图书馆"].cases, 3);
});

test("normalizes and matches expected source matchers", () => {
  const matchers = normalizeExpectedSourceMatchers({
    expectedSourceIds: ["seed-id"],
    expectedSourceMatchers: [{ dedupKey: "seat-guide", sourceName: "天津商业大学图书馆" }],
  });

  assert.deepEqual(matchers, [
    { id: "seed-id" },
    { dedupKey: "seat-guide", sourceName: "天津商业大学图书馆" },
  ]);
  assert.equal(
    matchesExpectedSource(
      {
        id: "postgres-uuid",
        dedupKey: "seat-guide",
        title: "座位预约系统使用说明",
        sourceName: "天津商业大学图书馆",
      },
      { dedupKey: "seat-guide", sourceName: "天津商业大学图书馆" },
    ),
    true,
  );
  assert.equal(
    matchesExpectedSource(
      {
        id: "postgres-uuid",
        dedupKey: "other",
        title: "座位预约系统使用说明",
        sourceName: "天津商业大学图书馆",
      },
      { dedupKey: "seat-guide", sourceName: "天津商业大学图书馆" },
    ),
    false,
  );
});
