create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create table if not exists source_registry (
  id text primary key,
  name text not null,
  type text not null check (type in ('official', 'community')),
  description text not null,
  base_url text not null,
  fetch_mode text not null,
  update_cadence text not null,
  cleaning_profile text not null,
  trust_weight numeric(4, 3) not null check (trust_weight >= 0 and trust_weight <= 1),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references source_registry(id),
  external_id text,
  source_type text not null check (source_type in ('official', 'community')),
  source_name text not null,
  title text not null,
  url text not null,
  canonical_url text not null,
  published_at timestamptz,
  updated_at timestamptz,
  fetched_at timestamptz not null,
  last_verified_at timestamptz,
  dedup_key text not null,
  content_hash text not null,
  status text not null default 'active' check (status in ('active', 'superseded', 'filtered', 'stale')),
  created_at timestamptz not null default now(),
  updated_at_db timestamptz not null default now(),
  unique (canonical_url),
  unique (source_id, external_id)
);

create table if not exists document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  version_no integer not null,
  raw_html text,
  cleaned_markdown text not null,
  created_at timestamptz not null default now(),
  unique (document_id, version_no)
);

create table if not exists chunks (
  id uuid primary key default gen_random_uuid(),
  document_version_id uuid not null references document_versions(id) on delete cascade,
  chunk_index integer not null,
  snippet text not null,
  full_snippet text not null,
  token_count integer not null,
  embedding_ref text,
  created_at timestamptz not null default now(),
  unique (document_version_id, chunk_index)
);

create table if not exists ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references source_registry(id),
  status text not null check (status in ('queued', 'running', 'succeeded', 'failed', 'partial')),
  stage text not null check (stage in ('fetch', 'clean', 'dedup', 'chunk', 'index', 'publish')),
  started_at timestamptz not null,
  ended_at timestamptz,
  fetched_count integer not null default 0,
  stored_count integer not null default 0,
  deduped_count integer not null default 0,
  chunk_count integer not null default 0,
  error_message text
);

create table if not exists ingestion_run_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references ingestion_runs(id) on delete cascade,
  source_id text not null references source_registry(id),
  stage text not null check (stage in ('fetch', 'clean', 'dedup', 'chunk', 'index', 'publish')),
  item_url text,
  status text not null check (status in ('succeeded', 'failed', 'skipped', 'retried')),
  attempt integer not null default 1,
  error_message text,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists search_feedback (
  id uuid primary key default gen_random_uuid(),
  request_id text not null,
  query text not null,
  rating text not null check (rating in ('up', 'down')),
  reason text,
  source_ids text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists search_query_logs (
  id uuid primary key default gen_random_uuid(),
  request_id text not null,
  query text not null,
  status text not null check (status in ('ok', 'partial', 'empty', 'error')),
  retrieved_count integer not null default 0,
  source_count integer not null default 0,
  official_source_count integer not null default 0,
  community_source_count integer not null default 0,
  cache_status text check (cache_status in ('hit', 'miss', 'bypass')),
  error_code text,
  duration_ms integer,
  client_hash text,
  gateway_event text not null default 'search_response' check (gateway_event in ('search_response', 'rate_limited', 'gateway_error')),
  created_at timestamptz not null default now()
);

alter table if exists search_query_logs
  add column if not exists gateway_event text not null default 'search_response';

create table if not exists service_event_logs (
  id uuid primary key default gen_random_uuid(),
  service text not null,
  level text not null check (level in ('info', 'error')),
  event text not null,
  request_id text,
  error_code text,
  message text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists documents_source_id_idx on documents (source_id);
create index if not exists documents_published_at_idx on documents (published_at desc);
create index if not exists documents_last_verified_at_idx on documents (last_verified_at desc);
create index if not exists documents_title_trgm_idx on documents using gin (title gin_trgm_ops);
create index if not exists chunks_document_version_id_idx on chunks (document_version_id);
create index if not exists chunks_snippet_trgm_idx on chunks using gin (snippet gin_trgm_ops);
create index if not exists chunks_full_snippet_trgm_idx on chunks using gin (full_snippet gin_trgm_ops);
create index if not exists ingestion_runs_source_id_idx on ingestion_runs (source_id, started_at desc);
create index if not exists ingestion_run_items_run_id_idx on ingestion_run_items (run_id);
create index if not exists search_feedback_request_id_idx on search_feedback (request_id);
create index if not exists search_feedback_created_at_idx on search_feedback (created_at desc);
create index if not exists search_query_logs_request_id_idx on search_query_logs (request_id);
create index if not exists search_query_logs_created_at_idx on search_query_logs (created_at desc);
create index if not exists search_query_logs_status_idx on search_query_logs (status, created_at desc);
create index if not exists search_query_logs_gateway_event_idx on search_query_logs (gateway_event, created_at desc);
create index if not exists service_event_logs_event_idx on service_event_logs (event, created_at desc);
create index if not exists service_event_logs_request_id_idx on service_event_logs (request_id);
