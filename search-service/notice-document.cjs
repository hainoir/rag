const { seedCorpus } = require("./seed-corpus.cjs");

const NOTICE_BODY_HARD_MAX_CHARS = 20_000;
const TRUNCATION_MARK = "…[已截断]";

function documentVisibilitySql() {
  return `d.status = 'active'
    and coalesce(sgo.enabled_override, sr.enabled, true) = true
    and (d.source_type <> 'community' or coalesce(crr.status, 'pending') in ('approved', 'supplemental'))`;
}

function governanceStatusSql() {
  return "coalesce(crr.status, case when d.source_type = 'community' then 'pending' else 'approved' end)";
}

function answerEligibilitySql() {
  return "(d.source_type <> 'community' or coalesce(crr.status, 'pending') = 'approved')";
}

function parseDocumentId(value) {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return id && id.length <= 128 ? id : null;
}

function isoOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toNoticeDocument(row, seed = false) {
  const original = String(seed ? (row.cleanedMarkdown ?? row.fullSnippet ?? "") : row.cleaned_markdown);
  const truncated = original.length > NOTICE_BODY_HARD_MAX_CHARS;
  const body = truncated
    ? original.slice(0, NOTICE_BODY_HARD_MAX_CHARS - TRUNCATION_MARK.length) + TRUNCATION_MARK
    : original;
  const url = row.url ?? null;
  return {
    documentId: seed ? row.documentId : row.document_id,
    versionNo: seed ? 1 : Number(row.version_no),
    title: row.title,
    type: seed ? row.type : row.source_type,
    sourceName: seed ? row.sourceName : row.source_name,
    sourceDomain: seed ? row.sourceDomain : url ? new URL(url).hostname : null,
    url,
    canonicalUrl: seed ? (row.canonicalUrl ?? null) : (row.canonical_url ?? null),
    publishedAt: isoOrNull(seed ? row.publishedAt : row.published_at),
    updatedAt: isoOrNull(seed ? row.updatedAt : row.updated_at),
    fetchedAt: isoOrNull(seed ? row.fetchedAt : row.fetched_at),
    lastVerifiedAt: isoOrNull(seed ? row.lastVerifiedAt : row.last_verified_at),
    governanceStatus: seed ? (row.type === "community" ? "supplemental" : "approved") : row.governance_status,
    answerEligible: seed ? row.type === "official" : Boolean(row.answer_eligible),
    body,
    truncated,
    bodyCharCount: original.length,
    returnedCharCount: body.length,
  };
}

const documentQuery = `
  select d.id::text as document_id, dv.version_no, dv.cleaned_markdown,
    d.title, d.source_type, d.source_name, d.url, d.canonical_url,
    d.published_at, d.updated_at, d.fetched_at, d.last_verified_at,
    ${governanceStatusSql()} as governance_status,
    ${answerEligibilitySql()} as answer_eligible
  from documents d
  join lateral (
    select version_no, cleaned_markdown from document_versions
    where document_id = d.id order by version_no desc limit 1
  ) dv on true
  left join source_registry sr on sr.id = d.source_id
  left join source_governance_overrides sgo on sgo.source_id = d.source_id
  left join lateral (
    select status from community_review_records
    where document_id = d.id or canonical_url = d.canonical_url
    order by updated_at desc, created_at desc limit 1
  ) crr on true
  where d.id::text = $1 and ${documentVisibilitySql()}
`;

async function getNoticeDocument(documentId, { provider, databaseConfigured, query } = {}) {
  const id = parseDocumentId(documentId);
  if (!id) return { status: 400, error: "invalid_document_id" };
  if (provider === "seed" || (provider === "auto" && !databaseConfigured)) {
    const record = seedCorpus.find((item) => item.documentId === id);
    return record
      ? { status: 200, document: toNoticeDocument(record, true) }
      : { status: 404, error: "notice_not_found" };
  }
  let rows;
  try {
    rows = await query(documentQuery, [id]);
  } catch {
    return { status: 503, error: "database_unavailable" };
  }
  return rows[0] ? { status: 200, document: toNoticeDocument(rows[0]) } : { status: 404, error: "notice_not_found" };
}

module.exports = {
  NOTICE_BODY_HARD_MAX_CHARS,
  TRUNCATION_MARK,
  answerEligibilitySql,
  documentVisibilitySql,
  getNoticeDocument,
  governanceStatusSql,
  parseDocumentId,
  toNoticeDocument,
};
