import type { SearchProvider } from "../search/types.ts";
import { toolRegistry } from "./tools/registry.ts";
import type { AgentCitation, AgentEvent } from "./types.ts";

export type RunCampusAgentOptions = {
  emit: (event: AgentEvent) => void;
  search?: SearchProvider["search"];
};

export async function runCampusAgent(query: string, { emit, search }: RunCampusAgentOptions): Promise<void> {
  emit({ type: "phase", phase: "received" });
  emit({ type: "phase", phase: "retrieving" });

  const trimmedQuery = query.trim();
  const searchId = "search-1";
  emit({ type: "phase", phase: "tool", detail: "search_notices" });
  emit({ type: "tool_call", id: searchId, name: "search_notices", args: { query: trimmedQuery } });

  let summary = "";
  let sourceSummary = "";
  let citations: AgentCitation[] = [];
  let fallback = false;

  try {
    const result = await toolRegistry.search_notices.run({ query: trimmedQuery }, { search });
    if (result.status === "error") {
      fallback = true;
      emit({ type: "tool_result", id: searchId, name: "search_notices", ok: false, summary: "校园信息检索失败。" });
      emit({ type: "error", message: "校园信息检索暂时不可用。", code: result.errorCode ?? "search_failed" });
      emit({ type: "phase", phase: "fallback", detail: "检索服务未返回可用结果" });
    } else {
      emit({
        type: "tool_result",
        id: searchId,
        name: "search_notices",
        ok: true,
        summary: `找到 ${result.sources.length} 条来源。`,
      });
    }

    summary = result.answer?.summary?.trim() ?? "";
    sourceSummary = result.sources.map((source) => `${source.title}（${source.sourceName}）`).join("；");

    if (result.sources.length > 0) {
      const exportId = "export-2";
      emit({ type: "phase", phase: "tool", detail: "export_citations" });
      emit({
        type: "tool_call",
        id: exportId,
        name: "export_citations",
        args: { sourceCount: result.sources.length },
      });

      try {
        const exported = toolRegistry.export_citations.run({
          sources: result.sources,
          evidence: result.answer?.evidence,
        });
        citations = exported.citations;
        emit({ type: "tool_result", id: exportId, name: "export_citations", ok: true, summary: exported.text });
      } catch (error) {
        fallback = true;
        emit({ type: "tool_result", id: exportId, name: "export_citations", ok: false, summary: "引用导出失败。" });
        emit({ type: "error", message: error instanceof Error ? error.message : "引用导出失败。", code: "export_failed" });
        emit({ type: "phase", phase: "fallback", detail: "保留已检索到的回答" });
      }
    }
  } catch (error) {
    fallback = true;
    emit({ type: "tool_result", id: searchId, name: "search_notices", ok: false, summary: "校园信息检索失败。" });
    emit({ type: "error", message: error instanceof Error ? error.message : "校园信息检索失败。", code: "search_failed" });
    emit({ type: "phase", phase: "fallback", detail: "检索服务未返回可用结果" });
  }

  if (!summary) {
    if (citations.length > 0) {
      const titles = citations.map((citation) => `${citation.title}（${citation.sourceName}）`).join("；");
      summary = `已检索到相关来源：${titles}。请核对引用原文。`;
    } else if (sourceSummary) {
      summary = `已检索到相关来源：${sourceSummary}。请核对来源原文。`;
    } else {
      summary = fallback
        ? "目前无法检索校园信息，请稍后重试。"
        : "没有找到相关校园信息，请尝试更具体的关键词。";
    }
  }

  emit({ type: "phase", phase: "answering" });
  emit({ type: "answer", summary, citations, ...(fallback ? { fallback: true } : {}) });
  emit({ type: "phase", phase: "done" });
}
