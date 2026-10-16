import { AttemptViewSchema, type AttemptView } from '@bio-exam/exam-core'

import type { AttemptReviewData, PublicTestQuestion } from './types'

export type StudentAttemptPhoto = { id: string; uploadedAt: string }

export type StudentAttemptTest = {
	id: string
	slug: string
	title: string
	topicSlug: string
	topicTitle: string
}

export type StudentAttemptData = {
	attempt: AttemptView
	test: StudentAttemptTest
	questions: PublicTestQuestion[]
	photos: Record<string, StudentAttemptPhoto[]>
}

export function parseStudentAttempt(body: unknown): StudentAttemptData {
	if (!body || typeof body !== 'object') throw new Error('Malformed student attempt response')
	const record = body as Record<string, unknown>
	const test = record.test as StudentAttemptTest | undefined
	if (!test || typeof test.id !== 'string' || !Array.isArray(record.questions)) {
		throw new Error('Malformed student attempt response')
	}
	return {
		attempt: AttemptViewSchema.parse(record.attempt),
		test,
		questions: record.questions as PublicTestQuestion[],
		photos: (record.photos ?? {}) as Record<string, StudentAttemptPhoto[]>,
	}
}

export function reviewDataOf(attempt: AttemptView, testId: string): AttemptReviewData {
	return {
		...attempt,
		testId,
		userId: '',
		answers: Object.fromEntries(attempt.results.map((result) => [result.questionId, result.userAnswer])),
		telemetry: null,
	}
}

export function questionsInAttempt(attempt: AttemptView, questions: PublicTestQuestion[]): PublicTestQuestion[] {
	const answered = new Set(attempt.results.map((result) => result.questionId))
	return questions.filter((question) => answered.has(question.id)).sort((a, b) => a.order - b.order)
}
