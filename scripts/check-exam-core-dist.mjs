import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const DIST_DIR = fileURLToPath(new URL('../packages/exam-core/dist/', import.meta.url))
const REQUIRED_FILES = ['index.js', 'index.cjs', 'index.d.ts', 'index.d.cts']

const EXPECTED_EXPORTS = [
	'ALLOWED_MISTAKE_METRICS_BY_TEMPLATE',
	'ANSWER_PHOTO_FORBIDDEN_MESSAGE',
	'ANSWER_PHOTO_LIMIT_MESSAGE',
	'ANSWER_PHOTO_MAX_BYTES',
	'ANSWER_PHOTO_MAX_COUNT',
	'ANSWER_PHOTO_MAX_COUNT_LIMIT',
	'ANSWER_PHOTO_MAX_SIDE',
	'ANSWER_PHOTO_VARIANTS',
	'ANSWER_VIOLATION_REASONS',
	'ATTEMPT_GRACE_PERIOD_MINUTES',
	'ATTEMPT_SUBMIT_SOURCES',
	'AUTHORING_MESSAGES',
	'AUTO_SCORED_TEMPLATES',
	'AdminAttemptViewSchema',
	'AdminOpenAnswerSchema',
	'AnswerPhotoDeleteResponseSchema',
	'AnswerPhotoListResponseSchema',
	'AnswerPhotoSchema',
	'AnswerPhotoUploadResponseSchema',
	'AnswerValueSchema',
	'AttemptFactsSchema',
	'AttemptQuestionViewSchema',
	'AttemptSessionSchema',
	'AttemptViewSchema',
	'BUILTIN_QUESTION_TYPES',
	'LegacyAttemptResultItemSchema',
	'LegacyAttemptResultsSchema',
	'MISTAKES_UNSCORABLE',
	'MISTAKE_METRICS',
	'MatchingPairsSchema',
	'OPEN_QUESTION_MAX_POINTS',
	'OPEN_REVIEW_COMMENT_MAX_LENGTH',
	'OPEN_REVIEW_NO_ANSWER_COMMENT',
	'OPEN_TEXT_MAX_LENGTH',
	'OpenAnswerPhotoSchema',
	'OpenReviewRequestSchema',
	'OpenReviewResponseSchema',
	'OpenReviewSchema',
	'OptionSchema',
	'PHOTO_UPLOAD_WINDOW_DEFAULT_MINUTES',
	'PHOTO_UPLOAD_WINDOW_MAX_MINUTES',
	'QUESTION_UI_TEMPLATES',
	'QuestionIdValueSchema',
	'QuestionKeyPayloadSchema',
	'QuestionPhotoSettingsSchema',
	'QuestionStatusSchema',
	'QuestionTelemetrySchema',
	'QuestionTypeDefinitionSchema',
	'QuestionTypeScoringRuleSchema',
	'QuestionTypeValidationSchema',
	'QuestionVerdictsSchema',
	'REVIEW_ERROR_CODES',
	'REVIEW_STATUSES',
	'SCORING_FORMULAS',
	'SHORT_TEXT_MAX_LENGTH',
	'SUBMIT_ERROR_CODES',
	'SaveAttemptDraftRequestSchema',
	'SavedOpenReviewSchema',
	'ScoredQuestionFactSchema',
	'ScoringTierSchema',
	'SessionFateSchema',
	'StudentOpenReviewSchema',
	'SubmitAttemptErrorSchema',
	'SubmitAttemptRequestSchema',
	'TEMPLATE_ADAPTERS',
	'TelemetryMapSchema',
	'UPLOAD_LINK_INVALID_MESSAGE',
	'UPLOAD_TOKEN_HEADER',
	'UPLOAD_WINDOW_ERROR_CODES',
	'UPLOAD_WINDOW_REFUSAL_STATUS',
	'UploadLinkContextSchema',
	'UploadLinkIssueResponseSchema',
	'UploadWindowRefusalSchema',
	'allPartsCorrect',
	'answerIdList',
	'answerPhotoLimitMessage',
	'computeAttemptOutcome',
	'computeVerdicts',
	'countMistakes',
	'createDefaultScoringRuleForTemplate',
	'defaultMistakeMetricForTemplate',
	'errorUnits',
	'exactChoiceCountMessage',
	'findAnswerViolation',
	'getAllowedMistakeMetricsForTemplate',
	'getBuiltinQuestionTypeByKey',
	'getTemplateAdapter',
	'isAnswered',
	'isAutoScoredTemplate',
	'isMistakeMetricAllowedForTemplate',
	'keyShapeFor',
	'matchingAdapter',
	'maxOptionsMessage',
	'mergeTelemetryMaps',
	'minOptionsMessage',
	'multiChoiceAdapter',
	'normalizeCompactString',
	'normalizeDigitsSequence',
	'normalizeIdArray',
	'normalizeIdRecord',
	'normalizeIdValue',
	'normalizeKeyValue',
	'normalizeScoringRule',
	'openAdapter',
	'pluralRu',
	'projectionOf',
	'questionStatus',
	'readKey',
	'scoreByRule',
	'scoreQuestionByType',
	'scoreQuestionFacts',
	'sequenceDigitsAdapter',
	'shortTextAdapter',
	'singleChoiceAdapter',
	'templateForMetric',
	'toCanonicalKey',
	'validateQuestionForSave',
]

function diffNames(label, actual) {
	const expected = [...EXPECTED_EXPORTS].sort()
	const missing = expected.filter((name) => !actual.includes(name))
	const extra = actual.filter((name) => !expected.includes(name))
	const problems = []
	if (missing.length) problems.push(`${label}: нет экспортов ${missing.join(', ')}`)
	if (extra.length) problems.push(`${label}: лишние экспорты ${extra.join(', ')}`)
	return problems
}

function checkZodIsExternal() {
	const problems = []
	const esm = fs.readFileSync(path.join(DIST_DIR, 'index.js'), 'utf8')
	const cjs = fs.readFileSync(path.join(DIST_DIR, 'index.cjs'), 'utf8')
	if (!/from\s+["']zod["']/.test(esm)) problems.push('index.js не импортирует zod')
	if (!/require\(\s*["']zod["']\s*\)/.test(cjs)) problems.push('index.cjs не вызывает require("zod")')
	return problems
}

async function main() {
	const problems = []

	for (const file of REQUIRED_FILES) {
		if (!fs.existsSync(path.join(DIST_DIR, file))) problems.push(`нет файла packages/exam-core/dist/${file}`)
	}
	if (problems.length) throw new Error(problems.join('\n'))

	const esmNames = Object.keys(await import(pathToFileURL(path.join(DIST_DIR, 'index.js')).href)).sort()
	const cjsNames = Object.keys(createRequire(import.meta.url)(path.join(DIST_DIR, 'index.cjs'))).sort()

	problems.push(...diffNames('ESM', esmNames), ...diffNames('CJS', cjsNames), ...checkZodIsExternal())
	if (problems.length) throw new Error(problems.join('\n'))

	console.log(`exam-core dist OK: ${REQUIRED_FILES.join(', ')}; ${EXPECTED_EXPORTS.length} экспортов в ESM и CJS`)
}

main().catch((err) => {
	console.error(`exam-core dist FAILED:\n${err.message}`)
	process.exit(1)
})
