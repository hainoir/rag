export type SourceType = "official" | "community";
export type ViewMode = "answer" | "retrieval";
export type SearchStatus = "ok" | "partial" | "empty" | "error";
export type SourceFreshness = "fresh" | "recent" | "stale" | "undated";

export type SearchSource = {
  id: string;
  title: string;
  type: SourceType;
  sourceName: string;
  sourceDomain?: string;
  publishedAt: string | null;
  updatedAt: string | null;
  fetchedAt: string;
  lastVerifiedAt: string | null;
  snippet: string;
  fullSnippet?: string;
  matchedKeywords: string[];
  url?: string;
  canonicalUrl?: string;
  freshnessLabel: SourceFreshness;
  trustScore?: number;
  dedupKey?: string;
};

export type SearchAnswer = {
  summary: string;
  sourceNote: string;
  disclaimer: string;
  confidence: number;
};

export type SearchResponse = {
  query: string;
  status: SearchStatus;
  answer: SearchAnswer | null;
  sources: SearchSource[];
  relatedQuestions: string[];
  retrievedCount: number;
  resultGeneratedAt: string;
};

export type SearchProvider = {
  search: (query: string) => Promise<SearchResponse>;
};
