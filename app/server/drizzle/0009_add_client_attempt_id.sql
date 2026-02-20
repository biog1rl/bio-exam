ALTER TABLE "test_attempts" ADD COLUMN "client_attempt_id" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "test_attempts_user_client_attempt_idx"
	ON "test_attempts" ("user_id", "client_attempt_id")
	WHERE client_attempt_id IS NOT NULL;
