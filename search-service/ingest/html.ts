import { load, type Cheerio, type CheerioAPI } from "cheerio";
import type { AnyNode, Element } from "domhandler";

import { parseTimestampsFromText, resolveAbsoluteUrl } from "./utils.ts";

type SectionListParseOptions = {
  html: string;
  pageUrl: string;
  headingTexts: string[];
  isDetailUrl: (url: string) => boolean;
  isExtraListUrl?: (url: string) => boolean;
};

type ArticleParseOptions = {
  html: string;
  pageUrl: string;
  titleSelectors: string[];
  contentSelectors: string[];
  metaSelectors?: string[];
};

const SECTION_HEADING_SELECTOR = "h1, h2, h3, h4, h5, strong, span, div, p, a";
const BLOCK_SELECTOR = "h2, h3, h4, p, li, blockquote, td";
const NOISE_SELECTOR =
  "script, style, noscript, iframe, form, header, footer, nav, aside, svg, canvas, button, input, select, textarea";
const NOISE_PATTERN = /(nav|menu|footer|share|comment|breadcrumb|pager|copyright|banner|logo|schoolbadge|toolbar)/i;

function normalizeHeadingText(value: string) {
  return value.replace(/\s+/g, "").trim();
}

function normalizeBlockText(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

function findHeadingNodes($: CheerioAPI, headingTexts: string[]) {
  const normalizedTargets = headingTexts.map(normalizeHeadingText);

  return $(SECTION_HEADING_SELECTOR)
    .toArray()
    .filter((element) => {
      const text = normalizeHeadingText($(element).text());

      if (!text || text.length > 20) {
        return false;
      }

      return normalizedTargets.some((target) => text === target || text.startsWith(target) || text.includes(target));
    });
}

function chooseScopeContainer($: CheerioAPI, heading: Element) {
  let current = $(heading);

  for (let depth = 0; depth < 5; depth += 1) {
    const parent = current.parent();

    if (!parent.length) {
      break;
    }

    const anchorCount = parent.find("a[href]").length;
    const textLength = normalizeBlockText(parent.text()).length;

    if (anchorCount >= 3 && textLength <= 8_000) {
      return parent;
    }

    current = parent;
  }

  return current.parent();
}

function collectAnchors($scope: Cheerio<Element>, $: CheerioAPI) {
  const scopes = [$scope, $scope.nextAll().slice(0, 2)];
  const anchors = scopes.flatMap((scope) => scope.find("a[href]").toArray());

  return anchors.filter((element, index, items) => items.indexOf(element) === index).map((element) => $(element));
}

export function parseSectionListPage({
  html,
  pageUrl,
  headingTexts,
  isDetailUrl,
  isExtraListUrl,
}: SectionListParseOptions) {
  const $ = load(html);
  const detailUrls = new Set<string>();
  const extraListUrls = new Set<string>();
  const headingNodes = findHeadingNodes($, headingTexts);
  const anchorBuckets = headingNodes.length > 0
    ? headingNodes.map((heading) => collectAnchors(chooseScopeContainer($, heading), $))
    : [$("a[href]").toArray().map((element) => $(element))];

  for (const anchors of anchorBuckets) {
    for (const $anchor of anchors) {
      const href = resolveAbsoluteUrl(pageUrl, $anchor.attr("href"));

      if (!href) {
        continue;
      }

      if (isDetailUrl(href)) {
        detailUrls.add(href);
        continue;
      }

      const anchorText = normalizeBlockText($anchor.text());

      if (
        (anchorText.includes("更多") || anchorText.toLowerCase().includes("more")) &&
        (!isExtraListUrl || isExtraListUrl(href))
      ) {
        extraListUrls.add(href);
        continue;
      }

      if (isExtraListUrl?.(href)) {
        extraListUrls.add(href);
      }
    }
  }

  return {
    detailUrls: [...detailUrls],
    extraListUrls: [...extraListUrls],
  };
}

function pickTitle($: CheerioAPI, selectors: string[]) {
  for (const selector of selectors) {
    const value = normalizeBlockText($(selector).first().text());

    if (value) {
      return value.replace(/\s*[-_｜|].*$/, "").trim();
    }
  }

  const titleTag = normalizeBlockText($("title").first().text());

  if (titleTag) {
    return titleTag.replace(/\s*[-_｜|].*$/, "").trim();
  }

  throw new Error("Unable to extract article title.");
}

function scoreContentNode($candidate: Cheerio<AnyNode>) {
  const text = normalizeBlockText($candidate.text());

  if (!text || text.length < 20) {
    return -1;
  }

  const paragraphCount = $candidate.find("p").length;
  const listCount = $candidate.find("li").length;
  const blockCount = $candidate.find("div").length;
  const linkTextLength = normalizeBlockText($candidate.find("a").text()).length;

  return text.length + paragraphCount * 80 + listCount * 40 + blockCount * 5 - linkTextLength * 2;
}

function pickContentRoot($: CheerioAPI, selectors: string[]) {
  for (const selector of selectors) {
    const candidate = $(selector).first();

    if (candidate.length && scoreContentNode(candidate) > 0) {
      return candidate.clone();
    }
  }

  let bestNode: Cheerio<Element> | null = null;
  let bestScore = -1;

  $("article, main, section, div")
    .toArray()
    .forEach((element) => {
      const candidate = $(element);
      const score = scoreContentNode(candidate);

      if (score > bestScore) {
        bestScore = score;
        bestNode = candidate.clone();
      }
    });

  if (!bestNode) {
    throw new Error("Unable to locate article content root.");
  }

  return bestNode;
}

function stripNoise($root: Cheerio<AnyNode>, $: CheerioAPI, pageUrl: string) {
  $root.find(NOISE_SELECTOR).remove();
  $root.find("br").replaceWith("\n");

  $root.find("*").each((_, element) => {
    const attrs = `${$(element).attr("class") ?? ""} ${$(element).attr("id") ?? ""}`;

    if (NOISE_PATTERN.test(attrs)) {
      $(element).remove();
    }
  });

  $root.find("a[href]").each((_, element) => {
    const $anchor = $(element);
    const text = normalizeBlockText($anchor.text());
    const href = resolveAbsoluteUrl(pageUrl, $anchor.attr("href") ?? "");

    if (!text) {
      $anchor.remove();
      return;
    }

    if (!href) {
      $anchor.replaceWith(text);
      return;
    }

    $anchor.replaceWith(`${text} (${href})`);
  });
}

function collectContentBlocks($root: Cheerio<AnyNode>, $: CheerioAPI) {
  const rootNodes = new Set($root.toArray());
  const blocks = $root
    .find(BLOCK_SELECTOR)
    .filter(
      (_, element) =>
        $(element)
          .parents(BLOCK_SELECTOR)
          .toArray()
          .every((ancestor) => !rootNodes.has(ancestor)),
    )
    .toArray();
  const values: string[] = [];

  for (const element of blocks) {
    const text = normalizeBlockText($(element).text());

    if (!text) {
      continue;
    }

    values.push(text);
  }

  if (values.length > 0) {
    return values;
  }

  return $root
    .text()
    .split(/\n+/)
    .map((entry) => normalizeBlockText(entry))
    .filter(Boolean);
}

function dedupeBlocks(blocks: string[], title: string) {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const block of blocks) {
    const normalized = normalizeHeadingText(block);

    if (!normalized || normalized === normalizeHeadingText(title)) {
      continue;
    }

    if (parseTimestampsFromText(block).length > 0 && normalized.length <= 24) {
      continue;
    }

    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    unique.push(block);
  }

  return unique;
}

function collectMetaTexts($: CheerioAPI, selectors: string[]) {
  const values: string[] = [];

  for (const selector of selectors) {
    $(selector)
      .toArray()
      .forEach((element) => {
        const value = normalizeBlockText($(element).text());

        if (value) {
          values.push(value);
        }
      });
  }

  return values;
}

export function parseArticlePage({
  html,
  pageUrl,
  titleSelectors,
  contentSelectors,
  metaSelectors = [],
}: ArticleParseOptions) {
  const $ = load(html);
  const title = pickTitle($, titleSelectors);
  const contentRoot = pickContentRoot($, contentSelectors);
  const metaTexts = collectMetaTexts($, metaSelectors);

  stripNoise(contentRoot, $, pageUrl);

  const blocks = dedupeBlocks(collectContentBlocks(contentRoot, $), title);
  const cleanedMarkdown = blocks.join("\n\n").trim();

  if (!cleanedMarkdown) {
    throw new Error(`No article content extracted for ${pageUrl}`);
  }

  const timestampCandidates = parseTimestampsFromText(`${metaTexts.join(" ")} ${$("body").text().slice(0, 2_000)}`);
  const publishedAt = timestampCandidates[0] ?? null;
  const updatedAt = timestampCandidates[1] ?? null;

  return {
    title,
    publishedAt,
    updatedAt,
    cleanedMarkdown,
  };
}
