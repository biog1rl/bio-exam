import type { AttemptView } from '@bio-exam/exam-core'

import assert from 'node:assert/strict'
import { test } from 'vitest'

import { parseStudentAttempt, questionsInAttempt } from './student-attempt'
import type { PublicTestQuestion } from './types'

const FIRST = '11111111-1111-4111-8111-111111111111'
const SECOND = '22222222-2222-4222-8222-222222222222'
const REMOVED = '33333333-3333-4333-8333-333333333333'

function question(id: string, order: number): PublicTestQuestion {
	return {
		id,
		type: 'radio',
		questionUiTemplate: 'single_choice',
		questionTypeTitle: 'Один ответ',
		order,
		points: 1,
		options: null,
		matchingPairs: null,
		promptText: id,
	}
}

function attemptOf(...questionIds: string[]): AttemptView {
	return {
		attemptId: '44444444-4444-4444-8444-444444444444',
		submittedAt: '2026-10-16T10:00:00.000Z',
		earnedPoints: 1,
		totalPoints: 1,
		scorePercentage: 100,
		passed: true,
		reviewStatus: 'none',
		autoEarnedPoints: 1,
		autoTotalPoints: 1,
		results: questionIds.map((questionId) => ({
			questionId,
			isCorrect: true,
			points: 1,
			earnedPoints: 1,
			userAnswer: 'a',
			correctAnswer: null,
			explanationText: null,
			status: 'correct' as const,
			keyVisible: false,
			mistakes: null,
			verdicts: null,
		})),
	}
}

test('questionsInAttempt: только вопросы попытки, по порядку теста', () => {
	const questions = [question(SECOND, 2), question(REMOVED, 3), question(FIRST, 1)]

	const shown = questionsInAttempt(attemptOf(FIRST, SECOND), questions)

	assert.deepEqual(
		shown.map((item) => item.id),
		[FIRST, SECOND]
	)
})

test('parseStudentAttempt: ответ без test или с битой попыткой отклоняется', () => {
	const test = { id: FIRST, slug: 't', title: 'T', topicSlug: 'x', topicTitle: 'X' }
	assert.throws(() => parseStudentAttempt({ attempt: attemptOf(FIRST), questions: [] }))
	assert.throws(() => parseStudentAttempt({ attempt: { attemptId: 'bad' }, test, questions: [] }))
	const parsed = parseStudentAttempt({ attempt: attemptOf(FIRST), test, questions: [] })
	assert.deepEqual(parsed.photos, {})
})
