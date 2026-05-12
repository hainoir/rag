import { createRequire } from "node:module";

import { Pool } from "pg";

import { readIngestRuntimeConfig, requireDatabaseUrl } from "../ingest/config.ts";

const require = createRequire(import.meta.url);
require("../load-env.cjs").loadLocalEnv();

const {
  formatVectorLiteral,
  generateEmbeddings,
  readEmbeddingConfig,
  shouldUseEmbeddings,
}: {
  formatVectorLiteral: (embedding: number[]) => string;
  generateEmbeddings: (inputs: string[], config?: EmbeddingConfig) => Promise<number[][]>;
  readEmbeddingConfig: () => EmbeddingConfig;
  shouldUseEmbeddings: (config?: EmbeddingConfig) => boolean;
} = require("../embedding-client.cjs");

type EmbeddingConfig = {
  apiKey: string;
  model: string;
  dimensions: number;
  vectorColumn: string;
  modelColumn: string;
  embeddedAtColumn: string;
};

type PendingChunk = {
  id: string;
  title: string;
  sourceName: string;
  fullSnippet: string;
};

function quoteIdentifier(identifier: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid schema identifier: ${identifier}`);
  }

  return `"${identifier}"`;
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function parseBooleanFlag(name: string) {
  return process.argv.includes(name);
}

function toEmbeddingInput(chunk: PendingChunk) {
  return [`title: ${chunk.title}`, `source: ${chunk.sourceName}`, `chunk: ${chunk.fullSnippet}`]
    .join("\n")
    .slice(0, 6_000);
}

async function hasEmbeddingColumn(pool: Pool, schema: string) {
  const embeddingConfig = readEmbeddingConfig();
  const result = await pool.query<{ exists: boolean }>(
    `
      select exists (
        select 1
        from information_schema.columns
        where table_schema = $1
          and table_name = 'chunks'
          and column_name = $2
      )
    `,
    [schema, embeddingConfig.vectorColumn],
  );

  return Boolean(result.rows[0]?.exists);
}

async function main() {
  const runtimeConfig = readIngestRuntimeConfig();
  const embeddingConfig = readEmbeddingConfig();
  const schema = process.env.SEARCH_DATABASE_SCHEMA ?? "public";
  const limit = parsePositiveInteger(process.env.EMBEDDING_CHUNK_LIMIT, 200);
  const batchSize = Math.min(parsePositiveInteger(process.env.EMBEDDING_BATCH_SIZE, 16), 64);
  const dryRun = parseBooleanFlag("--dry-run") || !shouldUseEmbeddings(embeddingConfig);
  const pool = new Pool({
    connectionString: requireDatabaseUrl(runtimeConfig),
  });

  try {
    await pool.query(`set search_path to ${quoteIdentifier(schema)}, public`);

    if (!(await hasEmbeddingColumn(pool, schema))) {
      throw new Error(
        `chunks.${embeddingConfig.vectorColumn} column is missing. Run npm run vector:init before embedding chunks.`,
      );
    }

    const pending = await pool.query<{
      id: string;
      title: string;
      source_name: string;
      full_snippet: string;
    }>(
      `
        with latest_versions as (
          select distinct on (document_id)
            document_id,
            id as version_id
          from document_versions
          order by document_id, version_no desc
        )
        select
          c.id::text as id,
          d.title,
          d.source_name,
          c.full_snippet
        from chunks c
        join latest_versions lv on lv.version_id = c.document_version_id
        join documents d on d.id = lv.document_id
        where c.${quoteIdentifier(embeddingConfig.vectorColumn)} is null
          and d.status = 'active'
        order by c.created_at asc
        limit $1
      `,
      [limit],
    );
    const chunks: PendingChunk[] = pending.rows.map((row) => ({
      id: row.id,
      title: row.title,
      sourceName: row.source_name,
      fullSnippet: row.full_snippet,
    }));

    if (dryRun) {
      console.log(
        shouldUseEmbeddings(embeddingConfig)
          ? `Embedding dry run: pendingChunks=${chunks.length} model=${embeddingConfig.model}`
          : `SKIP embeddings: EMBEDDING_API_KEY is not configured. pendingChunks=${chunks.length}`,
      );
      return;
    }

    let embeddedCount = 0;

    for (let index = 0; index < chunks.length; index += batchSize) {
      const batch = chunks.slice(index, index + batchSize);
      const embeddings = await generateEmbeddings(batch.map(toEmbeddingInput), embeddingConfig);

      for (let batchIndex = 0; batchIndex < batch.length; batchIndex += 1) {
        await pool.query(
          `
            update chunks
            set
              ${quoteIdentifier(embeddingConfig.vectorColumn)} = $2::vector,
              embedding_ref = $3,
              ${quoteIdentifier(embeddingConfig.modelColumn)} = $3,
              ${quoteIdentifier(embeddingConfig.embeddedAtColumn)} = now()
            where id = $1
          `,
          [batch[batchIndex].id, formatVectorLiteral(embeddings[batchIndex]), embeddingConfig.model],
        );
        embeddedCount += 1;
      }
    }

    console.log(`Embedding complete: embeddedChunks=${embeddedCount} model=${embeddingConfig.model}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
