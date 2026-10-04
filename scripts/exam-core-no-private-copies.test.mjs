import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const SCAN_ROOTS = ['app/web', 'app/server/src']
const SKIPPED_DIRS = new Set(['node_modules', '.next', '.turbo', '.vercel', 'dist', 'out', 'coverage'])
const SOURCE_FILE = /\.(?:[cm]?[jt]s|[jt]sx)$/
const TEST_FILE = /\.(?:test|spec)\.(?:[cm]?[jt]s|[jt]sx)$/

const PRIVATE_COPY_NAMES = [
	{
		positions: 'D-17 п. 1',
		names: [
			'countMistakes',
			'countRadioMistakes',
			'countShortAnswerMistakes',
			'countShortAnswerVariantsMistakes',
			'countSequenceMistakes',
			'countCheckboxMistakes',
			'countMatchingMistakes',
			'scoreByMetric',
			'scoreByRule',
			'normalizeRule',
			'normalizeScoringRule',
			'scoreQuestionByType',
			'normalizeCompactString',
			'normalizeDigitsSequence',
			'normalizeIdValue',
			'normalizeIdArray',
			'normalizeIdRecord',
			'MISTAKES_UNSCORABLE',
		],
	},
	{
		positions: 'D-17 п. 2, 5, 19',
		names: [
			'QUESTION_UI_TEMPLATES',
			'MISTAKE_METRICS',
			'ALLOWED_MISTAKE_METRICS_BY_TEMPLATE',
			'SCORING_FORMULAS',
			'ScoringTierSchema',
			'QuestionTypeScoringRuleSchema',
			'QuestionTypeValidationSchema',
			'QuestionTypeDefinitionSchema',
			'BUILTIN_QUESTION_TYPES',
			'getBuiltinQuestionTypeByKey',
			'defaultMistakeMetricForTemplate',
			'getAllowedMistakeMetricsForTemplate',
			'isMistakeMetricAllowedForTemplate',
			'createDefaultScoringRuleForTemplate',
			'templateForMetric',
		],
	},
	{
		positions: 'D-17 п. 3',
		names: [
			'validateByTemplate',
			'stringIdsArray',
			'isRecordOfStrings',
			'validateOptionsCount',
			'normalizeCompactAnswer',
		],
	},
	{
		positions: 'D-17 п. 4',
		names: [
			'IdSchema',
			'CorrectAnswerSchema',
			'hasDuplicateIds',
			'OptionSchema',
			'MatchingPairsSchema',
			'QuestionIdValueSchema',
			'QuestionKeyPayloadSchema',
		],
	},
	{
		positions: 'D-17 п. 6, 8',
		names: [
			'SubmitResultItemSchema',
			'SubmitResultSchema',
			'AnswerValueSchema',
			'SubmitAnswerValueSchema',
			'TelemetrySchema',
		],
	},
	{
		positions: 'D-17 п. 7, 18',
		names: ['mergeTelemetryMaps', 'QuestionTelemetrySchema', 'TelemetryMapSchema'],
	},
	{
		positions: 'D-17 п. 11',
		names: [
			'isMetricAllowedForTemplate',
			'createDefaultQuestionTypeScoringRule',
			'normalizeSequenceCorrectValue',
			'normalizeShortTextCorrectValue',
			'isValidSequenceCorrectValue',
		],
	},
	{
		positions: 'D-17 п. 12, 13',
		names: [
			'normalizeDraftCorrect',
			'validateQuestionForSave',
			'AUTHORING_MESSAGES',
			'TEMPLATE_ADAPTERS',
			'getTemplateAdapter',
			'singleChoiceAdapter',
			'multiChoiceAdapter',
			'matchingAdapter',
			'shortTextAdapter',
			'sequenceDigitsAdapter',
		],
	},
	{ positions: 'D-17 п. 14', names: ['keyShapeFor', 'toCanonicalKey'] },
	{ positions: 'D-17 п. 15', names: ['isAnswered'] },
	{ positions: 'D-17 п. 16', names: ['answerIdList', 'normalizeKeyValue'] },
	{ positions: 'D-17 п. 17', names: ['computeVerdicts', 'allPartsCorrect', 'errorUnits', 'readKey'] },
	{
		positions: 'Phase 5 D-16',
		names: [
			'SubmitAttemptRequestSchema',
			'SubmitAttemptErrorSchema',
			'SUBMIT_ERROR_CODES',
			'ATTEMPT_GRACE_PERIOD_MINUTES',
			'QuestionVerdictsSchema',
			'QuestionStatusSchema',
			'ScoredQuestionFactSchema',
			'AttemptFactsSchema',
			'LegacyAttemptResultItemSchema',
			'LegacyAttemptResultsSchema',
			'AttemptQuestionViewSchema',
			'AttemptViewSchema',
			'AdminAttemptViewSchema',
			'scoreQuestionFacts',
		],
	},
	{
		positions: 'Phase 6 D-14',
		names: ['SaveAttemptDraftRequestSchema', 'AttemptSessionSchema', 'SaveDraftAnswerSchema'],
	},
]

const PRIVATE_COPY_PATTERNS = [
	{
		positions: 'D-17 п. 5',
		label: "литерал списка шаблонов z.enum(['single_choice', …])",
		pattern: /z\.enum\(\s*\[\s*['"]single_choice['"]/,
	},
	{
		positions: 'D-17 п. 14 (D-09)',
		label: 'форма ключа по сравнению метрики мимо keyShapeFor',
		pattern: /mistakeMetric\s*[!=]==?\s*['"]/,
	},
]

const LEGACY_D19_EXEMPTIONS = [{ file: 'app/server/src/lib/tests/scoring.ts', name: 'SCORING_FORMULAS' }]

const REMOVED_SERVER_COPIES = [
	'app/server/src/lib/tests/question-types.ts',
	'app/server/src/lib/tests/submit-result.ts',
	'app/server/src/lib/tests/telemetry.ts',
]

const ALL_NAMES = PRIVATE_COPY_NAMES.flatMap((group) =>
	group.names.map((name) => ({ name, positions: group.positions }))
)

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const DECLARATION = new RegExp(
	`(?:^|[^\\w$.])(?:function(?:\\s*\\*\\s*|\\s+)|(?:const|let|var|class)\\s+)(${ALL_NAMES.map((item) => escapeRegExp(item.name)).join('|')})(?![\\w$])`,
	'gm'
)

function findDeclarations(source) {
	return [...source.matchAll(DECLARATION)].map((match) => match[1])
}

function findPatterns(source) {
	return PRIVATE_COPY_PATTERNS.filter((item) => item.pattern.test(source))
}

function collectSources(relativeDir) {
	const files = []
	const walk = (dir) => {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
			if (entry.isDirectory()) {
				if (!SKIPPED_DIRS.has(entry.name)) walk(path.join(dir, entry.name))
				continue
			}
			if (!entry.isFile() || !SOURCE_FILE.test(entry.name) || TEST_FILE.test(entry.name)) continue
			files.push(path.join(dir, entry.name))
		}
	}
	walk(path.join(REPO_ROOT, relativeDir))
	return files.sort()
}

function isExempt(file, name) {
	return LEGACY_D19_EXEMPTIONS.some((item) => item.file === file && item.name === name)
}

test('детектор находит объявления и не реагирует на импорт и реэкспорт', () => {
	assert.deepEqual(findDeclarations('export function mergeTelemetryMaps(a, b) {}'), ['mergeTelemetryMaps'])
	assert.deepEqual(findDeclarations('async function isAnswered() {}'), ['isAnswered'])
	assert.deepEqual(findDeclarations('export const IdSchema = z.string()'), ['IdSchema'])
	assert.deepEqual(findDeclarations('const computeVerdicts = () => null'), ['computeVerdicts'])
	assert.deepEqual(findDeclarations("import { mergeTelemetryMaps } from '@bio-exam/exam-core'"), [])
	assert.deepEqual(findDeclarations("export { mergeTelemetryMaps } from '@bio-exam/exam-core'"), [])
	assert.deepEqual(findDeclarations('const verdicts = computeVerdicts({})'), [])
	assert.deepEqual(findDeclarations('function isAnsweredLater() {}'), [])
	assert.deepEqual(findDeclarations('obj.isAnswered = function () {}'), [])
	assert.equal(findPatterns("z.enum(['single_choice', 'multi_choice'])").length, 1)
	assert.equal(findPatterns("selected.scoringRule.mistakeMetric === 'compact_text_in_set'").length, 1)
	assert.equal(findPatterns("keyShapeFor({ uiTemplate, mistakeMetric }) === 'text_variants'").length, 0)
})

test('в app/web и app/server/src нет приватных копий логики шаблона из списка D-17', () => {
	const violations = []
	let scanned = 0
	for (const root of SCAN_ROOTS) {
		const files = collectSources(root)
		assert.ok(files.length > 0, `${root}: не найдено ни одного исходника`)
		scanned += files.length
		for (const file of files) {
			const relative = path.relative(REPO_ROOT, file).split(path.sep).join('/')
			const source = fs.readFileSync(file, 'utf8')
			for (const name of findDeclarations(source)) {
				if (isExempt(relative, name)) continue
				const positions = ALL_NAMES.find((item) => item.name === name)?.positions
				violations.push(`${relative}: локальное объявление ${name} (${positions}), импортируйте из @bio-exam/exam-core`)
			}
			for (const item of findPatterns(source)) {
				violations.push(`${relative}: ${item.label} (${item.positions})`)
			}
		}
	}
	assert.ok(scanned >= 50, `просканировано файлов: ${scanned}`)
	assert.deepEqual(violations, [])
})

test('исключение D-19 указывает на существующее объявление legacy', () => {
	for (const item of LEGACY_D19_EXEMPTIONS) {
		const source = fs.readFileSync(path.join(REPO_ROOT, item.file), 'utf8')
		assert.ok(findDeclarations(source).includes(item.name), `${item.file}: ${item.name}`)
	}
})

test('удалённые серверные копии не вернулись', () => {
	for (const file of REMOVED_SERVER_COPIES) {
		assert.equal(fs.existsSync(path.join(REPO_ROOT, file)), false, file)
	}
})

test('web telemetry реэкспортирует mergeTelemetryMaps из @bio-exam/exam-core', () => {
	const source = fs.readFileSync(path.join(REPO_ROOT, 'app/web/components/tests/telemetry.ts'), 'utf8')
	assert.match(
		source,
		/export\s*\{(?:[^}]*,)?\s*mergeTelemetryMaps\s*(?:,[^}]*)?\}\s*from\s*['"]@bio-exam\/exam-core['"]/
	)
})
