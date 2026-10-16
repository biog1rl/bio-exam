SET LOCAL lock_timeout = '5s';--> statement-breakpoint
CREATE TABLE "answer_photos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"attempt_id" uuid,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "answer_photos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "answer_photos" ADD CONSTRAINT "answer_photos_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."test_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_photos" ADD CONSTRAINT "answer_photos_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_photos" ADD CONSTRAINT "answer_photos_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "public"."test_attempts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_answer_photos_session_question" ON "answer_photos" USING btree ("session_id","question_id");--> statement-breakpoint
CREATE POLICY "deny_direct_access" ON "answer_photos" AS PERMISSIVE FOR ALL TO public USING (false) WITH CHECK (false);