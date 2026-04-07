import { DEFAULT_QUESTIONS, SEARCH_SCENARIOS, type SearchScenario } from "@/lib/search/mock-data";
import type { SearchAnswer, SearchProvider, SearchResponse } from "@/lib/search/types";

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[？?！!，,。.:：;；\s]/g, "");
}

function scoreScenario(query: string, scenario: SearchScenario) {
  const normalizedQuery = normalizeText(query);
  const keywordHits = scenario.keywords.filter((keyword) =>
    normalizedQuery.includes(normalizeText(keyword)),
  );
  const primaryQuestionHit = normalizedQuery.includes(normalizeText(scenario.primaryQuestion));
  const exactKeywordHit = scenario.keywords.some(
    (keyword) => normalizeText(keyword) === normalizedQuery,
  );

  return {
    scenario,
    score: keywordHits.length + (primaryQuestionHit ? 3 : 0),
    exactKeywordHit,
  };
}

function buildPartialAnswer(query: string, scenario: SearchScenario): SearchAnswer {
  return {
    summary: `已找到与“${scenario.title}”相关的通用信息，但暂未检索到能完整回答“${query}”的高置信内容。`,
    sourceNote:
      "当前结果以官方 FAQ 和社区经验帖为主，适合先查看原始片段再继续细化问法，例如补充时间、地点或对象范围。",
    disclaimer:
      "如果问题涉及具体费用、时段、楼栋或政策细节，请以对应部门的最新公告为准。",
    confidence: 0.58,
  };
}

function buildResponse({
  query,
  status,
  answer,
  relatedQuestions,
  sources,
}: Omit<SearchResponse, "generatedAt" | "retrievedCount">): SearchResponse {
  return {
    query,
    status,
    answer,
    relatedQuestions,
    sources,
    retrievedCount: sources.length,
    generatedAt: new Date().toISOString(),
  };
}

export const mockSearchProvider: SearchProvider = {
  async search(query: string) {
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      return buildResponse({
        query: "",
        status: "empty",
        answer: null,
        sources: [],
        relatedQuestions: DEFAULT_QUESTIONS,
      });
    }

    const rankedScenarios = SEARCH_SCENARIOS.map((scenario) => scoreScenario(trimmedQuery, scenario))
      .sort((left, right) => right.score - left.score);

    const bestMatch = rankedScenarios[0];

    if (!bestMatch || bestMatch.score === 0) {
      return buildResponse({
        query: trimmedQuery,
        status: "empty",
        answer: null,
        sources: [],
        relatedQuestions: DEFAULT_QUESTIONS,
      });
    }

    if (bestMatch.score >= 2 || bestMatch.exactKeywordHit) {
      return buildResponse({
        query: trimmedQuery,
        status: "ok",
        answer: bestMatch.scenario.answer,
        sources: bestMatch.scenario.sources,
        relatedQuestions: bestMatch.scenario.relatedQuestions,
      });
    }

    return buildResponse({
      query: trimmedQuery,
      status: "partial",
      answer: buildPartialAnswer(trimmedQuery, bestMatch.scenario),
      sources: bestMatch.scenario.sources.slice(0, 3),
      relatedQuestions: bestMatch.scenario.relatedQuestions,
    });
  },
};
