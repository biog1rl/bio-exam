SET LOCAL lock_timeout = '5s';--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "allow_photos" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "max_photos" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_max_photos_check" CHECK ("questions"."max_photos" BETWEEN 1 AND 10);