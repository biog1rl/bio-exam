CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS "question_search_documents" (
	"question_id" uuid PRIMARY KEY NOT NULL,
	"test_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	"prompt_text" text NOT NULL DEFAULT '',
	"options_text" text NOT NULL DEFAULT '',
	"matching_text" text NOT NULL DEFAULT '',
	"search_text" text NOT NULL DEFAULT '',
	"updated_at" timestamp NOT NULL DEFAULT now(),
	CONSTRAINT "question_search_documents_question_id_questions_id_fk"
		FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE cascade,
	CONSTRAINT "question_search_documents_test_id_tests_id_fk"
		FOREIGN KEY ("test_id") REFERENCES "tests"("id") ON DELETE cascade,
	CONSTRAINT "question_search_documents_topic_id_topics_id_fk"
		FOREIGN KEY ("topic_id") REFERENCES "topics"("id") ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS "question_search_documents_test_id_idx" ON "question_search_documents" ("test_id");
CREATE INDEX IF NOT EXISTS "question_search_documents_topic_id_idx" ON "question_search_documents" ("topic_id");
CREATE INDEX IF NOT EXISTS "question_search_documents_updated_at_idx" ON "question_search_documents" ("updated_at");
CREATE INDEX IF NOT EXISTS "question_search_documents_search_text_trgm_idx"
	ON "question_search_documents" USING gin ("search_text" gin_trgm_ops);
