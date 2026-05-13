import assert from "node:assert/strict";

import {
  buildSearchQueryLogPayload,
  parseSearchQueryLogPayload,
  type SearchQueryLogPayload,
} from "../../src/lib/search/query-log.ts";
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

const sampleResponse: SearchResponse = {
  query: "图书馆借书",
  status: "ok",
  answer: {
    summary: "可以按图书馆借阅规则办理。",
    sourceNote: "当前结论主要基于官方来源整理。",
    disclaimer: "以原文为准。",
    confidence: 0.82,
    evidence: [],
  },
  sources: [
    {
      id: "official-1",
      title: "图书馆借阅说明",
      type: "official",
      sourceName: "图书馆",
      publishedAt: null,
      updatedAt: null,
      fetchedAt: "2026-05-13T00:00:00.000Z",
      lastVerifiedAt: null,
      snippet: "官方借阅规则",
      matchedKeywords: ["图书馆", "借书"],
      freshnessLabel: "fresh",
    },
    {
      id: "community-1",
      title: "借书经验",
      type: "community",
      sourceName: "贴吧",
      publishedAt: null,
      updatedAt: null,
      fetchedAt: "2026-05-13T00:00:00.000Z",
      lastVerifiedAt: null,
      snippet: "同学经验",
      matchedKeywords: ["借书"],
      freshnessLabel: "recent",
    },
  ],
  relatedQuestions: [],
  retrievedCount: 8,
  resultGeneratedAt: "2026-05-13T00:00:00.000Z",
  meta: {
    requestId: "req-1",
    cacheStatus: "miss",
    durationMs: 320,
  },
};

test("builds query log payload from search responses", () => {
  const payload = buildSearchQueryLogPayload({
    requestId: "req-1",
    query: "  图书馆借书  ",
    response: sampleResponse,
    clientId: "127.0.0.1",
    gatewayEvent: "search_response",
  });

  assert.deepEqual(payload, {
    requestId: "req-1",
    query: "图书馆借书",
    status: "ok",
    retrievedCount: 8,
    sourceCount: 2,
    officialSourceCount: 1,
    communitySourceCount: 1,
    cacheStatus: "miss",
    durationMs: 320,
    clientId: "127.0.0.1",
    gatewayEvent: "search_response",
    sourceIds: ["official-1", "community-1"],
    sourceSnapshot: [
      {
        id: "official-1",
        title: "图书馆借阅说明",
        type: "official",
        sourceName: "图书馆",
      },
      {
        id: "community-1",
        title: "借书经验",
        type: "community",
        sourceName: "贴吧",
      },
    ],
    answerSummary: "可以按图书馆借阅规则办理。",
    answerConfidence: 0.82,
    resultGeneratedAt: "2026-05-13T00:00:00.000Z",
  } satisfies SearchQueryLogPayload);
});

test("parses valid query log payloads", () => {
  const parsed = parseSearchQueryLogPayload({
    requestId: "req-2",
    query: "  宿舍报修流程  ",
    status: "partial",
    retrievedCount: 3,
    sourceCount: 2,
    officialSourceCount: 2,
    communitySourceCount: 0,
    cacheStatus: "hit",
    errorCode: "upstream_timeout",
    durationMs: 240,
    gatewayEvent: "search_response",
    sourceIds: ["source-1"],
    sourceSnapshot: [{ id: "source-1", title: "宿舍报修", type: "official", sourceName: "后勤处" }],
    answerSummary: "报修流程摘要",
    answerConfidence: 0.73,
    resultGeneratedAt: "2026-05-13T01:00:00.000Z",
  });

  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.payload, {
    requestId: "req-2",
    query: "宿舍报修流程",
    status: "partial",
    retrievedCount: 3,
    sourceCount: 2,
    officialSourceCount: 2,
    communitySourceCount: 0,
    cacheStatus: "hit",
    errorCode: "upstream_timeout",
    durationMs: 240,
    gatewayEvent: "search_response",
    sourceIds: ["source-1"],
    sourceSnapshot: [{ id: "source-1", title: "宿舍报修", type: "official", sourceName: "后勤处" }],
    answerSummary: "报修流程摘要",
    answerConfidence: 0.73,
    resultGeneratedAt: "2026-05-13T01:00:00.000Z",
  });
});

test("rejects invalid query log payload counts", () => {
  const parsed = parseSearchQueryLogPayload({
    requestId: "req-3",
    query: "社团纳新",
    status: "ok",
    retrievedCount: 2,
    sourceCount: 1,
    officialSourceCount: 1,
    communitySourceCount: 1,
    cacheStatus: "bypass",
    gatewayEvent: "gateway_error",
  });

  assert.equal(parsed.ok, false);
  assert.equal(parsed.error, "officialSourceCount and communitySourceCount cannot exceed sourceCount.");
});
