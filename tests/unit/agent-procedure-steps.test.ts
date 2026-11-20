import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { getBodyReadStatus } from "../../src/lib/agent/body-read-status.ts";
import { runCampusAgent } from "../../src/lib/agent/orchestrator.ts";
import { extractProcedure } from "../../src/lib/agent/procedure-steps.ts";
import { AGENT_NOTICE_BODY_MAX_CHARS } from "../../src/lib/agent/tools/fetch-notice.ts";
import type { AgentEvent } from "../../src/lib/agent/types.ts";
import { buildEmptyResponse } from "../../src/lib/search/normalize-response.ts";
import type { NoticeDocument, SearchSource } from "../../src/lib/search/types.ts";

const timestamp = "2026-10-29T00:00:00.000Z";
const { seedCorpus } = createRequire(import.meta.url)("../../search-service/seed-corpus.cjs") as { seedCorpus: { cleanedMarkdown: string }[] };

function source(id: string, type: SearchSource["type"] = "official"): SearchSource {
  return { id, documentId: id, title: `${id} 通知`, type, sourceName: type === "official" ? "学校" : "社区", publishedAt: null, updatedAt: null, fetchedAt: timestamp, lastVerifiedAt: null, snippet: "搜索片段", matchedKeywords: [], freshnessLabel: "fresh", answerEligible: type === "official" };
}

function document(id: string, body: string, type: NoticeDocument["type"] = "official", eligible = type === "official"): NoticeDocument {
  return { documentId: id, versionNo: 1, title: `${id} 通知`, type, sourceName: type === "official" ? "学校" : "社区", publishedAt: null, updatedAt: null, fetchedAt: timestamp, lastVerifiedAt: null, answerEligible: eligible, body, truncated: false, bodyCharCount: body.length, returnedCharCount: body.length };
}

async function run(sources: SearchSource[], bodies: Record<string, NoticeDocument | null>) {
  const events: AgentEvent[] = [];
  await runCampusAgent("校园手续", {
    emit: (event) => events.push(event),
    search: async () => ({ ...buildEmptyResponse("校园手续"), status: "ok", sources, answer: { summary: "搜索摘要没有出现在正文", sourceNote: "", disclaimer: "", confidence: 0.5 } }),
    fetchNotice: async (id) => bodies[id] ? { status: "ok", document: bodies[id] } : { status: "not_found", document: null },
  });
  const answer = events.find((event): event is Extract<AgentEvent, { type: "answer" }> => event.type === "answer");
  assert.ok(answer);
  return { answer, events };
}

function assertEvidence(items: NonNullable<Extract<AgentEvent, { type: "answer" }>["procedure"]>["steps"], documentId: string) {
  for (const item of items) assert.deepEqual(item.evidence, { documentId, title: `${documentId} 通知` });
}

async function test(name: string, task: () => Promise<void> | void) {
  try { await task(); console.log(`PASS ${name}`); }
  catch (error) { console.error(`FAIL ${name}`, error); process.exitCode = 1; }
}

await test("borrow, repair, and seat lists produce body text with document evidence", async () => {
  const cases = [
    { id: "borrow", body: "演示语料（非真实通知全文）\n# 借阅\n凭校园卡借书。\n办理步骤\n1. 确认图书可借。\n2、凭校园卡办理借阅。\n材料\n- 校园卡或读者码。\n仍需核对原文\n• 核对馆内最新规则。", steps: ["确认图书可借。", "凭校园卡办理借阅。"], material: "校园卡或读者码。", verify: "核对馆内最新规则。" },
    { id: "repair", body: "宿舍报修说明。\n步骤\n(1) 在后勤入口提交工单。\n（2）填写房间号。\n特殊情况\n* 紧急故障按值班室流程处理。", steps: ["在后勤入口提交工单。", "填写房间号。"], exception: "紧急故障按值班室流程处理。" },
    { id: "seat", body: "座位预约说明。\n一、办理步骤\n- 预约座位。\n· 入馆后签到。\n注意事项\n- 超时席位释放。", steps: ["预约座位。", "入馆后签到。"], exception: "超时席位释放。" },
  ];
  for (const item of cases) {
    const { answer, events } = await run([source(item.id)], { [item.id]: document(item.id, item.body) });
    assert.ok(answer.procedure);
    assert.deepEqual(answer.procedure.steps.map((step) => step.text), item.steps);
    assert.equal(answer.procedure.exceptions[0]?.text, item.exception);
    assert.equal(answer.procedure.materials[0]?.text, item.material);
    if (item.verify) assert.equal(answer.procedure.verify[0]?.text, item.verify);
    for (const group of [answer.procedure.steps, answer.procedure.materials, answer.procedure.exceptions, answer.procedure.verify]) assertEvidence(group, item.id);
    assert.equal(answer.summary, item.body.split("\n").find((line) => line.endsWith("说明。") || line === "凭校园卡借书。"));
    assert.equal(answer.demoCorpus, item.id === "borrow" ? true : undefined);
    assert.equal(getBodyReadStatus(events), "已读到正文");
  }
});

await test("leave seed and card lists keep materials separate from exceptions", async () => {
  const body = seedCorpus.find((item) => item.cleanedMarkdown.includes("# 学生请假与离校审批说明"))?.cleanedMarkdown;
  assert.ok(body);
  assert.ok(body.startsWith("演示语料（非真实通知全文）"));
  const leave = extractProcedure({ documents: [document("leave", body)] });
  assert.ok(leave);
  assert.match(leave.materials[0]?.text ?? "", /跨节假日或离津类申请一般需要补充去向/);
  assert.equal(leave.exceptions.length, 0);
  const { answer: seedAnswer } = await run([source("leave")], { leave: document("leave", body) });
  assert.equal(seedAnswer.demoCorpus, true);
  assert.deepEqual(seedAnswer.procedure?.materials, leave.materials);
  const card = extractProcedure({ documents: [document("card", "办理步骤\n1. 确认图书可借。\n材料\n- 校园卡或读者码。\n- 读者码截图。") ] });
  assert.deepEqual(card?.materials.map((item) => item.text), ["校园卡或读者码。", "读者码截图。"]);
  assert.equal(card?.exceptions.length, 0);
});

await test("materials-only and truncated bodies produce procedures without invented steps", () => {
  const materials = extractProcedure({ documents: [document("materials", "所需材料\n- 请假申请表\n- 家长知情书")] });
  assert.deepEqual(materials?.steps, []);
  assert.deepEqual(materials?.materials.map((item) => item.text), ["请假申请表", "家长知情书"]);
  const first = document("first", "办理步骤\n1. 提交申请。");
  const second = { ...document("second", "办理步骤\n1. 被截掉的尾句…[已截断]"), truncated: true };
  const mixed = extractProcedure({ documents: [first, second] });
  assert.deepEqual(mixed?.steps.map((item) => item.text), ["提交申请。"]);
  assertEvidence(mixed?.verify ?? [], "second");
  const crafted = { ...document("crafted", "办理步骤\n1. 在后勤入口提交工单…[已截断]\n特殊情况\n- 紧急故障按值班室流程处理。"), truncated: true };
  const result = extractProcedure({ documents: [crafted] });
  assert.deepEqual(result?.steps, []);
  assert.deepEqual(result?.exceptions.map((item) => item.text), ["紧急故障按值班室流程处理。"]);
  assertEvidence(result?.verify ?? [], "crafted");
  assert.doesNotMatch(JSON.stringify(result), /在后勤入口提交工单/);
  const onlyCut = extractProcedure({ documents: [{ ...document("only", "办理步骤\n1. 截断步骤…[已截断]"), truncated: true }] });
  assert.deepEqual(onlyCut?.steps, []);
  assertEvidence(onlyCut?.verify ?? [], "only");
  const cutContinuation = extractProcedure({ documents: [document("continued", "办理步骤\n1. 提交申请。\n   后续证明…[已截断]")] });
  assert.deepEqual(cutContinuation?.steps.map((item) => item.text), ["提交申请。"]);
  assertEvidence(cutContinuation?.verify ?? [], "continued");
});

await test("headings end previous buckets and wrapped items keep their continuation", () => {
  const body = "本通知说明请假审批。\n## 适用对象\n- 本科生\n- 研究生\n## 办理步骤\n1. 提交请假申请。\n## 联系方式\n- 电话：12345";
  assert.deepEqual(extractProcedure({ documents: [document("heading", body)] })?.steps.map((item) => item.text), ["提交请假申请。"]);
  assert.deepEqual(extractProcedure({ documents: [document("bare", "办理步骤\n1. 提交申请。\n联系方式\n- 电话：12345")] })?.steps.map((item) => item.text), ["提交申请。"]);
  const switched = extractProcedure({ documents: [document("switch", "材料\n- 请假申请表\n## 办理流程\n1. 提交请假申请。")] });
  assert.deepEqual(switched?.materials.map((item) => item.text), ["请假申请表"]);
  assert.deepEqual(switched?.steps.map((item) => item.text), ["提交请假申请。"]);
  const wrapped = extractProcedure({ documents: [document("wrapped", "操作步骤\n1. 提交请假申请，\n   并上传辅导员签字的证明。\n2. 等待学院审批。") ] });
  assert.deepEqual(wrapped?.steps.map((item) => item.text), ["提交请假申请， 并上传辅导员签字的证明。", "等待学院审批。"]);
});

await test("truncation keeps complete prefix items and asks to check the original", async () => {
  const body = `办理步骤\n1. 已保留的第一步。\n2. 已保留的第二步。\n${"填".repeat(AGENT_NOTICE_BODY_MAX_CHARS)}\n3. 被截掉的后续步骤。`;
  const { answer } = await run([source("long")], { long: document("long", body) });
  assert.ok(answer.procedure);
  assert.deepEqual(answer.procedure.steps.map((item) => item.text), ["已保留的第一步。", "已保留的第二步。"]);
  assert.match(answer.procedure.verify[0]?.text ?? "", /已截断.*核对原文/);
  assertEvidence(answer.procedure.verify as typeof answer.procedure.steps, "long");
  assert.doesNotMatch(JSON.stringify(answer.procedure), /被截掉的后续步骤/);
});

await test("successful community fetch never supplies a procedure item", async () => {
  const official = document("official", "办理步骤\n1. 填写官方申请。\n特殊情况\n- 附上校园卡。\n");
  const community = document("community", "办理步骤\n1. 找舍友代办。\n2. 上传工单截图。", "community");
  const mixed = await run([source("official"), source("community", "community")], { official, community });
  assert.ok(mixed.answer.procedure);
  assertEvidence(mixed.answer.procedure.steps, "official");
  assertEvidence(mixed.answer.procedure.exceptions as typeof mixed.answer.procedure.steps, "official");
  assert.doesNotMatch(JSON.stringify(mixed.answer.procedure), /找舍友|工单截图|community/);
  const onlyCommunity = await run([source("community", "community")], { community });
  assert.equal(onlyCommunity.answer.procedure, undefined);
  assert.equal(onlyCommunity.answer.fallback, true);
  assert.match(onlyCommunity.answer.summary, /未读到可用于回答的通知全文/);
  assert.equal(getBodyReadStatus(onlyCommunity.events), "未读到正文");
});

await test("extractor independently rejects supplemental and ineligible documents", () => {
  const body = "办理步骤\n1. 不可使用的步骤。";
  const supplemental = { ...document("supplemental", body), governanceStatus: "supplemental" as const };
  const ineligible = document("ineligible", body, "official", false);
  const community = document("community", body, "community", true);
  assert.equal(extractProcedure({ documents: [supplemental, ineligible, community] }), undefined);
});

await test("prose-only official body retains grounded summary and omits procedure", async () => {
  const { answer } = await run([source("prose")], { prose: document("prose", "凭校园卡办理借阅。") });
  assert.equal(answer.summary, "凭校园卡办理借阅。");
  assert.equal(answer.procedure, undefined);
  assert.equal(answer.fallback, undefined);
});

await test("unheaded list items default to steps", async () => {
  const { answer } = await run([source("unheaded")], { unheaded: document("unheaded", "办理说明。\n- 提交申请。\n* 查看审核结果。") });
  assert.deepEqual(answer.procedure?.steps.map((item) => item.text), ["提交申请。", "查看审核结果。"]);
  assertEvidence(answer.procedure!.steps, "unheaded");
});

await test("missing body keeps unread fallback and omits procedure", async () => {
  const { answer, events } = await run([source("missing")], { missing: null });
  assert.match(answer.summary, /未读到通知全文/);
  assert.equal(answer.fallback, true);
  assert.equal(answer.procedure, undefined);
  assert.equal(getBodyReadStatus(events), "未读到正文");
  assert.equal(answer.demoCorpus, undefined);
});
