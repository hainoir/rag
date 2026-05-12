import { createRequire } from "node:module";

import { Pool } from "pg";

import { readIngestRuntimeConfig, requireDatabaseUrl } from "../ingest/config.ts";

const require = createRequire(import.meta.url);
require("../load-env.cjs").loadLocalEnv();

const {
  readEmbeddingConfig,
}: {
  readEmbeddingConfig: () => {
    dimensions: number;
    vectorColumn: string;
    modelColumn: string;
    embeddedAtColumn: string;
  };
} = require("../embedding-client.cjs");

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
  const connectionString = requireDatabaseUrl(runtimeConfig);

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const pool = new Pool({
      connectionString,
    });

    try {
      await pool.query(`create schema if not exists ${quoteIdentifier(schema)}`);
      await pool.query(`set search_path to ${quoteIdentifier(schema)}, public`);

      try {
        await pool.query("create extension if not exists vector");
      } catch (error) {
        throw new Error(
          `pgvector extension is not available in this database. Install pgvector or use a Postgres image/provider that supports it. ${error instanceof Error ? error.message : String(error)}`,
          {
            cause: error,
          },
        );
      }

      await pool.query(`
        alter table chunks
          add column if not exists ${quoteIdentifier(embeddingConfig.vectorColumn)} vector(${embeddingConfig.dimensions}),
          add column if not exists ${quoteIdentifier(embeddingConfig.modelColumn)} text,
          add column if not exists ${quoteIdentifier(embeddingConfig.embeddedAtColumn)} timestamptz
      `);

      const hnswIndexName = quoteIdentifier(`chunks_${embeddingConfig.vectorColumn}_hnsw_idx`);
      const ivfIndexName = quoteIdentifier(`chunks_${embeddingConfig.vectorColumn}_ivfflat_idx`);

      try {
        await pool.query(`
          create index if not exists ${hnswIndexName}
          on chunks using hnsw (${quoteIdentifier(embeddingConfig.vectorColumn)} vector_cosine_ops)
          where ${quoteIdentifier(embeddingConfig.vectorColumn)} is not null
        `);
      } catch {
        await pool.query(`
          create index if not exists ${ivfIndexName}
          on chunks using ivfflat (${quoteIdentifier(embeddingConfig.vectorColumn)} vector_cosine_ops)
          with (lists = 100)
          where ${quoteIdentifier(embeddingConfig.vectorColumn)} is not null
        `);
      }

      console.log(
        `Vector schema ready: schema=${schema} column=${embeddingConfig.vectorColumn} dimensions=${embeddingConfig.dimensions}`,
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
