import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { getSourceAdapter } from "../ingest/adapters.ts";
import { resolveSelectedSources } from "../ingest/config.ts";

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
