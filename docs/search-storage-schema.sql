create table source_registry (
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

create table documents (
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
  status text not null default 'active' check (status in ('active', 'superseded', 'filtered')),
  created_at timestamptz not null default now(),
  updated_at_db timestamptz not null default now(),
  unique (canonical_url),
  unique (source_id, external_id)
);

create table document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  version_no integer not null,
  raw_html text,
  cleaned_markdown text not null,
  created_at timestamptz not null default now(),
  unique (document_id, version_no)
);

create table chunks (
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

create table ingestion_runs (
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

create index documents_source_id_idx on documents (source_id);
create index documents_published_at_idx on documents (published_at desc);
create index documents_last_verified_at_idx on documents (last_verified_at desc);
create index chunks_document_version_id_idx on chunks (document_version_id);
create index ingestion_runs_source_id_idx on ingestion_runs (source_id, started_at desc);
