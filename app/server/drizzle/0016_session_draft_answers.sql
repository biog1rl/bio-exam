ALTER TABLE "test_sessions" ADD COLUMN "draft_answers" jsonb;
ALTER TABLE "test_sessions" ADD COLUMN "draft_last_question_id" text;
ALTER TABLE "test_sessions" ADD COLUMN "draft_updated_at" timestamp;
