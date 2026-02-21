DROP TABLE IF EXISTS "test_drafts";
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "question_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"test_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
	"lock_version" integer NOT NULL DEFAULT 0,
	"created_at" timestamp NOT NULL DEFAULT now(),
	"updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "question_drafts"
		ADD CONSTRAINT "question_drafts_test_id_tests_id_fk"
		FOREIGN KEY ("test_id") REFERENCES "public"."tests"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
	ALTER TABLE "question_drafts"
		ADD CONSTRAINT "question_drafts_owner_id_users_id_fk"
		FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "question_drafts_owner_test_updated_idx"
	ON "question_drafts" ("owner_id", "test_id", "updated_at" DESC);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "question_drafts_test_updated_idx"
	ON "question_drafts" ("test_id", "updated_at" DESC);
