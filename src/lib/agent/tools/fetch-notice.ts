import type { NoticeDocument, SearchProvider } from "../../search/types.ts";

export const AGENT_NOTICE_BODY_MAX_CHARS = 6_000;
export const AGENT_NOTICE_BODY_TOTAL_CHARS = 12_000;
export const MAX_FETCH_NOTICES = 3;
const TRUNCATION_MARK = "…[已截断]";

export type FetchNoticeResult = {
  ok: boolean;
  document: NoticeDocument | null;
  errorCode?: string;
  summary: string;
  truncated?: boolean;
};

export function capNoticeBody(document: NoticeDocument, maxChars: number): NoticeDocument {
  if (document.body.length <= maxChars) return document;
  const body = document.body.slice(0, Math.max(0, maxChars - TRUNCATION_MARK.length)) + TRUNCATION_MARK;
  return { ...document, body, truncated: true, returnedCharCount: body.length };
}

export function noticeBodyExcerpt(body: string, maxChars: number): string {
  const lines = body.split(/\n+/).map((part) => part.trim()).filter(Boolean);
  const line = lines.find((part) => !part.startsWith("#") && !part.startsWith("演示语料（")) ?? lines[0] ?? "";
  return line.slice(0, maxChars).trim();
}

export async function fetchNoticeTool(
  documentId: string,
  fetchNotice?: SearchProvider["fetchNotice"],
  requestId?: string,
): Promise<FetchNoticeResult> {
  const id = typeof documentId === "string" ? documentId.trim() : "";
  if (!id) return { ok: false, document: null, errorCode: "invalid_document_id", summary: "通知文档 ID 无效。" };
  try {
    const runFetch = fetchNotice ?? (await import("../../search/search-provider.ts")).searchServiceProvider.fetchNotice;
    const response = await runFetch(id, { requestId });
    if (response.status !== "ok" || !response.document) {
      return { ok: false, document: null, errorCode: response.meta?.errorCode ?? response.status, summary: `通知全文读取失败（${response.status}）。` };
    }
    const document = capNoticeBody(response.document, AGENT_NOTICE_BODY_MAX_CHARS);
    return { ok: true, document, truncated: document.truncated, summary: `已读取《${document.title.slice(0, 60)}》正文${document.truncated ? "（已截断）" : ""}。` };
  } catch {
    return { ok: false, document: null, errorCode: "fetch_failed", summary: "通知全文读取失败（服务不可用）。" };
  }
}
