import { load } from "cheerio";

import { parseTimestampsFromText, resolveAbsoluteUrl } from "./utils.ts";

export type FeedCandidate = {
  url: string;
  updatedAt: string | null;
};

function toIsoTimestamp(value: string | null | undefined) {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    return null;
  }

  const parsedDate = new Date(normalized);

  if (!Number.isNaN(parsedDate.getTime())) {
    return parsedDate.toISOString();
  }

  return parseTimestampsFromText(normalized)[0] ?? null;
}

export function parseSitemapCandidates(xml: string, pageUrl: string): FeedCandidate[] {
  const $ = load(xml, { xmlMode: true });

  return $("url")
    .toArray()
    .map((element) => {
      const loc = resolveAbsoluteUrl(pageUrl, $(element).find("loc").first().text().trim());

      if (!loc) {
        return null;
      }

      return {
        url: loc,
        updatedAt: toIsoTimestamp($(element).find("lastmod").first().text()),
      };
    })
    .filter((item): item is FeedCandidate => item !== null);
}

export function parseRssCandidates(xml: string, pageUrl: string): FeedCandidate[] {
  const $ = load(xml, { xmlMode: true });

  return $("item, entry")
    .toArray()
    .map((element) => {
      const linkText = $(element).find("link").first().text().trim();
      const linkHref = $(element).find("link[href]").first().attr("href");
      const guid = $(element).find("guid, id").first().text().trim();
      const url = resolveAbsoluteUrl(pageUrl, linkHref || linkText || guid);

      if (!url) {
        return null;
      }

      return {
        url,
        updatedAt: toIsoTimestamp(
          $(element).find("updated, pubDate, published, dc\\:date").first().text(),
        ),
      };
    })
    .filter((item): item is FeedCandidate => item !== null);
}

export function filterIncrementalCandidates(candidates: FeedCandidate[], lastSeenAt: string | null) {
  if (!lastSeenAt) {
    return candidates;
  }

  const lastSeenMs = Date.parse(lastSeenAt);

  if (Number.isNaN(lastSeenMs)) {
    return candidates;
  }

  return candidates.filter((candidate) => {
    if (!candidate.updatedAt) {
      return true;
    }

    const updatedMs = Date.parse(candidate.updatedAt);

    return Number.isNaN(updatedMs) || updatedMs > lastSeenMs;
  });
}
