import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { getSourceAdapter } from "../ingest/adapters.ts";
import { resolveSelectedSources } from "../ingest/config.ts";
import { parseArticlePage } from "../ingest/html.ts";
import { buildChunksFromMarkdown } from "../ingest/utils.ts";

const fixtureDir = path.resolve(process.cwd(), "search-service/test/fixtures");

function readFixture(name: string) {
  return fs.readFileSync(path.join(fixtureDir, name), "utf8");
}

test("main notices adapter discovers scoped detail URLs and parses cleaned content", () => {
  const source = resolveSelectedSources(["tjcu-main-notices"])[0];
  const adapter = getSourceAdapter(source.id);
  const list = adapter.parseListPage(source, source.baseUrl, readFixture("main-notices-list.html"));

  assert.deepEqual(list.detailUrls, [
    "https://www.tjcu.edu.cn/info/1080/25496.htm",
    "https://www.tjcu.edu.cn/info/1080/25515.htm",
  ]);
  assert.deepEqual(list.extraListUrls, ["https://www.tjcu.edu.cn/tzgg.htm"]);

  const detail = adapter.parseDetailPage(
    "https://www.tjcu.edu.cn/info/1080/25496.htm",
    readFixture("main-notice-detail.html"),
  );

  assert.equal(detail.title, "关于校园网断网升级的通知");
  assert.equal(detail.publishedAt, "2026-04-17T01:30:00.000Z");
  assert.match(detail.cleanedMarkdown, /附件下载 \(https:\/\/www\.tjcu\.edu\.cn\/uploads\/network-plan\.pdf\)/);
  assert.equal(detail.cleanedMarkdown.match(/请各单位提前做好业务安排。/g)?.length, 1);
});

test("main notices adapter reads the current vsb_content_4 article shell", () => {
  const source = resolveSelectedSources(["tjcu-main-notices"])[0];
  const adapter = getSourceAdapter(source.id);
  const detail = adapter.parseDetailPage(
    "https://www.tjcu.edu.cn/info/1080/28799.htm",
    readFixture("main-notice-detail-vsb4.html"),
  );

  assert.equal(detail.title, "关于校园内树木消杀打药的通知");
  assert.match(detail.cleanedMarkdown, /病虫害防治喷洒打药工作/);
});

test("undergrad admissions adapter restricts details to /info/1047 pages", () => {
  const source = resolveSelectedSources(["tjcu-undergrad-admissions"])[0];
  const adapter = getSourceAdapter(source.id);
  const list = adapter.parseListPage(source, source.baseUrl, readFixture("undergrad-list.html"));

  assert.deepEqual(list.detailUrls, [
    "https://zs.tjcu.edu.cn/info/1047/2932.htm",
    "https://zs.tjcu.edu.cn/info/1047/2950.htm",
  ]);
  assert.deepEqual(list.extraListUrls, ["https://zs.tjcu.edu.cn/index/zsdt.htm"]);

  const detail = adapter.parseDetailPage(
    "https://zs.tjcu.edu.cn/info/1047/2932.htm",
    readFixture("undergrad-detail.html"),
  );

  assert.equal(detail.title, "天津商业大学2025年普通本科招生章程");
  assert.equal(detail.publishedAt, "2025-05-15T00:00:00.000Z");
  assert.match(detail.cleanedMarkdown, /第一条 为确保学校招生工作顺利进行/);
});

test("live main notice keeps form-wrapped VSB content", () => {
  const source = resolveSelectedSources(["tjcu-main-notices"])[0];
  const adapter = getSourceAdapter(source.id);
  const pageUrl = "https://www.tjcu.edu.cn/info/1080/28759.htm";
  const html = readFixture("live-main-notice-28759.html");
  const detail = adapter.parseDetailPage(pageUrl, html);

  assert.equal(detail.title, "关于举办“华为杯”第五届中国研究生网络安全创新大赛的通知");
  assert.equal(detail.publishedAt, "2026-09-29T16:00:00.000Z");
  assert.match(detail.cleanedMarkdown, /一、相关背景/);
  assert.match(detail.cleanedMarkdown, /中国研究生网络安全创新大赛/);

  const fromOuterSection = parseArticlePage({
    html,
    pageUrl,
    titleSelectors: [".nr_title"],
    contentSelectors: ["section.sec_inner"],
    metaSelectors: [".nr_date"],
  });

  assert.match(fromOuterSection.cleanedMarkdown, /一、相关背景/);
  assert.ok(buildChunksFromMarkdown(detail.cleanedMarkdown).length > 0);
});

test("live undergrad pages keep article titles and image-only posters", () => {
  const source = resolveSelectedSources(["tjcu-undergrad-admissions"])[0];
  const adapter = getSourceAdapter(source.id);
  const charter = adapter.parseDetailPage(
    "https://zs.tjcu.edu.cn/info/1047/2932.htm",
    readFixture("live-undergrad-2932.html"),
  );

  assert.equal(charter.title, "天津商业大学2025年普通本科招生章程");
  assert.match(charter.cleanedMarkdown, /第一条 为确保学校招生工作顺利进行/);

  const subjects = adapter.parseDetailPage(
    "https://zs.tjcu.edu.cn/info/1047/1253.htm",
    readFixture("live-undergrad-1253.html"),
  );

  assert.equal(subjects.title, "天津商业大学2026年本科招生专业选考科目要求");
  assert.match(subjects.cleanedMarkdown, /注：招生专业及专业组设置情况以各省级招生主管部门公布为准。/);

  const poster = adapter.parseDetailPage(
    "https://zs.tjcu.edu.cn/info/1047/1246.htm",
    readFixture("live-undergrad-1246.html"),
  );

  assert.equal(poster.title, "天津商业大学2023年分省招生政策宣讲");
  assert.match(
    poster.cleanedMarkdown,
    /^天津商业大学2023年分省招生政策宣讲\n\n!\[\]\(https:\/\/zs\.tjcu\.edu\.cn\/virtual_attach_file\.vsb\?/,
  );
  assert.equal(buildChunksFromMarkdown(poster.cleanedMarkdown).length, 1);

  assert.throws(
    () =>
      parseArticlePage({
        html: "<html><body><h1>空通知</h1><div class=\"v_news_content\"></div></body></html>",
        pageUrl: "https://www.tjcu.edu.cn/info/1080/1.htm",
        titleSelectors: ["h1"],
        contentSelectors: [".v_news_content"],
      }),
    /No article content extracted|Unable to locate article content root/,
  );
});

test("grad admissions adapter collects both 招生动态 and 招生信息 sections", () => {
  const source = resolveSelectedSources(["tjcu-grad-admissions"])[0];
  const adapter = getSourceAdapter(source.id);
  const list = adapter.parseListPage(source, source.baseUrl, readFixture("grad-list.html"));

  assert.deepEqual(list.detailUrls, [
    "https://yz.tjcu.edu.cn/info/1042/3312.htm",
    "https://yz.tjcu.edu.cn/info/1041/3349.htm",
  ]);
  assert.deepEqual(list.extraListUrls, [
    "https://yz.tjcu.edu.cn/zsdt.htm",
    "https://yz.tjcu.edu.cn/zsxx.htm",
  ]);

  const detail = adapter.parseDetailPage(
    "https://yz.tjcu.edu.cn/info/1041/3349.htm",
    readFixture("grad-detail.html"),
  );

  assert.equal(detail.title, "天津商业大学2026年硕士研究生招生简章");
  assert.equal(detail.publishedAt, "2025-09-30T07:37:00.000Z");
  assert.match(detail.cleanedMarkdown, /2026年我校面向全国招收全日制和非全日制硕士研究生/);
});
