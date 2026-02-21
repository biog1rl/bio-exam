// =============================================================================
// Types for Test Management
// =============================================================================

export type QuestionType = string
export type QuestionUiTemplate = 'single_choice' | 'multi_choice' | 'matching' | 'short_text' | 'sequence_digits'
export type ScoringFormula = 'exact_match' | 'one_mistake_partial'
export type DynamicScoringFormula = 'exact_match' | 'one_mistake_partial' | 'tiers'
export type MistakeMetric =
	| 'boolean_correct'
	| 'set_distance'
	| 'pair_mismatch_count'
	| 'compact_text_equal'
	| 'hamming_digits'

export interface QuestionScoringRule {
	formula: ScoringFormula
	correctPoints: number
	oneMistakePoints?: number
}

export interface TestScoringRules {
	radio: QuestionScoringRule
	checkbox: QuestionScoringRule
	matching: QuestionScoringRule
	short_answer: QuestionScoringRule
	sequence: QuestionScoringRule
}

export interface QuestionTypeTier {
	maxMistakes: number
	points: number
}

export interface QuestionTypeScoringRule {
	formula: DynamicScoringFormula
	mistakeMetric: MistakeMetric
	correctPoints: number
	oneMistakePoints?: number
	tiers?: QuestionTypeTier[]
}

export const TEMPLATE_META: Record<
	QuestionUiTemplate,
	{
		label: string
		description: string
		answerFormat: string
		example: string
	}
> = {
	single_choice: {
		label: 'Один вариант',
		description: 'Пользователь выбирает один ответ из списка.',
		answerFormat: '`correct` = строковый id варианта',
		example: 'Вопрос: 2+2. Варианты: [1,2,3,4], correct = "4"',
	},
	multi_choice: {
		label: 'Множественный выбор',
		description: 'Пользователь отмечает несколько вариантов.',
		answerFormat: '`correct` = массив id вариантов',
		example: 'Выберите 3 признака. correct = ["1","3","5"]',
	},
	matching: {
		label: 'Сопоставление',
		description: 'Нужно сопоставить элементы слева и справа.',
		answerFormat: '`correct` = объект leftId -> rightId',
		example: 'correct = { "a": "1", "b": "2", "c": "3" }',
	},
	short_text: {
		label: 'Краткий ответ',
		description: 'Одна строка: слово, число или код.',
		answerFormat: '`correct` = строка',
		example: 'correct = "митоз"',
	},
	sequence_digits: {
		label: 'Последовательность цифр',
		description: 'Ответ проверяется как порядок цифр.',
		answerFormat: '`correct` = строка из цифр без пробелов',
		example: 'correct = "2314"',
	},
}

export const MISTAKE_METRIC_LABELS: Record<MistakeMetric, string> = {
	boolean_correct: 'Точное совпадение (0/1)',
	set_distance: 'Расстояние множеств (для multi-choice)',
	pair_mismatch_count: 'Количество неверных пар (для matching)',
	compact_text_equal: 'Сравнение строк без пробелов/регистра',
	hamming_digits: 'Позиционные ошибки в последовательности',
}

export const MISTAKE_METRIC_DESCRIPTIONS: Record<MistakeMetric, string> = {
	boolean_correct: '0 ошибок только при полном совпадении ответа.',
	set_distance: 'Ошибка считается по отсутствующим/лишним выбранным вариантам.',
	pair_mismatch_count: 'Каждая неверная пара добавляет 1 ошибку.',
	compact_text_equal: 'Сравнивается строка после нормализации пробелов и регистра.',
	hamming_digits: 'Считаются несовпадения по позициям и разница длины.',
}

export const ALLOWED_MISTAKE_METRICS_BY_TEMPLATE: Record<QuestionUiTemplate, MistakeMetric[]> = {
	single_choice: ['boolean_correct'],
	multi_choice: ['set_distance'],
	matching: ['pair_mismatch_count'],
	short_text: ['compact_text_equal'],
	sequence_digits: ['hamming_digits'],
}

export function getAllowedMistakeMetricsForTemplate(template: QuestionUiTemplate): MistakeMetric[] {
	return ALLOWED_MISTAKE_METRICS_BY_TEMPLATE[template]
}

export function isMetricAllowedForTemplate(template: QuestionUiTemplate, metric: MistakeMetric): boolean {
	return ALLOWED_MISTAKE_METRICS_BY_TEMPLATE[template].includes(metric)
}

export function createDefaultQuestionTypeScoringRule(template: QuestionUiTemplate): QuestionTypeScoringRule {
	const metric = getAllowedMistakeMetricsForTemplate(template)[0]
	if (template === 'single_choice' || template === 'short_text') {
		return { formula: 'exact_match', mistakeMetric: metric, correctPoints: 1 }
	}
	return { formula: 'one_mistake_partial', mistakeMetric: metric, correctPoints: 2, oneMistakePoints: 1 }
}

export interface QuestionTypeValidationSchema {
	minOptions?: number
	maxOptions?: number
	exactChoiceCount?: number
}

export interface QuestionTypeDefinition {
	key: string
	title: string
	description?: string | null
	uiTemplate: QuestionUiTemplate
	validationSchema?: QuestionTypeValidationSchema | null
	scoringRule: QuestionTypeScoringRule
	isSystem: boolean
	isActive: boolean
	hasOverride?: boolean
	override?: {
		titleOverride?: string | null
		scoringRuleOverride?: QuestionTypeScoringRule | null
		isDisabled?: boolean
	} | null
}

export interface Option {
	id: string
	text: string
}

export interface MatchingPairs {
	left: Option[]
	right: Option[]
}

export interface Topic {
	id: string
	slug: string
	title: string
	description: string | null
	order: number
	isActive: boolean
	createdAt: string
	testsCount?: number
}

export interface Test {
	id: string
	topicId: string
	slug: string
	title: string
	description: string | null
	version: number
	isPublished: boolean
	showCorrectAnswer: boolean
	scoringRules?: TestScoringRules
	timeLimitMinutes: number | null
	passingScore: number | null
	order: number
	createdAt: string
	updatedAt: string
	topicSlug?: string
	topicTitle?: string
	questionsCount?: number
}

export interface Question {
	id?: string
	type: QuestionType
	questionUiTemplate?: QuestionUiTemplate | null
	questionTypeTitle?: string
	order: number
	points: number
	options: Option[] | null
	matchingPairs: MatchingPairs | null
	promptText: string
	explanationText: string | null
	correct: string | string[] | Record<string, string>
}

export interface TestWithQuestions extends Test {
	questions: Question[]
}

// Form data types
export interface TopicFormData {
	slug: string
	title: string
	description: string
	order: number
	isActive: boolean
}

export interface TestFormData {
	topicId: string
	title: string
	slug: string
	description: string
	isPublished: boolean
	showCorrectAnswer: boolean
	scoringRules?: TestScoringRules
	timeLimitMinutes: number | null
	passingScore: number | null
	order: number
	questions: Question[]
}

// API response types
export interface TopicsResponse {
	topics: Topic[]
}

export interface TestsResponse {
	tests: Test[]
}

export interface QuestionDraft {
	id: string
	testId: string
	lockVersion: number
	updatedAt: string
	createdAt: string
	payload: Record<string, unknown>
}

export interface QuestionDraftsResponse {
	drafts: QuestionDraft[]
}

export interface QuestionDraftDetailResponse {
	draft: QuestionDraft
}

export interface TestDetailResponse {
	test: Test
	questions: Question[]
}

export interface QuestionTypesResponse {
	scope: 'global' | 'test'
	testId?: string
	questionTypes: QuestionTypeDefinition[]
}

export function resolveQuestionTemplate(question: Pick<Question, 'questionUiTemplate'>): QuestionUiTemplate | null {
	return question.questionUiTemplate ?? null
}

export function normalizeSequenceCorrectValue(value: unknown): string | null {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return String(value).replace(/\s+/g, '')
	}
	if (typeof value === 'string') {
		return value.replace(/\s+/g, '')
	}
	return null
}

export function normalizeShortTextCorrectValue(value: unknown): string | null {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return String(value)
	}
	if (typeof value === 'string') {
		return value
	}
	return null
}

export function isValidSequenceCorrectValue(value: unknown): boolean {
	const normalized = normalizeSequenceCorrectValue(value)
	if (!normalized) return false
	return /^\d+$/.test(normalized)
}

export function normalizeQuestionForSave(question: Question): Question {
	const template = resolveQuestionTemplate(question)
	if (template === 'short_text') {
		const normalized = normalizeShortTextCorrectValue(question.correct)
		if (normalized == null) return question
		return {
			...question,
			correct: normalized,
		}
	}

	if (template !== 'sequence_digits') return question

	const normalized = normalizeSequenceCorrectValue(question.correct)
	if (!normalized) return question

	return {
		...question,
		correct: normalized,
	}
}

// Helper function to generate UUID
export function generateId(): string {
	return crypto.randomUUID()
}

// Default values
export function createDefaultQuestion(order: number): Question {
	return {
		type: 'short_answer',
		questionUiTemplate: 'short_text',
		questionTypeTitle: 'Краткий ответ',
		order,
		points: 1,
		options: null,
		matchingPairs: null,
		promptText: '',
		explanationText: null,
		correct: '',
	}
}

export function createDefaultScoringRules(): TestScoringRules {
	return {
		radio: { formula: 'exact_match', correctPoints: 1 },
		short_answer: { formula: 'exact_match', correctPoints: 1 },
		sequence: { formula: 'one_mistake_partial', correctPoints: 2, oneMistakePoints: 1 },
		matching: { formula: 'one_mistake_partial', correctPoints: 2, oneMistakePoints: 1 },
		checkbox: { formula: 'one_mistake_partial', correctPoints: 2, oneMistakePoints: 1 },
	}
}

export function createDefaultMatchingPairs(): MatchingPairs {
	return {
		left: [
			{ id: generateId(), text: '' },
			{ id: generateId(), text: '' },
		],
		right: [
			{ id: generateId(), text: '' },
			{ id: generateId(), text: '' },
		],
	}
}
