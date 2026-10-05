import type { QuestionUiTemplate } from './registry'

export const REVIEW_STATUSES = ['none', 'pending', 'graded'] as const

export type ReviewStatus = (typeof REVIEW_STATUSES)[number]

export type OutcomeFact = {
	questionId: string
	template?: QuestionUiTemplate
	points: number
	earnedPoints: number
}

export type AttemptScore = {
	earnedPoints: number
	totalPoints: number
	scorePercentage: number
	passed: boolean
}

export type AttemptOutcome = {
	reviewStatus: ReviewStatus
	submitted: AttemptScore
	autoEarnedPoints: number
	autoTotalPoints: number
	final: { earnedPoints: number; scorePercentage: number; passed: boolean } | null
}

export type ComputeAttemptOutcomeInput = {
	facts: readonly OutcomeFact[]
	finalScores: ReadonlyMap<string, number>
	passingScore: number | null
}

export type OutcomeProjection = {
	reviewStatus: ReviewStatus
	finalEarnedPoints: number | null
	finalScorePercentage: number | null
	finalPassed: boolean | null
	autoTotalPoints: number
}

function scoreOf(earnedPoints: number, totalPoints: number, passingScore: number | null): AttemptScore {
	const scorePercentage = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0
	const passed = passingScore == null ? true : scorePercentage >= Number(passingScore)
	return { earnedPoints, totalPoints, scorePercentage, passed }
}

function finalOf(score: AttemptScore): NonNullable<AttemptOutcome['final']> {
	return { earnedPoints: score.earnedPoints, scorePercentage: score.scorePercentage, passed: score.passed }
}

function isOpenFact(fact: OutcomeFact): boolean {
	return fact.template === 'open'
}

function assertOpenScore(fact: OutcomeFact, score: number): void {
	if (!Number.isFinite(score) || score < 0 || score > fact.points) {
		throw new RangeError(`Оценка открытого вопроса ${fact.questionId} вне диапазона 0..${fact.points}`)
	}
}

export function computeAttemptOutcome(input: ComputeAttemptOutcomeInput): AttemptOutcome {
	const { facts, finalScores, passingScore } = input

	let totalPoints = 0
	let earnedPoints = 0
	let autoTotalPoints = 0
	let autoEarnedPoints = 0
	let hasOpen = false
	let hasUngradedOpen = false
	let gradesSum = 0

	for (const fact of facts) {
		totalPoints += fact.points
		earnedPoints += fact.earnedPoints
		if (!isOpenFact(fact)) {
			autoTotalPoints += fact.points
			autoEarnedPoints += fact.earnedPoints
			continue
		}
		hasOpen = true
		const grade = finalScores.get(fact.questionId)
		if (grade === undefined) {
			hasUngradedOpen = true
			continue
		}
		assertOpenScore(fact, grade)
		gradesSum += grade
	}

	const submitted = scoreOf(earnedPoints, totalPoints, passingScore)

	if (!hasOpen) {
		return { reviewStatus: 'none', submitted, autoEarnedPoints, autoTotalPoints, final: finalOf(submitted) }
	}

	if (hasUngradedOpen) {
		return { reviewStatus: 'pending', submitted, autoEarnedPoints, autoTotalPoints, final: null }
	}

	const final = scoreOf(autoEarnedPoints + gradesSum, totalPoints, passingScore)
	return { reviewStatus: 'graded', submitted, autoEarnedPoints, autoTotalPoints, final: finalOf(final) }
}

export function projectionOf(outcome: AttemptOutcome): OutcomeProjection {
	return {
		reviewStatus: outcome.reviewStatus,
		finalEarnedPoints: outcome.final ? outcome.final.earnedPoints : null,
		finalScorePercentage: outcome.final ? outcome.final.scorePercentage : null,
		finalPassed: outcome.final ? outcome.final.passed : null,
		autoTotalPoints: outcome.autoTotalPoints,
	}
}
