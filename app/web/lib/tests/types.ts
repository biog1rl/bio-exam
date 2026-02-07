export type TestQuestionType = 'radio' | 'checkbox' | 'matching'

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
	order: number
	points: number
	options: TestOption[] | null
	matchingPairs: MatchingPairs | null
	promptText: string
}

export type TestAnswerValue = string | string[] | Record<string, string>

export type SubmitResultItem = {
	questionId: string
	isCorrect: boolean
	points: number
	earnedPoints: number
	userAnswer: unknown
	correctAnswer: unknown
	explanationText: string | null
}

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
