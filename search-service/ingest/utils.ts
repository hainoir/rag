import crypto from "node:crypto";

import type { PreparedChunk, SelectedSource } from "./types.ts";

const CONTENT_SENTENCE_SPLIT = /(?<=[。！？；])/u;

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeTextForDedup(value: string) {
  return normalizeWhitespace(value).toLowerCase();
}

export function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function toChinaTimeIso(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
) {
  return new Date(Date.UTC(year, month - 1, day, hour - 8, minute, second)).toISOString();
}

function toInt(value: string | undefined, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const TIMESTAMP_PATTERNS = [
  /(20\d{2})[./-](\d{1,2})[./-](\d{1,2})(?:\s+(\d{1,2})[:：](\d{1,2})(?:[:：](\d{1,2}))?)?/g,
  /(20\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日?(?:\s*(\d{1,2})[:：](\d{1,2})(?:[:：](\d{1,2}))?)?/g,
  /(\d{1,2})月\s*(\d{1,2})[,，]\s*(20\d{2})(?:\s*(\d{1,2})[:：](\d{1,2})(?:[:：](\d{1,2}))?)?/g,
  /(\d{1,2})\.(\d{1,2})\s+(20\d{2})/g,
] as const;

export function parseTimestampsFromText(text: string) {
  const unique = new Set<string>();

  for (const pattern of TIMESTAMP_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      if (pattern === TIMESTAMP_PATTERNS[0] || pattern === TIMESTAMP_PATTERNS[1]) {
        unique.add(
          toChinaTimeIso(
            toInt(match[1]),
            toInt(match[2]),
            toInt(match[3]),
            toInt(match[4]),
            toInt(match[5]),
            toInt(match[6]),
          ),
        );
        continue;
      }

      if (pattern === TIMESTAMP_PATTERNS[2]) {
        unique.add(
          toChinaTimeIso(
            toInt(match[3]),
            toInt(match[1]),
            toInt(match[2]),
            toInt(match[5]),
            toInt(match[6]),
            toInt(match[7]),
          ),
        );
        continue;
      }

      unique.add(toChinaTimeIso(toInt(match[3]), toInt(match[1]), toInt(match[2])));
    }
  }

  return [...unique].sort();
}

export function resolveAbsoluteUrl(baseUrl: string, candidate: string | undefined | null) {
  if (!candidate) {
    return null;
  }

  try {
    return new URL(candidate, baseUrl).toString();
  } catch {
    return null;
  }
}

export function normalizeCanonicalUrl(input: string) {
  const url = new URL(input);

  url.hash = "";
  url.search = "";
  url.hostname = url.hostname.toLowerCase();
  url.protocol = url.protocol.toLowerCase();

  if (url.pathname !== "/") {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }

  return url.toString();
}

export function extractExternalIdFromUrl(input: string) {
  const match = input.match(/\/(\d+)\.(?:s?html?|htm)$/i) ?? input.match(/\/(\d+)(?:\/)?$/);
  return match?.[1] ?? null;
}

export function isAllowedArticleUrl(source: SelectedSource, input: string) {
  const base = new URL(source.baseUrl);
  const candidate = new URL(input);

  if (base.hostname !== candidate.hostname) {
    return false;
  }

  if (!candidate.pathname.match(/\/\d+\.(?:s?html?|htm)$/i)) {
    return false;
  }

  return source.allowedPaths.some((pathPrefix) => candidate.pathname.startsWith(pathPrefix));
}

export function buildDedupKey(sourceId: string, title: string, publishedAt: string | null) {
  return sha256(`${sourceId}|${normalizeTextForDedup(title)}|${publishedAt ?? ""}`);
}

export function buildContentHash(cleanedMarkdown: string) {
  return sha256(normalizeWhitespace(cleanedMarkdown));
}

function chunkLongParagraph(paragraph: string, maxLength: number) {
  if (paragraph.length <= maxLength) {
    return [paragraph];
  }

  const sentences = paragraph.split(CONTENT_SENTENCE_SPLIT).map((entry) => entry.trim()).filter(Boolean);

  if (sentences.length <= 1) {
    const chunks: string[] = [];

    for (let index = 0; index < paragraph.length; index += maxLength) {
      chunks.push(paragraph.slice(index, index + maxLength).trim());
    }

    return chunks.filter(Boolean);
  }

  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    const next = current ? `${current}${sentence}` : sentence;

    if (next.length > maxLength && current) {
      chunks.push(current.trim());
      current = sentence;
      continue;
    }

    current = next;
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}

export function buildChunksFromMarkdown(cleanedMarkdown: string): PreparedChunk[] {
  const minLength = 350;
  const targetLength = 450;
  const maxLength = 500;
  const paragraphs = cleanedMarkdown
    .split(/\n{2,}/)
    .map((entry) => normalizeWhitespace(entry))
    .filter(Boolean)
    .flatMap((entry) => chunkLongParagraph(entry, maxLength));
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;

    if (next.length > maxLength && current) {
      chunks.push(current.trim());
      current = paragraph;
      continue;
    }

    if (next.length >= targetLength) {
      chunks.push(next.trim());
      current = "";
      continue;
    }

    current = next;
  }

  if (current.trim()) {
    if (chunks.length > 0 && current.trim().length < minLength) {
      chunks[chunks.length - 1] = `${chunks[chunks.length - 1]}\n\n${current.trim()}`.trim();
    } else {
      chunks.push(current.trim());
    }
  }

  return chunks.map((fullSnippet, index) => ({
    chunkIndex: index,
    snippet: fullSnippet.slice(0, 120),
    fullSnippet,
    tokenCount: fullSnippet.length,
  }));
}

export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<R>,
) {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const currentIndex = cursor;
      cursor += 1;
      results[currentIndex] = await task(items[currentIndex], currentIndex);
    }
  }

  const workers = Array.from({ length: Math.min(Math.max(concurrency, 1), items.length || 1) }, () => worker());
  await Promise.all(workers);

  return results;
}
