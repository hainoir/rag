export type SourceType = "official" | "community";
export type ViewMode = "answer" | "retrieval";
export type SearchStatus = "ok" | "partial" | "empty" | "error";
export type SourceFreshness = "fresh" | "recent" | "stale" | "undated";
export type SearchCacheStatus = "hit" | "miss" | "bypass";
export type SourceGovernanceStatus = "approved" | "supplemental" | "pending" | "rejected";
export type SearchErrorCode =
  | "missing_search_service_url"
  | "upstream_bad_request"
  | "upstream_unauthorized"
  | "upstream_timeout"
  | "upstream_rate_limited"
  | "upstream_unavailable"
  | "upstream_unreachable"
  | "upstream_http_error"
  | "upstream_error"
  | "invalid_upstream_response"
  | "rate_limited"
  | "search_service_error"
  | "database_unavailable"
  | "invalid_feedback"
  | "feedback_store_unavailable";

export type SearchResponseMeta = {
  requestId: string;
  errorCode?: SearchErrorCode;
  cacheStatus?: SearchCacheStatus;
  durationMs?: number;
};

export type SearchProviderOptions = {
  requestId?: string;
};

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
  governanceStatus?: SourceGovernanceStatus;
  answerEligible?: boolean;
};

export type SearchAnswer = {
  summary: string;
  sourceNote: string;
  disclaimer: string;
  confidence: number;
  evidence?: SearchAnswerEvidence[];
};

export type SearchAnswerEvidence = {
  sourceId: string;
  title: string;
  sourceName?: string;
  snippet?: string;
};

export type SearchResponse = {
  query: string;
  status: SearchStatus;
  answer: SearchAnswer | null;
  sources: SearchSource[];
  relatedQuestions: string[];
  retrievedCount: number;
  resultGeneratedAt: string;
  meta?: SearchResponseMeta;
};

export type SearchProvider = {
  search: (query: string, options?: SearchProviderOptions) => Promise<SearchResponse>;
};
