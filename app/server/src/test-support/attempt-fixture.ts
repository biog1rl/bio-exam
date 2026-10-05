import {
	computeAttemptOutcome,
	defaultMistakeMetricForTemplate,
	projectionOf,
	type OutcomeFact,
	type QuestionUiTemplate,
	type ReviewStatus,
	type ScoredQuestionFact,
} from '@bio-exam/exam-core'

import type pg from 'pg'

export type Queryable = Pick<pg.Pool, 'query'>

export type AttemptFixtureFact = OutcomeFact & { template: QuestionUiTemplate }

type AttemptFixtureBase = {
	testId: string
	userId: string
	submittedAt?: string | Date
	answers?: unknown
	results?: unknown
	resultsVersion?: number
	sessionId?: string | null
	clientAttemptId?: string | null
}

export type AttemptFixtureFromFacts = AttemptFixtureBase & {
	earnedPoints: number
	totalPoints: number
	scorePercentage: number
	passed: boolean
	passingScore?: number | null
}

export type AttemptFixtureFromOutcome = AttemptFixtureBase & {
	outcomeFacts: AttemptFixtureFact[]
	finalScores?: ReadonlyMap<string, number>
	passingScore: number | null
}

export type AttemptFixtureInput = AttemptFixtureFromFacts | AttemptFixtureFromOutcome

type AttemptRow = {
	results: unknown
	resultsVersion: number
	earnedPoints: number
	totalPoints: number
	scorePercentage: number
	passed: boolean
	reviewStatus: ReviewStatus
	finalEarnedPoints: number | null
	finalScorePercentage: number | null
	finalPassed: boolean | null
	autoTotalPoints: number
	passingScore: number | null
	graded: boolean
}

function storedFactOf(fact: AttemptFixtureFact): ScoredQuestionFact {
	return {
		questionId: fact.questionId,
		template: fact.template,
		metric: defaultMistakeMetricForTemplate(fact.template),
		points: fact.points,
		earnedPoints: fact.earnedPoints,
		isCorrect: fact.earnedPoints === fact.points && fact.points > 0,
		mistakes: null,
		key: null,
		keyVersion: null,
		verdicts: null,
		userAnswer: null,
		explanationText: null,
	}
}

function rowOf(input: AttemptFixtureInput): AttemptRow {
	if ('outcomeFacts' in input) {
		const outcome = computeAttemptOutcome({
			facts: input.outcomeFacts,
			finalScores: input.finalScores ?? new Map(),
			passingScore: input.passingScore,
		})
		const projection = projectionOf(outcome)
		return {
			results: input.results ?? input.outcomeFacts.map(storedFactOf),
			resultsVersion: input.resultsVersion ?? 2,
			...outcome.submitted,
			...projection,
			passingScore: input.passingScore,
			graded: outcome.reviewStatus === 'graded',
		}
	}
	return {
		results: input.results ?? [],
		resultsVersion: input.resultsVersion ?? 1,
		earnedPoints: input.earnedPoints,
		totalPoints: input.totalPoints,
		scorePercentage: input.scorePercentage,
		passed: input.passed,
		reviewStatus: 'none',
		finalEarnedPoints: input.earnedPoints,
		finalScorePercentage: input.scorePercentage,
		finalPassed: input.passed,
		autoTotalPoints: input.totalPoints,
		passingScore: input.passingScore ?? null,
		graded: false,
	}
}

export async function insertAttemptFixture(executor: Queryable, input: AttemptFixtureInput): Promise<string> {
	const row = rowOf(input)
	const result = await executor.query<{ id: string }>(
		`INSERT INTO test_attempts (
			test_id, user_id, answers, results, results_version, earned_points, total_points, score_percentage, passed,
			review_status, final_earned_points, final_score_percentage, final_passed, auto_total_points, passing_score,
			graded_at, submit_source, submitted_at, session_id, client_attempt_id
		)
		VALUES (
			$1, $2, $3::jsonb, $4::jsonb, $5, $6, $7, $8, $9,
			$10, $11, $12, $13, $14, $15,
			CASE WHEN $16::boolean THEN now() ELSE NULL END, 'client', coalesce($17::timestamptz, now()), $18, $19
		)
		RETURNING id`,
		[
			input.testId,
			input.userId,
			JSON.stringify(input.answers ?? {}),
			JSON.stringify(row.results),
			row.resultsVersion,
			row.earnedPoints,
			row.totalPoints,
			row.scorePercentage,
			row.passed,
			row.reviewStatus,
			row.finalEarnedPoints,
			row.finalScorePercentage,
			row.finalPassed,
			row.autoTotalPoints,
			row.passingScore,
			row.graded,
			input.submittedAt ?? null,
			input.sessionId ?? null,
			input.clientAttemptId ?? null,
		]
	)
	const id = result.rows[0]?.id
	if (!id) throw new Error('insertAttemptFixture: attempt was not inserted')
	return id
}
