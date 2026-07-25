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
	'short_answer_variants',
	'Краткий ответ (несколько вариантов)',
	'Несколько равнозначных правильных форм краткого ответа',
	'short_text',
	NULL,
	'{"formula":"exact_match","mistakeMetric":"compact_text_in_set","correctPoints":1}'::jsonb,
	true,
	true
)
ON CONFLICT ("key") DO UPDATE
SET
	"title" = EXCLUDED."title",
	"description" = EXCLUDED."description",
	"ui_template" = EXCLUDED."ui_template",
	"validation_schema" = EXCLUDED."validation_schema",
	"scoring_rule" = EXCLUDED."scoring_rule",
	"is_system" = EXCLUDED."is_system",
	"is_active" = EXCLUDED."is_active",
	"updated_at" = now();
