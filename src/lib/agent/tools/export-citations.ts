import type { NoticeDocument, SearchAnswerEvidence, SearchSource } from "../../search/types.ts";
import type { AgentCitation } from "../types.ts";
import { noticeBodyExcerpt } from "./fetch-notice.ts";

export type CitationExport = { text: string; citations: AgentCitation[] };

export function exportCitations(
  sources: SearchSource[],
  evidence: SearchAnswerEvidence[] = [],
  documents?: NoticeDocument[],
): CitationExport {
  if (documents) {
    const eligible = new Map(documents.filter((document) => document.answerEligible).map((document) => [document.documentId, document]));
    const seen = new Set<string>();
    const citations: AgentCitation[] = [];
    for (const source of sources) {
      const documentId = source.documentId?.trim();
      const document = documentId ? eligible.get(documentId) : undefined;
      if (!document || seen.has(document.documentId)) continue;
      seen.add(document.documentId);
      const snippet = noticeBodyExcerpt(document.body, 96);
      citations.push({
        sourceId: source.id,
        documentId: document.documentId,
        title: document.title,
        sourceName: document.sourceName,
        ...(document.canonicalUrl || document.url ? { url: document.canonicalUrl || document.url } : {}),
        ...(snippet ? { snippet } : {}),
      });
    }
    return { citations, text: formatCitations(citations) };
  }
  const evidenceBySource = new Map<string, SearchAnswerEvidence>();

  for (const item of evidence) {
    if (!evidenceBySource.has(item.sourceId)) {
      evidenceBySource.set(item.sourceId, item);
    }
  }

  const citations = sources.map((source) => {
    const matchingEvidence = evidenceBySource.get(source.id);

    return {
      sourceId: source.id,
      title: source.title,
      sourceName: source.sourceName,
      ...(source.url || source.canonicalUrl ? { url: source.canonicalUrl || source.url } : {}),
      ...(matchingEvidence?.snippet || source.snippet
        ? { snippet: matchingEvidence?.snippet || source.snippet }
        : {}),
    } satisfies AgentCitation;
  });

  return { text: formatCitations(citations), citations };
}

function formatCitations(citations: AgentCitation[]) {
  return citations
    .map((citation, index) =>
      [
        `[${index + 1}] ${citation.title} — ${citation.sourceName}`,
        ...(citation.url ? [citation.url] : []),
        ...(citation.snippet ? [`依据：${citation.snippet}`] : []),
      ].join("\n"),
    )
    .join("\n\n");

}
