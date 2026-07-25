import assert from 'node:assert/strict'

import { createDefaultTestScoringRules } from '../lib/tests/scoring.js'
import { SaveTestSchema } from './tests.js'

const basePayload = {
	topicId: '11111111-1111-4111-8111-111111111111',
	title: 'Черновик теста',
	slug: 'chernovik-testa',
	description: null,
	isPublished: false,
	showCorrectAnswer: true,
	scoringRules: createDefaultTestScoringRules(),
	timeLimitMinutes: null,
	passingScore: null,
	order: 0,
}

const radioQuestion = {
	type: 'radio' as const,
	order: 0,
	points: 1,
	options: [
		{ id: 'a', text: 'Вариант A' },
		{ id: 'b', text: 'Вариант B' },
	],
	matchingPairs: null,
	promptText: 'Какой вариант правильный?',
	explanationText: null,
	correct: 'a',
}

const shortAnswerQuestion = {
	type: 'short_answer' as const,
	order: 0,
	points: 1,
	options: null,
	matchingPairs: null,
	promptText: 'Введите термин',
	explanationText: null,
	correct: 'митоз',
}

const shortAnswerVariantsQuestion = {
	type: 'short_answer_variants' as const,
	order: 0,
	points: 1,
	options: null,
	matchingPairs: null,
	promptText: 'Назовите метод исследования',
	explanationText: null,
	correct: ['эксперимент', 'моделирование'],
}

const sequenceQuestion = {
	type: 'sequence' as const,
	order: 0,
	points: 2,
	options: null,
	matchingPairs: null,
	promptText: 'Укажите последовательность цифр',
	explanationText: null,
	correct: '2314',
}

const checkboxWithNumericIdsQuestion = {
	type: 'checkbox' as const,
	order: 0,
	points: 2,
	options: [
		{ id: 1, text: 'Вариант 1' },
		{ id: 2, text: 'Вариант 2' },
		{ id: 3, text: 'Вариант 3' },
	],
	matchingPairs: null,
	promptText: 'Выберите правильные варианты',
	explanationText: null,
	correct: [1, 3],
}

const customQuestionType = {
	type: 'custom_multi',
	order: 0,
	points: 3,
	options: [
		{ id: 1, text: 'A' },
		{ id: 2, text: 'B' },
		{ id: 3, text: 'C' },
	],
	matchingPairs: null,
	promptText: 'Кастомный вопрос',
	explanationText: null,
	correct: [1, 2],
}

const draftWithoutQuestions = SaveTestSchema.safeParse({
	...basePayload,
	isPublished: false,
	questions: [],
})

assert.equal(draftWithoutQuestions.success, true)

const publishedWithoutQuestions = SaveTestSchema.safeParse({
	...basePayload,
	isPublished: true,
	questions: [],
})

assert.equal(publishedWithoutQuestions.success, false)
if (publishedWithoutQuestions.success) {
	throw new Error('Published test without questions should be rejected')
}

const hasQuestionsIssue = publishedWithoutQuestions.error.issues.some((issue) => issue.path.join('.') === 'questions')
assert.equal(hasQuestionsIssue, true)

const publishedWithQuestion = SaveTestSchema.safeParse({
	...basePayload,
	isPublished: true,
	questions: [radioQuestion],
})

assert.equal(publishedWithQuestion.success, true)

const publishedWithShortAnswer = SaveTestSchema.safeParse({
	...basePayload,
	isPublished: true,
	questions: [shortAnswerQuestion],
})
assert.equal(publishedWithShortAnswer.success, true)

const publishedWithShortAnswerVariants = SaveTestSchema.safeParse({
	...basePayload,
	isPublished: true,
	questions: [shortAnswerVariantsQuestion],
})
assert.equal(publishedWithShortAnswerVariants.success, true)

const shortAnswerVariantsWithScalar = SaveTestSchema.safeParse({
	...basePayload,
	isPublished: true,
	questions: [{ ...shortAnswerVariantsQuestion, correct: 'эксперимент' }],
})
assert.equal(shortAnswerVariantsWithScalar.success, false)

const shortAnswerVariantsWithDuplicate = SaveTestSchema.safeParse({
	...basePayload,
	isPublished: true,
	questions: [{ ...shortAnswerVariantsQuestion, correct: ['Эксперимент', ' эксперимент '] }],
})
assert.equal(shortAnswerVariantsWithDuplicate.success, false)

const publishedWithSequence = SaveTestSchema.safeParse({
	...basePayload,
	isPublished: true,
	questions: [sequenceQuestion],
})
assert.equal(publishedWithSequence.success, true)

const publishedCheckboxWithNumericIds = SaveTestSchema.safeParse({
	...basePayload,
	isPublished: true,
	questions: [checkboxWithNumericIdsQuestion],
})
assert.equal(publishedCheckboxWithNumericIds.success, true)

const publishedCustomType = SaveTestSchema.safeParse({
	...basePayload,
	isPublished: true,
	questions: [customQuestionType],
})
assert.equal(publishedCustomType.success, true)

const invalidSequence = SaveTestSchema.safeParse({
	...basePayload,
	isPublished: true,
	questions: [{ ...sequenceQuestion, correct: '23a4' }],
})
assert.equal(invalidSequence.success, false)

const scoringRulesByDefault = SaveTestSchema.safeParse({
	...basePayload,
	scoringRules: undefined,
	questions: [radioQuestion],
})
assert.equal(scoringRulesByDefault.success, true)
if (!scoringRulesByDefault.success) throw new Error('Payload without scoringRules should be accepted')
assert.equal(scoringRulesByDefault.data.scoringRules, undefined)

const draftWithTimerThresholds = SaveTestSchema.safeParse({
	...basePayload,
	timeLimitMinutes: 90,
	redThresholdMinutes: 10,
	warningThresholdMinutes: 3,
	questions: [],
})
assert.equal(draftWithTimerThresholds.success, true)
if (!draftWithTimerThresholds.success) {
	throw new Error('Payload with timer thresholds should be accepted')
}
assert.equal(draftWithTimerThresholds.data.redThresholdMinutes, 10)
assert.equal(draftWithTimerThresholds.data.warningThresholdMinutes, 3)
