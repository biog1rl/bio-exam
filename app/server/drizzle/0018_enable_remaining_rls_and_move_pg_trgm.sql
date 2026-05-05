CREATE SCHEMA IF NOT EXISTS extensions;

DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM pg_extension e
		INNER JOIN pg_namespace n ON n.oid = e.extnamespace
		WHERE e.extname = 'pg_trgm'
			AND n.nspname = 'public'
	) THEN
		ALTER EXTENSION pg_trgm SET SCHEMA extensions;
	END IF;
END $$;

DO $$
DECLARE
	table_name text;
BEGIN
	FOREACH table_name IN ARRAY ARRAY[
		'__drizzle_migrations',
		'refresh_tokens',
		'test_timer_settings',
		'test_attempts',
		'test_assignments',
		'student_groups',
		'user_groups',
		'test_scoring_settings',
		'app_settings',
		'question_types',
		'test_question_type_overrides',
		'test_sessions',
		'tests',
		'question_search_documents',
		'questions',
		'answer_keys',
		'topics',
		'question_drafts',
		'users',
		'roles',
		'user_roles',
		'invites',
		'rbac_role_grants',
		'rbac_page_rules',
		'rbac_user_grants',
		'sidebar_items'
	] LOOP
		IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
			EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);

			IF NOT EXISTS (
				SELECT 1
				FROM pg_policies
				WHERE schemaname = 'public'
					AND tablename = table_name
					AND policyname = 'deny_direct_access'
			) THEN
				EXECUTE format(
					'CREATE POLICY deny_direct_access ON public.%I FOR ALL TO public USING (false) WITH CHECK (false)',
					table_name
				);
			END IF;
		END IF;
	END LOOP;
END $$;
