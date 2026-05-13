const assert = require("node:assert/strict");
const { Pool } = require("pg");

const { closeAdminPool, closePostgresPool, createServer } = require("../../search-service/server.cjs");
const { closeTelemetryPool } = require("../../search-service/telemetry-store.cjs");

async function seedAdminFixture() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const sourceId = "admin-test-source";

  try {
    await pool.query(`
      insert into source_registry (
        id, name, type, description, base_url, fetch_mode, update_cadence, cleaning_profile, trust_weight, enabled
      )
      values (
        '${sourceId}', '后台测试来源', 'community', 'integration fixture', 'https://example.test/',
        'html', 'daily', 'community_thread', 0.55, true
      )
      on conflict (id) do update set enabled = true, trust_weight = 0.55, updated_at = now()
    `);
    const document = await pool.query(
      `
        insert into documents (
          source_id, external_id, source_type, source_name, title, url, canonical_url,
          fetched_at, last_verified_at, dedup_key, content_hash
        )
        values ($1, 'admin-test-doc', 'community', '后台测试来源', '后台测试帖子',
          'https://example.test/post/1', 'https://example.test/post/1', now(), now(),
          'admin-test-dedup', 'admin-test-hash')
        on conflict (canonical_url) do update set updated_at_db = now()
        returning id
      `,
      [sourceId],
    );
    const version = await pool.query(
      `
        insert into document_versions (document_id, version_no, cleaned_markdown)
        values ($1, 1, '后台测试内容')
        on conflict (document_id, version_no) do update set cleaned_markdown = excluded.cleaned_markdown
        returning id
      `,
      [document.rows[0].id],
    );

    await pool.query(
      `
        insert into chunks (document_version_id, chunk_index, snippet, full_snippet, token_count)
        values ($1, 0, '后台测试内容', '后台测试内容', 8)
        on conflict (document_version_id, chunk_index) do nothing
      `,
      [version.rows[0].id],
    );
    const run = await pool.query(
      `
        insert into ingestion_runs (source_id, status, stage, started_at, ended_at, fetched_count, stored_count, chunk_count, error_message)
        values ($1, 'failed', 'publish', now(), now(), 1, 0, 0, 'fixture failure')
        returning id
      `,
      [sourceId],
    );
    await pool.query(
      `
        insert into ingestion_run_items (run_id, source_id, stage, item_url, status, error_message)
        values ($1, $2, 'fetch', 'https://example.test/post/1', 'failed', 'fixture item failure')
      `,
      [run.rows[0].id, sourceId],
    );
    await pool.query(
      `
        insert into search_query_logs (
          request_id, query, status, retrieved_count, source_count, official_source_count,
          community_source_count, cache_status, gateway_event, source_ids, source_snapshot,
          answer_summary, answer_confidence, result_generated_at
        )
        values (
          'admin-query-1', '后台测试', 'ok', 1, 1, 0, 1, 'miss', 'search_response',
          array[$1], $2::jsonb, '后台测试回答', 0.77, now()
        )
      `,
      [sourceId, JSON.stringify([{ id: sourceId, title: "后台测试帖子", type: "community", sourceName: "后台测试来源" }])],
    );
    const feedback = await pool.query(
      `
        insert into search_feedback (request_id, query, rating, reason, source_ids)
        values ('admin-query-1', '后台测试', 'down', 'needs review', array[$1])
        returning id
      `,
      [sourceId],
    );
    const review = await pool.query(
      `
        insert into community_review_records (source_id, document_id, canonical_url, title, status, risk_level, reason)
        values ($1, $2, 'https://example.test/post/1', '后台测试帖子', 'pending', 'medium', 'fixture')
        on conflict (canonical_url) do update set status = 'pending', updated_at = now()
        returning id
      `,
      [sourceId, document.rows[0].id],
    );

    return {
      sourceId,
      feedbackId: feedback.rows[0].id,
      reviewId: review.rows[0].id,
    };
  } finally {
    await pool.end();
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for admin integration tests.");
  }

  process.env.SEARCH_SERVICE_PROVIDER = "seed";
  process.env.SEARCH_SERVICE_API_KEY = "admin-integration-key";
  process.env.SEARCH_SERVICE_AUTH_HEADER = "Authorization";

  const fixture = await seedAdminFixture();
  const server = createServer();

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve the ephemeral search-service port.");
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;
  const headers = { Authorization: "Bearer admin-integration-key", "Content-Type": "application/json" };

  try {
    const sources = await fetch(`${baseUrl}/api/admin/sources`, { headers }).then((response) => response.json());
    assert.equal(sources.ok, true);
    assert.equal(sources.sources.some((source) => source.id === fixture.sourceId), true);

    const queryLogs = await fetch(`${baseUrl}/api/admin/query-logs?sourceType=community`, { headers }).then((response) =>
      response.json(),
    );
    assert.equal(queryLogs.items.some((item) => item.requestId === "admin-query-1"), true);

    const feedbackPatch = await fetch(`${baseUrl}/api/admin/feedback/${fixture.feedbackId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ status: "resolved", adminNote: "handled" }),
    });
    assert.equal(feedbackPatch.status, 200);

    const reviewPatch = await fetch(`${baseUrl}/api/admin/community-review/${fixture.reviewId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ status: "supplemental", riskLevel: "medium", reason: "experience only" }),
    });
    assert.equal(reviewPatch.status, 200);

    const sourcePatch = await fetch(`${baseUrl}/api/admin/sources/${fixture.sourceId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ enabled: false, trustWeight: 0.4, updateCadence: "manual" }),
    });
    assert.equal(sourcePatch.status, 200);

    const disabledIngest = await fetch(`${baseUrl}/api/admin/sources/${fixture.sourceId}/ingest`, {
      method: "POST",
      headers,
    });
    assert.equal(disabledIngest.status, 409);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
    await closePostgresPool();
    await closeTelemetryPool();
    await closeAdminPool();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
