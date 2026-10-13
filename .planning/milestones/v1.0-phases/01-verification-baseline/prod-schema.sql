--
-- PostgreSQL database dump
--

\restrict S7vdX95dsQ8oV5IZQCKOAtpepJGZlNzDKtKDSE6toahQYEVCJDuep95ARJZnJnc

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.10 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: extensions; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA extensions;


--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: link_target; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.link_target AS ENUM (
    '_self',
    '_blank'
);


--
-- Name: question_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.question_type AS ENUM (
    'radio',
    'checkbox',
    'matching',
    'short_answer',
    'sequence'
);


--
-- Name: grant_pg_cron_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_cron_access() RETURNS event_trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF EXISTS (
    SELECT
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_cron'
  )
  THEN
    grant usage on schema cron to postgres with grant option;

    alter default privileges in schema cron grant all on tables to postgres with grant option;
    alter default privileges in schema cron grant all on functions to postgres with grant option;
    alter default privileges in schema cron grant all on sequences to postgres with grant option;

    alter default privileges for user supabase_admin in schema cron grant all
        on sequences to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on tables to postgres with grant option;
    alter default privileges for user supabase_admin in schema cron grant all
        on functions to postgres with grant option;

    grant all privileges on all tables in schema cron to postgres with grant option;
    revoke all on table cron.job from postgres;
    grant select on table cron.job to postgres with grant option;
    revoke trigger on cron.job_run_details from postgres;
  END IF;
END;
$$;


--
-- Name: FUNCTION grant_pg_cron_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_cron_access() IS 'Grants access to pg_cron';


--
-- Name: grant_pg_graphql_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_graphql_access() RETURNS event_trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
begin
    if not exists (
        select 1
        from pg_catalog.pg_event_trigger_ddl_commands() ev
        join pg_catalog.pg_extension e on ev.objid = e.oid
        where e.extname = 'pg_graphql'
    ) then
        return;
    end if;

    drop function if exists graphql_public.graphql;
    create or replace function graphql_public.graphql(
        "operationName" text default null,
        query text default null,
        variables jsonb default null,
        extensions jsonb default null
    )
        returns jsonb
        language sql
    as $$
        select graphql.resolve(
            query := query,
            variables := coalesce(variables, '{}'),
            "operationName" := "operationName",
            extensions := extensions
        );
    $$;

    -- Attach the wrapper to the extension so DROP EXTENSION cascades to it,
    -- which in turn triggers set_graphql_placeholder to reinstall the "not enabled" stub.
    alter extension pg_graphql add function graphql_public.graphql(text, text, jsonb, jsonb);

    grant usage on schema graphql to postgres, anon, authenticated, service_role;
    grant execute on function graphql.resolve to postgres, anon, authenticated, service_role;
    grant usage on schema graphql to postgres with grant option;
    grant usage on schema graphql_public to postgres with grant option;
end;
$_$;


--
-- Name: FUNCTION grant_pg_graphql_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_graphql_access() IS 'Grants access to pg_graphql';


--
-- Name: grant_pg_net_access(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.grant_pg_net_access() RETURNS event_trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_event_trigger_ddl_commands() AS ev
    JOIN pg_extension AS ext
    ON ev.objid = ext.oid
    WHERE ext.extname = 'pg_net'
  )
  THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_roles
      WHERE rolname = 'supabase_functions_admin'
    )
    THEN
      CREATE USER supabase_functions_admin NOINHERIT CREATEROLE LOGIN NOREPLICATION;
    END IF;

    GRANT USAGE ON SCHEMA net TO supabase_functions_admin, postgres, anon, authenticated, service_role;

    IF EXISTS (
      SELECT FROM pg_extension
      WHERE extname = 'pg_net'
      -- all versions in use on existing projects as of 2025-02-20
      -- version 0.12.0 onwards don't need these applied
      AND extversion IN ('0.2', '0.6', '0.7', '0.7.1', '0.8.0', '0.10.0', '0.11.0')
    ) THEN
      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SECURITY DEFINER;

      ALTER function net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;
      ALTER function net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) SET search_path = net;

      REVOKE ALL ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;
      REVOKE ALL ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) FROM PUBLIC;

      GRANT EXECUTE ON FUNCTION net.http_get(url text, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
      GRANT EXECUTE ON FUNCTION net.http_post(url text, body jsonb, params jsonb, headers jsonb, timeout_milliseconds integer) TO supabase_functions_admin, postgres, anon, authenticated, service_role;
    END IF;
  END IF;
END;
$$;


--
-- Name: FUNCTION grant_pg_net_access(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.grant_pg_net_access() IS 'Grants access to pg_net';


--
-- Name: pgrst_ddl_watch(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.pgrst_ddl_watch() RETURNS event_trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN SELECT * FROM pg_event_trigger_ddl_commands()
  LOOP
    IF cmd.command_tag IN (
      'CREATE SCHEMA', 'ALTER SCHEMA'
    , 'CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO', 'ALTER TABLE'
    , 'CREATE FOREIGN TABLE', 'ALTER FOREIGN TABLE'
    , 'CREATE VIEW', 'ALTER VIEW'
    , 'CREATE MATERIALIZED VIEW', 'ALTER MATERIALIZED VIEW'
    , 'CREATE FUNCTION', 'ALTER FUNCTION'
    , 'CREATE TRIGGER'
    , 'CREATE TYPE', 'ALTER TYPE'
    , 'CREATE RULE'
    , 'COMMENT'
    )
    -- don't notify in case of CREATE TEMP table or other objects created on pg_temp
    AND cmd.schema_name is distinct from 'pg_temp'
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $$;


--
-- Name: pgrst_drop_watch(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.pgrst_drop_watch() RETURNS event_trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  obj record;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_dropped_objects()
  LOOP
    IF obj.object_type IN (
      'schema'
    , 'table'
    , 'foreign table'
    , 'view'
    , 'materialized view'
    , 'function'
    , 'trigger'
    , 'type'
    , 'rule'
    )
    AND obj.is_temporary IS false -- no pg_temp objects
    THEN
      NOTIFY pgrst, 'reload schema';
    END IF;
  END LOOP;
END; $$;


--
-- Name: set_graphql_placeholder(); Type: FUNCTION; Schema: extensions; Owner: -
--

CREATE FUNCTION extensions.set_graphql_placeholder() RETURNS event_trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $_$
    DECLARE
    graphql_is_dropped bool;
    BEGIN
    graphql_is_dropped = (
        SELECT ev.schema_name = 'graphql_public'
        FROM pg_event_trigger_dropped_objects() AS ev
        WHERE ev.schema_name = 'graphql_public'
    );

    IF graphql_is_dropped
    THEN
        create or replace function graphql_public.graphql(
            "operationName" text default null,
            query text default null,
            variables jsonb default null,
            extensions jsonb default null
        )
            returns jsonb
            language plpgsql
            set search_path to ''
        as $$
            DECLARE
                server_version float;
            BEGIN
                server_version = (SELECT (SPLIT_PART((select version()), ' ', 2))::float);

                IF server_version >= 14 THEN
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql extension is not enabled.'
                            )
                        )
                    );
                ELSE
                    RETURN jsonb_build_object(
                        'errors', jsonb_build_array(
                            jsonb_build_object(
                                'message', 'pg_graphql is only available on projects running Postgres 14 onwards.'
                            )
                        )
                    );
                END IF;
            END;
        $$;
    END IF;

    END;
$_$;


--
-- Name: FUNCTION set_graphql_placeholder(); Type: COMMENT; Schema: extensions; Owner: -
--

COMMENT ON FUNCTION extensions.set_graphql_placeholder() IS 'Reintroduces placeholder function for graphql_public.graphql';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: __drizzle_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.__drizzle_migrations (
    id integer NOT NULL,
    hash text NOT NULL,
    created_at bigint NOT NULL
);


--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.__drizzle_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: __drizzle_migrations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.__drizzle_migrations_id_seq OWNED BY public.__drizzle_migrations.id;


--
-- Name: answer_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.answer_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    question_id uuid NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    correct_answer jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    created_by uuid
);


--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_settings (
    key text NOT NULL,
    value text NOT NULL
);


--
-- Name: invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invites (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    consumed_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    created_by uuid
);


--
-- Name: question_drafts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.question_drafts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    test_id uuid NOT NULL,
    owner_id uuid NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    lock_version integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: question_search_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.question_search_documents (
    question_id uuid NOT NULL,
    test_id uuid NOT NULL,
    topic_id uuid NOT NULL,
    prompt_text text DEFAULT ''::text NOT NULL,
    options_text text DEFAULT ''::text NOT NULL,
    matching_text text DEFAULT ''::text NOT NULL,
    search_text text DEFAULT ''::text NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: question_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.question_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    key text NOT NULL,
    title text NOT NULL,
    description text,
    ui_template text NOT NULL,
    validation_schema jsonb,
    scoring_rule jsonb NOT NULL,
    is_system boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid
);


--
-- Name: questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    test_id uuid NOT NULL,
    type text NOT NULL,
    "order" integer DEFAULT 0 NOT NULL,
    points real DEFAULT 1 NOT NULL,
    options jsonb,
    matching_pairs jsonb,
    prompt_path text,
    explanation_path text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: rbac_page_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rbac_page_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    pattern text NOT NULL,
    domain text NOT NULL,
    action text NOT NULL,
    exact boolean DEFAULT false NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_by uuid
);


--
-- Name: rbac_role_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rbac_role_grants (
    role_key text NOT NULL,
    domain text NOT NULL,
    action text NOT NULL,
    allow boolean DEFAULT true NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_by uuid
);


--
-- Name: rbac_user_grants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rbac_user_grants (
    user_id uuid NOT NULL,
    domain text NOT NULL,
    action text NOT NULL,
    allow boolean DEFAULT true NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_by uuid
);


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by_ip text
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    key text NOT NULL
);


--
-- Name: sidebar_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sidebar_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    url text NOT NULL,
    icon text NOT NULL,
    target public.link_target DEFAULT '_self'::public.link_target NOT NULL,
    "order" integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: student_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.student_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_by uuid,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: test_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.test_assignments (
    test_id uuid NOT NULL,
    user_id uuid NOT NULL,
    assigned_by uuid,
    assigned_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: test_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.test_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    test_id uuid NOT NULL,
    user_id uuid NOT NULL,
    answers jsonb NOT NULL,
    results jsonb NOT NULL,
    earned_points real NOT NULL,
    total_points real NOT NULL,
    score_percentage real NOT NULL,
    passed boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL,
    client_attempt_id text,
    telemetry jsonb
);


--
-- Name: test_question_type_overrides; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.test_question_type_overrides (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    test_id uuid NOT NULL,
    question_type_key text NOT NULL,
    title_override text,
    scoring_rule_override jsonb,
    is_disabled boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid
);


--
-- Name: test_scoring_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.test_scoring_settings (
    id text DEFAULT 'global'::text NOT NULL,
    rules jsonb NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_by uuid
);


--
-- Name: test_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.test_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    test_id uuid NOT NULL,
    user_id uuid NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    submitted_at timestamp with time zone,
    attempt_id uuid,
    draft_answers jsonb,
    draft_last_question_id text,
    draft_updated_at timestamp without time zone,
    draft_telemetry jsonb
);


--
-- Name: test_timer_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.test_timer_settings (
    id text DEFAULT 'global'::text NOT NULL,
    red_threshold_minutes integer DEFAULT 5 NOT NULL,
    warning_threshold_minutes integer DEFAULT 1 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by uuid
);


--
-- Name: tests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    topic_id uuid NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    description text,
    version integer DEFAULT 1 NOT NULL,
    is_published boolean DEFAULT false NOT NULL,
    time_limit_minutes integer,
    passing_score real,
    "order" integer DEFAULT 0 NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    created_by uuid,
    updated_by uuid,
    show_correct_answer boolean DEFAULT true NOT NULL,
    scoring_rules jsonb,
    red_threshold_minutes integer,
    warning_threshold_minutes integer
);


--
-- Name: topics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.topics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    description text,
    "order" integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    created_by uuid
);


--
-- Name: user_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_groups (
    group_id uuid NOT NULL,
    user_id uuid NOT NULL
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    user_id uuid NOT NULL,
    role_key text NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    login text,
    first_name text,
    last_name text,
    name text,
    avatar text,
    avatar_cropped text,
    avatar_color text,
    initials text,
    password_hash text,
    is_active boolean DEFAULT false NOT NULL,
    invited_at timestamp without time zone,
    activated_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    created_by uuid,
    birthdate date,
    telegram text,
    phone text,
    email text,
    avatar_crop_x real,
    avatar_crop_y real,
    avatar_crop_zoom real,
    avatar_crop_rotation real,
    avatar_crop_view_x real,
    avatar_crop_view_y real,
    failed_login_attempts integer DEFAULT 0 NOT NULL,
    locked_until timestamp with time zone
);


--
-- Name: __drizzle_migrations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.__drizzle_migrations ALTER COLUMN id SET DEFAULT nextval('public.__drizzle_migrations_id_seq'::regclass);


--
-- Name: __drizzle_migrations __drizzle_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.__drizzle_migrations
    ADD CONSTRAINT __drizzle_migrations_pkey PRIMARY KEY (id);


--
-- Name: answer_keys answer_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.answer_keys
    ADD CONSTRAINT answer_keys_pkey PRIMARY KEY (id);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (key);


--
-- Name: invites invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invites
    ADD CONSTRAINT invites_pkey PRIMARY KEY (id);


--
-- Name: question_drafts question_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_drafts
    ADD CONSTRAINT question_drafts_pkey PRIMARY KEY (id);


--
-- Name: question_search_documents question_search_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_search_documents
    ADD CONSTRAINT question_search_documents_pkey PRIMARY KEY (question_id);


--
-- Name: question_types question_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_types
    ADD CONSTRAINT question_types_pkey PRIMARY KEY (id);


--
-- Name: questions questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_pkey PRIMARY KEY (id);


--
-- Name: rbac_page_rules rbac_page_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_page_rules
    ADD CONSTRAINT rbac_page_rules_pkey PRIMARY KEY (id);


--
-- Name: rbac_role_grants rbac_role_grants_role_key_domain_action_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_role_grants
    ADD CONSTRAINT rbac_role_grants_role_key_domain_action_pk PRIMARY KEY (role_key, domain, action);


--
-- Name: rbac_user_grants rbac_user_grants_user_id_domain_action_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_user_grants
    ADD CONSTRAINT rbac_user_grants_user_id_domain_action_pk PRIMARY KEY (user_id, domain, action);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (key);


--
-- Name: sidebar_items sidebar_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sidebar_items
    ADD CONSTRAINT sidebar_items_pkey PRIMARY KEY (id);


--
-- Name: student_groups student_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_groups
    ADD CONSTRAINT student_groups_pkey PRIMARY KEY (id);


--
-- Name: test_assignments test_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_assignments
    ADD CONSTRAINT test_assignments_pkey PRIMARY KEY (test_id, user_id);


--
-- Name: test_attempts test_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_attempts
    ADD CONSTRAINT test_attempts_pkey PRIMARY KEY (id);


--
-- Name: test_question_type_overrides test_question_type_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_question_type_overrides
    ADD CONSTRAINT test_question_type_overrides_pkey PRIMARY KEY (id);


--
-- Name: test_scoring_settings test_scoring_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_scoring_settings
    ADD CONSTRAINT test_scoring_settings_pkey PRIMARY KEY (id);


--
-- Name: test_sessions test_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_sessions
    ADD CONSTRAINT test_sessions_pkey PRIMARY KEY (id);


--
-- Name: test_timer_settings test_timer_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_timer_settings
    ADD CONSTRAINT test_timer_settings_pkey PRIMARY KEY (id);


--
-- Name: tests tests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tests
    ADD CONSTRAINT tests_pkey PRIMARY KEY (id);


--
-- Name: topics topics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topics
    ADD CONSTRAINT topics_pkey PRIMARY KEY (id);


--
-- Name: user_groups user_groups_group_id_user_id_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_groups
    ADD CONSTRAINT user_groups_group_id_user_id_pk PRIMARY KEY (group_id, user_id);


--
-- Name: user_roles user_roles_user_id_role_key_pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key_pk PRIMARY KEY (user_id, role_key);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: answer_keys_question_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX answer_keys_question_id_idx ON public.answer_keys USING btree (question_id);


--
-- Name: answer_keys_question_version_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX answer_keys_question_version_uniq ON public.answer_keys USING btree (question_id, version);


--
-- Name: idx_refresh_tokens_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_tokens_expires_at ON public.refresh_tokens USING btree (expires_at);


--
-- Name: idx_refresh_tokens_token_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_tokens_token_hash ON public.refresh_tokens USING btree (token_hash);


--
-- Name: idx_test_attempts_submitted_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_test_attempts_submitted_at ON public.test_attempts USING btree (submitted_at);


--
-- Name: idx_test_attempts_test_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_test_attempts_test_id ON public.test_attempts USING btree (test_id);


--
-- Name: idx_test_attempts_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_test_attempts_user_id ON public.test_attempts USING btree (user_id);


--
-- Name: idx_users_locked_until; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_locked_until ON public.users USING btree (locked_until);


--
-- Name: invites_token_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX invites_token_uniq ON public.invites USING btree (token_hash);


--
-- Name: question_drafts_owner_test_updated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX question_drafts_owner_test_updated_idx ON public.question_drafts USING btree (owner_id, test_id, updated_at DESC);


--
-- Name: question_drafts_test_updated_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX question_drafts_test_updated_idx ON public.question_drafts USING btree (test_id, updated_at DESC);


--
-- Name: question_search_documents_search_text_trgm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX question_search_documents_search_text_trgm_idx ON public.question_search_documents USING gin (search_text extensions.gin_trgm_ops);


--
-- Name: question_search_documents_test_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX question_search_documents_test_id_idx ON public.question_search_documents USING btree (test_id);


--
-- Name: question_search_documents_topic_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX question_search_documents_topic_id_idx ON public.question_search_documents USING btree (topic_id);


--
-- Name: question_search_documents_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX question_search_documents_updated_at_idx ON public.question_search_documents USING btree (updated_at);


--
-- Name: question_types_is_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX question_types_is_active_idx ON public.question_types USING btree (is_active);


--
-- Name: question_types_key_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX question_types_key_uniq ON public.question_types USING btree (key);


--
-- Name: questions_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX questions_order_idx ON public.questions USING btree ("order");


--
-- Name: questions_test_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX questions_test_id_idx ON public.questions USING btree (test_id);


--
-- Name: sidebar_items_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sidebar_items_order_idx ON public.sidebar_items USING btree ("order");


--
-- Name: test_assignments_test_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX test_assignments_test_idx ON public.test_assignments USING btree (test_id);


--
-- Name: test_assignments_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX test_assignments_user_idx ON public.test_assignments USING btree (user_id);


--
-- Name: test_attempts_user_client_attempt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX test_attempts_user_client_attempt_idx ON public.test_attempts USING btree (user_id, client_attempt_id) WHERE (client_attempt_id IS NOT NULL);


--
-- Name: test_question_type_overrides_test_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX test_question_type_overrides_test_id_idx ON public.test_question_type_overrides USING btree (test_id);


--
-- Name: test_question_type_overrides_test_type_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX test_question_type_overrides_test_type_uniq ON public.test_question_type_overrides USING btree (test_id, question_type_key);


--
-- Name: test_sessions_test_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX test_sessions_test_user_idx ON public.test_sessions USING btree (test_id, user_id);


--
-- Name: tests_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tests_order_idx ON public.tests USING btree ("order");


--
-- Name: tests_topic_slug_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX tests_topic_slug_uniq ON public.tests USING btree (topic_id, slug);


--
-- Name: topics_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX topics_order_idx ON public.topics USING btree ("order");


--
-- Name: topics_slug_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX topics_slug_uniq ON public.topics USING btree (slug);


--
-- Name: user_groups_group_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_groups_group_idx ON public.user_groups USING btree (group_id);


--
-- Name: user_groups_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_groups_user_idx ON public.user_groups USING btree (user_id);


--
-- Name: users_login_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_login_uniq ON public.users USING btree (login);


--
-- Name: answer_keys answer_keys_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.answer_keys
    ADD CONSTRAINT answer_keys_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: answer_keys answer_keys_question_id_questions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.answer_keys
    ADD CONSTRAINT answer_keys_question_id_questions_id_fk FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE CASCADE;


--
-- Name: invites invites_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invites
    ADD CONSTRAINT invites_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: invites invites_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invites
    ADD CONSTRAINT invites_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: question_drafts question_drafts_owner_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_drafts
    ADD CONSTRAINT question_drafts_owner_id_users_id_fk FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: question_drafts question_drafts_test_id_tests_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_drafts
    ADD CONSTRAINT question_drafts_test_id_tests_id_fk FOREIGN KEY (test_id) REFERENCES public.tests(id) ON DELETE CASCADE;


--
-- Name: question_search_documents question_search_documents_question_id_questions_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_search_documents
    ADD CONSTRAINT question_search_documents_question_id_questions_id_fk FOREIGN KEY (question_id) REFERENCES public.questions(id) ON DELETE CASCADE;


--
-- Name: question_search_documents question_search_documents_test_id_tests_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_search_documents
    ADD CONSTRAINT question_search_documents_test_id_tests_id_fk FOREIGN KEY (test_id) REFERENCES public.tests(id) ON DELETE CASCADE;


--
-- Name: question_search_documents question_search_documents_topic_id_topics_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_search_documents
    ADD CONSTRAINT question_search_documents_topic_id_topics_id_fk FOREIGN KEY (topic_id) REFERENCES public.topics(id) ON DELETE CASCADE;


--
-- Name: question_types question_types_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_types
    ADD CONSTRAINT question_types_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: question_types question_types_updated_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.question_types
    ADD CONSTRAINT question_types_updated_by_users_id_fk FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: questions questions_test_id_tests_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.questions
    ADD CONSTRAINT questions_test_id_tests_id_fk FOREIGN KEY (test_id) REFERENCES public.tests(id) ON DELETE CASCADE;


--
-- Name: rbac_page_rules rbac_page_rules_updated_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_page_rules
    ADD CONSTRAINT rbac_page_rules_updated_by_users_id_fk FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: rbac_role_grants rbac_role_grants_updated_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_role_grants
    ADD CONSTRAINT rbac_role_grants_updated_by_users_id_fk FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: rbac_user_grants rbac_user_grants_updated_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_user_grants
    ADD CONSTRAINT rbac_user_grants_updated_by_users_id_fk FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: rbac_user_grants rbac_user_grants_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rbac_user_grants
    ADD CONSTRAINT rbac_user_grants_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: student_groups student_groups_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.student_groups
    ADD CONSTRAINT student_groups_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: test_assignments test_assignments_assigned_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_assignments
    ADD CONSTRAINT test_assignments_assigned_by_users_id_fk FOREIGN KEY (assigned_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: test_assignments test_assignments_test_id_tests_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_assignments
    ADD CONSTRAINT test_assignments_test_id_tests_id_fk FOREIGN KEY (test_id) REFERENCES public.tests(id) ON DELETE CASCADE;


--
-- Name: test_assignments test_assignments_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_assignments
    ADD CONSTRAINT test_assignments_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: test_attempts test_attempts_test_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_attempts
    ADD CONSTRAINT test_attempts_test_id_fkey FOREIGN KEY (test_id) REFERENCES public.tests(id) ON DELETE CASCADE;


--
-- Name: test_attempts test_attempts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_attempts
    ADD CONSTRAINT test_attempts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: test_question_type_overrides test_question_type_overrides_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_question_type_overrides
    ADD CONSTRAINT test_question_type_overrides_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: test_question_type_overrides test_question_type_overrides_test_id_tests_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_question_type_overrides
    ADD CONSTRAINT test_question_type_overrides_test_id_tests_id_fk FOREIGN KEY (test_id) REFERENCES public.tests(id) ON DELETE CASCADE;


--
-- Name: test_question_type_overrides test_question_type_overrides_updated_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_question_type_overrides
    ADD CONSTRAINT test_question_type_overrides_updated_by_users_id_fk FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: test_scoring_settings test_scoring_settings_updated_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_scoring_settings
    ADD CONSTRAINT test_scoring_settings_updated_by_users_id_fk FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: test_sessions test_sessions_attempt_id_test_attempts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_sessions
    ADD CONSTRAINT test_sessions_attempt_id_test_attempts_id_fk FOREIGN KEY (attempt_id) REFERENCES public.test_attempts(id) ON DELETE SET NULL;


--
-- Name: test_sessions test_sessions_test_id_tests_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_sessions
    ADD CONSTRAINT test_sessions_test_id_tests_id_fk FOREIGN KEY (test_id) REFERENCES public.tests(id) ON DELETE CASCADE;


--
-- Name: test_sessions test_sessions_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_sessions
    ADD CONSTRAINT test_sessions_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: test_timer_settings test_timer_settings_updated_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.test_timer_settings
    ADD CONSTRAINT test_timer_settings_updated_by_users_id_fk FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: tests tests_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tests
    ADD CONSTRAINT tests_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: tests tests_topic_id_topics_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tests
    ADD CONSTRAINT tests_topic_id_topics_id_fk FOREIGN KEY (topic_id) REFERENCES public.topics(id) ON DELETE CASCADE;


--
-- Name: tests tests_updated_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tests
    ADD CONSTRAINT tests_updated_by_users_id_fk FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: topics topics_created_by_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.topics
    ADD CONSTRAINT topics_created_by_users_id_fk FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: user_groups user_groups_group_id_student_groups_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_groups
    ADD CONSTRAINT user_groups_group_id_student_groups_id_fk FOREIGN KEY (group_id) REFERENCES public.student_groups(id) ON DELETE CASCADE;


--
-- Name: user_groups user_groups_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_groups
    ADD CONSTRAINT user_groups_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_role_key_roles_key_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_role_key_roles_key_fk FOREIGN KEY (role_key) REFERENCES public.roles(key) ON DELETE CASCADE;


--
-- Name: user_roles user_roles_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_created_by_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_created_by_fk FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: __drizzle_migrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.__drizzle_migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: answer_keys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.answer_keys ENABLE ROW LEVEL SECURITY;

--
-- Name: app_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: __drizzle_migrations deny_direct_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_direct_access ON public.__drizzle_migrations USING (false) WITH CHECK (false);


--
-- Name: answer_keys deny_direct_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_direct_access ON public.answer_keys USING (false) WITH CHECK (false);


--
-- Name: app_settings deny_direct_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_direct_access ON public.app_settings USING (false) WITH CHECK (false);


--
-- Name: invites deny_direct_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_direct_access ON public.invites USING (false) WITH CHECK (false);


--
-- Name: question_drafts deny_direct_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_direct_access ON public.question_drafts USING (false) WITH CHECK (false);


--
-- Name: question_search_documents deny_direct_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_direct_access ON public.question_search_documents USING (false) WITH CHECK (false);


--
-- Name: question_types deny_direct_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_direct_access ON public.question_types USING (false) WITH CHECK (false);


--
-- Name: questions deny_direct_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_direct_access ON public.questions USING (false) WITH CHECK (false);


--
-- Name: rbac_page_rules deny_direct_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_direct_access ON public.rbac_page_rules USING (false) WITH CHECK (false);


--
-- Name: rbac_role_grants deny_direct_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_direct_access ON public.rbac_role_grants USING (false) WITH CHECK (false);


--
-- Name: rbac_user_grants deny_direct_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_direct_access ON public.rbac_user_grants USING (false) WITH CHECK (false);


--
-- Name: refresh_tokens deny_direct_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_direct_access ON public.refresh_tokens USING (false) WITH CHECK (false);


--
-- Name: roles deny_direct_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_direct_access ON public.roles USING (false) WITH CHECK (false);


--
-- Name: sidebar_items deny_direct_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_direct_access ON public.sidebar_items USING (false) WITH CHECK (false);


--
-- Name: student_groups deny_direct_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_direct_access ON public.student_groups USING (false) WITH CHECK (false);


--
-- Name: test_assignments deny_direct_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_direct_access ON public.test_assignments USING (false) WITH CHECK (false);


--
-- Name: test_attempts deny_direct_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_direct_access ON public.test_attempts USING (false) WITH CHECK (false);


--
-- Name: test_question_type_overrides deny_direct_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_direct_access ON public.test_question_type_overrides USING (false) WITH CHECK (false);


--
-- Name: test_scoring_settings deny_direct_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_direct_access ON public.test_scoring_settings USING (false) WITH CHECK (false);


--
-- Name: test_sessions deny_direct_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_direct_access ON public.test_sessions USING (false) WITH CHECK (false);


--
-- Name: test_timer_settings deny_direct_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_direct_access ON public.test_timer_settings USING (false) WITH CHECK (false);


--
-- Name: tests deny_direct_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_direct_access ON public.tests USING (false) WITH CHECK (false);


--
-- Name: topics deny_direct_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_direct_access ON public.topics USING (false) WITH CHECK (false);


--
-- Name: user_groups deny_direct_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_direct_access ON public.user_groups USING (false) WITH CHECK (false);


--
-- Name: user_roles deny_direct_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_direct_access ON public.user_roles USING (false) WITH CHECK (false);


--
-- Name: users deny_direct_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deny_direct_access ON public.users USING (false) WITH CHECK (false);


--
-- Name: invites; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

--
-- Name: question_drafts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.question_drafts ENABLE ROW LEVEL SECURITY;

--
-- Name: question_search_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.question_search_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: question_types; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.question_types ENABLE ROW LEVEL SECURITY;

--
-- Name: questions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

--
-- Name: rbac_page_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rbac_page_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: rbac_role_grants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rbac_role_grants ENABLE ROW LEVEL SECURITY;

--
-- Name: rbac_user_grants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rbac_user_grants ENABLE ROW LEVEL SECURITY;

--
-- Name: refresh_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.refresh_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

--
-- Name: sidebar_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sidebar_items ENABLE ROW LEVEL SECURITY;

--
-- Name: student_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.student_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: test_assignments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.test_assignments ENABLE ROW LEVEL SECURITY;

--
-- Name: test_attempts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.test_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: test_question_type_overrides; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.test_question_type_overrides ENABLE ROW LEVEL SECURITY;

--
-- Name: test_scoring_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.test_scoring_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: test_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.test_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: test_timer_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.test_timer_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: tests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tests ENABLE ROW LEVEL SECURITY;

--
-- Name: topics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;

--
-- Name: user_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--

\unrestrict S7vdX95dsQ8oV5IZQCKOAtpepJGZlNzDKtKDSE6toahQYEVCJDuep95ARJZnJnc

