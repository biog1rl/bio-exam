export {
	getTemplateAdapter,
	matchingAdapter,
	multiChoiceAdapter,
	sequenceDigitsAdapter,
	shortTextAdapter,
	singleChoiceAdapter,
	TEMPLATE_ADAPTERS,
} from './adapters/index'
export type {
	AuthoringInput,
	ChoiceOptionVerdict,
	KeyShape,
	MatchingPairVerdict,
	QuestionContent,
	QuestionContentItem,
	QuestionVerdicts,
	SequencePositionVerdict,
	ShortTextVerdict,
	TemplateAdapter,
	TemplateConfig,
	VerdictsInput,
} from './adapters/types'
export {
	AUTHORING_MESSAGES,
	exactChoiceCountMessage,
	keyShapeFor,
	maxOptionsMessage,
	minOptionsMessage,
	toCanonicalKey,
	validateQuestionForSave,
} from './authoring'
export type { ValidateQuestionForSaveInput } from './authoring'
export {
	AnswerValueSchema,
	ATTEMPT_GRACE_PERIOD_MINUTES,
	SUBMIT_ERROR_CODES,
	SubmitAttemptErrorSchema,
	SubmitAttemptRequestSchema,
	SubmitResultItemSchema,
	SubmitResultSchema,
} from './attempt-result'
export type {
	AnswerValue,
	SubmitAttemptError,
	SubmitAttemptRequest,
	SubmitResult,
	SubmitResultItem,
} from './attempt-result'
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
export {
	allPartsCorrect,
	answerIdList,
	computeVerdicts,
	errorUnits,
	isAnswered,
	normalizeKeyValue,
	readKey,
} from './review'
export type { ComputeVerdictsInput } from './review'
export { pluralRu } from './plural'
export { countMistakes, MISTAKES_UNSCORABLE, normalizeScoringRule, scoreByRule, scoreQuestionByType } from './scoring'
export type { RuntimeQuestionTypeConfig, ScoreQuestionByTypeInput, ScoreQuestionResult } from './scoring'
export { mergeTelemetryMaps, QuestionTelemetrySchema, TelemetryMapSchema } from './telemetry'
export type { QuestionTelemetry, TelemetryMap } from './telemetry'
