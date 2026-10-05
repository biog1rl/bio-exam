import {
	allPartsCorrect,
	AttemptViewSchema,
	questionStatus,
	type AnswerValue,
	type AttemptQuestionView,
	type AttemptView,
	type QuestionUiTemplate,
	type QuestionVerdicts,
	type ReviewStatus,
} from '@bio-exam/exam-core'

export type ReadableFact = {
	questionId: string
	template?: QuestionUiTemplate
	points: number
	earnedPoints: number
	isCorrect: boolean
	userAnswer: unknown
	explanationText: string | null
	key: AnswerValue | null
	verdicts: QuestionVerdicts | null
	mistakes: number | null
}

export type AttemptViewer = { kind: 'admin' } | { kind: 'student'; showCorrectAnswer: boolean }

export type AttemptSummary = {
	id: string
	submittedAt: string
	reviewStatus: ReviewStatus
	earnedPoints: number | null
	totalPoints: number
	scorePercentage: number | null
	passed: boolean | null
	autoEarnedPoints: number
	autoTotalPoints: number
}

type KeyDisclosure = Pick<AttemptQuestionView, 'keyVisible' | 'correctAnswer' | 'verdicts' | 'mistakes'>

function discloseToStudent(fact: ReadableFact, showCorrectAnswer: boolean): KeyDisclosure {
	if (showCorrectAnswer) {
		return {
			keyVisible: fact.key != null,
			correctAnswer: fact.isCorrect ? null : fact.key,
			verdicts: fact.verdicts,
			mistakes: fact.mistakes,
		}
	}
	if (fact.isCorrect) {
		const verdicts = fact.verdicts && allPartsCorrect(fact.verdicts) ? fact.verdicts : null
		return { keyVisible: false, correctAnswer: null, verdicts, mistakes: 0 }
	}
	return { keyVisible: false, correctAnswer: null, verdicts: null, mistakes: null }
}

function discloseKey(fact: ReadableFact, viewer: AttemptViewer): KeyDisclosure {
	if (viewer.kind === 'student') return discloseToStudent(fact, viewer.showCorrectAnswer)
	return { keyVisible: fact.key != null, correctAnswer: fact.key, verdicts: fact.verdicts, mistakes: fact.mistakes }
}

function buildQuestionView(fact: ReadableFact, viewer: AttemptViewer): AttemptQuestionView {
	return {
		questionId: fact.questionId,
		isCorrect: fact.isCorrect,
		points: fact.points,
		earnedPoints: fact.earnedPoints,
		userAnswer: fact.userAnswer,
		explanationText: fact.explanationText,
		status: questionStatus(fact),
		...discloseKey(fact, viewer),
	}
}

export function buildAttemptView(params: {
	attempt: AttemptSummary
	facts: ReadonlyArray<ReadableFact>
	viewer: AttemptViewer
}): AttemptView {
	const { attempt, facts, viewer } = params
	return AttemptViewSchema.parse({
		attemptId: attempt.id,
		submittedAt: attempt.submittedAt,
		reviewStatus: attempt.reviewStatus,
		earnedPoints: attempt.earnedPoints,
		totalPoints: attempt.totalPoints,
		scorePercentage: attempt.scorePercentage,
		passed: attempt.passed,
		autoEarnedPoints: attempt.autoEarnedPoints,
		autoTotalPoints: attempt.autoTotalPoints,
		results: facts.map((fact) => buildQuestionView(fact, viewer)),
	})
}
