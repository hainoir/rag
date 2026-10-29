import assert from "node:assert/strict";

import { exportCitations } from "../../src/lib/agent/tools/export-citations.ts";
import type { SearchSource } from "../../src/lib/search/types.ts";

function test(name: string, task: () => void) {
  try {
    task();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`, error);
    process.exitCode = 1;
  }
}

const source: SearchSource = {
  id: "notice-1",
  title: "借阅规则",
  type: "official",
  sourceName: "图书馆",
  publishedAt: null,
  updatedAt: null,
  fetchedAt: "2026-10-29T00:00:00.000Z",
  lastVerifiedAt: null,
  snippet: "原始摘要",
  matchedKeywords: [],
  url: "https://campus.test/old",
  canonicalUrl: "https://campus.test/library",
  freshnessLabel: "fresh",
};

test("formats copyable citations from sources and matching evidence", () => {
  const sources = [source];
  const result = exportCitations(sources, [
    { sourceId: "notice-1", title: "借阅规则", snippet: "请携带校园卡" },
    { sourceId: "other", title: "不匹配", snippet: "不应显示" },
  ]);

  assert.deepEqual(result.citations, [{
    sourceId: "notice-1",
    title: "借阅规则",
    sourceName: "图书馆",
    url: "https://campus.test/library",
    snippet: "请携带校园卡",
  }]);
  assert.equal(result.text, "[1] 借阅规则 — 图书馆\nhttps://campus.test/library\n依据：请携带校园卡");
  assert.equal(sources[0].snippet, "原始摘要");
});

test("handles sources without evidence and empty sources", () => {
  assert.match(exportCitations([source]).text, /原始摘要/);
  assert.deepEqual(exportCitations([]), { text: "", citations: [] });
});

test("keeps the first evidence hit and falls back through blank urls", () => {
  const withBlankCanonical = { ...source, canonicalUrl: "", url: "https://campus.test/from-url" };
  const result = exportCitations([withBlankCanonical], [
    { sourceId: "notice-1", title: "借阅规则", snippet: "" },
    { sourceId: "notice-1", title: "借阅规则", snippet: "第二条不应覆盖" },
  ]);

  assert.equal(result.citations[0]?.url, "https://campus.test/from-url");
  assert.equal(result.citations[0]?.snippet, "原始摘要");
});
