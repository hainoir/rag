--
-- PostgreSQL database dump
--

\restrict q0UecpjxiB1Hh1Da8pSDUeaOGMuM1u8STAped7mOSaHXwbRHmq6L0LBOXjaNWCl

-- Dumped from database version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: chunks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.chunks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_version_id uuid NOT NULL,
    chunk_index integer NOT NULL,
    snippet text NOT NULL,
    full_snippet text NOT NULL,
    token_count integer NOT NULL,
    embedding_ref text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.chunks OWNER TO postgres;

--
-- Name: community_review_records; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.community_review_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_id text NOT NULL,
    document_id uuid,
    canonical_url text NOT NULL,
    title text,
    status text DEFAULT 'pending'::text NOT NULL,
    risk_level text DEFAULT 'medium'::text NOT NULL,
    reason text,
    reviewed_by text,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT community_review_records_risk_level_check CHECK ((risk_level = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text]))),
    CONSTRAINT community_review_records_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'supplemental'::text, 'rejected'::text])))
);


ALTER TABLE public.community_review_records OWNER TO postgres;

--
-- Name: document_versions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.document_versions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    document_id uuid NOT NULL,
    version_no integer NOT NULL,
    raw_html text,
    cleaned_markdown text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.document_versions OWNER TO postgres;

--
-- Name: documents; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_id text NOT NULL,
    external_id text,
    source_type text NOT NULL,
    source_name text NOT NULL,
    title text NOT NULL,
    url text NOT NULL,
    canonical_url text NOT NULL,
    published_at timestamp with time zone,
    updated_at timestamp with time zone,
    fetched_at timestamp with time zone NOT NULL,
    last_verified_at timestamp with time zone,
    dedup_key text NOT NULL,
    content_hash text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at_db timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT documents_source_type_check CHECK ((source_type = ANY (ARRAY['official'::text, 'community'::text]))),
    CONSTRAINT documents_status_check CHECK ((status = ANY (ARRAY['active'::text, 'superseded'::text, 'filtered'::text, 'stale'::text])))
);


ALTER TABLE public.documents OWNER TO postgres;

--
-- Name: ingestion_run_items; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ingestion_run_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    run_id uuid NOT NULL,
    source_id text NOT NULL,
    stage text NOT NULL,
    item_url text,
    status text NOT NULL,
    attempt integer DEFAULT 1 NOT NULL,
    error_message text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    ended_at timestamp with time zone,
    CONSTRAINT ingestion_run_items_stage_check CHECK ((stage = ANY (ARRAY['fetch'::text, 'clean'::text, 'dedup'::text, 'chunk'::text, 'index'::text, 'publish'::text]))),
    CONSTRAINT ingestion_run_items_status_check CHECK ((status = ANY (ARRAY['succeeded'::text, 'failed'::text, 'skipped'::text, 'retried'::text])))
);


ALTER TABLE public.ingestion_run_items OWNER TO postgres;

--
-- Name: ingestion_runs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ingestion_runs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_id text NOT NULL,
    status text NOT NULL,
    stage text NOT NULL,
    started_at timestamp with time zone NOT NULL,
    ended_at timestamp with time zone,
    fetched_count integer DEFAULT 0 NOT NULL,
    stored_count integer DEFAULT 0 NOT NULL,
    deduped_count integer DEFAULT 0 NOT NULL,
    chunk_count integer DEFAULT 0 NOT NULL,
    error_message text,
    CONSTRAINT ingestion_runs_stage_check CHECK ((stage = ANY (ARRAY['fetch'::text, 'clean'::text, 'dedup'::text, 'chunk'::text, 'index'::text, 'publish'::text]))),
    CONSTRAINT ingestion_runs_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'partial'::text])))
);


ALTER TABLE public.ingestion_runs OWNER TO postgres;

--
-- Name: search_feedback; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.search_feedback (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id text NOT NULL,
    query text NOT NULL,
    rating text NOT NULL,
    reason text,
    source_ids text[] DEFAULT '{}'::text[] NOT NULL,
    status text DEFAULT 'new'::text NOT NULL,
    handled_at timestamp with time zone,
    handled_by text,
    admin_note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT search_feedback_rating_check CHECK ((rating = ANY (ARRAY['up'::text, 'down'::text]))),
    CONSTRAINT search_feedback_status_check CHECK ((status = ANY (ARRAY['new'::text, 'reviewing'::text, 'resolved'::text, 'dismissed'::text])))
);


ALTER TABLE public.search_feedback OWNER TO postgres;

--
-- Name: search_query_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.search_query_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id text NOT NULL,
    query text NOT NULL,
    status text NOT NULL,
    retrieved_count integer DEFAULT 0 NOT NULL,
    source_count integer DEFAULT 0 NOT NULL,
    official_source_count integer DEFAULT 0 NOT NULL,
    community_source_count integer DEFAULT 0 NOT NULL,
    cache_status text,
    error_code text,
    duration_ms integer,
    client_hash text,
    gateway_event text DEFAULT 'search_response'::text NOT NULL,
    source_ids text[] DEFAULT '{}'::text[] NOT NULL,
    source_snapshot jsonb,
    answer_summary text,
    answer_confidence numeric(4,3),
    result_generated_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT search_query_logs_answer_confidence_check CHECK (((answer_confidence >= (0)::numeric) AND (answer_confidence <= (1)::numeric))),
    CONSTRAINT search_query_logs_cache_status_check CHECK ((cache_status = ANY (ARRAY['hit'::text, 'miss'::text, 'bypass'::text]))),
    CONSTRAINT search_query_logs_gateway_event_check CHECK ((gateway_event = ANY (ARRAY['search_response'::text, 'rate_limited'::text, 'gateway_error'::text]))),
    CONSTRAINT search_query_logs_status_check CHECK ((status = ANY (ARRAY['ok'::text, 'partial'::text, 'empty'::text, 'error'::text])))
);


ALTER TABLE public.search_query_logs OWNER TO postgres;

--
-- Name: service_event_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.service_event_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service text NOT NULL,
    level text NOT NULL,
    event text NOT NULL,
    request_id text,
    error_code text,
    message text,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT service_event_logs_level_check CHECK ((level = ANY (ARRAY['info'::text, 'error'::text])))
);


ALTER TABLE public.service_event_logs OWNER TO postgres;

--
-- Name: source_governance_overrides; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.source_governance_overrides (
    source_id text NOT NULL,
    enabled_override boolean,
    trust_weight_override numeric(4,3),
    update_cadence_override text,
    admin_note text,
    updated_by text DEFAULT 'admin'::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT source_governance_overrides_trust_weight_override_check CHECK (((trust_weight_override >= (0)::numeric) AND (trust_weight_override <= (1)::numeric))),
    CONSTRAINT source_governance_overrides_update_cadence_override_check CHECK ((update_cadence_override = ANY (ARRAY['hourly'::text, 'daily'::text, 'weekly'::text, 'manual'::text])))
);


ALTER TABLE public.source_governance_overrides OWNER TO postgres;

--
-- Name: source_registry; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.source_registry (
    id text NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    description text NOT NULL,
    base_url text NOT NULL,
    fetch_mode text NOT NULL,
    update_cadence text NOT NULL,
    cleaning_profile text NOT NULL,
    trust_weight numeric(4,3) NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT source_registry_trust_weight_check CHECK (((trust_weight >= (0)::numeric) AND (trust_weight <= (1)::numeric))),
    CONSTRAINT source_registry_type_check CHECK ((type = ANY (ARRAY['official'::text, 'community'::text])))
);


ALTER TABLE public.source_registry OWNER TO postgres;

--
-- Name: chunks chunks_document_version_id_chunk_index_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chunks
    ADD CONSTRAINT chunks_document_version_id_chunk_index_key UNIQUE (document_version_id, chunk_index);


--
-- Name: chunks chunks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chunks
    ADD CONSTRAINT chunks_pkey PRIMARY KEY (id);


--
-- Name: community_review_records community_review_records_canonical_url_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.community_review_records
    ADD CONSTRAINT community_review_records_canonical_url_key UNIQUE (canonical_url);


--
-- Name: community_review_records community_review_records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.community_review_records
    ADD CONSTRAINT community_review_records_pkey PRIMARY KEY (id);


--
-- Name: document_versions document_versions_document_id_version_no_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.document_versions
    ADD CONSTRAINT document_versions_document_id_version_no_key UNIQUE (document_id, version_no);


--
-- Name: document_versions document_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.document_versions
    ADD CONSTRAINT document_versions_pkey PRIMARY KEY (id);


--
-- Name: documents documents_canonical_url_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_canonical_url_key UNIQUE (canonical_url);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: documents documents_source_id_external_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_source_id_external_id_key UNIQUE (source_id, external_id);


--
-- Name: ingestion_run_items ingestion_run_items_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ingestion_run_items
    ADD CONSTRAINT ingestion_run_items_pkey PRIMARY KEY (id);


--
-- Name: ingestion_runs ingestion_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ingestion_runs
    ADD CONSTRAINT ingestion_runs_pkey PRIMARY KEY (id);


--
-- Name: search_feedback search_feedback_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.search_feedback
    ADD CONSTRAINT search_feedback_pkey PRIMARY KEY (id);


--
-- Name: search_query_logs search_query_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.search_query_logs
    ADD CONSTRAINT search_query_logs_pkey PRIMARY KEY (id);


--
-- Name: service_event_logs service_event_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.service_event_logs
    ADD CONSTRAINT service_event_logs_pkey PRIMARY KEY (id);


--
-- Name: source_governance_overrides source_governance_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.source_governance_overrides
    ADD CONSTRAINT source_governance_overrides_pkey PRIMARY KEY (source_id);


--
-- Name: source_registry source_registry_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.source_registry
    ADD CONSTRAINT source_registry_pkey PRIMARY KEY (id);


--
-- Name: chunks_document_version_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX chunks_document_version_id_idx ON public.chunks USING btree (document_version_id);


--
-- Name: chunks_full_snippet_trgm_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX chunks_full_snippet_trgm_idx ON public.chunks USING gin (full_snippet public.gin_trgm_ops);


--
-- Name: chunks_snippet_trgm_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX chunks_snippet_trgm_idx ON public.chunks USING gin (snippet public.gin_trgm_ops);


--
-- Name: community_review_records_document_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX community_review_records_document_idx ON public.community_review_records USING btree (document_id);


--
-- Name: community_review_records_source_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX community_review_records_source_idx ON public.community_review_records USING btree (source_id, status);


--
-- Name: community_review_records_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX community_review_records_status_idx ON public.community_review_records USING btree (status, updated_at DESC);


--
-- Name: documents_last_verified_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX documents_last_verified_at_idx ON public.documents USING btree (last_verified_at DESC);


--
-- Name: documents_published_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX documents_published_at_idx ON public.documents USING btree (published_at DESC);


--
-- Name: documents_source_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX documents_source_id_idx ON public.documents USING btree (source_id);


--
-- Name: documents_title_trgm_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX documents_title_trgm_idx ON public.documents USING gin (title public.gin_trgm_ops);


--
-- Name: ingestion_run_items_run_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ingestion_run_items_run_id_idx ON public.ingestion_run_items USING btree (run_id);


--
-- Name: ingestion_runs_source_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX ingestion_runs_source_id_idx ON public.ingestion_runs USING btree (source_id, started_at DESC);


--
-- Name: search_feedback_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX search_feedback_created_at_idx ON public.search_feedback USING btree (created_at DESC);


--
-- Name: search_feedback_request_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX search_feedback_request_id_idx ON public.search_feedback USING btree (request_id);


--
-- Name: search_feedback_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX search_feedback_status_idx ON public.search_feedback USING btree (status, created_at DESC);


--
-- Name: search_query_logs_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX search_query_logs_created_at_idx ON public.search_query_logs USING btree (created_at DESC);


--
-- Name: search_query_logs_gateway_event_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX search_query_logs_gateway_event_idx ON public.search_query_logs USING btree (gateway_event, created_at DESC);


--
-- Name: search_query_logs_request_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX search_query_logs_request_id_idx ON public.search_query_logs USING btree (request_id);


--
-- Name: search_query_logs_source_ids_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX search_query_logs_source_ids_idx ON public.search_query_logs USING gin (source_ids);


--
-- Name: search_query_logs_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX search_query_logs_status_idx ON public.search_query_logs USING btree (status, created_at DESC);


--
-- Name: service_event_logs_event_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX service_event_logs_event_idx ON public.service_event_logs USING btree (event, created_at DESC);


--
-- Name: service_event_logs_request_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX service_event_logs_request_id_idx ON public.service_event_logs USING btree (request_id);


--
-- Name: source_governance_overrides_updated_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX source_governance_overrides_updated_at_idx ON public.source_governance_overrides USING btree (updated_at DESC);


--
-- Name: chunks chunks_document_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.chunks
    ADD CONSTRAINT chunks_document_version_id_fkey FOREIGN KEY (document_version_id) REFERENCES public.document_versions(id) ON DELETE CASCADE;


--
-- Name: community_review_records community_review_records_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.community_review_records
    ADD CONSTRAINT community_review_records_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: community_review_records community_review_records_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.community_review_records
    ADD CONSTRAINT community_review_records_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.source_registry(id);


--
-- Name: document_versions document_versions_document_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.document_versions
    ADD CONSTRAINT document_versions_document_id_fkey FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;


--
-- Name: documents documents_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.source_registry(id);


--
-- Name: ingestion_run_items ingestion_run_items_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ingestion_run_items
    ADD CONSTRAINT ingestion_run_items_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.ingestion_runs(id) ON DELETE CASCADE;


--
-- Name: ingestion_run_items ingestion_run_items_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ingestion_run_items
    ADD CONSTRAINT ingestion_run_items_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.source_registry(id);


--
-- Name: ingestion_runs ingestion_runs_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ingestion_runs
    ADD CONSTRAINT ingestion_runs_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.source_registry(id);


--
-- Name: source_governance_overrides source_governance_overrides_source_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.source_governance_overrides
    ADD CONSTRAINT source_governance_overrides_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.source_registry(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict q0UecpjxiB1Hh1Da8pSDUeaOGMuM1u8STAped7mOSaHXwbRHmq6L0LBOXjaNWCl

