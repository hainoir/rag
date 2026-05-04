import assert from "node:assert/strict";

import {
  buildEmptyResponse,
  buildErrorResponse,
  normalizeUpstreamResponse,
} from "../../src/lib/search/normalize-response.ts";

const generatedAt = "2026-05-04T08:00:00.000Z";

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

test("normalizes legacy aliases and freshness by timestamp priority", () => {
  const response = normalizeUpstreamResponse("借书", {
    generatedAt,
    state: "ok",
    totalHits: 3,
    suggestions: ["续借规则"],
    results: [
      {
        documentId: "doc-1",
        sourceTitle: "图书馆借阅规则",
        origin: "authority",
        publisher: "天津商业大学图书馆",
        link: "https://lib.tjcu.edu.cn/info/1.htm",
        published_at: "2026-05-01T00:00:00.000Z",
        updated_at: "2026-05-03T00:00:00.000Z",
        crawled_at: "2026-05-04T00:00:00.000Z",
        verifiedAt: "2026-05-04T07:00:00.000Z",
        excerpt: "凭校园卡办理借阅。",
        matched_terms: ["借书"],
        trust_score: 96,
      },
    ],
    answer: {
      text: "图书馆借阅需要凭校园卡办理。",
      citations: [
        {
          source_id: "doc-1",
          title: "图书馆借阅规则",
          source_name: "天津商业大学图书馆",
          excerpt: "凭校园卡办理借阅。",
        },
      ],
      score: 0.82,
    },
  });

  assert.equal(response.status, "ok");
  assert.equal(response.retrievedCount, 3);
  assert.equal(response.relatedQuestions[0], "续借规则");
  assert.equal(response.sources[0].id, "doc-1");
  assert.equal(response.sources[0].type, "official");
  assert.equal(response.sources[0].sourceName, "天津商业大学图书馆");
  assert.equal(response.sources[0].updatedAt, "2026-05-03T00:00:00.000Z");
  assert.equal(response.sources[0].lastVerifiedAt, "2026-05-04T07:00:00.000Z");
  assert.equal(response.sources[0].freshnessLabel, "fresh");
  assert.equal(response.sources[0].trustScore, 0.96);
  assert.equal(response.answer?.evidence?.[0].sourceId, "doc-1");
});

test("builds partial answers when upstream returns sources without answer", () => {
  const response = normalizeUpstreamResponse("报修", {
    resultGeneratedAt: generatedAt,
    status: "ok",
    sources: [
      {
        id: "repair-1",
        title: "宿舍报修流程",
        type: "official",
        sourceName: "后勤处",
        fetchedAt: "2026-04-20T00:00:00.000Z",
        snippet: "学生可在后勤平台提交宿舍报修申请。",
      },
    ],
  });

  assert.equal(response.status, "partial");
  assert.match(response.answer?.summary ?? "", /宿舍报修申请/);
  assert.equal(response.answer?.evidence?.[0].sourceId, "repair-1");
});

test("preserves empty and error states without fabricated answers", () => {
  const empty = normalizeUpstreamResponse("不存在的问题", {
    resultGeneratedAt: generatedAt,
    status: "empty",
    sources: [],
    answer: "不应该保留",
  });
  const error = normalizeUpstreamResponse("失败问题", null);

  assert.equal(empty.status, "empty");
  assert.equal(empty.answer, null);
  assert.equal(empty.sources.length, 0);
  assert.equal(error.status, "error");
  assert.equal(error.answer, null);
  assert.equal(error.sources.length, 0);
});

test("creates explicit fallback responses", () => {
  assert.equal(buildEmptyResponse("").status, "empty");
  assert.equal(buildErrorResponse("图书馆").status, "error");
});

test("unwraps nested data payloads and falls back from invalid timestamps", () => {
  const response = normalizeUpstreamResponse("校历", {
    data: {
      timestamp: generatedAt,
      state: "ok",
      matches: [
        {
          chunkId: "chunk-1",
          name: "校历安排",
          channel: "community",
          href: "https://example.test/calendar",
          date: "not-a-date",
          indexedAt: "bad-date",
          body: "校历以教务处通知为准。",
        },
      ],
      summary: "校历信息需要以教务处通知为准。",
    },
  });

  assert.equal(response.status, "ok");
  assert.equal(response.sources[0].id, "chunk-1");
  assert.equal(response.sources[0].publishedAt, null);
  assert.equal(response.sources[0].fetchedAt, generatedAt);
  assert.equal(response.sources[0].freshnessLabel, "fresh");
});

test("keeps explicit freshness labels and clamps percentage confidence", () => {
  const response = normalizeUpstreamResponse("招生", {
    resultGeneratedAt: generatedAt,
    status: "ok",
    sources: [
      {
        id: "admission-1",
        title: "招生章程",
        type: "official",
        sourceName: "本科招生网",
        fetchedAt: "2025-01-01T00:00:00.000Z",
        freshness_label: "stale",
        snippet: "招生章程以官方发布为准。",
      },
    ],
    answer: {
      summary: "查看招生章程。",
      confidence: 87,
    },
  });

  assert.equal(response.sources[0].freshnessLabel, "stale");
  assert.equal(response.answer?.confidence, 0.87);
});

test("normalizes invalid statuses based on available sources and answer", () => {
  const response = normalizeUpstreamResponse("宿舍", {
    resultGeneratedAt: generatedAt,
    status: "complete",
    sources: [
      {
        id: "dorm-1",
        title: "宿舍报修",
        type: "official",
        sourceName: "后勤处",
        fetchedAt: generatedAt,
        snippet: "宿舍报修通过后勤平台提交。",
      },
    ],
    answer: "宿舍报修通过后勤平台提交。",
  });

  assert.equal(response.status, "ok");
  assert.equal(response.answer?.evidence?.[0].sourceId, "dorm-1");
});

test("falls back to source evidence when provided evidence is malformed", () => {
  const response = normalizeUpstreamResponse("就业", {
    resultGeneratedAt: generatedAt,
    status: "ok",
    sources: [
      {
        id: "career-1",
        title: "就业手续",
        type: "official",
        sourceName: "就业信息网",
        fetchedAt: generatedAt,
        snippet: "就业手续以就业信息网说明为准。",
      },
    ],
    answer: {
      summary: "就业手续以就业信息网说明为准。",
      evidence: [{ sourceId: "", title: "" }],
    },
  });

  assert.equal(response.answer?.evidence?.[0].sourceId, "career-1");
});
