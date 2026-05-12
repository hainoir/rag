import { createRequire } from "node:module";

import { Pool } from "pg";

import { readIngestRuntimeConfig, requireDatabaseUrl } from "../ingest/config.ts";

const require = createRequire(import.meta.url);
require("../load-env.cjs").loadLocalEnv();

const {
  formatQueryEmbeddingInput,
  formatVectorLiteral,
  generateEmbedding,
  readEmbeddingConfig,
  shouldUseEmbeddings,
}: {
  formatQueryEmbeddingInput: (query: string, config?: EmbeddingConfig) => string;
  formatVectorLiteral: (embedding: number[]) => string;
  generateEmbedding: (input: string, config?: EmbeddingConfig) => Promise<number[]>;
  readEmbeddingConfig: () => EmbeddingConfig;
  shouldUseEmbeddings: (config?: EmbeddingConfig) => boolean;
} = require("../embedding-client.cjs");

type EmbeddingConfig = {
  apiKey: string;
  model: string;
  vectorColumn: string;
  queryInstruction?: string;
};

function quoteIdentifier(identifier: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid schema identifier: ${identifier}`);
  }

  return `"${identifier}"`;
}

function isRetryablePostgresConnectionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /connection terminated unexpectedly|connection terminated|server closed the connection unexpectedly|econnreset/i.test(
    message,
  );
}

async function main() {
  const runtimeConfig = readIngestRuntimeConfig();
  const embeddingConfig = readEmbeddingConfig();
  const schema = process.env.SEARCH_DATABASE_SCHEMA ?? "public";
  const query = process.env.SEARCH_VECTOR_SMOKE_QUERY ?? "图书馆借书";
  const connectionString = requireDatabaseUrl(runtimeConfig);

  if (!shouldUseEmbeddings(embeddingConfig)) {
    console.error("EMBEDDING_API_KEY is required for vector smoke verification.");
    process.exitCode = 1;
    return;
  }

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const pool = new Pool({
      connectionString,
    });

    try {
      await pool.query(`set search_path to ${quoteIdentifier(schema)}, public`);

      const embeddedCount = await pool.query<{ count: string }>(
        `select count(*)::text as count from chunks where ${quoteIdentifier(embeddingConfig.vectorColumn)} is not null`,
      );

      if (Number(embeddedCount.rows[0]?.count ?? 0) === 0) {
        throw new Error("No embedded chunks found. Run npm run embed:chunks first.");
      }

      const embedding = await generateEmbedding(formatQueryEmbeddingInput(query, embeddingConfig), embeddingConfig);
      const result = await pool.query<{ title: string; distance: number }>(
        `
          with latest_versions as (
            select distinct on (document_id)
              document_id,
              id as version_id
            from document_versions
            order by document_id, version_no desc
          )
          select
            d.title,
            (c.${quoteIdentifier(embeddingConfig.vectorColumn)} <=> $1::vector)::float as distance
          from chunks c
          join latest_versions lv on lv.version_id = c.document_version_id
          join documents d on d.id = lv.document_id
          where c.${quoteIdentifier(embeddingConfig.vectorColumn)} is not null
            and d.status = 'active'
          order by c.${quoteIdentifier(embeddingConfig.vectorColumn)} <=> $1::vector
          limit 3
        `,
        [formatVectorLiteral(embedding)],
      );

      if (result.rows.length === 0) {
        throw new Error(`Vector query returned no chunks for "${query}".`);
      }

      console.log(
        [
          "Vector smoke passed:",
          `query="${query}"`,
          `column=${embeddingConfig.vectorColumn}`,
          `embeddedChunks=${embeddedCount.rows[0].count}`,
          `topTitle="${result.rows[0].title}"`,
          `topDistance=${Number(result.rows[0].distance).toFixed(4)}`,
        ].join(" "),
      );
      return;
    } catch (error) {
      if (attempt === 2 || !isRetryablePostgresConnectionError(error)) {
        throw error;
      }
    } finally {
      await pool.end();
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
