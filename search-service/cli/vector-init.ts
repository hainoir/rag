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
  };
} = require("../embedding-client.cjs");

function quoteIdentifier(identifier: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid schema identifier: ${identifier}`);
  }

  return `"${identifier}"`;
}

async function main() {
  const runtimeConfig = readIngestRuntimeConfig();
  const embeddingConfig = readEmbeddingConfig();
  const schema = process.env.SEARCH_DATABASE_SCHEMA ?? "public";
  const pool = new Pool({
    connectionString: requireDatabaseUrl(runtimeConfig),
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
        add column if not exists embedding vector(${embeddingConfig.dimensions}),
        add column if not exists embedding_model text,
        add column if not exists embedded_at timestamptz
    `);

    try {
      await pool.query(`
        create index if not exists chunks_embedding_hnsw_idx
        on chunks using hnsw (embedding vector_cosine_ops)
        where embedding is not null
      `);
    } catch {
      await pool.query(`
        create index if not exists chunks_embedding_ivfflat_idx
        on chunks using ivfflat (embedding vector_cosine_ops)
        with (lists = 100)
        where embedding is not null
      `);
    }

    console.log(`Vector schema ready: schema=${schema} dimensions=${embeddingConfig.dimensions}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
