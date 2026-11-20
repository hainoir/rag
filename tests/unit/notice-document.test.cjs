const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createServer, buildPostgresSource, searchSeed } = require("../../search-service/server.cjs");
const { seedCorpus } = require("../../search-service/seed-corpus.cjs");
const noticeFixture = require("../../fixtures/notice-document.json");
const longBody = require("../../fixtures/notice-document-long.cjs");
const {
  TRUNCATION_MARK,
  documentVisibilitySql,
  getNoticeDocument,
  parseDocumentId,
  toNoticeDocument,
} = require("../../search-service/notice-document.cjs");

const dbRow = {
  document_id: "document-1",
  version_no: 2,
  cleaned_markdown: "Latest cleaned body; not the short snippet.",
  raw_html: "<script>never return this</script>",
  title: "Synthetic database notice",
  source_type: "official",
  source_name: "Test source",
  url: "https://example.test/notice",
  canonical_url: "https://example.test/notice",
  published_at: null,
  updated_at: null,
  fetched_at: new Date("2026-01-01T00:00:00Z"),
  last_verified_at: null,
  governance_status: "approved",
  answer_eligible: true,
};

test("search identifiers preserve chunk ID and expose document ID independently", () => {
  const source = buildPostgresSource(
    {
      ...dbRow,
      chunk_id: "chunk-1",
      snippet: "short snippet",
      full_snippet: "short full snippet",
    },
    [],
    "notice",
    new Date().toISOString(),
  );
  assert.equal(source.id, "chunk-1");
  assert.equal(source.documentId, "document-1");
  const seed = searchSeed("图书馆怎么借书", 6);
  assert.ok(seed.sources.length > 0);
  for (const item of seed.sources) assert.equal(item.documentId, item.id);
  assert.equal(seedCorpus.length, 12);
});

test("seed fetch uses cleanedMarkdown, with community ineligible", async () => {
  for (const item of seedCorpus) {
    assert.equal(item.documentId, item.id);
    assert.equal(typeof item.cleanedMarkdown, "string");
    const result = await getNoticeDocument(item.id, { provider: "seed" });
    assert.equal(result.status, 200);
    assert.equal(result.document.body, item.cleanedMarkdown);
    assert.notEqual(result.document.body, item.fullSnippet);
    assert.equal(result.document.answerEligible, item.type === "official");
    assert.equal(result.document.versionNo, 1);
  }
  assert.deepEqual((await getNoticeDocument(noticeFixture.documentId, { provider: "seed" })).document, noticeFixture);
});

test("database fetch queries latest version and returns only allowed fields", async () => {
  const result = await getNoticeDocument(" document-1 ", {
    provider: "postgres",
    databaseConfigured: true,
    query: async (sql, values) => {
      assert.deepEqual(values, ["document-1"]);
      assert.match(sql, /order by version_no desc limit 1/);
      assert.match(sql, /dv\.cleaned_markdown/);
      assert.doesNotMatch(sql, /raw_html/);
      assert.match(sql, /d\.status = 'active'/);
      assert.match(sql, /coalesce\(sgo\.enabled_override, sr\.enabled, true\) = true/);
      assert.match(sql, /coalesce\(crr\.status, 'pending'\) in \('approved', 'supplemental'\)/);
      const versions = [
        { ...dbRow, version_no: 1, cleaned_markdown: "Older cleaned body." },
        dbRow,
      ];
      return versions.sort((left, right) => right.version_no - left.version_no).slice(0, 1);
    },
  });
  assert.equal(result.status, 200);
  assert.equal(result.document.versionNo, 2);
  assert.equal(result.document.body, dbRow.cleaned_markdown);
  assert.equal(result.document.publishedAt, null);
  assert.equal(result.document.fetchedAt, "2026-01-01T00:00:00.000Z");
  assert.equal(JSON.stringify(result.document).includes("raw_html"), false);
  assert.equal(JSON.stringify(result.document).includes("version_id"), false);
});

test("shared visibility SQL covers hidden governance and source states", () => {
  const sql = documentVisibilitySql();
  assert.match(sql, /d\.status = 'active'/);
  assert.match(sql, /coalesce\(sgo\.enabled_override, sr\.enabled, true\) = true/);
  assert.match(sql, /coalesce\(crr\.status, 'pending'\) in \('approved', 'supplemental'\)/);
});

test("missing and hidden IDs share one 404; chunk IDs are not resolved", async () => {
  for (const hidden of [
    "unknown",
    "chunk-uuid",
    "inactive",
    "disabled",
    "pending",
    "rejected",
    "community-without-review",
  ]) {
    const result = await getNoticeDocument(hidden, {
      provider: "postgres",
      databaseConfigured: true,
      query: async () => [],
    });
    assert.deepEqual(result, { status: 404, error: "notice_not_found" });
  }
  for (const governance of ["approved", "supplemental"]) {
    const result = await getNoticeDocument("document-1", {
      provider: "postgres",
      databaseConfigured: true,
      query: async () => [
        {
          ...dbRow,
          source_type: "community",
          governance_status: governance,
          answer_eligible: governance === "approved",
        },
      ],
    });
    assert.equal(result.document.answerEligible, governance === "approved");
  }
});

test("bad IDs fail validation and database failures never substitute seed", async () => {
  for (const id of ["", "  ", "x".repeat(129), null, 4]) {
    assert.equal(parseDocumentId(id), null);
    assert.deepEqual(await getNoticeDocument(id, { provider: "seed" }), { status: 400, error: "invalid_document_id" });
  }
  for (const provider of ["postgres", "auto"]) {
    const result = await getNoticeDocument("official-library-borrow-guide", {
      provider,
      databaseConfigured: true,
      query: async () => {
        throw new Error("database down");
      },
    });
    assert.deepEqual(result, { status: 503, error: "database_unavailable" });
  }
  assert.equal(
    (await getNoticeDocument("official-library-borrow-guide", { provider: "auto", databaseConfigured: false })).status,
    200,
  );
});

test("synthetic long body truncates to the exact hard cap", () => {
  const result = toNoticeDocument({ ...dbRow, cleaned_markdown: longBody });
  assert.equal(result.truncated, true);
  assert.equal(result.body.length, 20_000);
  assert.equal(result.body.endsWith(TRUNCATION_MARK), true);
  assert.equal(result.bodyCharCount, longBody.length);
  assert.equal(result.returnedCharCount, 20_000);
  const exact = toNoticeDocument({ ...dbRow, cleaned_markdown: "x".repeat(20_000) });
  assert.equal(exact.truncated, false);
  assert.equal(exact.returnedCharCount, exact.bodyCharCount);
});

test("invalid database URL omits source domain without losing the document", () => {
  const result = toNoticeDocument({ ...dbRow, url: "not a url" });
  assert.equal(result.body, dbRow.cleaned_markdown);
  assert.equal(result.sourceDomain, undefined);
});

test("HTTP route authenticates and emits body without logging it", async () => {
  const oldProvider = process.env.SEARCH_SERVICE_PROVIDER;
  const oldKey = process.env.SEARCH_SERVICE_API_KEY;
  const oldDatabaseUrl = process.env.DATABASE_URL;
  process.env.SEARCH_SERVICE_PROVIDER = "seed";
  process.env.SEARCH_SERVICE_API_KEY = "admin-integration-key";
  delete process.env.DATABASE_URL;
  const server = createServer();
  const logs = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args) => logs.push(args.join(" "));
  console.error = (...args) => logs.push(args.join(" "));
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const get = async (path, key = "admin-integration-key") => {
      const response = await fetch(base + path, { headers: key ? { Authorization: `Bearer ${key}` } : {} });
      return { status: response.status, body: await response.json() };
    };
    assert.equal((await get("/api/documents/official-library-borrow-guide", null)).status, 401);
    assert.equal((await get("/api/documents/official-library-borrow-guide", "wrong-key")).body.error, "unauthorized");
    const found = await get("/api/documents/official-library-borrow-guide");
    assert.equal(found.status, 200);
    assert.equal(found.body.body, seedCorpus.find((item) => item.id === found.body.documentId).cleanedMarkdown);
    assert.equal("raw_html" in found.body, false);
    const injected = seedCorpus.find((item) => item.id === found.body.documentId);
    const originalBody = injected.cleanedMarkdown;
    const originalUrl = injected.url;
    const originalDomain = injected.sourceDomain;
    try {
      injected.cleanedMarkdown = longBody;
      injected.url = "not a url";
      injected.sourceDomain = undefined;
      const synthetic = await get(`/api/documents/${injected.documentId}`);
      assert.equal(synthetic.status, 200);
      assert.equal(synthetic.body.url, "not a url");
      assert.equal(synthetic.body.sourceDomain, undefined);
      assert.equal(synthetic.body.truncated, true);
      assert.equal(synthetic.body.body.length, 20_000);
      assert.equal(synthetic.body.body.endsWith(TRUNCATION_MARK), true);
      assert.equal(synthetic.body.bodyCharCount, longBody.length);
      assert.equal(synthetic.body.returnedCharCount, 20_000);
    } finally {
      injected.cleanedMarkdown = originalBody;
      injected.url = originalUrl;
      injected.sourceDomain = originalDomain;
    }
    assert.equal((await get("/api/documents")).body.error, "invalid_document_id");
    assert.equal((await get("/api/documents/%20%20")).status, 400);
    assert.equal((await get(`/api/documents/${"x".repeat(129)}`)).status, 400);
    assert.deepEqual((await get("/api/documents/chunk-uuid")).body, {
      error: "notice_not_found",
      message: "Notice not found.",
    });
    process.env.SEARCH_SERVICE_PROVIDER = "postgres";
    assert.deepEqual((await get("/api/documents/official-library-borrow-guide")).body, {
      error: "database_unavailable",
      message: "Database unavailable.",
    });
    assert.equal(logs.join(" ").includes(found.body.body), false);
  } finally {
    console.log = originalLog;
    console.error = originalError;
    await new Promise((resolve) => server.close(resolve));
    if (oldProvider === undefined) delete process.env.SEARCH_SERVICE_PROVIDER;
    else process.env.SEARCH_SERVICE_PROVIDER = oldProvider;
    if (oldKey === undefined) delete process.env.SEARCH_SERVICE_API_KEY;
    else process.env.SEARCH_SERVICE_API_KEY = oldKey;
    if (oldDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = oldDatabaseUrl;
  }
});
