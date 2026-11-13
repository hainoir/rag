import assert from "node:assert/strict";

import { runCampusAgent } from "../../src/lib/agent/orchestrator.ts";
import { exportCitations } from "../../src/lib/agent/tools/export-citations.ts";
import { toolRegistry } from "../../src/lib/agent/tools/registry.ts";
import { AGENT_NOTICE_BODY_MAX_CHARS, AGENT_NOTICE_BODY_TOTAL_CHARS, capNoticeBody, fetchNoticeTool } from "../../src/lib/agent/tools/fetch-notice.ts";
import type { AgentEvent } from "../../src/lib/agent/types.ts";
import { buildEmptyResponse, buildErrorResponse } from "../../src/lib/search/normalize-response.ts";
import type { NoticeDocument, SearchProvider, SearchSource } from "../../src/lib/search/types.ts";

const timestamp = "2026-10-29T00:00:00.000Z";
function source(id: string, documentId?: string, type: SearchSource["type"] = "official"): SearchSource {
  return { id, ...(documentId ? { documentId } : {}), title: `${id} 标题`, type, sourceName: type === "official" ? "图书馆" : "社区", publishedAt: null, updatedAt: null, fetchedAt: timestamp, lastVerifiedAt: null, snippet: `搜索摘要 ${id}`, matchedKeywords: [], freshnessLabel: "fresh", answerEligible: type === "official" };
}
function document(id: string, body: string, eligible = true, truncated = false): NoticeDocument {
  return { documentId: id, versionNo: 1, title: `${id} 标题`, type: eligible ? "official" : "community", sourceName: eligible ? "图书馆" : "社区", publishedAt: null, updatedAt: null, fetchedAt: timestamp, lastVerifiedAt: null, answerEligible: eligible, body, truncated, bodyCharCount: body.length, returnedCharCount: body.length };
}
function searchResponse(sources: SearchSource[], summary = "搜索摘要没有出现在正文中。") {
  return { ...buildEmptyResponse("借阅"), status: "ok" as const, sources, answer: { summary, sourceNote: "", disclaimer: "", confidence: 0.5, evidence: sources.map((item) => ({ sourceId: item.id, title: item.title, snippet: item.snippet })) } };
}
async function run(sources: SearchSource[], fetchNotice?: SearchProvider["fetchNotice"], summary?: string) {
  const events: AgentEvent[] = [];
  await runCampusAgent(" 借阅 ", { emit: (event) => events.push(event), requestId: "r1", search: async () => searchResponse(sources, summary), fetchNotice });
  const answer = events.find((event) => event.type === "answer");
  assert.equal(answer?.type, "answer");
  if (answer?.type !== "answer") throw new Error("answer missing");
  return { events, answer };
}
function calls(events: AgentEvent[], name: string) { return events.filter((event) => event.type === "tool_call" && event.name === name); }
function exportResult(events: AgentEvent[]) { return events.find((event): event is Extract<AgentEvent, { type: "tool_result" }> => event.type === "tool_result" && event.name === "export_citations"); }

async function test(name: string, task: () => Promise<void> | void) {
  try { await task(); console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name}`, error); process.exitCode = 1; }
}

await test("registers fetch_notice and keeps deterministic event order", async () => {
  assert.deepEqual(Object.keys(toolRegistry).sort(), ["export_citations", "fetch_notice", "search_notices"]);
  const { events, answer } = await run([source("chunk", "doc")], async (id, options) => {
    assert.equal(id, "doc"); assert.equal(options?.requestId, "r1");
    return { status: "ok", document: document("doc", "凭校园卡借阅。") };
  });
  assert.deepEqual(events.filter((event) => event.type === "tool_call").map((event) => event.name), ["search_notices", "fetch_notice", "export_citations"]);
  assert.equal(answer.summary, "凭校园卡借阅。");
  assert.deepEqual(answer.citations[0], { sourceId: "chunk", documentId: "doc", title: "doc 标题", sourceName: "图书馆", snippet: "凭校园卡借阅。" });
  assert.deepEqual(answer.evidence, [{ sourceId: "chunk", title: "doc 标题", sourceName: "图书馆", snippet: "凭校园卡借阅。" }]);
  const expected = exportCitations([source("chunk", "doc")], [], [document("doc", "凭校园卡借阅。")]);
  assert.deepEqual(exportResult(events), { type: "tool_result", id: "export-2", name: "export_citations", ok: true, summary: expected.text });
  assert.match(expected.text, /依据：凭校园卡借阅。/);
  assert.doesNotMatch(expected.text, /已导出|搜索摘要/);
  assert.equal(answer.fallback, undefined);
  assert.deepEqual(events.at(-1), { type: "phase", phase: "done" });
});

await test("missing documentId never fetches the chunk id and says full text was not read", async () => {
  const { events, answer } = await run([source("chunk-only")]);
  assert.equal(calls(events, "fetch_notice").length, 0);
  assert.equal(answer.citations.length, 0);
  assert.deepEqual(answer.evidence, []);
  assert.equal(answer.fallback, true);
  assert.match(answer.summary, /未读到通知全文/);
  assert.doesNotMatch(answer.summary, /搜索摘要/);
  assert.equal(exportResult(events)?.type, "tool_result");
  assert.equal(exportResult(events)?.ok, false);
  assert.doesNotMatch(JSON.stringify(exportResult(events)), /搜索摘要|依据：|已导出/);
});

await test("deduplicates document IDs and limits fetches to three, eligible first", async () => {
  const seen: string[] = [];
  const sources = [source("community", "c", "community"), source("a1", "a"), source("a2", "a"), source("b", "b"), source("d", "d"), source("e", "e")];
  const { answer } = await run(sources, async (id) => { seen.push(id); return { status: "ok", document: document(id, `正文 ${id}`) }; });
  assert.deepEqual(seen, ["a", "b", "d"]);
  assert.equal(answer.citations.length, 3);
  assert.equal(answer.citations[0].sourceId, "a1");
});

await test("6000 per document and 12000 total preserve truncation marks and flags", async () => {
  const long = document("a", "甲".repeat(9000));
  const capped = capNoticeBody(long, AGENT_NOTICE_BODY_MAX_CHARS);
  assert.equal(capped.body.length, 6000);
  assert.equal(capped.truncated, true);
  assert.ok(capped.body.endsWith("…[已截断]"));
  assert.equal(capped.bodyCharCount, 9000);
  const serviceTruncated = document("b", "乙".repeat(100), true, true);
  assert.equal((await fetchNoticeTool("b", async () => ({ status: "ok", document: serviceTruncated }))).document?.truncated, true);
  const twiceTruncated = document("b", "乙".repeat(9000), true, true);
  const twiceResult = await fetchNoticeTool("b", async () => ({ status: "ok", document: twiceTruncated }));
  assert.equal(twiceResult.document?.body.length, 6000);
  assert.equal(twiceResult.document?.truncated, true);
  const bodies = ["甲".repeat(9000), "乙".repeat(9000), "丙".repeat(9000)];
  const { answer } = await run([source("a", "a"), source("b", "b"), source("c", "c")], async (id) => ({ status: "ok", document: document(id, bodies[["a", "b", "c"].indexOf(id)]) }));
  assert.equal(AGENT_NOTICE_BODY_TOTAL_CHARS, 12000);
  assert.equal(answer.citations.length, 2);
  assert.ok(answer.citations.every((citation) => citation.snippet && !citation.snippet.includes("搜索摘要")));
  const withRemainder = await run([source("a", "a"), source("b", "b"), source("c", "c")], async (id) => ({ status: "ok", document: document(id, id === "a" ? "甲".repeat(5000) : "乙".repeat(9000)) }));
  assert.equal(withRemainder.answer.citations.length, 3);
  assert.match(withRemainder.answer.summary, /乙/);
});

await test("SSE events and tool results carry bounded excerpts, never the whole fetched body", async () => {
  const fullBody = "private-body-marker-".repeat(800);
  const { events } = await run([source("a", "a")], async () => ({ status: "ok", document: document("a", fullBody) }));
  const serialized = JSON.stringify(events);
  assert.ok(serialized.length < 2000);
  assert.equal(serialized.includes(fullBody), false);
  assert.equal(events.some((event) => event.type === "tool_result" && event.name === "fetch_notice" && event.summary.includes("private-body-marker")), false);
});

await test("search answer is used only when it occurs in an eligible fetched body", async () => {
  const exact = await run([source("a", "a")], async () => ({ status: "ok", document: document("a", "标题\n\n原文写明凭校园卡办理。") }), "原文写明凭校园卡办理。");
  assert.equal(exact.answer.summary, "原文写明凭校园卡办理。");
  const absent = await run([source("a", "a")], async () => ({ status: "ok", document: document("a", "原文仅写明到图书馆办理。") }), "凭身份证办理。");
  assert.equal(absent.answer.summary, "原文仅写明到图书馆办理。");
});

await test("partial fetch failure keeps its event and cites only the successful body", async () => {
  const { events, answer } = await run([source("bad-chunk", "bad"), source("good-chunk", "good")], async (id) => id === "bad" ? { status: "not_found", document: null } : { status: "ok", document: document("good", "正文只来自成功文档。") });
  assert.equal(events.some((event) => event.type === "tool_result" && event.name === "fetch_notice" && !event.ok && /not_found/.test(event.summary)), true);
  assert.equal(answer.summary, "正文只来自成功文档。");
  assert.deepEqual(answer.citations.map((citation) => citation.documentId), ["good"]);
});

await test("all fetches failed degrades without claiming original text was read", async () => {
  const { events, answer } = await run([source("a", "a"), source("b", "b")], async () => ({ status: "error", document: null }));
  assert.equal(calls(events, "fetch_notice").length, 2);
  assert.equal(answer.fallback, true);
  assert.equal(answer.citations.length, 0);
  assert.match(answer.summary, /未读到通知全文/);
  const exported = exportResult(events);
  assert.equal(exported?.type, "tool_result");
  if (exported?.type !== "tool_result") throw new Error("export result missing");
  assert.equal(exported.ok, false);
  assert.doesNotMatch(exported.summary, /搜索摘要|依据：|已导出/);
});

await test("supplemental body and search answer do not become evidence", async () => {
  const { events, answer } = await run([source("official", "official"), source("community", "community", "community")], async (id) => ({ status: "ok", document: document(id, id === "official" ? "官方正文：登录后提交报修。" : "社区经验：找舍友帮忙。", id === "official") }), "社区经验：找舍友帮忙。");
  assert.equal(events.filter((event) => event.type === "tool_result" && event.name === "fetch_notice" && event.ok).length, 2);
  assert.equal(answer.summary, "官方正文：登录后提交报修。");
  assert.equal(answer.citations.length, 1);
  assert.equal(answer.citations[0].documentId, "official");
  assert.doesNotMatch(JSON.stringify(answer), /找舍友/);
  const onlyCommunity = await run([source("community", "community", "community")], async () => ({ status: "ok", document: document("community", "经验帖", false) }));
  assert.equal(onlyCommunity.answer.citations.length, 0);
  assert.doesNotMatch(onlyCommunity.answer.summary, /经验帖|community 标题/);
  const exported = exportResult(onlyCommunity.events);
  assert.equal(exported?.type, "tool_result");
  if (exported?.type !== "tool_result") throw new Error("export result missing");
  assert.equal(exported.ok, false);
  assert.doesNotMatch(exported.summary, /经验帖|搜索摘要|依据：|已导出/);
});

await test("mock search without mock fetch never uses the real provider", async () => {
  const { answer, events } = await run([source("chunk", "doc")]);
  assert.equal(answer.fallback, true);
  assert.equal(events.some((event) => event.type === "tool_result" && event.name === "fetch_notice" && !event.ok), true);
});

await test("search errors and empty searches still finish", async () => {
  for (const search of [async () => { throw new Error("network"); }, async () => buildErrorResponse("借阅", { errorCode: "upstream_unavailable" }), async () => buildEmptyResponse("借阅")]) {
    const events: AgentEvent[] = [];
    await runCampusAgent("借阅", { emit: (event) => events.push(event), search });
    assert.equal(calls(events, "fetch_notice").length, 0);
    assert.equal(events.some((event) => event.type === "answer" && !!event.summary), true);
    assert.deepEqual(events.at(-1), { type: "phase", phase: "done" });
  }
});
