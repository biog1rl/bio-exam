ALTER TABLE "tests" ADD COLUMN IF NOT EXISTS "red_threshold_minutes" integer;
--> statement-breakpoint
ALTER TABLE "tests" ADD COLUMN IF NOT EXISTS "warning_threshold_minutes" integer;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "test_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"test_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"started_at" timestamptz NOT NULL DEFAULT now(),
	"submitted_at" timestamptz,
	"attempt_id" uuid
);
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "test_sessions"
		ADD CONSTRAINT "test_sessions_test_id_tests_id_fk"
		FOREIGN KEY ("test_id") REFERENCES "public"."tests"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "test_sessions"
		ADD CONSTRAINT "test_sessions_user_id_users_id_fk"
		FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "test_sessions"
		ADD CONSTRAINT "test_sessions_attempt_id_test_attempts_id_fk"
		FOREIGN KEY ("attempt_id") REFERENCES "public"."test_attempts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "test_sessions_test_user_idx"
	ON "test_sessions" ("test_id", "user_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "test_timer_settings" (
	"id" text PRIMARY KEY DEFAULT 'global' NOT NULL,
	"red_threshold_minutes" integer NOT NULL DEFAULT 5,
	"warning_threshold_minutes" integer NOT NULL DEFAULT 1,
	"updated_at" timestamptz NOT NULL DEFAULT now(),
	"updated_by" uuid
);
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "test_timer_settings"
		ADD CONSTRAINT "test_timer_settings_updated_by_users_id_fk"
		FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

INSERT INTO "test_timer_settings" ("id") VALUES ('global') ON CONFLICT DO NOTHING;
