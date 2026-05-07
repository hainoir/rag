import "server-only";

import { Pool } from "pg";

import type { SearchFeedbackPayload } from "@/lib/search/feedback";

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

export async function storeSearchFeedback(feedback: SearchFeedbackPayload) {
  const database = getPool();

  if (!database) {
    console.log(
      JSON.stringify({
        level: "info",
        timestamp: new Date().toISOString(),
        service: "feedback-store",
        event: "feedback.database_bypass",
        requestId: feedback.requestId,
      }),
    );
    return {
      stored: false,
    };
  }

  const schema = quoteIdentifier(process.env.SEARCH_DATABASE_SCHEMA?.trim() || "public");
  const client = await database.connect();

  try {
    await client.query(`set search_path to ${schema}, public`);
    await client.query(
      `
        insert into search_feedback (
          request_id,
          query,
          rating,
          reason,
          source_ids,
          created_at
        )
        values ($1, $2, $3, $4, $5, now())
      `,
      [
        feedback.requestId,
        feedback.query,
        feedback.rating,
        feedback.reason ?? null,
        feedback.sourceIds ?? [],
      ],
    );

    return {
      stored: true,
    };
  } finally {
    client.release();
  }
}
