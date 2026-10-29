import assert from "node:assert/strict";

import { runCampusAgent } from "../../src/lib/agent/orchestrator.ts";
import { encodeAgentDone, encodeAgentEvent } from "../../src/lib/agent/sse.ts";
import { toolRegistry } from "../../src/lib/agent/tools/registry.ts";
import type { AgentEvent } from "../../src/lib/agent/types.ts";
import { buildEmptyResponse, buildErrorResponse } from "../../src/lib/search/normalize-response.ts";
import type { SearchSource } from "../../src/lib/search/types.ts";

function test(name: string, task: () => Promise<void> | void) {
  Promise.resolve().then(task).then(
    () => console.log(`PASS ${name}`),
    (error) => {
      console.error(`FAIL ${name}`, error);
      process.exitCode = 1;
    },
  );
}

const source: SearchSource = {
  id: "notice-1",
  title: "图书馆借阅规则",
  type: "official",
  sourceName: "图书馆",
  publishedAt: null,
  updatedAt: null,
  fetchedAt: "2026-10-29T00:00:00.000Z",
  lastVerifiedAt: null,
  snippet: "凭校园卡借阅。",
  matchedKeywords: ["借阅"],
  url: "https://campus.test/library",
  freshnessLabel: "fresh",
};

test("registry exposes both tools with descriptions", () => {
  assert.deepEqual(Object.keys(toolRegistry).sort(), ["export_citations", "search_notices"]);
  assert.ok(toolRegistry.search_notices.description);
  assert.ok(toolRegistry.export_citations.description);
});

test("runs search then citation export and emits a cited answer", async () => {
  const events: AgentEvent[] = [];
  await runCampusAgent(" 借阅 ", {
    emit: (event) => events.push(event),
    search: async (query) => {
      assert.equal(query, "借阅");
      return {
        ...buildEmptyResponse(query),
        status: "ok",
        sources: [source],
        answer: {
          summary: "借书请带校园卡。",
          sourceNote: "图书馆公告",
          disclaimer: "请核对原文",
          confidence: 0.9,
          evidence: [{ sourceId: source.id, title: source.title, snippet: "凭校园卡借阅。" }],
        },
      };
    },
  });

  assert.deepEqual(events.filter((event) => event.type === "tool_call").map((event) => event.name), ["search_notices", "export_citations"]);
  const answer = events.find((event) => event.type === "answer");
  assert.equal(answer?.type, "answer");
  if (answer?.type === "answer") {
    assert.equal(answer.summary, "借书请带校园卡。");
    assert.equal(answer.citations[0].url, source.url);
    assert.equal(answer.fallback, undefined);
  }
  assert.deepEqual(events.at(-1), { type: "phase", phase: "done" });
});

test("uses an explicit fallback when search returns an error response", async () => {
  const events: AgentEvent[] = [];
  await runCampusAgent("借阅", {
    emit: (event) => events.push(event),
    search: async () => buildErrorResponse("借阅", { requestId: "r1", errorCode: "upstream_unavailable" }),
  });

  assert.equal(events.some((event) => event.type === "error" && event.code === "upstream_unavailable"), true);
  assert.equal(events.some((event) => event.type === "phase" && event.phase === "fallback"), true);
  assert.equal(events.some((event) => event.type === "tool_call" && event.name === "export_citations"), false);
  const answer = events.find((event) => event.type === "answer");
  assert.equal(answer?.type === "answer" && answer.fallback, true);
  assert.deepEqual(events.at(-1), { type: "phase", phase: "done" });
});

test("builds an answer from citations when search has sources but no summary", async () => {
  const events: AgentEvent[] = [];
  await runCampusAgent("借阅", {
    emit: (event) => events.push(event),
    search: async () => ({ ...buildEmptyResponse("借阅"), status: "partial", sources: [source] }),
  });

  const answer = events.find((event) => event.type === "answer");
  assert.equal(answer?.type, "answer");
  if (answer?.type === "answer") {
    assert.match(answer.summary, /图书馆借阅规则/);
    assert.equal(answer.citations.length, 1);
  }
});

test("finishes with a useful answer when search throws or has no sources", async () => {
  for (const search of [
    async () => { throw new Error("network failed"); },
    async () => buildEmptyResponse("借阅"),
  ]) {
    const events: AgentEvent[] = [];
    await runCampusAgent("借阅", { emit: (event) => events.push(event), search });
    assert.equal(events.some((event) => event.type === "answer" && event.summary.length > 0), true);
    assert.deepEqual(events.at(-1), { type: "phase", phase: "done" });
  }
});

test("SSE encoder emits JSON events and a terminal marker", () => {
  const event: AgentEvent = { type: "phase", phase: "received" };
  assert.equal(encodeAgentEvent(event), `data: ${JSON.stringify(event)}\n\n`);
  assert.equal(encodeAgentDone(), "data: [DONE]\n\n");
});
