import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { getSourceAdapter } from "../ingest/adapters.ts";
import { resolveSelectedSources } from "../ingest/config.ts";
import { parseArticlePage } from "../ingest/html.ts";
import { PostgresStore } from "../ingest/postgres-store.ts";
import { OFFICIAL_INGEST_SOURCE_IDS } from "../ingest/types.ts";
import {
  buildChunksFromMarkdown,
  buildContentHash,
  buildDedupKey,
  isAllowedArticleUrl,
  normalizeCanonicalUrl,
} from "../ingest/utils.ts";

const fixtureDir = path.resolve(process.cwd(), "search-service/test/fixtures");
const require = createRequire(import.meta.url);
const {
  closePostgresPool,
  searchPostgres,
  searchSeed,
}: {
  closePostgresPool: () => Promise<void>;
  searchPostgres: (query: string, limit: number) => Promise<{
    status: string;
    answer: { evidence?: Array<{ sourceId: string }> } | null;
    sources: Array<{ id: string; title: string }>;
  }>;
  searchSeed: (query: string, limit: number) => {
    status: string;
    answer: { evidence?: Array<{ sourceId: string }> } | null;
    sources: Array<{ id: string; title: string }>;
  };
} = require("../server.cjs");
const {
  generateLlmAnswer,
  shouldUseLlm,
}: {
  generateLlmAnswer: (
    query: string,
    sources: Array<{
      id: string;
      title: string;
      sourceName: string;
      type: string;
      publishedAt: string | null;
      updatedAt: string | null;
      fetchedAt: string;
      snippet: string;
      fullSnippet?: string;
    }>,
    baseAnswer: { confidence: number },
    env?: Record<string, string | undefined>,
  ) => Promise<{
    summary: string;
    usedSourceIds: string[];
    confidence: number;
  } | null>;
  shouldUseLlm: (config: { mode: string; apiKey: string; model: string }) => boolean;
} = require("../answer-generator.cjs");

function readFixture(name: string) {
  return fs.readFileSync(path.join(fixtureDir, name), "utf8");
}

async function runCase(name: string, task: () => Promise<void> | void) {
  try {
    await task();
    console.log(`PASS ${name}`);
    return true;
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    return false;
  }
}

async function main() {
  const results: boolean[] = [];

  results.push(
    await runCase("main notices adapter", () => {
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
    }),
  );

  results.push(
    await runCase("undergrad admissions adapter", () => {
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
    }),
  );

  results.push(
    await runCase("grad admissions adapter", () => {
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
    }),
  );

  results.push(
    await runCase("expanded official adapters are registered", () => {
      const sources = resolveSelectedSources([...OFFICIAL_INGEST_SOURCE_IDS]);

      assert.ok(sources.length >= 8);

      for (const source of sources) {
        const adapter = getSourceAdapter(source.id);

        assert.equal(adapter.sourceId, source.id);
        assert.deepEqual(adapter.seedListUrls(source), [source.baseUrl]);
      }
    }),
  );

  results.push(
    await runCase("rules and chunking", () => {
      assert.equal(
        normalizeCanonicalUrl("https://www.tjcu.edu.cn/info/1080/25496.htm?from=home#content"),
        "https://www.tjcu.edu.cn/info/1080/25496.htm",
      );

      const source = resolveSelectedSources(["tjcu-main-notices"])[0];
      assert.equal(isAllowedArticleUrl(source, "https://www.tjcu.edu.cn/info/1080/25496.htm"), true);
      assert.equal(isAllowedArticleUrl(source, "https://www.tjcu.edu.cn/index/tzgg.htm"), false);

      const first = buildDedupKey("tjcu-main-notices", "关于 校园网 断网升级 的 通知", "2026-04-17T01:30:00.000Z");
      const second = buildDedupKey("tjcu-main-notices", "关于 校园网 断网升级 的 通知", "2026-04-17T01:30:00.000Z");
      assert.equal(first, second);

      const markdown = Array.from({ length: 5 }, (_, index) => `第${index + 1}段：${"内容".repeat(120)}`).join("\n\n");
      const hash = buildContentHash(markdown);
      const chunks = buildChunksFromMarkdown(markdown);

      assert.equal(hash.length, 64);
      assert.ok(chunks.length >= 2);
      assert.ok(chunks.every((chunk) => chunk.tokenCount === chunk.fullSnippet.length));

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
    }),
  );

  results.push(
    await runCase("seed search returns answer evidence", () => {
      const response = searchSeed("图书馆借书", 2);

      assert.equal(response.status, "ok");
      assert.ok(response.sources.length > 0);
      assert.ok(response.answer?.evidence?.length);
      assert.equal(response.answer?.evidence?.[0].sourceId, response.sources[0].id);
    }),
  );

  results.push(
    await runCase("seed search rejects unrelated generic queries", () => {
      const response = searchSeed("明天校园集市几点开始", 2);

      assert.equal(response.status, "empty");
      assert.equal(response.sources.length, 0);
      assert.equal(response.answer, null);
    }),
  );

  results.push(
    await runCase("llm answer generation keeps evidence ids bounded", async () => {
      assert.equal(shouldUseLlm({ mode: "extractive", apiKey: "test-key", model: "test-model" }), false);
      assert.equal(shouldUseLlm({ mode: "llm", apiKey: "test-key", model: "test-model" }), true);

      const previousFetch = globalThis.fetch;

      globalThis.fetch = (async () => {
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    summary: "图书馆借阅需要凭校园卡办理，续借以图书馆规则为准。",
                    usedSourceIds: ["source-a", "unknown-source"],
                    confidence: 0.81,
                  }),
                },
              },
            ],
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        );
      }) as typeof fetch;

      try {
        const generated = await generateLlmAnswer(
          "图书馆借书",
          [
            {
              id: "source-a",
              title: "图书馆借阅与续借办理说明",
              sourceName: "图书馆",
              type: "official",
              publishedAt: null,
              updatedAt: null,
              fetchedAt: "2026-04-21T02:00:00.000Z",
              snippet: "读者凭校园卡可在图书馆办理借阅，续借以系统规则为准。",
            },
          ],
          { confidence: 0.72 },
          {
            SEARCH_ANSWER_MODE: "llm",
            LLM_API_KEY: "test-key",
            LLM_MODEL: "test-model",
            LLM_BASE_URL: "https://llm.example.test/v1",
          },
        );

        assert.equal(generated?.summary, "图书馆借阅需要凭校园卡办理，续借以图书馆规则为准。");
        assert.deepEqual(generated?.usedSourceIds, ["source-a"]);
        assert.equal(generated?.confidence, 0.81);
      } finally {
        globalThis.fetch = previousFetch;
      }
    }),
  );

  if (!process.env.DATABASE_URL) {
    console.log("SKIP postgres integration (DATABASE_URL is not configured)");
  } else {
    results.push(
      await runCase("postgres integration", async () => {
        const schema = `ingest_test_${crypto.randomUUID().replace(/-/g, "")}`;
        const store = new PostgresStore(process.env.DATABASE_URL!, schema);
        const source = resolveSelectedSources(["tjcu-main-notices"])[0];
        const baseArticle = {
          source,
          url: "https://www.tjcu.edu.cn/info/1080/25496.htm",
          canonicalUrl: "https://www.tjcu.edu.cn/info/1080/25496.htm",
          externalId: "25496",
          title: "关于校园网断网升级的通知",
          publishedAt: "2026-04-17T01:30:00.000Z",
          updatedAt: null,
          fetchedAt: "2026-04-21T02:00:00.000Z",
          rawHtml: "<html></html>",
          cleanedMarkdown: "第一段：" + "内容".repeat(180),
          dedupKey: buildDedupKey("tjcu-main-notices", "关于校园网断网升级的通知", "2026-04-17T01:30:00.000Z"),
          contentHash: "",
          chunks: [] as ReturnType<typeof buildChunksFromMarkdown>,
        };

        baseArticle.chunks = buildChunksFromMarkdown(baseArticle.cleanedMarkdown);
        baseArticle.contentHash = buildContentHash(baseArticle.cleanedMarkdown);

        try {
          await store.initSchema();
          await store.upsertSources([source]);

          const runId = await store.createRun(source.id);
          const firstPersist = await store.persistArticle(baseArticle);

          assert.equal(firstPersist.kind, "stored");
          assert.equal(firstPersist.wasNewDocument, true);

          const secondPersist = await store.persistArticle({
            ...baseArticle,
            fetchedAt: "2026-04-21T03:00:00.000Z",
          });

          assert.equal(secondPersist.kind, "dedup");

          const updatedMarkdown = `${baseArticle.cleanedMarkdown}\n\n第二段：${"补充".repeat(120)}`;
          const thirdPersist = await store.persistArticle({
            ...baseArticle,
            cleanedMarkdown: updatedMarkdown,
            fetchedAt: "2026-04-22T02:00:00.000Z",
            contentHash: buildContentHash(updatedMarkdown),
            chunks: buildChunksFromMarkdown(updatedMarkdown),
          });

          assert.equal(thirdPersist.kind, "stored");
          assert.equal(thirdPersist.wasNewDocument, false);

          await store.updateRun(runId, {
            stage: "publish",
            status: "succeeded",
            fetchedCount: 2,
            storedCount: 2,
            dedupedCount: 1,
            chunkCount: firstPersist.kind === "stored" ? firstPersist.chunkCount : 0,
            endedAt: new Date().toISOString(),
          });

          const rows = await store.inspectSources([source.id]);

          assert.equal(rows.length, 1);
          assert.equal(rows[0].runCount, 1);
          assert.equal(rows[0].documentCount, 1);
          assert.ok(rows[0].latestChunkCount > 0);

          const previousSchema = process.env.SEARCH_DATABASE_SCHEMA;
          process.env.SEARCH_DATABASE_SCHEMA = schema;

          try {
            const searchResponse = await searchPostgres("校园网升级", 3);

            assert.equal(searchResponse.status, "partial");
            assert.equal(searchResponse.sources.length, 1);
            assert.match(searchResponse.sources[0].title, /校园网断网升级/);
            assert.ok(searchResponse.answer?.evidence?.length);

            const emptyResponse = await searchPostgres("明天校园集市几点开始", 3);

            assert.equal(emptyResponse.status, "empty");
            assert.equal(emptyResponse.sources.length, 0);
          } finally {
            if (previousSchema === undefined) {
              delete process.env.SEARCH_DATABASE_SCHEMA;
            } else {
              process.env.SEARCH_DATABASE_SCHEMA = previousSchema;
            }

            await closePostgresPool();
          }
        } finally {
          await store.dropSchema();
          await store.close();
        }
      }),
    );
  }

  if (results.some((passed) => !passed)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
