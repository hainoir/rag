import fs from "node:fs/promises";

import { Pool, type PoolClient } from "pg";

import type { IngestionRunStatus, IngestionStage } from "../../src/lib/search/ingestion-contract.ts";
import type { SelectedSource } from "./types.ts";
import type { ParsedArticle, PersistOutcome } from "./types.ts";

type RunProgressPatch = {
  stage?: IngestionStage;
  status?: IngestionRunStatus;
  fetchedCount?: number;
  storedCount?: number;
  dedupedCount?: number;
  chunkCount?: number;
  endedAt?: string;
  errorMessage?: string | null;
};

type InspectRow = {
  sourceId: string;
  sourceName: string;
  runCount: number;
  fetchedCount: number;
  storedCount: number;
  dedupedCount: number;
  chunkCount: number;
  documentCount: number;
  latestChunkCount: number;
  lastStatus: string | null;
  lastStartedAt: string | null;
};

function quoteIdentifier(identifier: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid schema identifier: ${identifier}`);
  }

  return `"${identifier}"`;
}

export class PostgresStore {
  private readonly pool: Pool;
  private readonly schema: string;

  constructor(connectionString: string, schema = "public") {
    this.pool = new Pool({
      connectionString,
    });
    this.schema = schema;
  }

  async close() {
    await this.pool.end();
  }

  private async withClient<T>(task: (client: PoolClient) => Promise<T>) {
    const client = await this.pool.connect();

    try {
      await client.query(`set search_path to ${quoteIdentifier(this.schema)}, public`);
      return await task(client);
    } finally {
      client.release();
    }
  }

  async ensureSchema() {
    const client = await this.pool.connect();

    try {
      await client.query(`create schema if not exists ${quoteIdentifier(this.schema)}`);
    } finally {
      client.release();
    }
  }

  async dropSchema() {
    const client = await this.pool.connect();

    try {
      await client.query(`drop schema if exists ${quoteIdentifier(this.schema)} cascade`);
    } finally {
      client.release();
    }
  }

  async initSchema() {
    await this.ensureSchema();
    const schemaSql = await fs.readFile(new URL("../../docs/search-storage-schema.sql", import.meta.url), "utf8");

    await this.withClient(async (client) => {
      await client.query(schemaSql);
    });
  }

  async upsertSources(sources: SelectedSource[]) {
    if (sources.length === 0) {
      return;
    }

    await this.withClient(async (client) => {
      for (const source of sources) {
        await client.query(
          `
            insert into source_registry (
              id,
              name,
              type,
              description,
              base_url,
              fetch_mode,
              update_cadence,
              cleaning_profile,
              trust_weight,
              enabled
            )
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            on conflict (id)
            do update set
              name = excluded.name,
              type = excluded.type,
              description = excluded.description,
              base_url = excluded.base_url,
              fetch_mode = excluded.fetch_mode,
              update_cadence = excluded.update_cadence,
              cleaning_profile = excluded.cleaning_profile,
              trust_weight = excluded.trust_weight,
              enabled = excluded.enabled,
              updated_at = now()
          `,
          [
            source.id,
            source.name,
            source.type,
            source.description,
            source.baseUrl,
            source.fetchMode,
            source.updateCadence,
            source.cleaningProfile,
            source.trustWeight,
            source.enabled,
          ],
        );
      }
    });
  }

  async createRun(sourceId: string) {
    return this.withClient(async (client) => {
      const result = await client.query<{ id: string }>(
        `
          insert into ingestion_runs (source_id, status, stage, started_at)
          values ($1, 'running', 'fetch', $2)
          returning id
        `,
        [sourceId, new Date().toISOString()],
      );

      return result.rows[0].id;
    });
  }

  async updateRun(runId: string, patch: RunProgressPatch) {
    const fields: string[] = [];
    const values: Array<number | string | null> = [];

    if (patch.stage !== undefined) {
      fields.push(`stage = $${values.length + 1}`);
      values.push(patch.stage);
    }

    if (patch.status !== undefined) {
      fields.push(`status = $${values.length + 1}`);
      values.push(patch.status);
    }

    if (patch.fetchedCount !== undefined) {
      fields.push(`fetched_count = $${values.length + 1}`);
      values.push(patch.fetchedCount);
    }

    if (patch.storedCount !== undefined) {
      fields.push(`stored_count = $${values.length + 1}`);
      values.push(patch.storedCount);
    }

    if (patch.dedupedCount !== undefined) {
      fields.push(`deduped_count = $${values.length + 1}`);
      values.push(patch.dedupedCount);
    }

    if (patch.chunkCount !== undefined) {
      fields.push(`chunk_count = $${values.length + 1}`);
      values.push(patch.chunkCount);
    }

    if (patch.endedAt !== undefined) {
      fields.push(`ended_at = $${values.length + 1}`);
      values.push(patch.endedAt);
    }

    if (patch.errorMessage !== undefined) {
      fields.push(`error_message = $${values.length + 1}`);
      values.push(patch.errorMessage);
    }

    if (fields.length === 0) {
      return;
    }

    values.push(runId);

    await this.withClient(async (client) => {
      await client.query(`update ingestion_runs set ${fields.join(", ")} where id = $${values.length}`, values);
    });
  }

  async persistArticle(article: ParsedArticle): Promise<PersistOutcome> {
    return this.withClient(async (client) => {
      await client.query("begin");

      try {
        const existingByCanonical = await client.query<{
          id: string;
          source_id: string;
          content_hash: string;
        }>(
          `select id, source_id, content_hash from documents where canonical_url = $1 limit 1`,
          [article.canonicalUrl],
        );

        if (existingByCanonical.rows[0]) {
          const existing = existingByCanonical.rows[0];

          if (existing.source_id !== article.source.id) {
            await client.query("commit");
            return {
              kind: "dedup",
              reason: "cross_source_canonical",
              documentId: existing.id,
            };
          }

          if (existing.content_hash === article.contentHash) {
            await this.refreshDocumentMetadata(client, existing.id, article);
            await client.query("commit");
            return {
              kind: "dedup",
              reason: "canonical_unchanged",
              documentId: existing.id,
            };
          }

          const stored = await this.updateExistingDocument(client, existing.id, article);
          await client.query("commit");
          return stored;
        }

        if (article.externalId) {
          const existingByExternalId = await client.query<{
            id: string;
            content_hash: string;
          }>(
            `select id, content_hash from documents where source_id = $1 and external_id = $2 limit 1`,
            [article.source.id, article.externalId],
          );

          if (existingByExternalId.rows[0]) {
            const existing = existingByExternalId.rows[0];

            if (existing.content_hash === article.contentHash) {
              await this.refreshDocumentMetadata(client, existing.id, article);
              await client.query("commit");
              return {
                kind: "dedup",
                reason: "canonical_unchanged",
                documentId: existing.id,
              };
            }

            const stored = await this.updateExistingDocument(client, existing.id, article);
            await client.query("commit");
            return stored;
          }
        }

        const existingByDedupKey = await client.query<{ id: string }>(
          `select id from documents where dedup_key = $1 limit 1`,
          [article.dedupKey],
        );

        if (existingByDedupKey.rows[0]) {
          await client.query("commit");
          return {
            kind: "dedup",
            reason: "title_date",
            documentId: existingByDedupKey.rows[0].id,
          };
        }

        const existingByContentHash = await client.query<{ id: string }>(
          `select id from documents where content_hash = $1 limit 1`,
          [article.contentHash],
        );

        if (existingByContentHash.rows[0]) {
          await client.query("commit");
          return {
            kind: "dedup",
            reason: "content_hash",
            documentId: existingByContentHash.rows[0].id,
          };
        }

        const insertDocument = await client.query<{ id: string }>(
          `
            insert into documents (
              source_id,
              external_id,
              source_type,
              source_name,
              title,
              url,
              canonical_url,
              published_at,
              updated_at,
              fetched_at,
              last_verified_at,
              dedup_key,
              content_hash
            )
            values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            returning id
          `,
          [
            article.source.id,
            article.externalId,
            article.source.type,
            article.source.name,
            article.title,
            article.url,
            article.canonicalUrl,
            article.publishedAt,
            article.updatedAt,
            article.fetchedAt,
            article.fetchedAt,
            article.dedupKey,
            article.contentHash,
          ],
        );
        const documentId = insertDocument.rows[0].id;
        const versionId = await this.insertVersionWithChunks(client, documentId, 1, article);

        await client.query("commit");

        return {
          kind: "stored",
          documentId,
          versionId,
          chunkCount: article.chunks.length,
          wasNewDocument: true,
        };
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    });
  }

  private async refreshDocumentMetadata(client: PoolClient, documentId: string, article: ParsedArticle) {
    await client.query(
      `
        update documents
        set
          title = $2,
          url = $3,
          canonical_url = $4,
          published_at = $5,
          updated_at = $6,
          fetched_at = $7,
          last_verified_at = $8,
          dedup_key = $9,
          content_hash = $10,
          updated_at_db = now()
        where id = $1
      `,
      [
        documentId,
        article.title,
        article.url,
        article.canonicalUrl,
        article.publishedAt,
        article.updatedAt,
        article.fetchedAt,
        article.fetchedAt,
        article.dedupKey,
        article.contentHash,
      ],
    );
  }

  private async updateExistingDocument(client: PoolClient, documentId: string, article: ParsedArticle) {
    await this.refreshDocumentMetadata(client, documentId, article);

    const nextVersionResult = await client.query<{ version_no: number }>(
      `
        select coalesce(max(version_no), 0) + 1 as version_no
        from document_versions
        where document_id = $1
      `,
      [documentId],
    );
    const nextVersionNo = nextVersionResult.rows[0].version_no;
    const versionId = await this.insertVersionWithChunks(client, documentId, nextVersionNo, article);

    return {
      kind: "stored" as const,
      documentId,
      versionId,
      chunkCount: article.chunks.length,
      wasNewDocument: false,
    };
  }

  private async insertVersionWithChunks(
    client: PoolClient,
    documentId: string,
    versionNo: number,
    article: ParsedArticle,
  ) {
    const versionResult = await client.query<{ id: string }>(
      `
        insert into document_versions (document_id, version_no, raw_html, cleaned_markdown)
        values ($1, $2, $3, $4)
        returning id
      `,
      [documentId, versionNo, article.rawHtml, article.cleanedMarkdown],
    );
    const versionId = versionResult.rows[0].id;

    for (const chunk of article.chunks) {
      await client.query(
        `
          insert into chunks (document_version_id, chunk_index, snippet, full_snippet, token_count, embedding_ref)
          values ($1, $2, $3, $4, $5, null)
        `,
        [versionId, chunk.chunkIndex, chunk.snippet, chunk.fullSnippet, chunk.tokenCount],
      );
    }

    return versionId;
  }

  async inspectSources(sourceIds: string[]): Promise<InspectRow[]> {
    return this.withClient(async (client) => {
      const result = await client.query<{
        source_id: string;
        source_name: string;
        run_count: string;
        fetched_count: string;
        stored_count: string;
        deduped_count: string;
        chunk_count: string;
        document_count: string;
        latest_chunk_count: string;
        last_status: string | null;
        last_started_at: string | null;
      }>(
        `
          with selected_sources as (
            select id, name
            from source_registry
            where id = any($1::text[])
          ),
          run_stats as (
            select
              source_id,
              count(*)::int as run_count,
              coalesce(sum(fetched_count), 0)::int as fetched_count,
              coalesce(sum(stored_count), 0)::int as stored_count,
              coalesce(sum(deduped_count), 0)::int as deduped_count,
              coalesce(sum(chunk_count), 0)::int as chunk_count
            from ingestion_runs
            where source_id = any($1::text[])
            group by source_id
          ),
          last_runs as (
            select distinct on (source_id)
              source_id,
              status as last_status,
              started_at as last_started_at
            from ingestion_runs
            where source_id = any($1::text[])
            order by source_id, started_at desc
          ),
          document_stats as (
            select source_id, count(*)::int as document_count
            from documents
            where source_id = any($1::text[])
            group by source_id
          ),
          latest_versions as (
            select distinct on (document_id)
              document_id,
              id as version_id
            from document_versions
            order by document_id, version_no desc
          ),
          latest_chunk_stats as (
            select
              d.source_id,
              count(c.id)::int as latest_chunk_count
            from latest_versions lv
            join documents d on d.id = lv.document_id
            left join chunks c on c.document_version_id = lv.version_id
            where d.source_id = any($1::text[])
            group by d.source_id
          )
          select
            s.id as source_id,
            s.name as source_name,
            coalesce(rs.run_count, 0)::text as run_count,
            coalesce(rs.fetched_count, 0)::text as fetched_count,
            coalesce(rs.stored_count, 0)::text as stored_count,
            coalesce(rs.deduped_count, 0)::text as deduped_count,
            coalesce(rs.chunk_count, 0)::text as chunk_count,
            coalesce(ds.document_count, 0)::text as document_count,
            coalesce(lcs.latest_chunk_count, 0)::text as latest_chunk_count,
            lr.last_status,
            case when lr.last_started_at is null then null else lr.last_started_at::text end as last_started_at
          from selected_sources s
          left join run_stats rs on rs.source_id = s.id
          left join last_runs lr on lr.source_id = s.id
          left join document_stats ds on ds.source_id = s.id
          left join latest_chunk_stats lcs on lcs.source_id = s.id
          order by s.id
        `,
        [sourceIds],
      );

      return result.rows.map((row) => ({
        sourceId: row.source_id,
        sourceName: row.source_name,
        runCount: Number(row.run_count),
        fetchedCount: Number(row.fetched_count),
        storedCount: Number(row.stored_count),
        dedupedCount: Number(row.deduped_count),
        chunkCount: Number(row.chunk_count),
        documentCount: Number(row.document_count),
        latestChunkCount: Number(row.latest_chunk_count),
        lastStatus: row.last_status,
        lastStartedAt: row.last_started_at,
      }));
    });
  }
}
