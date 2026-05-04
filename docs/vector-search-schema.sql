-- Optional pgvector extension for hybrid retrieval.
-- Run through `npm run vector:init` so EMBEDDING_DIMENSIONS can be applied safely.

create extension if not exists vector;

alter table chunks
  add column if not exists embedding vector(1536),
  add column if not exists embedding_model text,
  add column if not exists embedded_at timestamptz;

create index if not exists chunks_embedding_hnsw_idx
on chunks using hnsw (embedding vector_cosine_ops)
where embedding is not null;
