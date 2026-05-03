import type { SelectedSource, SupportedSourceId } from "./types";
import { parseArticlePage, parseSectionListPage } from "./html";
import { isAllowedArticleUrl } from "./utils";

type SourceAdapter = {
  sourceId: SupportedSourceId;
  seedListUrls: (source: SelectedSource) => string[];
  parseListPage: (source: SelectedSource, pageUrl: string, html: string) => {
    detailUrls: string[];
    extraListUrls: string[];
  };
  parseDetailPage: (pageUrl: string, html: string) => {
    title: string;
    publishedAt: string | null;
    updatedAt: string | null;
    cleanedMarkdown: string;
  };
};

function isSameHost(source: SelectedSource, url: string) {
  return new URL(source.baseUrl).hostname === new URL(url).hostname;
}

function createOfficialHtmlAdapter({
  sourceId,
  headingTexts,
  extraListPattern,
  titleSelectors = ["h1", ".article-title", ".arti_title", ".show_t", ".v_news_title"],
  contentSelectors = [
    "#vsb_content_2",
    "#vsb_content",
    ".v_news_content",
    ".TRS_Editor",
    ".wp_articlecontent",
    ".article-content",
    ".news-content",
  ],
  metaSelectors = [".arti_metas", ".show_info", ".article-info", ".wp_article_detail", ".v_news_detail", ".news_meta"],
}: {
  sourceId: SupportedSourceId;
  headingTexts: string[];
  extraListPattern: RegExp;
  titleSelectors?: string[];
  contentSelectors?: string[];
  metaSelectors?: string[];
}): SourceAdapter {
  return {
    sourceId,
    seedListUrls: (source) => [source.baseUrl],
    parseListPage: (source, pageUrl, html) =>
      parseSectionListPage({
        html,
        pageUrl,
        headingTexts,
        isDetailUrl: (url) => isAllowedArticleUrl(source, url),
        isExtraListUrl: (url) => {
          const candidate = new URL(url);

          return isSameHost(source, url) && extraListPattern.test(candidate.pathname);
        },
      }),
    parseDetailPage: (pageUrl, html) =>
      parseArticlePage({
        html,
        pageUrl,
        titleSelectors,
        contentSelectors,
        metaSelectors,
      }),
  };
}

const adapters: Record<SupportedSourceId, SourceAdapter> = {
  "tjcu-main-notices": {
    sourceId: "tjcu-main-notices",
    seedListUrls: (source) => [source.baseUrl],
    parseListPage: (source, pageUrl, html) =>
      parseSectionListPage({
        html,
        pageUrl,
        headingTexts: ["通知公告"],
        isDetailUrl: (url) => isAllowedArticleUrl(source, url),
        isExtraListUrl: (url) => {
          const candidate = new URL(url);

          return isSameHost(source, url) && /tzgg|notice/i.test(candidate.pathname);
        },
      }),
    parseDetailPage: (pageUrl, html) =>
      parseArticlePage({
        html,
        pageUrl,
        titleSelectors: ["h1", ".article-title", ".arti_title", ".show_t"],
        contentSelectors: ["#vsb_content_2", "#vsb_content", ".TRS_Editor", ".wp_articlecontent", ".article-content"],
        metaSelectors: [".arti_metas", ".show_info", ".article-info", ".wp_article_detail"],
      }),
  },
  "tjcu-library": createOfficialHtmlAdapter({
    sourceId: "tjcu-library",
    headingTexts: ["通知公告", "服务指南", "读者服务", "开放时间"],
    extraListPattern: /(info|gk|notice|news|service|tzgg)/i,
  }),
  "tjcu-academic-affairs": createOfficialHtmlAdapter({
    sourceId: "tjcu-academic-affairs",
    headingTexts: ["通知公告", "教学通知", "学生业务", "规章制度"],
    extraListPattern: /(info|index|notice|news|jxtz|xsyw|gzzd)/i,
  }),
  "tjcu-student-affairs": createOfficialHtmlAdapter({
    sourceId: "tjcu-student-affairs",
    headingTexts: ["通知公告", "学生工作", "学生事务", "办事指南"],
    extraListPattern: /(info|bmjs|index|notice|news|xsgz|bszn)/i,
  }),
  "tjcu-logistics": createOfficialHtmlAdapter({
    sourceId: "tjcu-logistics",
    headingTexts: ["通知公告", "后勤服务", "服务指南"],
    extraListPattern: /(info|notice|news|fwzn|hqfw)/i,
  }),
  "tjcu-career": createOfficialHtmlAdapter({
    sourceId: "tjcu-career",
    headingTexts: ["通知公告", "就业通知", "招聘日历", "双选会"],
    extraListPattern: /(news|reccalender|correcruit|notice|jobfair)/i,
  }),
  "tjcu-undergrad-admissions": {
    sourceId: "tjcu-undergrad-admissions",
    seedListUrls: (source) => [source.baseUrl],
    parseListPage: (source, pageUrl, html) =>
      parseSectionListPage({
        html,
        pageUrl,
        headingTexts: ["招生动态"],
        isDetailUrl: (url) => {
          const candidate = new URL(url);

          return isAllowedArticleUrl(source, url) && /^\/info\/1047\/\d+\.htm$/i.test(candidate.pathname);
        },
        isExtraListUrl: (url) => {
          const candidate = new URL(url);

          return isSameHost(source, url) && /zsdt/i.test(candidate.pathname);
        },
      }),
    parseDetailPage: (pageUrl, html) =>
      parseArticlePage({
        html,
        pageUrl,
        titleSelectors: ["h1", ".arti_title", ".show_t", ".article-title"],
        contentSelectors: [".v_news_content", "#vsb_content_2", "#vsb_content", ".TRS_Editor"],
        metaSelectors: [".show_info", ".article-info", ".v_news_detail", ".news_meta"],
      }),
  },
  "tjcu-grad-admissions": {
    sourceId: "tjcu-grad-admissions",
    seedListUrls: (source) => [source.baseUrl],
    parseListPage: (source, pageUrl, html) =>
      parseSectionListPage({
        html,
        pageUrl,
        headingTexts: ["招生动态", "招生信息"],
        isDetailUrl: (url) => isAllowedArticleUrl(source, url),
        isExtraListUrl: (url) => {
          const candidate = new URL(url);

          return isSameHost(source, url) && /(zsdt|zsxx|news)/i.test(candidate.pathname);
        },
      }),
    parseDetailPage: (pageUrl, html) =>
      parseArticlePage({
        html,
        pageUrl,
        titleSelectors: ["h1", ".arti_title", ".show_t", ".article-title"],
        contentSelectors: [".v_news_content", "#vsb_content_2", "#vsb_content", ".TRS_Editor", ".wp_articlecontent"],
        metaSelectors: [".show_info", ".article-info", ".v_news_detail", ".news_meta"],
      }),
  },
};

export function getSourceAdapter(sourceId: SupportedSourceId) {
  return adapters[sourceId];
}
