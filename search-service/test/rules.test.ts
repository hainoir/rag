import assert from "node:assert/strict";
import test from "node:test";

import { parseArticlePage } from "../ingest/html";
import { buildChunksFromMarkdown, buildContentHash, buildDedupKey, normalizeCanonicalUrl } from "../ingest/utils";

test("canonical URL normalization removes search, hash, and trailing slash", () => {
  assert.equal(
    normalizeCanonicalUrl("https://www.tjcu.edu.cn/info/1080/25496.htm?from=home#content"),
    "https://www.tjcu.edu.cn/info/1080/25496.htm",
  );
});

test("dedup key is stable for normalized titles and timestamps", () => {
  const first = buildDedupKey("tjcu-main-notices", "关于 校园网 断网升级 的 通知", "2026-04-17T01:30:00.000Z");
  const second = buildDedupKey("tjcu-main-notices", "关于 校园网 断网升级 的 通知", "2026-04-17T01:30:00.000Z");

  assert.equal(first, second);
});

test("content hash and chunking operate on cleaned markdown", () => {
  const markdown = Array.from({ length: 5 }, (_, index) => `第${index + 1}段：${"内容".repeat(120)}`).join("\n\n");
  const hash = buildContentHash(markdown);
  const chunks = buildChunksFromMarkdown(markdown);

  assert.equal(hash.length, 64);
  assert.ok(chunks.length >= 2);
  assert.ok(chunks.every((chunk) => chunk.tokenCount === chunk.fullSnippet.length));
});

test("article cleaning removes duplicate paragraphs and resolves relative links", () => {
  const detail = parseArticlePage({
    html: `
      <html>
        <body>
          <h1>关于图书馆服务调整的通知</h1>
          <div class="arti_metas">2026年04月18日 08:15</div>
          <div id="vsb_content_2">
            <p>图书馆将于周末调整开放时间。</p>
            <p>图书馆将于周末调整开放时间。</p>
            <p><a href="/service/rules.html">借阅规则</a></p>
          </div>
        </body>
      </html>
    `,
    pageUrl: "https://lib.tjcu.edu.cn/info/2040/1001.htm",
    titleSelectors: ["h1"],
    contentSelectors: ["#vsb_content_2"],
    metaSelectors: [".arti_metas"],
  });

  assert.equal(detail.publishedAt, "2026-04-18T00:15:00.000Z");
  assert.equal(detail.cleanedMarkdown.match(/图书馆将于周末调整开放时间。/g)?.length, 1);
  assert.match(detail.cleanedMarkdown, /借阅规则 \(https:\/\/lib\.tjcu\.edu\.cn\/service\/rules\.html\)/);
});
