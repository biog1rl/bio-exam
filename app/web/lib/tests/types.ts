import type { AdminAttemptView, QuestionUiTemplate, ReviewStatus } from '@bio-exam/exam-core'

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
	AttemptQuestionView,
	AttemptView,
	QuestionStatus,
	QuestionTelemetry,
	QuestionUiTemplate,
} from '@bio-exam/exam-core'

export type TestAttemptSummary = {
	id: string
	earnedPoints: number | null
	totalPoints: number
	scorePercentage: number | null
	passed: boolean | null
	reviewStatus: ReviewStatus
	autoEarnedPoints: number
	autoTotalPoints: number
	submittedAt: string
}

export type AttemptReviewData = AdminAttemptView
