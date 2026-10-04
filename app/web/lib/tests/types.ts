import type { AnswerValue as TestAnswerValue, QuestionTelemetry, QuestionUiTemplate } from '@bio-exam/exam-core'

export type TestQuestionType = string

export type TestOption = {
	id: string
	text: string
}

export type MatchingPairs = {
	left: TestOption[]
	right: TestOption[]
}

export type PublicTestListItem = {
	id: string
	slug: string
	title: string
	description: string | null
	timeLimitMinutes: number | null
	passingScore: number | null
	topicId: string
	topicSlug: string
	topicTitle: string
	questionsCount: number
}

export type PublicTestDetail = {
	id: string
	slug: string
	title: string
	description: string | null
	showCorrectAnswer: boolean
	timeLimitMinutes: number | null
	passingScore: number | null
	topicId: string
	topicSlug: string
	topicTitle: string
}

export type PublicTestQuestion = {
	id: string
	type: TestQuestionType
	questionUiTemplate: QuestionUiTemplate | null
	questionTypeTitle: string
	order: number
	points: number
	options: TestOption[] | null
	matchingPairs: MatchingPairs | null
	promptText: string
}

export type {
	AnswerValue as TestAnswerValue,
	QuestionTelemetry,
	QuestionUiTemplate,
	SubmitResult,
	SubmitResultItem,
} from '@bio-exam/exam-core'

export type TestAttemptSummary = {
	id: string
	earnedPoints: number
	totalPoints: number
	scorePercentage: number
	passed: boolean
	submittedAt: string
}

export type SessionInfo = {
	sessionId: string
	startedAt: string // ISO 8601 timestamp
	draftAnswers?: Record<string, TestAnswerValue> | null
	draftLastQuestionId?: string | null
	draftTelemetry?: Record<string, QuestionTelemetry> | null
}

// Shape mirrors testAttempts row returned by GET /api/tests/admin/attempts/:id
export type AttemptReviewData = {
	id: string
	testId: string
	userId: string
	answers: Record<string, unknown>
	results: unknown[]
	earnedPoints: number
	totalPoints: number
	scorePercentage: number
	passed: boolean
	submittedAt: string
	telemetry: Record<string, QuestionTelemetry> | null
}
