SET LOCAL lock_timeout = '5s';--> statement-breakpoint
ALTER TABLE "test_attempts" ADD COLUMN "upload_closes_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tests" ADD COLUMN "photo_upload_window_minutes" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "tests" ADD CONSTRAINT "tests_photo_upload_window_minutes_check" CHECK ("tests"."photo_upload_window_minutes" BETWEEN 0 AND 120);