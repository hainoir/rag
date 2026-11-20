import assert from "node:assert/strict";

import { getBodyReadStatus } from "../../src/lib/agent/body-read-status.ts";
import { runCampusAgent } from "../../src/lib/agent/orchestrator.ts";
import { buildEmptyResponse } from "../../src/lib/search/normalize-response.ts";
import type { AgentEvent } from "../../src/lib/agent/types.ts";
import type { NoticeDocument, SearchProvider, SearchSource } from "../../src/lib/search/types.ts";

const timestamp = "2026-10-29T00:00:00.000Z";

function source(id: string, type: SearchSource["type"]): SearchSource {
  return {
    id,
    documentId: id,
    title: `${id} 标题`,
    type,
    sourceName: type === "official" ? "图书馆" : "社区",
    publishedAt: null,
    updatedAt: null,
    fetchedAt: timestamp,
    lastVerifiedAt: null,
    snippet: `搜索摘要 ${id}`,
    matchedKeywords: [],
    freshnessLabel: "fresh",
    answerEligible: type === "official",
  };
}

function document(id: string, eligible: boolean): NoticeDocument {
  const body = eligible ? "凭校园卡办理借阅。" : "经验帖正文，不可作答依据。";
  return {
    documentId: id,
    versionNo: 1,
    title: `${id} 标题`,
    type: eligible ? "official" : "community",
    sourceName: eligible ? "图书馆" : "社区",
    publishedAt: null,
    updatedAt: null,
    fetchedAt: timestamp,
    lastVerifiedAt: null,
    answerEligible: eligible,
    body,
    truncated: false,
    bodyCharCount: body.length,
    returnedCharCount: body.length,
  };
}

async function collect(sources: SearchSource[], fetchNotice: SearchProvider["fetchNotice"]) {
  const events: AgentEvent[] = [];
  await runCampusAgent("借阅", {
    emit: (event) => events.push(event),
    search: async () => ({
      ...buildEmptyResponse("借阅"),
      status: "ok" as const,
      sources,
      answer: { summary: "搜索摘要不应作为依据", sourceNote: "", disclaimer: "", confidence: 0.5, evidence: [] },
    }),
    fetchNotice,
  });
  const answer = events.find((event): event is Extract<AgentEvent, { type: "answer" }> => event.type === "answer");
  assert.ok(answer);
  return { events, answer };
}

async function test(name: string, task: () => Promise<void>) {
  try {
    await task();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`, error);
    process.exitCode = 1;
  }
}

await test("supplemental-only successful fetch is unread for answering", async () => {
  const { events, answer } = await collect([source("community", "community")], async () => ({ status: "ok", document: document("community", false) }));
  assert.equal(events.some((event) => event.type === "tool_result" && event.name === "fetch_notice" && event.ok), true);
  assert.equal(answer.fallback, true);
  assert.match(answer.summary, /未读到可用于回答的通知全文/);
  assert.equal(getBodyReadStatus(events), "未读到正文");
});

await test("official failure followed by supplemental success is unread for answering", async () => {
  const { events, answer } = await collect(
    [source("official", "official"), source("community", "community")],
    async (id) => id === "official" ? { status: "not_found", document: null } : { status: "ok", document: document("community", false) },
  );
  assert.deepEqual(
    events.filter((event) => event.type === "tool_result" && event.name === "fetch_notice").map((event) => event.type === "tool_result" && event.ok),
    [false, true],
  );
  assert.equal(answer.fallback, true);
  assert.match(answer.summary, /未读到通知全文/);
  assert.equal(getBodyReadStatus(events), "未读到正文");
});

await test("eligible official success keeps the read label and a grounded answer", async () => {
  const { events, answer } = await collect([source("official", "official")], async () => ({ status: "ok", document: document("official", true) }));
  assert.equal(answer.fallback, undefined);
  assert.equal(answer.summary, "凭校园卡办理借阅。");
  assert.equal(getBodyReadStatus(events), "已读到正文");
});

await test("fallback alone does not erase a successful body read", async () => {
  const { events, answer } = await collect([source("official", "official")], async () => ({ status: "ok", document: document("official", true) }));
  answer.fallback = true;
  assert.equal(getBodyReadStatus(events), "已读到正文");
});
