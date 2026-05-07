import "server-only";

import crypto from "node:crypto";

import { Pool } from "pg";

import type { SearchResponse } from "@/lib/search/types";

export type SearchQueryLogPayload = {
  requestId: string;
  query: string;
  response: SearchResponse;
  clientId?: string;
};

let pool: Pool | null = null;

function quoteIdentifier(identifier: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid schema identifier: ${identifier}`);
  }

  return `"${identifier}"`;
}

function getPool() {
  const connectionString = process.env.DATABASE_URL?.trim();

  if (!connectionString) {
    return null;
  }

  pool ??= new Pool({ connectionString });

  return pool;
}

function hashClientId(clientId: string | undefined) {
  const value = clientId?.trim();

  if (!value) {
    return null;
  }

  return crypto.createHash("sha256").update(value).digest("hex");
}

function countSources(response: SearchResponse) {
  return response.sources.reduce(
    (counts, source) => {
      if (source.type === "official") {
        counts.official += 1;
      }

      if (source.type === "community") {
        counts.community += 1;
      }

      return counts;
    },
    {
      official: 0,
      community: 0,
    },
  );
}

export async function storeSearchQueryLog({ requestId, query, response, clientId }: SearchQueryLogPayload) {
  const database = getPool();

  if (!database) {
    console.log(
      JSON.stringify({
        level: "info",
        timestamp: new Date().toISOString(),
        service: "search-log-store",
        event: "search_log.database_bypass",
        requestId,
        status: response.status,
      }),
    );
    return {
      stored: false,
    };
  }

  const schema = quoteIdentifier(process.env.SEARCH_DATABASE_SCHEMA?.trim() || "public");
  const sourceCounts = countSources(response);
  const client = await database.connect();

  try {
    await client.query(`set search_path to ${schema}, public`);
    await client.query(
      `
        insert into search_query_logs (
          request_id,
          query,
          status,
          retrieved_count,
          source_count,
          official_source_count,
          community_source_count,
          cache_status,
          error_code,
          duration_ms,
          client_hash,
          created_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
      `,
      [
        requestId,
        query,
        response.status,
        response.retrievedCount,
        response.sources.length,
        sourceCounts.official,
        sourceCounts.community,
        response.meta?.cacheStatus ?? null,
        response.meta?.errorCode ?? null,
        response.meta?.durationMs ?? null,
        hashClientId(clientId),
      ],
    );

    return {
      stored: true,
    };
  } finally {
    client.release();
  }
}
