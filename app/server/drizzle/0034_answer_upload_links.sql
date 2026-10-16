SET LOCAL lock_timeout = '5s';--> statement-breakpoint
CREATE TABLE "answer_upload_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "answer_upload_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "answer_photos" ADD COLUMN "uploaded_via" text DEFAULT 'session' NOT NULL;--> statement-breakpoint
ALTER TABLE "answer_upload_links" ADD CONSTRAINT "answer_upload_links_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."test_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_upload_links" ADD CONSTRAINT "answer_upload_links_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "answer_upload_links_token_uniq" ON "answer_upload_links" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_answer_upload_links_active_slot" ON "answer_upload_links" USING btree ("session_id","question_id") WHERE "answer_upload_links"."revoked_at" IS NULL;--> statement-breakpoint
ALTER TABLE "answer_photos" ADD CONSTRAINT "answer_photos_uploaded_via_check" CHECK ("answer_photos"."uploaded_via" IN ('session', 'link'));--> statement-breakpoint
CREATE POLICY "deny_direct_access" ON "answer_upload_links" AS PERMISSIVE FOR ALL TO public USING (false) WITH CHECK (false);