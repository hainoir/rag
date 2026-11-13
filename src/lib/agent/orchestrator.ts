import type { NoticeDocument, SearchProvider, SearchSource } from "../search/types.ts";
import { toolRegistry } from "./tools/registry.ts";
import { AGENT_NOTICE_BODY_TOTAL_CHARS, MAX_FETCH_NOTICES, capNoticeBody, noticeBodyExcerpt } from "./tools/fetch-notice.ts";
import type { AgentCitation, AgentEvent } from "./types.ts";

export type RunCampusAgentOptions = {
  emit: (event: AgentEvent) => void;
  search?: SearchProvider["search"];
  fetchNotice?: SearchProvider["fetchNotice"];
  signal?: AbortSignal;
  requestId?: string;
};

function selectNoticeIds(sources: SearchSource[]): string[] {
  const seen = new Set<string>();
  return [...sources]
    .sort((a, b) => Number(b.answerEligible === true) - Number(a.answerEligible === true) || Number(b.type === "official") - Number(a.type === "official"))
    .flatMap((source) => {
      const id = source.documentId?.trim();
      if (!id || seen.has(id)) return [];
      seen.add(id);
      return [id];
    })
    .slice(0, MAX_FETCH_NOTICES);
}

export async function runCampusAgent(
  query: string,
  { emit, search, fetchNotice, signal, requestId }: RunCampusAgentOptions,
): Promise<void> {
  emit({ type: "phase", phase: "received" });
  emit({ type: "phase", phase: "retrieving" });
  const trimmedQuery = query.trim();
  const searchId = "search-1";
  let citations: AgentCitation[] = [];
  let fallback = false;
  let result: Awaited<ReturnType<typeof toolRegistry.search_notices.run>> | undefined;

  if (!signal?.aborted) {
    emit({ type: "phase", phase: "tool", detail: "search_notices" });
    emit({ type: "tool_call", id: searchId, name: "search_notices", args: { query: trimmedQuery } });
    try {
      result = await toolRegistry.search_notices.run({ query: trimmedQuery }, { search, requestId });
    } catch {
      fallback = true;
      emit({ type: "tool_result", id: searchId, name: "search_notices", ok: false, summary: "校园信息检索失败。" });
      emit({ type: "error", message: "校园信息检索失败。", code: "search_failed" });
      emit({ type: "phase", phase: "fallback", detail: "检索服务未返回可用结果" });
    }
    if (result?.status === "error") {
      fallback = true;
      emit({ type: "tool_result", id: searchId, name: "search_notices", ok: false, summary: "校园信息检索失败。" });
      emit({ type: "error", message: "校园信息检索暂时不可用。", code: result.errorCode ?? "search_failed" });
      emit({ type: "phase", phase: "fallback", detail: "检索服务未返回可用结果" });
    } else if (result) {
      emit({ type: "tool_result", id: searchId, name: "search_notices", ok: true, summary: `找到 ${result.sources.length} 条来源。` });
    }
  }

  const documents: NoticeDocument[] = [];
  if (result && result.status !== "error" && result.sources.length > 0 && !signal?.aborted) {
    const ids = selectNoticeIds(result.sources);
    let remaining = AGENT_NOTICE_BODY_TOTAL_CHARS;
    for (const [index, documentId] of ids.entries()) {
      if (signal?.aborted) break;
      const id = `fetch-${index + 1}`;
      emit({ type: "phase", phase: "tool", detail: "fetch_notice" });
      emit({ type: "tool_call", id, name: "fetch_notice", args: { documentId } });
      // Mock searches must never silently make real HTTP requests.
      const runFetch = search && !fetchNotice
        ? async (): Promise<Awaited<ReturnType<SearchProvider["fetchNotice"]>>> => ({ status: "error", document: null })
        : fetchNotice;
      const fetched = await toolRegistry.fetch_notice.run({ documentId }, { fetchNotice: runFetch, requestId });
      emit({ type: "tool_result", id, name: "fetch_notice", ok: fetched.ok, summary: fetched.summary });
      if (fetched.ok && fetched.document?.answerEligible && remaining > 0 && (fetched.document.body.length <= remaining || remaining > "…[已截断]".length)) {
        const kept = capNoticeBody(fetched.document, remaining);
        remaining -= kept.body.length;
        documents.push(kept);
      }
    }

    const exportId = "export-2";
    emit({ type: "phase", phase: "tool", detail: "export_citations" });
    emit({ type: "tool_call", id: exportId, name: "export_citations", args: { sourceCount: result.sources.length } });
    try {
      const exported = toolRegistry.export_citations.run({ sources: result.sources, documents });
      citations = exported.citations;
      emit({ type: "tool_result", id: exportId, name: "export_citations", ok: citations.length > 0, summary: exported.text || "没有可导出的正文引用。" });
    } catch {
      fallback = true;
      emit({ type: "tool_result", id: exportId, name: "export_citations", ok: false, summary: "引用导出失败。" });
      emit({ type: "error", message: "引用导出失败。", code: "export_failed" });
      emit({ type: "phase", phase: "fallback", detail: "引用导出失败" });
    }
  }

  let summary: string;
  if (documents.length > 0) {
    const searchSummary = result?.answer?.summary?.trim();
    const verifiedSearchSummary = searchSummary && searchSummary.length <= 180 && documents.some((document) => document.body.includes(searchSummary));
    const excerpts = documents.map((document) => noticeBodyExcerpt(document.body, 180)).filter(Boolean);
    summary = verifiedSearchSummary ? searchSummary : excerpts.length ? excerpts.join("；") : `已读取 ${documents.length} 篇通知正文，但没有可摘录的内容。`;
  } else if (result?.sources.length) {
    fallback = true;
    const titles = result.sources.filter((source) => source.type === "official" && source.answerEligible !== false)
      .map((source) => `${source.title.slice(0, 80)}（${source.sourceName.slice(0, 60)}）`).slice(0, 3).join("；");
    summary = titles
      ? `检索到官方来源：${titles}。未读到通知全文，请核对原文。`
      : "未读到可用于回答的通知全文，请核对官方通知。";
    emit({ type: "phase", phase: "fallback", detail: "未读到可用于回答的通知全文" });
  } else {
    summary = fallback ? "目前无法检索校园信息，请稍后重试。" : "没有找到相关校园信息，请尝试更具体的关键词。";
  }
  emit({ type: "phase", phase: "answering" });
  const evidence = citations.filter((citation) => citation.snippet).map((citation) => ({ sourceId: citation.sourceId, title: citation.title, sourceName: citation.sourceName, snippet: citation.snippet! }));
  emit({ type: "answer", summary, citations, evidence, ...(fallback ? { fallback: true } : {}) });
  emit({ type: "phase", phase: "done" });
}
