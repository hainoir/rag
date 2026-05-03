import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import { resolveSelectedSources } from "../ingest/config";
import { PostgresStore } from "../ingest/postgres-store";
import { buildChunksFromMarkdown, buildContentHash, buildDedupKey } from "../ingest/utils";

const databaseUrl = process.env.DATABASE_URL;
const integrationTest = databaseUrl ? test : test.skip;

integrationTest("postgres store initializes schema, persists versions, and records run flow", async () => {
  const schema = `ingest_test_${crypto.randomUUID().replace(/-/g, "")}`;
  const store = new PostgresStore(databaseUrl!, schema);
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
  } finally {
    await store.dropSchema();
    await store.close();
  }
});
