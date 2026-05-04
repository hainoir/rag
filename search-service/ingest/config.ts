import { SOURCE_REGISTRY } from "../../src/lib/search/source-registry.ts";
import {
  DEFAULT_OFFICIAL_SOURCE_IDS,
  SUPPORTED_INGEST_SOURCE_IDS,
  type SelectedSource,
  type SupportedSourceId,
} from "./types.ts";

const DEFAULT_FETCH_LIMIT = 12;
const DEFAULT_HTTP_TIMEOUT_MS = 15_000;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_USER_AGENT = "campus-rag-ingestion/1.0 (+https://www.tjcu.edu.cn/)";

const SUPPORTED_SOURCE_IDS = new Set<string>(SUPPORTED_INGEST_SOURCE_IDS);

export type IngestRuntimeConfig = {
  databaseUrl: string;
  fetchLimit: number;
  httpTimeoutMs: number;
  concurrency: number;
  userAgent: string;
};

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function splitCsv(value: string | undefined) {
  return String(value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function getAllSupportedSources() {
  return SOURCE_REGISTRY.filter((source): source is SelectedSource => {
    return (
      SUPPORTED_SOURCE_IDS.has(source.id) &&
      source.enabled &&
      (source.type === "official" || source.type === "community") &&
      source.fetchMode === "html" &&
      (source.cleaningProfile === "official_notice" ||
        source.cleaningProfile === "official_faq" ||
        source.cleaningProfile === "community_thread")
    );
  });
}

export function resolveSelectedSources(ids?: string[]) {
  const sourceMap = new Map(getAllSupportedSources().map((source) => [source.id, source]));
  const requestedIds = (ids && ids.length > 0 ? ids : DEFAULT_OFFICIAL_SOURCE_IDS).map((entry) => entry.trim());
  const selected: SelectedSource[] = [];

  for (const id of requestedIds) {
    const source = sourceMap.get(id as SupportedSourceId);

    if (!source) {
      throw new Error(`Unsupported ingestion source: ${id}`);
    }

    selected.push(source);
  }

  return selected;
}

export function resolveCliSourceIds(argv: string[], env = process.env) {
  const positional = argv.filter((entry) => !entry.startsWith("--"));
  const inlineSourceIds: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--source" && argv[index + 1]) {
      inlineSourceIds.push(argv[index + 1]);
      index += 1;
    }
  }

  const resolved = [...inlineSourceIds, ...positional];

  if (resolved.length > 0) {
    return resolved;
  }

  const fromEnv = splitCsv(env.INGEST_SOURCE_IDS);

  return fromEnv.length > 0 ? fromEnv : [...DEFAULT_OFFICIAL_SOURCE_IDS];
}

export function readIngestRuntimeConfig(env = process.env): IngestRuntimeConfig {
  return {
    databaseUrl: String(env.DATABASE_URL ?? "").trim(),
    fetchLimit: parsePositiveInteger(env.INGEST_FETCH_LIMIT, DEFAULT_FETCH_LIMIT),
    httpTimeoutMs: parsePositiveInteger(env.INGEST_HTTP_TIMEOUT_MS, DEFAULT_HTTP_TIMEOUT_MS),
    concurrency: parsePositiveInteger(env.INGEST_CONCURRENCY, DEFAULT_CONCURRENCY),
    userAgent: String(env.INGEST_USER_AGENT ?? DEFAULT_USER_AGENT).trim() || DEFAULT_USER_AGENT,
  };
}

export function requireDatabaseUrl(config: IngestRuntimeConfig) {
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL is required for the ingestion pipeline.");
  }

  return config.databaseUrl;
}
