SET LOCAL lock_timeout = '5s';--> statement-breakpoint
CREATE TABLE "answer_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"score" smallint NOT NULL,
	"comment" text,
	"reviewer_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "answer_reviews_score_check" CHECK ("answer_reviews"."score" BETWEEN 0 AND 3),
	CONSTRAINT "answer_reviews_comment_check" CHECK (char_length("answer_reviews"."comment") <= 2000)
);
--> statement-breakpoint
ALTER TABLE "answer_reviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "answer_reviews" ADD CONSTRAINT "answer_reviews_attempt_id_fkey" FOREIGN KEY ("attempt_id") REFERENCES "public"."test_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_reviews" ADD CONSTRAINT "answer_reviews_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "answer_reviews" ADD CONSTRAINT "answer_reviews_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_answer_reviews_attempt_question" ON "answer_reviews" USING btree ("attempt_id","question_id","created_at");--> statement-breakpoint
CREATE POLICY "deny_direct_access" ON "answer_reviews" AS PERMISSIVE FOR ALL TO public USING (false) WITH CHECK (false);