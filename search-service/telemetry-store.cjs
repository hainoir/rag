const crypto = require("node:crypto");

let PostgresPoolCtor = null;
let telemetryPool = null;

function resolvePostgresPoolCtor() {
  if (!PostgresPoolCtor) {
    ({ Pool: PostgresPoolCtor } = require("pg"));
  }

  return PostgresPoolCtor;
}

function quoteIdentifier(identifier) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid schema identifier: ${identifier}`);
  }

  return `"${identifier}"`;
}

function getSearchSchema() {
  return process.env.SEARCH_DATABASE_SCHEMA || process.env.DATABASE_SCHEMA || "public";
}

function getTelemetryPool() {
  const databaseUrl = String(process.env.DATABASE_URL ?? "").trim();

  if (!databaseUrl) {
    return null;
  }

  if (!telemetryPool) {
    const Pool = resolvePostgresPoolCtor();
    telemetryPool = new Pool({
      connectionString: databaseUrl,
    });
  }

  return telemetryPool;
}

async function closeTelemetryPool() {
  if (!telemetryPool) {
    return;
  }

  const pool = telemetryPool;
  telemetryPool = null;
  await pool.end();
}

async function withTelemetryClient(task) {
  const pool = getTelemetryPool();

  if (!pool) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const client = await pool.connect();

  try {
    await client.query(`set search_path to ${quoteIdentifier(getSearchSchema())}, public`);
    return await task(client);
  } finally {
    client.release();
  }
}

function hashClientId(clientId) {
  const value = typeof clientId === "string" ? clientId.trim() : "";

  if (!value) {
    return null;
  }

  return crypto.createHash("sha256").update(value).digest("hex");
}

async function storeSearchFeedback(feedback) {
  if (!getTelemetryPool()) {
    return {
      stored: false,
      reason: "database_unconfigured",
    };
  }

  await withTelemetryClient(async (client) => {
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
  });

  return {
    stored: true,
  };
}

async function storeSearchQueryLog(payload) {
  if (!getTelemetryPool()) {
    return {
      stored: false,
      reason: "database_unconfigured",
    };
  }

  await withTelemetryClient(async (client) => {
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
          gateway_event,
          created_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
      `,
      [
        payload.requestId,
        payload.query,
        payload.status,
        payload.retrievedCount,
        payload.sourceCount,
        payload.officialSourceCount,
        payload.communitySourceCount,
        payload.cacheStatus,
        payload.errorCode ?? null,
        payload.durationMs ?? null,
        hashClientId(payload.clientId),
        payload.gatewayEvent,
      ],
    );
  });

  return {
    stored: true,
  };
}

async function recordServiceEvent(event) {
  if (!getTelemetryPool()) {
    return {
      stored: false,
      reason: "database_unconfigured",
    };
  }

  await withTelemetryClient(async (client) => {
    await client.query(
      `
        insert into service_event_logs (
          service,
          level,
          event,
          request_id,
          error_code,
          message,
          payload,
          created_at
        )
        values ($1, $2, $3, $4, $5, $6, $7::jsonb, now())
      `,
      [
        event.service,
        event.level,
        event.event,
        event.requestId ?? null,
        event.errorCode ?? null,
        event.message ?? null,
        JSON.stringify(event.payload ?? {}),
      ],
    );
  });

  return {
    stored: true,
  };
}

async function readTelemetryState() {
  if (!getTelemetryPool()) {
    return {
      databaseConfigured: false,
      databaseReachable: false,
      telemetryWritable: false,
      missingTables: ["search_feedback", "search_query_logs", "service_event_logs"],
    };
  }

  try {
    return await withTelemetryClient(async (client) => {
      const result = await client.query(
        `
          select
            to_regclass($1) as search_feedback_table,
            to_regclass($2) as search_query_logs_table,
            to_regclass($3) as service_event_logs_table
        `,
        [
          `${getSearchSchema()}.search_feedback`,
          `${getSearchSchema()}.search_query_logs`,
          `${getSearchSchema()}.service_event_logs`,
        ],
      );

      const row = result.rows[0] ?? {};
      const missingTables = [];

      if (!row.search_feedback_table) {
        missingTables.push("search_feedback");
      }

      if (!row.search_query_logs_table) {
        missingTables.push("search_query_logs");
      }

      if (!row.service_event_logs_table) {
        missingTables.push("service_event_logs");
      }

      return {
        databaseConfigured: true,
        databaseReachable: true,
        telemetryWritable: missingTables.length === 0,
        missingTables,
      };
    });
  } catch (error) {
    return {
      databaseConfigured: true,
      databaseReachable: false,
      telemetryWritable: false,
      missingTables: ["search_feedback", "search_query_logs", "service_event_logs"],
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

function rowsToCountMap(rows, keyField, valueField = "count") {
  return rows.reduce((counts, row) => {
    const key = row[keyField];

    if (typeof key === "string" && key) {
      counts[key] = Number(row[valueField] ?? 0);
    }

    return counts;
  }, {});
}

function buildPersistentMetricsSnapshot({
  windowHours,
  summaryRow,
  statusRows,
  cacheRows,
  errorRows,
  ingestionFailureRows,
}) {
  const requestsTotal = Number(summaryRow?.requests_total ?? 0);
  const averageDurationMs = Number(summaryRow?.average_duration_ms ?? 0);

  return {
    enabled: true,
    windowHours,
    requestsTotal,
    averageDurationMs: Number.isFinite(averageDurationMs) ? averageDurationMs : 0,
    byStatus: rowsToCountMap(statusRows, "status"),
    byCacheStatus: rowsToCountMap(cacheRows, "cache_status"),
    byErrorCode: rowsToCountMap(errorRows, "error_code"),
    recentIngestionFailures: ingestionFailureRows.map((row) => ({
      service: row.service,
      level: row.level,
      event: row.event,
      requestId: row.request_id ?? undefined,
      errorCode: row.error_code ?? undefined,
      message: row.message ?? undefined,
      payload: row.payload ?? {},
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    })),
  };
}

async function getPersistentMetrics(windowHours = 24) {
  const state = await readTelemetryState();

  if (!state.databaseConfigured) {
    return {
      enabled: false,
      reason: "database_unconfigured",
    };
  }

  if (!state.databaseReachable) {
    return {
      enabled: false,
      reason: "database_unreachable",
      ...(state.errorMessage ? { errorMessage: state.errorMessage } : {}),
    };
  }

  if (!state.telemetryWritable) {
    return {
      enabled: false,
      reason: "telemetry_schema_missing",
      missingTables: state.missingTables,
    };
  }

  return withTelemetryClient(async (client) => {
    const summaryResult = await client.query(
      `
        select
          count(*)::int as requests_total,
          coalesce(round(avg(duration_ms)::numeric, 2), 0)::float8 as average_duration_ms
        from search_query_logs
        where created_at >= now() - make_interval(hours => $1)
      `,
      [windowHours],
    );
    const statusResult = await client.query(
      `
        select status, count(*)::int as count
        from search_query_logs
        where created_at >= now() - make_interval(hours => $1)
        group by status
      `,
      [windowHours],
    );
    const cacheResult = await client.query(
      `
        select cache_status, count(*)::int as count
        from search_query_logs
        where created_at >= now() - make_interval(hours => $1)
          and cache_status is not null
        group by cache_status
      `,
      [windowHours],
    );
    const errorResult = await client.query(
      `
        select error_code, count(*)::int as count
        from search_query_logs
        where created_at >= now() - make_interval(hours => $1)
          and error_code is not null
        group by error_code
      `,
      [windowHours],
    );
    const ingestionFailureResult = await client.query(
      `
        select service, level, event, request_id, error_code, message, payload, created_at
        from service_event_logs
        where created_at >= now() - make_interval(hours => $1)
          and level = 'error'
          and (event like 'ingestion%' or event like 'scheduled_ingestion.%')
        order by created_at desc
        limit 10
      `,
      [windowHours],
    );

    return buildPersistentMetricsSnapshot({
      windowHours,
      summaryRow: summaryResult.rows[0] ?? null,
      statusRows: statusResult.rows,
      cacheRows: cacheResult.rows,
      errorRows: errorResult.rows,
      ingestionFailureRows: ingestionFailureResult.rows,
    });
  });
}

module.exports = {
  buildPersistentMetricsSnapshot,
  closeTelemetryPool,
  getPersistentMetrics,
  readTelemetryState,
  recordServiceEvent,
  storeSearchFeedback,
  storeSearchQueryLog,
};
