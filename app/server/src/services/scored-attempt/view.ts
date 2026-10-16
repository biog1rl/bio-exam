import {
	allPartsCorrect,
	AttemptViewSchema,
	questionStatus,
	type AnswerValue,
	type AttemptQuestionView,
	type AttemptSubmitSource,
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

export type OpenReviewRecord = {
	score: number
	comment: string | null
	reviewedAt: Date
	reviewerName: string | null
}

export type OpenAnswerContext = {
	reviews: ReadonlyMap<string, OpenReviewRecord>
	photos: ReadonlyMap<string, ReadonlyArray<{ id: string; uploadedAt: string }>>
}

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
	uploadClosesAt?: string | null
	submitSource?: AttemptSubmitSource
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

function openAnswerText(fact: ReadableFact): string {
	return typeof fact.userAnswer === 'string' ? fact.userAnswer : ''
}

function reviewedGrade(fact: ReadableFact, review: OpenReviewRecord) {
	const isCorrect = review.score === fact.points
	return {
		isCorrect,
		earnedPoints: review.score,
		status: questionStatus({ points: fact.points, isCorrect, earnedPoints: review.score }),
	}
}

function openAdminOverlay(fact: ReadableFact, open: OpenAnswerContext): Partial<AttemptQuestionView> {
	const review = open.reviews.get(fact.questionId) ?? null
	return {
		...(review ? reviewedGrade(fact, review) : {}),
		open: {
			text: openAnswerText(fact),
			photos: [...(open.photos.get(fact.questionId) ?? [])],
			review: review
				? {
						score: review.score,
						comment: review.comment,
						reviewedAt: review.reviewedAt.toISOString(),
						reviewerName: review.reviewerName,
					}
				: null,
			referenceText: fact.explanationText,
		},
	}
}

function openStudentOverlay(
	fact: ReadableFact,
	graded: boolean,
	open: OpenAnswerContext
): Partial<AttemptQuestionView> {
	if (!graded) return { explanationText: null, review: null, referenceText: null }
	const review = open.reviews.get(fact.questionId) ?? null
	return {
		...(review ? reviewedGrade(fact, review) : {}),
		review: review ? { score: review.score, comment: review.comment } : null,
		referenceText: fact.explanationText,
	}
}

function openOverlay(
	fact: ReadableFact,
	viewer: AttemptViewer,
	graded: boolean,
	open: OpenAnswerContext
): Partial<AttemptQuestionView> {
	if (fact.template !== 'open') return {}
	return viewer.kind === 'student' ? openStudentOverlay(fact, graded, open) : openAdminOverlay(fact, open)
}

function buildQuestionView(
	fact: ReadableFact,
	viewer: AttemptViewer,
	graded: boolean,
	open: OpenAnswerContext
): AttemptQuestionView {
	return {
		questionId: fact.questionId,
		isCorrect: fact.isCorrect,
		points: fact.points,
		earnedPoints: fact.earnedPoints,
		userAnswer: fact.userAnswer,
		explanationText: fact.explanationText,
		status: questionStatus(fact),
		...discloseKey(fact, viewer),
		...openOverlay(fact, viewer, graded, open),
	}
}

const NO_OPEN_ANSWERS: OpenAnswerContext = { reviews: new Map(), photos: new Map() }

export function buildAttemptView(params: {
	attempt: AttemptSummary
	facts: ReadonlyArray<ReadableFact>
	viewer: AttemptViewer
	open?: OpenAnswerContext
}): AttemptView {
	const { attempt, facts, viewer } = params
	const open = params.open ?? NO_OPEN_ANSWERS
	const graded = attempt.reviewStatus === 'graded'
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
		uploadClosesAt: attempt.uploadClosesAt ?? null,
		submitSource: attempt.submitSource ?? 'client',
		results: facts.map((fact) => buildQuestionView(fact, viewer, graded, open)),
	})
}
