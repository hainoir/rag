import assert from "node:assert/strict";

import { exportCitations } from "../../src/lib/agent/tools/export-citations.ts";
import type { NoticeDocument, SearchSource } from "../../src/lib/search/types.ts";

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
  documentId: "notice-1",
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

test("documents branch keeps only official answer-eligible bodies", () => {
  const official: NoticeDocument = {
    documentId: "official-1",
    versionNo: 1,
    title: "报修办法",
    type: "official",
    sourceName: "后勤处",
    publishedAt: null,
    updatedAt: null,
    fetchedAt: "2026-10-29T00:00:00.000Z",
    lastVerifiedAt: null,
    answerEligible: true,
    body: "官方正文：登录后提交报修。",
    truncated: false,
    bodyCharCount: 13,
    returnedCharCount: 13,
  };
  const approvedCommunity: NoticeDocument = {
    ...official,
    documentId: "community-approved-1",
    title: "宿舍报修经验",
    type: "community",
    sourceName: "校园论坛",
    governanceStatus: "approved",
    body: "社区经验：找舍友帮忙即可报修。",
    bodyCharCount: 15,
    returnedCharCount: 15,
  };
  const supplementalOfficial: NoticeDocument = {
    ...official,
    documentId: "supp-1",
    title: "补充口径",
    governanceStatus: "supplemental",
    body: "补充材料：内部口径。",
    bodyCharCount: 10,
    returnedCharCount: 10,
  };
  const officialSource: SearchSource = { ...source, id: "chunk-official", documentId: "official-1", title: "报修办法", sourceName: "后勤处" };
  const communitySource: SearchSource = { ...source, id: "chunk-community", documentId: "community-approved-1", title: "宿舍报修经验", type: "community", sourceName: "校园论坛" };
  const supplementalSource: SearchSource = { ...source, id: "chunk-supp", documentId: "supp-1", title: "补充口径" };

  const mixed = exportCitations([officialSource, communitySource, supplementalSource], [], [official, approvedCommunity, supplementalOfficial]);
  assert.deepEqual(mixed.citations.map((citation) => citation.documentId), ["official-1"]);
  assert.match(mixed.text, /官方正文：登录后提交报修。/);
  assert.doesNotMatch(mixed.text, /找舍友|内部口径/);

  const onlyCommunity = exportCitations([communitySource], [], [approvedCommunity]);
  assert.deepEqual(onlyCommunity, { text: "", citations: [] });
});
