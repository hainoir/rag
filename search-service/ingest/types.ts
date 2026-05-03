import type { SourceRegistryEntry } from "../../src/lib/search/source-registry";

export const OFFICIAL_INGEST_SOURCE_IDS = [
  "tjcu-main-notices",
  "tjcu-library",
  "tjcu-academic-affairs",
  "tjcu-student-affairs",
  "tjcu-logistics",
  "tjcu-career",
  "tjcu-undergrad-admissions",
  "tjcu-grad-admissions",
] as const;

export const DEFAULT_OFFICIAL_SOURCE_IDS = [
  "tjcu-main-notices",
  "tjcu-library",
  "tjcu-academic-affairs",
  "tjcu-undergrad-admissions",
  "tjcu-grad-admissions",
] as const;

export const OFFICIAL_NOTICE_SOURCE_IDS = OFFICIAL_INGEST_SOURCE_IDS;

export type SupportedSourceId = (typeof OFFICIAL_INGEST_SOURCE_IDS)[number];

export type SelectedSource = SourceRegistryEntry & {
  id: SupportedSourceId;
  type: "official";
  fetchMode: "html";
  cleaningProfile: "official_notice" | "official_faq";
};

export type PreparedChunk = {
  chunkIndex: number;
  snippet: string;
  fullSnippet: string;
  tokenCount: number;
};

export type ParsedArticle = {
  source: SelectedSource;
  url: string;
  canonicalUrl: string;
  externalId: string | null;
  title: string;
  publishedAt: string | null;
  updatedAt: string | null;
  fetchedAt: string;
  rawHtml: string;
  cleanedMarkdown: string;
  dedupKey: string;
  contentHash: string;
  chunks: PreparedChunk[];
};

export type ListPageParseResult = {
  detailUrls: string[];
  extraListUrls: string[];
};

export type ArticleParseResult = {
  title: string;
  publishedAt: string | null;
  updatedAt: string | null;
  cleanedMarkdown: string;
};

export type PersistOutcome =
  | {
      kind: "stored";
      documentId: string;
      versionId: string;
      chunkCount: number;
      wasNewDocument: boolean;
    }
  | {
      kind: "dedup";
      reason: "canonical_unchanged" | "title_date" | "content_hash" | "cross_source_canonical";
      documentId?: string;
    };

export type SourceRunSummary = {
  sourceId: SupportedSourceId;
  fetchedCount: number;
  storedCount: number;
  dedupedCount: number;
  skippedCount: number;
  chunkCount: number;
  errorCount: number;
  errors: string[];
};
