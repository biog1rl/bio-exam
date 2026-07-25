export type TestQuestionType = string
export type QuestionUiTemplate = 'single_choice' | 'multi_choice' | 'matching' | 'short_text' | 'sequence_digits'

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

export type TestAnswerValue = string | string[] | Record<string, string>

// Shape mirrors SubmitResultSchema in app/server/src/lib/tests/submit-result.ts
// Keep in sync manually (no shared package for these types)
export type SubmitResultItem = {
	questionId: string
	isCorrect: boolean
	points: number
	earnedPoints: number
	userAnswer: unknown
	correctAnswer: unknown
	explanationText: string | null
}

// Shape mirrors SubmitResultSchema in app/server/src/lib/tests/submit-result.ts
// Keep in sync manually (no shared package for these types)
export type SubmitResult = {
	attemptId: string
	submittedAt: string
	earnedPoints: number
	totalPoints: number
	scorePercentage: number
	passed: boolean
	results: SubmitResultItem[]
}

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

export type QuestionTelemetry = {
	timeSpentMs: number
	focusLossCount: number
	visitCount: number
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
