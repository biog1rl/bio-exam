import { describe, expect, it } from 'vitest'

import type { Question } from '../../../types'
import { createDefaultQuestion, normalizeQuestionForSave } from '../../../types'
import { questionFormKey, toQuestionDraftPayload } from './question-draft-payload'

function choiceQuestion(): Question {
	return {
		id: 'q-1',
		type: 'radio',
		questionUiTemplate: 'single_choice',
		questionTypeTitle: 'Один ответ',
		order: 2,
		points: 1,
		options: [
			{ id: 'a', text: 'Митоз' },
			{ id: 'b', text: 'Мейоз' },
		],
		matchingPairs: null,
		promptText: 'Как делится соматическая клетка?',
		explanationText: null,
		correct: 'a',
	}
}

function shortQuestion(): Question {
	return { ...createDefaultQuestion(4), id: 'q-2', promptText: 'Деление клетки', correct: 'митоз' }
}

describe('questionFormKey', () => {
	it('equals for a question and its normalized copy', () => {
		const choice = choiceQuestion()
		const short = shortQuestion()
		expect(questionFormKey(normalizeQuestionForSave(choice))).toBe(questionFormKey(choice))
		expect(questionFormKey(normalizeQuestionForSave(short))).toBe(questionFormKey(short))
		expect(questionFormKey({ ...choice })).toBe(questionFormKey(choice))
	})

	it('changes when promptText changes', () => {
		const base = choiceQuestion()
		expect(questionFormKey({ ...base, promptText: `${base.promptText} ` })).not.toBe(questionFormKey(base))
	})

	it('changes when the answer key changes', () => {
		const base = choiceQuestion()
		expect(questionFormKey({ ...base, correct: 'b' })).not.toBe(questionFormKey(base))
		const short = shortQuestion()
		expect(questionFormKey({ ...short, correct: 'мейоз' })).not.toBe(questionFormKey(short))
	})

	it('changes when options change', () => {
		const base = choiceQuestion()
		const renamed = { ...base, options: [base.options![0], { id: 'b', text: 'Амитоз' }] }
		const added = { ...base, options: [...base.options!, { id: 'c', text: 'Амитоз' }] }
		expect(questionFormKey(renamed)).not.toBe(questionFormKey(base))
		expect(questionFormKey(added)).not.toBe(questionFormKey(base))
	})

	it('does not depend on id', () => {
		const base = choiceQuestion()
		expect(questionFormKey({ ...base, id: undefined })).toBe(questionFormKey(base))
		expect(questionFormKey({ ...base, id: 'other' })).toBe(questionFormKey(base))
	})

	it('does not depend on key order of the form object', () => {
		const base = choiceQuestion()
		const reordered = Object.fromEntries(Object.entries(base).reverse()) as unknown as Question
		expect(questionFormKey(reordered)).toBe(questionFormKey(base))
	})
})

describe('toQuestionDraftPayload', () => {
	it('builds the draft PATCH payload with no id and the given order', () => {
		const base = choiceQuestion()
		const payload = toQuestionDraftPayload(base, 3)
		expect(payload).toEqual({ question: { ...normalizeQuestionForSave(base), id: undefined, order: 3 } })
		expect(payload.question.id).toBeUndefined()
		expect(payload.question.order).toBe(3)
		expect('id' in payload.question).toBe(true)
	})

	it('normalizes the answer key like normalizeQuestionForSave', () => {
		const short = shortQuestion()
		const payload = toQuestionDraftPayload({ ...short, order: 9 }, 0)
		expect(payload.question).toEqual({ ...normalizeQuestionForSave(short), id: undefined, order: 0 })
		expect(payload.question.correct).toBe(normalizeQuestionForSave(short).correct)
	})
})
