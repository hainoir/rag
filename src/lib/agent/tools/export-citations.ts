import type { SearchAnswerEvidence, SearchSource } from "../../search/types.ts";
import type { AgentCitation } from "../types.ts";

export type CitationExport = { text: string; citations: AgentCitation[] };

export function exportCitations(
  sources: SearchSource[],
  evidence: SearchAnswerEvidence[] = [],
): CitationExport {
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

  const text = citations
    .map((citation, index) =>
      [
        `[${index + 1}] ${citation.title} — ${citation.sourceName}`,
        ...(citation.url ? [citation.url] : []),
        ...(citation.snippet ? [`依据：${citation.snippet}`] : []),
      ].join("\n"),
    )
    .join("\n\n");

  return { text, citations };
}
