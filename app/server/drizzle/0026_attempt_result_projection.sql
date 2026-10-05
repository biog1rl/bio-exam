SET LOCAL lock_timeout = '5s';--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_created_by_fk";--> statement-breakpoint
ALTER TABLE "test_attempts" ADD COLUMN "review_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "test_attempts" ADD COLUMN "final_earned_points" real;--> statement-breakpoint
ALTER TABLE "test_attempts" ADD COLUMN "final_score_percentage" real;--> statement-breakpoint
ALTER TABLE "test_attempts" ADD COLUMN "final_passed" boolean;--> statement-breakpoint
ALTER TABLE "test_attempts" ADD COLUMN "graded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "test_attempts" ADD COLUMN "passing_score" real;--> statement-breakpoint
ALTER TABLE "test_attempts" ADD COLUMN "auto_total_points" real;--> statement-breakpoint
ALTER TABLE "test_attempts" ADD COLUMN "submit_source" text DEFAULT 'client' NOT NULL;--> statement-breakpoint
UPDATE "test_attempts" AS ta SET "final_earned_points" = ta."earned_points", "final_score_percentage" = ta."score_percentage", "final_passed" = ta."passed", "auto_total_points" = ta."total_points", "passing_score" = (SELECT t."passing_score" FROM "tests" t WHERE t."id" = ta."test_id");--> statement-breakpoint
ALTER TABLE "test_attempts" ALTER COLUMN "auto_total_points" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_attempts" ADD CONSTRAINT "test_attempts_review_status_check" CHECK ("test_attempts"."review_status" IN ('none', 'pending', 'graded'));--> statement-breakpoint
ALTER TABLE "test_attempts" ADD CONSTRAINT "test_attempts_submit_source_check" CHECK ("test_attempts"."submit_source" IN ('client', 'deadline'));--> statement-breakpoint
ALTER TABLE "test_attempts" ADD CONSTRAINT "test_attempts_review_projection_check" CHECK (("test_attempts"."final_earned_points" IS NULL) = ("test_attempts"."review_status" = 'pending') AND ("test_attempts"."final_score_percentage" IS NULL) = ("test_attempts"."review_status" = 'pending') AND ("test_attempts"."final_passed" IS NULL) = ("test_attempts"."review_status" = 'pending'));--> statement-breakpoint
ALTER TABLE "test_attempts" ADD CONSTRAINT "test_attempts_graded_at_check" CHECK (("test_attempts"."review_status" = 'graded') = ("test_attempts"."graded_at" IS NOT NULL));--> statement-breakpoint
CREATE FUNCTION "test_attempts_facts_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	IF NEW."answers" IS DISTINCT FROM OLD."answers"
		OR NEW."results" IS DISTINCT FROM OLD."results"
		OR NEW."results_version" IS DISTINCT FROM OLD."results_version"
		OR NEW."earned_points" IS DISTINCT FROM OLD."earned_points"
		OR NEW."total_points" IS DISTINCT FROM OLD."total_points"
		OR NEW."score_percentage" IS DISTINCT FROM OLD."score_percentage"
		OR NEW."passed" IS DISTINCT FROM OLD."passed" THEN
		RAISE EXCEPTION 'test_attempts facts are immutable' USING ERRCODE = '23001', CONSTRAINT = 'test_attempts_facts_immutable';
	END IF;
	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "test_attempts_facts_immutable" BEFORE UPDATE ON "test_attempts" FOR EACH ROW EXECUTE FUNCTION "test_attempts_facts_immutable"();--> statement-breakpoint
INSERT INTO "question_types" (
	"key",
	"title",
	"description",
	"ui_template",
	"validation_schema",
	"scoring_rule",
	"is_system",
	"is_active"
)
VALUES (
	'open',
	'Открытый вопрос',
	'Развёрнутый ответ, баллы от 0 до 3 выставляет учитель',
	'open',
	NULL,
	'{"formula":"exact_match","mistakeMetric":"manual","correctPoints":3}'::jsonb,
	true,
	false
)
ON CONFLICT ("key") DO NOTHING;
