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
	it.each(
		(
			[
				{
					name: 'changes when promptText changes',
					equal: false,
					pairs: () => {
						const base = choiceQuestion()
						return [[{ ...base, promptText: `${base.promptText} ` }, base]]
					},
				},
				{
					name: 'changes when the answer key changes',
					equal: false,
					pairs: () => {
						const base = choiceQuestion()
						const short = shortQuestion()
						return [
							[{ ...base, correct: 'b' }, base],
							[{ ...short, correct: 'мейоз' }, short],
						]
					},
				},
				{
					name: 'changes when options change',
					equal: false,
					pairs: () => {
						const base = choiceQuestion()
						return [
							[{ ...base, options: [base.options![0], { id: 'b', text: 'Амитоз' }] }, base],
							[{ ...base, options: [...base.options!, { id: 'c', text: 'Амитоз' }] }, base],
						]
					},
				},
				{
					name: 'does not depend on id',
					equal: true,
					pairs: () => {
						const base = choiceQuestion()
						return [
							[{ ...base, id: undefined }, base],
							[{ ...base, id: 'other' }, base],
						]
					},
				},
				{
					name: 'does not depend on key order of the form object',
					equal: true,
					pairs: () => {
						const base = choiceQuestion()
						return [[Object.fromEntries(Object.entries(base).reverse()) as unknown as Question, base]]
					},
				},
			] as { name: string; equal: boolean; pairs: () => [Question, Question][] }[]
		).map((row): [string, { name: string; equal: boolean; pairs: () => [Question, Question][] }] => [row.name, row])
	)('%s', (_name, { equal, pairs }) => {
		for (const [changed, base] of pairs()) {
			if (equal) expect(questionFormKey(changed)).toBe(questionFormKey(base))
			else expect(questionFormKey(changed)).not.toBe(questionFormKey(base))
		}
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
})
