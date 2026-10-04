export {
	getTemplateAdapter,
	matchingAdapter,
	multiChoiceAdapter,
	sequenceDigitsAdapter,
	shortTextAdapter,
	singleChoiceAdapter,
	TEMPLATE_ADAPTERS,
} from './adapters/index'
export type { TemplateAdapter } from './adapters/index'
export { AnswerValueSchema, SubmitResultItemSchema, SubmitResultSchema } from './attempt-result'
export type { AnswerValue, SubmitResult, SubmitResultItem } from './attempt-result'
export { MatchingPairsSchema, OptionSchema, QuestionIdValueSchema, QuestionKeyPayloadSchema } from './content'
export type { QuestionKeyPayload, QuestionMatchingPairs, QuestionOption } from './content'
export {
	normalizeCompactString,
	normalizeDigitsSequence,
	normalizeIdArray,
	normalizeIdRecord,
	normalizeIdValue,
} from './normalize'
export {
	ALLOWED_MISTAKE_METRICS_BY_TEMPLATE,
	BUILTIN_QUESTION_TYPES,
	createDefaultScoringRuleForTemplate,
	defaultMistakeMetricForTemplate,
	getAllowedMistakeMetricsForTemplate,
	getBuiltinQuestionTypeByKey,
	isMistakeMetricAllowedForTemplate,
	MISTAKE_METRICS,
	QUESTION_UI_TEMPLATES,
	QuestionTypeDefinitionSchema,
	QuestionTypeScoringRuleSchema,
	QuestionTypeValidationSchema,
	SCORING_FORMULAS,
	ScoringTierSchema,
	templateForMetric,
} from './registry'
export type {
	BuiltinQuestionType,
	MistakeMetric,
	QuestionTypeDefinition,
	QuestionTypeScoringRule,
	QuestionTypeValidation,
	QuestionUiTemplate,
	ScoringFormula,
} from './registry'
export { countMistakes, MISTAKES_UNSCORABLE, normalizeScoringRule, scoreByRule, scoreQuestionByType } from './scoring'
export type { RuntimeQuestionTypeConfig, ScoreQuestionByTypeInput, ScoreQuestionResult } from './scoring'
export { mergeTelemetryMaps, QuestionTelemetrySchema, TelemetryMapSchema } from './telemetry'
export type { QuestionTelemetry, TelemetryMap } from './telemetry'
