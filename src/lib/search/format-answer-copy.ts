import type { SearchAnswer, SearchSource } from "@/lib/search/types";
import { formatDateTime } from "@/lib/utils";

type AnswerCopyInput = {
  query: string;
  answer: SearchAnswer;
  sources: SearchSource[];
  resultGeneratedAt: string;
};

function validHttpUrl(value?: string) {
  if (!value) {
    return undefined;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function formatAnswerForCopy({ query, answer, sources, resultGeneratedAt }: AnswerCopyInput) {
  const sourcesById = new Map(sources.map((source) => [source.id, source]));
  const evidenceLines = (answer.evidence ?? []).map((item, index) => {
    const source = sourcesById.get(item.sourceId);
    const url = validHttpUrl(source?.canonicalUrl) ?? validHttpUrl(source?.url);

    return `${index + 1}. ${item.title}\n   ${url ?? "链接未提供"}`;
  });

  return [
    `问题：${query}`,
    `回答摘要：${answer.summary}`,
    `信息来源：${answer.sourceNote}`,
    `补充说明：${answer.disclaimer}`,
    `本次回答：${formatDateTime(resultGeneratedAt)}（${resultGeneratedAt}）`,
    ...(evidenceLines.length > 0 ? ["依据来源：", ...evidenceLines] : []),
  ].join("\n\n");
}
