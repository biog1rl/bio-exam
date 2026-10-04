SET LOCAL lock_timeout = '5s';--> statement-breakpoint
ALTER TABLE "test_attempts" ADD COLUMN "session_id" uuid;--> statement-breakpoint
ALTER TABLE "test_sessions" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "test_sessions" ADD COLUMN "close_reason" text;--> statement-breakpoint
UPDATE "test_sessions" SET "closed_at" = now(), "close_reason" = 'superseded' WHERE "id" IN (SELECT "id" FROM (SELECT "id", row_number() OVER (PARTITION BY "test_id", "user_id" ORDER BY "started_at" DESC, "id" DESC) AS "rn" FROM "test_sessions" WHERE "submitted_at" IS NULL AND "closed_at" IS NULL) AS "ranked" WHERE "ranked"."rn" > 1);--> statement-breakpoint
ALTER TABLE "test_attempts" ADD CONSTRAINT "test_attempts_session_id_test_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."test_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "test_attempts_session_id_uniq" ON "test_attempts" USING btree ("session_id") WHERE "test_attempts"."session_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "test_sessions_open_uniq" ON "test_sessions" USING btree ("test_id","user_id") WHERE "test_sessions"."submitted_at" IS NULL AND "test_sessions"."closed_at" IS NULL;--> statement-breakpoint
ALTER TABLE "test_sessions" ADD CONSTRAINT "test_sessions_close_reason_check" CHECK ("test_sessions"."close_reason" IN ('expired', 'superseded'));