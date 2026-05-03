import type { CleaningProfile } from "./source-registry";
import type { SourceType } from "./types";

export type CleaningAction =
  | "strip_navigation"
  | "strip_footer"
  | "strip_ads"
  | "strip_contact_info"
  | "normalize_whitespace"
  | "normalize_timestamps"
  | "merge_duplicate_paragraphs"
  | "remove_reply_noise";

export type CleaningRule = {
  id: string;
  profile: CleaningProfile;
  actions: CleaningAction[];
  preserveFields: string[];
  notes: string;
};

export const CLEANING_RULES: CleaningRule[] = [
  {
    id: "official-notice-cleaning",
    profile: "official_notice",
    actions: [
      "strip_navigation",
      "strip_footer",
      "strip_ads",
      "normalize_whitespace",
      "normalize_timestamps",
      "merge_duplicate_paragraphs",
    ],
    preserveFields: ["title", "source_name", "published_at", "updated_at", "url", "canonical_url"],
    notes: "保留公告原始标题、发文时间和通知编号，去掉导航、页脚和重复说明。",
  },
  {
    id: "official-faq-cleaning",
    profile: "official_faq",
    actions: [
      "strip_navigation",
      "strip_footer",
      "normalize_whitespace",
      "normalize_timestamps",
      "merge_duplicate_paragraphs",
    ],
    preserveFields: ["title", "question", "answer", "updated_at", "url", "canonical_url"],
    notes: "保留问答结构，避免把列表页说明混入正文。",
  },
  {
    id: "community-thread-cleaning",
    profile: "community_thread",
    actions: [
      "strip_ads",
      "strip_contact_info",
      "normalize_whitespace",
      "normalize_timestamps",
      "merge_duplicate_paragraphs",
      "remove_reply_noise",
    ],
    preserveFields: ["title", "author_name", "published_at", "url", "canonical_url"],
    notes: "去掉广告、联系方式、灌水回复和楼层噪音，仅保留公开经验内容。",
  },
];

export type DedupMethod = "canonical_url" | "title_and_date" | "content_hash" | "simhash";

export type DedupRule = {
  id: string;
  method: DedupMethod;
  stage: "document" | "chunk";
  threshold?: number;
  description: string;
};

export const DEDUP_RULES: DedupRule[] = [
  {
    id: "document-canonical-url",
    method: "canonical_url",
    stage: "document",
    description: "同一规范链接只保留一份主文档，镜像链接记为别名。",
  },
  {
    id: "document-title-date",
    method: "title_and_date",
    stage: "document",
    description: "标题和发布日期完全一致时，视为重复公告候选。",
  },
  {
    id: "document-content-hash",
    method: "content_hash",
    stage: "document",
    description: "清洗后的正文哈希一致时合并版本，避免同页多次抓取重复入库。",
  },
  {
    id: "chunk-near-duplicate",
    method: "simhash",
    stage: "chunk",
    threshold: 0.92,
    description: "正文高相似片段在分块阶段合并，减少重复召回。",
  },
];

export type IngestionStage = "fetch" | "clean" | "dedup" | "chunk" | "index" | "publish";
export type IngestionRunStatus = "queued" | "running" | "succeeded" | "failed" | "partial";

export type SearchDocumentRecord = {
  id: string;
  sourceId: string;
  sourceType: SourceType;
  sourceName: string;
  title: string;
  url: string;
  canonicalUrl: string;
  publishedAt?: string;
  updatedAt?: string;
  fetchedAt: string;
  lastVerifiedAt?: string;
  dedupKey: string;
  contentHash: string;
};

export type SearchChunkRecord = {
  id: string;
  documentId: string;
  chunkIndex: number;
  snippet: string;
  fullSnippet: string;
  tokenCount: number;
  embeddingRef?: string;
};

export type IngestionRunRecord = {
  id: string;
  sourceId: string;
  status: IngestionRunStatus;
  stage: IngestionStage;
  startedAt: string;
  endedAt?: string;
  fetchedCount: number;
  storedCount: number;
  dedupedCount: number;
  chunkCount: number;
  errorMessage?: string;
};
