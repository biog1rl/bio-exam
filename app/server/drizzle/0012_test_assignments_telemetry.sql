CREATE TABLE IF NOT EXISTS "test_assignments" (
  "test_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "assigned_by" uuid,
  "assigned_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("test_id", "user_id")
);
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "test_assignments"
    ADD CONSTRAINT "test_assignments_test_id_tests_id_fk"
    FOREIGN KEY ("test_id") REFERENCES "public"."tests"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "test_assignments"
    ADD CONSTRAINT "test_assignments_user_id_users_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
  ALTER TABLE "test_assignments"
    ADD CONSTRAINT "test_assignments_assigned_by_users_id_fk"
    FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "test_assignments_user_idx"
  ON "test_assignments" ("user_id");
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "test_assignments_test_idx"
  ON "test_assignments" ("test_id");
--> statement-breakpoint

ALTER TABLE "test_attempts" ADD COLUMN IF NOT EXISTS "telemetry" jsonb;
