export type SourceType = "official" | "community";
export type ViewMode = "answer" | "retrieval";
export type SearchStatus = "ok" | "partial" | "empty";

export type SearchSource = {
  id: string;
  title: string;
  type: SourceType;
  publishedAt: string;
  snippet: string;
  fullSnippet?: string;
  matchedKeywords: string[];
  url?: string;
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
  generatedAt: string;
};

export type SearchProvider = {
  search: (query: string) => Promise<SearchResponse>;
};

