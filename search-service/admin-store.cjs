const { Pool } = require("pg");

const ALLOWED_CADENCES = new Set(["hourly", "daily", "weekly", "manual"]);
const ALLOWED_FEEDBACK_STATUSES = new Set(["new", "reviewing", "resolved", "dismissed"]);
const ALLOWED_COMMUNITY_REVIEW_STATUSES = new Set(["pending", "approved", "supplemental", "rejected"]);
const ALLOWED_RISK_LEVELS = new Set(["low", "medium", "high"]);
const ALLOWED_SOURCE_TYPES = new Set(["official", "community"]);
const ALLOWED_SOURCE_HEALTH = new Set(["healthy", "warning", "failed", "disabled"]);
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

let adminPool = null;

function quoteIdentifier(identifier) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid schema identifier: ${identifier}`);
  }

  return `"${identifier}"`;
}

function getSearchSchema(env = process.env) {
  return String(env.SEARCH_DATABASE_SCHEMA ?? "public").trim() || "public";
}

function getAdminPool(env = process.env) {
  const databaseUrl = String(env.DATABASE_URL ?? "").trim();

  if (!databaseUrl) {
    return null;
  }

  if (!adminPool) {
    adminPool = new Pool({
      connectionString: databaseUrl,
    });
  }

  return adminPool;
}

async function closeAdminPool() {
  if (!adminPool) {
    return;
  }

  const pool = adminPool;
  adminPool = null;
  await pool.end();
}

function createAdminError(statusCode, code, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

async function withAdminClient(task, env = process.env) {
  const pool = getAdminPool(env);

  if (!pool) {
    throw createAdminError(503, "admin_database_unconfigured", "DATABASE_URL is required for admin APIs.");
  }

  const client = await pool.connect();

  try {
    await client.query(`set search_path to ${quoteIdentifier(getSearchSchema(env))}, public`);
    return await task(client);
  } finally {
    client.release();
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(record, key) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function normalizeOptionalString(value, maxLength = 1_000) {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function parsePositiveInteger(value, fallback, max = MAX_LIMIT) {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, max);
}

function parseWindowHours(value, fallback = 24) {
  return parsePositiveInteger(value, fallback, 24 * 30);
}

function parseSourceGovernancePatch(value) {
  if (!isRecord(value)) {
    return {
      ok: false,
      error: "Payload must be an object.",
    };
  }

  const patch = {};

  if (hasOwn(value, "enabled")) {
    if (value.enabled !== null && typeof value.enabled !== "boolean") {
      return {
        ok: false,
        error: "enabled must be a boolean or null.",
      };
    }

    patch.enabledOverride = value.enabled;
  }

  if (hasOwn(value, "trustWeight")) {
    if (value.trustWeight !== null && (typeof value.trustWeight !== "number" || value.trustWeight < 0 || value.trustWeight > 1)) {
      return {
        ok: false,
        error: "trustWeight must be between 0 and 1 or null.",
      };
    }

    patch.trustWeightOverride = value.trustWeight === null ? null : Number(value.trustWeight.toFixed(3));
  }

  if (hasOwn(value, "updateCadence")) {
    if (value.updateCadence !== null && (typeof value.updateCadence !== "string" || !ALLOWED_CADENCES.has(value.updateCadence))) {
      return {
        ok: false,
        error: "updateCadence must be one of hourly, daily, weekly, manual, or null.",
      };
    }

    patch.updateCadenceOverride = value.updateCadence;
  }

  if (hasOwn(value, "adminNote")) {
    const adminNote = normalizeOptionalString(value.adminNote, 1_000);

    if (adminNote === undefined) {
      return {
        ok: false,
        error: "adminNote must be a string or null.",
      };
    }

    patch.adminNote = adminNote;
  }

  const updatedBy = normalizeOptionalString(value.updatedBy, 120);
  patch.updatedBy = updatedBy ?? "admin";

  if (!hasOwn(patch, "enabledOverride") && !hasOwn(patch, "trustWeightOverride") && !hasOwn(patch, "updateCadenceOverride") && !hasOwn(patch, "adminNote")) {
    return {
      ok: false,
      error: "At least one governance field is required.",
    };
  }

  return {
    ok: true,
    patch,
  };
}

function parseFeedbackPatch(value) {
  if (!isRecord(value)) {
    return {
      ok: false,
      error: "Payload must be an object.",
    };
  }

  const patch = {};

  if (hasOwn(value, "status")) {
    if (typeof value.status !== "string" || !ALLOWED_FEEDBACK_STATUSES.has(value.status)) {
      return {
        ok: false,
        error: "status must be one of new, reviewing, resolved, dismissed.",
      };
    }

    patch.status = value.status;
  }

  if (hasOwn(value, "adminNote")) {
    const adminNote = normalizeOptionalString(value.adminNote, 1_000);

    if (adminNote === undefined) {
      return {
        ok: false,
        error: "adminNote must be a string or null.",
      };
    }

    patch.adminNote = adminNote;
  }

  const handledBy = normalizeOptionalString(value.handledBy, 120);
  patch.handledBy = handledBy ?? "admin";

  if (!patch.status && !hasOwn(patch, "adminNote")) {
    return {
      ok: false,
      error: "status or adminNote is required.",
    };
  }

  return {
    ok: true,
    patch,
  };
}

function parseCommunityReviewPatch(value) {
  if (!isRecord(value)) {
    return {
      ok: false,
      error: "Payload must be an object.",
    };
  }

  const patch = {};

  if (hasOwn(value, "status")) {
    if (typeof value.status !== "string" || !ALLOWED_COMMUNITY_REVIEW_STATUSES.has(value.status)) {
      return {
        ok: false,
        error: "status must be one of pending, approved, supplemental, rejected.",
      };
    }

    patch.status = value.status;
  }

  if (hasOwn(value, "riskLevel")) {
    if (typeof value.riskLevel !== "string" || !ALLOWED_RISK_LEVELS.has(value.riskLevel)) {
      return {
        ok: false,
        error: "riskLevel must be one of low, medium, high.",
      };
    }

    patch.riskLevel = value.riskLevel;
  }

  if (hasOwn(value, "reason")) {
    const reason = normalizeOptionalString(value.reason, 1_000);

    if (reason === undefined) {
      return {
        ok: false,
        error: "reason must be a string or null.",
      };
    }

    patch.reason = reason;
  }

  const reviewedBy = normalizeOptionalString(value.reviewedBy, 120);
  patch.reviewedBy = reviewedBy ?? "admin";

  if (!patch.status && !patch.riskLevel && !hasOwn(patch, "reason")) {
    return {
      ok: false,
      error: "status, riskLevel, or reason is required.",
    };
  }

  return {
    ok: true,
    patch,
  };
}

function toIso(value) {
  return value instanceof Date ? value.toISOString() : value ?? null;
}

function toNumber(value) {
  return Number(value ?? 0);
}

function mapSourceRow(row) {
  const enabled = row.enabled_override === null || row.enabled_override === undefined ? row.enabled : row.enabled_override;
  const trustWeight =
    row.trust_weight_override === null || row.trust_weight_override === undefined
      ? Number(row.trust_weight)
      : Number(row.trust_weight_override);
  const updateCadence = row.update_cadence_override ?? row.update_cadence;
  const runCount = toNumber(row.run_count);
  const failedRunCount = toNumber(row.failed_run_count);
  const lastStatus = row.last_status ?? null;
  const latestError = row.latest_error ?? row.last_error_message ?? null;
  const healthStatus = !enabled
    ? "disabled"
    : lastStatus === "failed"
      ? "failed"
      : lastStatus === "partial" || latestError
        ? "warning"
        : "healthy";

  return {
    id: row.id,
    name: row.name,
    type: row.type,
    description: row.description,
    baseUrl: row.base_url,
    fetchMode: row.fetch_mode,
    defaultEnabled: row.enabled,
    effectiveEnabled: enabled,
    defaultTrustWeight: Number(row.trust_weight),
    effectiveTrustWeight: trustWeight,
    defaultUpdateCadence: row.update_cadence,
    effectiveUpdateCadence: updateCadence,
    override: {
      enabled: row.enabled_override,
      trustWeight: row.trust_weight_override === null || row.trust_weight_override === undefined ? null : Number(row.trust_weight_override),
      updateCadence: row.update_cadence_override,
      adminNote: row.admin_note,
      updatedBy: row.updated_by,
      updatedAt: toIso(row.override_updated_at),
    },
    stats: {
      runCount,
      failedRunCount,
      failureRate: runCount > 0 ? Number((failedRunCount / runCount).toFixed(3)) : 0,
      documentCount: toNumber(row.document_count),
      chunkCount: toNumber(row.chunk_count),
      fetchedCount: toNumber(row.fetched_count),
      storedCount: toNumber(row.stored_count),
      dedupedCount: toNumber(row.deduped_count),
      lastStatus,
      lastStartedAt: toIso(row.last_started_at),
      lastEndedAt: toIso(row.last_ended_at),
      latestError,
    },
    healthStatus,
  };
}

async function getAdminSummary(filters = {}) {
  const windowHours = parseWindowHours(filters.windowHours, 24);

  return withAdminClient(async (client) => {
    const result = await client.query(
      `
        select
          (select count(*)::int from search_query_logs where created_at >= now() - make_interval(hours => $1)) as query_count,
          (select count(*)::int from search_query_logs where created_at >= now() - make_interval(hours => $1) and status = 'error') as error_count,
          (select coalesce(round(avg(duration_ms)::numeric, 2), 0)::float8 from search_query_logs where created_at >= now() - make_interval(hours => $1)) as average_duration_ms,
          (select count(*)::int from search_feedback where status in ('new', 'reviewing')) as pending_feedback_count,
          (select count(*)::int from ingestion_runs where started_at >= now() - make_interval(hours => $1) and status in ('failed', 'partial')) as ingestion_issue_count,
          (select count(*)::int from community_review_records where status = 'pending') as pending_community_review_count
      `,
      [windowHours],
    );
    const row = result.rows[0] ?? {};
    const queryCount = toNumber(row.query_count);
    const errorCount = toNumber(row.error_count);

    return {
      windowHours,
      queryCount,
      errorCount,
      errorRate: queryCount > 0 ? Number((errorCount / queryCount).toFixed(3)) : 0,
      averageDurationMs: Number(row.average_duration_ms ?? 0),
      pendingFeedbackCount: toNumber(row.pending_feedback_count),
      ingestionIssueCount: toNumber(row.ingestion_issue_count),
      pendingCommunityReviewCount: toNumber(row.pending_community_review_count),
    };
  });
}

async function listSources(filters = {}) {
  return withAdminClient(async (client) => {
    const result = await client.query(
      `
        with run_stats as (
          select
            source_id,
            count(*)::int as run_count,
            count(*) filter (where status in ('failed', 'partial'))::int as failed_run_count,
            coalesce(sum(fetched_count), 0)::int as fetched_count,
            coalesce(sum(stored_count), 0)::int as stored_count,
            coalesce(sum(deduped_count), 0)::int as deduped_count
          from ingestion_runs
          group by source_id
        ),
        latest_runs as (
          select distinct on (source_id)
            source_id,
            status as last_status,
            started_at as last_started_at,
            ended_at as last_ended_at,
            error_message as last_error_message
          from ingestion_runs
          order by source_id, started_at desc
        ),
        document_stats as (
          select source_id, count(*)::int as document_count
          from documents
          where status = 'active'
          group by source_id
        ),
        latest_versions as (
          select distinct on (document_id)
            document_id,
            id as version_id
          from document_versions
          order by document_id, version_no desc
        ),
        chunk_stats as (
          select d.source_id, count(c.id)::int as chunk_count
          from latest_versions lv
          join documents d on d.id = lv.document_id
          left join chunks c on c.document_version_id = lv.version_id
          where d.status = 'active'
          group by d.source_id
        ),
        latest_errors as (
          select distinct on (source_id)
            source_id,
            error_message as latest_error
          from ingestion_run_items
          where status = 'failed' and error_message is not null
          order by source_id, started_at desc
        )
        select
          sr.*,
          sgo.enabled_override,
          sgo.trust_weight_override,
          sgo.update_cadence_override,
          sgo.admin_note,
          sgo.updated_by,
          sgo.updated_at as override_updated_at,
          coalesce(rs.run_count, 0) as run_count,
          coalesce(rs.failed_run_count, 0) as failed_run_count,
          coalesce(rs.fetched_count, 0) as fetched_count,
          coalesce(rs.stored_count, 0) as stored_count,
          coalesce(rs.deduped_count, 0) as deduped_count,
          coalesce(ds.document_count, 0) as document_count,
          coalesce(cs.chunk_count, 0) as chunk_count,
          lr.last_status,
          lr.last_started_at,
          lr.last_ended_at,
          lr.last_error_message,
          le.latest_error
        from source_registry sr
        left join source_governance_overrides sgo on sgo.source_id = sr.id
        left join run_stats rs on rs.source_id = sr.id
        left join latest_runs lr on lr.source_id = sr.id
        left join document_stats ds on ds.source_id = sr.id
        left join chunk_stats cs on cs.source_id = sr.id
        left join latest_errors le on le.source_id = sr.id
        order by sr.type, sr.id
      `,
    );

    let sources = result.rows.map(mapSourceRow);

    if (ALLOWED_SOURCE_TYPES.has(filters.type)) {
      sources = sources.filter((source) => source.type === filters.type);
    }

    if (ALLOWED_SOURCE_HEALTH.has(filters.health)) {
      sources = sources.filter((source) => source.healthStatus === filters.health);
    }

    return {
      sources,
    };
  });
}

async function getEffectiveSource(sourceId) {
  return withAdminClient(async (client) => {
    const result = await client.query(
      `
        select
          sr.id,
          sr.name,
          sr.type,
          sr.enabled,
          sr.trust_weight,
          sr.update_cadence,
          sgo.enabled_override,
          sgo.trust_weight_override,
          sgo.update_cadence_override
        from source_registry sr
        left join source_governance_overrides sgo on sgo.source_id = sr.id
        where sr.id = $1
        limit 1
      `,
      [sourceId],
    );

    const row = result.rows[0];

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      name: row.name,
      type: row.type,
      enabled: row.enabled_override === null || row.enabled_override === undefined ? row.enabled : row.enabled_override,
      trustWeight:
        row.trust_weight_override === null || row.trust_weight_override === undefined
          ? Number(row.trust_weight)
          : Number(row.trust_weight_override),
      updateCadence: row.update_cadence_override ?? row.update_cadence,
    };
  });
}

async function updateSourceGovernance(sourceId, patch) {
  await withAdminClient(async (client) => {
    const exists = await client.query("select id from source_registry where id = $1 limit 1", [sourceId]);

    if (exists.rowCount === 0) {
      throw createAdminError(404, "source_not_found", `Unknown source: ${sourceId}`);
    }

    await client.query(
      `
        insert into source_governance_overrides (source_id, updated_by, updated_at)
        values ($1, $2, now())
        on conflict (source_id) do nothing
      `,
      [sourceId, patch.updatedBy],
    );

    const fields = ["updated_by = $2", "updated_at = now()"];
    const values = [sourceId, patch.updatedBy];

    if (hasOwn(patch, "enabledOverride")) {
      values.push(patch.enabledOverride);
      fields.push(`enabled_override = $${values.length}`);
    }

    if (hasOwn(patch, "trustWeightOverride")) {
      values.push(patch.trustWeightOverride);
      fields.push(`trust_weight_override = $${values.length}`);
    }

    if (hasOwn(patch, "updateCadenceOverride")) {
      values.push(patch.updateCadenceOverride);
      fields.push(`update_cadence_override = $${values.length}`);
    }

    if (hasOwn(patch, "adminNote")) {
      values.push(patch.adminNote);
      fields.push(`admin_note = $${values.length}`);
    }

    await client.query(`update source_governance_overrides set ${fields.join(", ")} where source_id = $1`, values);
  });

  return getEffectiveSource(sourceId);
}

async function listQueryLogs(filters = {}) {
  const limit = parsePositiveInteger(filters.limit, DEFAULT_LIMIT);
  const offset = parsePositiveInteger(filters.offset, 0, 10_000);
  const conditions = ["created_at >= now() - make_interval(hours => $1)"];
  const values = [parseWindowHours(filters.windowHours, 24)];

  for (const [field, column] of [
    ["status", "status"],
    ["gatewayEvent", "gateway_event"],
    ["cacheStatus", "cache_status"],
    ["errorCode", "error_code"],
  ]) {
    if (typeof filters[field] === "string" && filters[field].trim()) {
      values.push(filters[field].trim());
      conditions.push(`${column} = $${values.length}`);
    }
  }

  if (filters.sourceType === "official") {
    conditions.push("official_source_count > 0");
  } else if (filters.sourceType === "community") {
    conditions.push("community_source_count > 0");
  }

  values.push(limit, offset);

  return withAdminClient(async (client) => {
    const result = await client.query(
      `
        select
          id::text,
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
          gateway_event,
          source_ids,
          source_snapshot,
          answer_summary,
          answer_confidence,
          result_generated_at,
          created_at
        from search_query_logs
        where ${conditions.join(" and ")}
        order by created_at desc
        limit $${values.length - 1}
        offset $${values.length}
      `,
      values,
    );

    return {
      items: result.rows.map((row) => ({
        id: row.id,
        requestId: row.request_id,
        query: row.query,
        status: row.status,
        retrievedCount: row.retrieved_count,
        sourceCount: row.source_count,
        officialSourceCount: row.official_source_count,
        communitySourceCount: row.community_source_count,
        cacheStatus: row.cache_status,
        errorCode: row.error_code,
        durationMs: row.duration_ms,
        gatewayEvent: row.gateway_event,
        sourceIds: row.source_ids ?? [],
        sourceSnapshot: row.source_snapshot ?? [],
        answerSummary: row.answer_summary,
        answerConfidence: row.answer_confidence === null || row.answer_confidence === undefined ? null : Number(row.answer_confidence),
        resultGeneratedAt: toIso(row.result_generated_at),
        createdAt: toIso(row.created_at),
      })),
    };
  });
}

async function listFeedback(filters = {}) {
  const limit = parsePositiveInteger(filters.limit, DEFAULT_LIMIT);
  const offset = parsePositiveInteger(filters.offset, 0, 10_000);
  const conditions = ["f.created_at >= now() - make_interval(hours => $1)"];
  const values = [parseWindowHours(filters.windowHours, 24)];

  if (filters.rating === "up" || filters.rating === "down") {
    values.push(filters.rating);
    conditions.push(`f.rating = $${values.length}`);
  }

  if (ALLOWED_FEEDBACK_STATUSES.has(filters.status)) {
    values.push(filters.status);
    conditions.push(`f.status = $${values.length}`);
  }

  values.push(limit, offset);

  return withAdminClient(async (client) => {
    const result = await client.query(
      `
        select
          f.id::text,
          f.request_id,
          f.query,
          f.rating,
          f.reason,
          f.source_ids,
          f.status,
          f.handled_at,
          f.handled_by,
          f.admin_note,
          f.created_at,
          q.status as query_status,
          q.source_snapshot,
          q.answer_summary,
          q.answer_confidence,
          q.result_generated_at
        from search_feedback f
        left join lateral (
          select status, source_snapshot, answer_summary, answer_confidence, result_generated_at
          from search_query_logs
          where request_id = f.request_id
          order by created_at desc
          limit 1
        ) q on true
        where ${conditions.join(" and ")}
        order by f.created_at desc
        limit $${values.length - 1}
        offset $${values.length}
      `,
      values,
    );

    return {
      items: result.rows.map((row) => ({
        id: row.id,
        requestId: row.request_id,
        query: row.query,
        rating: row.rating,
        reason: row.reason,
        sourceIds: row.source_ids ?? [],
        status: row.status,
        handledAt: toIso(row.handled_at),
        handledBy: row.handled_by,
        adminNote: row.admin_note,
        createdAt: toIso(row.created_at),
        queryStatus: row.query_status,
        sourceSnapshot: row.source_snapshot ?? [],
        answerSummary: row.answer_summary,
        answerConfidence: row.answer_confidence === null || row.answer_confidence === undefined ? null : Number(row.answer_confidence),
        resultGeneratedAt: toIso(row.result_generated_at),
      })),
    };
  });
}

async function updateFeedback(feedbackId, patch) {
  return withAdminClient(async (client) => {
    const fields = [];
    const values = [feedbackId];

    if (patch.status) {
      values.push(patch.status);
      fields.push(`status = $${values.length}`);
      values.push(patch.status === "resolved" || patch.status === "dismissed" ? patch.handledBy : null);
      fields.push(`handled_by = $${values.length}`);
      fields.push(`handled_at = ${patch.status === "resolved" || patch.status === "dismissed" ? "now()" : "null"}`);
    }

    if (hasOwn(patch, "adminNote")) {
      values.push(patch.adminNote);
      fields.push(`admin_note = $${values.length}`);
    }

    const result = await client.query(
      `
        update search_feedback
        set ${fields.join(", ")}
        where id = $1
        returning id::text
      `,
      values,
    );

    if (result.rowCount === 0) {
      throw createAdminError(404, "feedback_not_found", `Unknown feedback id: ${feedbackId}`);
    }
  });
}

async function listCommunityReview(filters = {}) {
  const limit = parsePositiveInteger(filters.limit, DEFAULT_LIMIT);
  const offset = parsePositiveInteger(filters.offset, 0, 10_000);
  const conditions = ["true"];
  const values = [];

  if (ALLOWED_COMMUNITY_REVIEW_STATUSES.has(filters.status)) {
    values.push(filters.status);
    conditions.push(`crr.status = $${values.length}`);
  }

  if (typeof filters.sourceId === "string" && filters.sourceId.trim()) {
    values.push(filters.sourceId.trim());
    conditions.push(`crr.source_id = $${values.length}`);
  }

  values.push(limit, offset);

  return withAdminClient(async (client) => {
    const result = await client.query(
      `
        select
          crr.id::text,
          crr.source_id,
          sr.name as source_name,
          crr.document_id::text,
          crr.canonical_url,
          coalesce(crr.title, d.title) as title,
          crr.status,
          crr.risk_level,
          crr.reason,
          crr.reviewed_by,
          crr.reviewed_at,
          crr.created_at,
          crr.updated_at
        from community_review_records crr
        left join source_registry sr on sr.id = crr.source_id
        left join documents d on d.id = crr.document_id
        where ${conditions.join(" and ")}
        order by crr.updated_at desc
        limit $${values.length - 1}
        offset $${values.length}
      `,
      values,
    );

    return {
      items: result.rows.map((row) => ({
        id: row.id,
        sourceId: row.source_id,
        sourceName: row.source_name,
        documentId: row.document_id,
        canonicalUrl: row.canonical_url,
        title: row.title,
        status: row.status,
        riskLevel: row.risk_level,
        reason: row.reason,
        reviewedBy: row.reviewed_by,
        reviewedAt: toIso(row.reviewed_at),
        createdAt: toIso(row.created_at),
        updatedAt: toIso(row.updated_at),
      })),
    };
  });
}

async function updateCommunityReview(reviewId, patch) {
  return withAdminClient(async (client) => {
    const fields = ["updated_at = now()"];
    const values = [reviewId];

    if (patch.status) {
      values.push(patch.status);
      fields.push(`status = $${values.length}`);
      values.push(patch.status === "pending" ? null : patch.reviewedBy);
      fields.push(`reviewed_by = $${values.length}`);
      fields.push(`reviewed_at = ${patch.status === "pending" ? "null" : "now()"}`);
    }

    if (patch.riskLevel) {
      values.push(patch.riskLevel);
      fields.push(`risk_level = $${values.length}`);
    }

    if (hasOwn(patch, "reason")) {
      values.push(patch.reason);
      fields.push(`reason = $${values.length}`);
    }

    const result = await client.query(
      `
        update community_review_records
        set ${fields.join(", ")}
        where id = $1
        returning id::text
      `,
      values,
    );

    if (result.rowCount === 0) {
      throw createAdminError(404, "community_review_not_found", `Unknown community review id: ${reviewId}`);
    }
  });
}

async function recordCommunityReviewCandidate(candidate) {
  return withAdminClient(async (client) => {
    await client.query(
      `
        insert into community_review_records (
          source_id,
          document_id,
          canonical_url,
          title,
          status,
          risk_level,
          reason,
          created_at,
          updated_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, now(), now())
        on conflict (canonical_url)
        do update set
          document_id = coalesce(excluded.document_id, community_review_records.document_id),
          title = coalesce(excluded.title, community_review_records.title),
          updated_at = now()
      `,
      [
        candidate.sourceId,
        candidate.documentId ?? null,
        candidate.canonicalUrl,
        candidate.title ?? null,
        candidate.status ?? "pending",
        candidate.riskLevel ?? "medium",
        candidate.reason ?? "community_default_review",
      ],
    );
  });
}

module.exports = {
  ALLOWED_CADENCES,
  ALLOWED_COMMUNITY_REVIEW_STATUSES,
  ALLOWED_FEEDBACK_STATUSES,
  ALLOWED_RISK_LEVELS,
  closeAdminPool,
  createAdminError,
  getAdminSummary,
  getEffectiveSource,
  listCommunityReview,
  listFeedback,
  listQueryLogs,
  listSources,
  parseCommunityReviewPatch,
  parseFeedbackPatch,
  parseSourceGovernancePatch,
  recordCommunityReviewCandidate,
  updateCommunityReview,
  updateFeedback,
  updateSourceGovernance,
};
