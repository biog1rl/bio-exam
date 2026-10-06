import {
	computeAttemptOutcome,
	findAnswerViolation,
	MatchingPairsSchema,
	OptionSchema,
	scoreQuestionFacts,
	type AnswerValue,
	type AnswerViolation,
	type AttemptOutcome,
	type QuestionContent,
	type ScoredQuestionFact,
} from '@bio-exam/exam-core'

import { and, asc, eq, inArray } from 'drizzle-orm'

import { db } from '../../db/index.js'
import { answerKeys, questions } from '../../db/schema.js'
import { logger } from '../../lib/logger.js'
import { mapBounded } from '../../lib/map-bounded.js'
import { getQuestionTypeMapForTest } from '../../lib/tests/question-type-resolver.js'
import { PROMPT_READ_CONCURRENCY } from '../question-content/index.js'
import { toStorableFact } from './storable-fact.js'

export type ExplanationReader = (question: { id: string; explanationPath: string | null }) => Promise<string | null>

export type ScoreSubmissionParams = {
	testId: string
	answers: Record<string, AnswerValue>
	passingScore: number | null
	readExplanation: ExplanationReader
}

export type ScoreSubmissionResult =
	| {
			ok: true
			facts: ScoredQuestionFact[]
			outcome: AttemptOutcome
			passingScore: number | null
			earnedPoints: number
			totalPoints: number
			scorePercentage: number
			passed: boolean
	  }
	| { ok: false; reason: 'no_questions' }
	| { ok: false; reason: 'answers_invalid'; violation: AnswerViolation }

export function readContent(row: { options: unknown; matchingPairs: unknown }): QuestionContent {
	const options = OptionSchema.array().safeParse(row.options)
	const matchingPairs = MatchingPairsSchema.safeParse(row.matchingPairs)
	return {
		options: options.success ? options.data : [],
		matchingPairs: matchingPairs.success ? matchingPairs.data : null,
	}
}

export async function scoreSubmission(params: ScoreSubmissionParams): Promise<ScoreSubmissionResult> {
	const { testId, answers, passingScore, readExplanation } = params

	const questionRows = await db
		.select({
			id: questions.id,
			type: questions.type,
			points: questions.points,
			options: questions.options,
			matchingPairs: questions.matchingPairs,
			explanationPath: questions.explanationPath,
		})
		.from(questions)
		.where(eq(questions.testId, testId))
		.orderBy(asc(questions.order))
	if (questionRows.length === 0) return { ok: false, reason: 'no_questions' }

	const questionTypesMap = await getQuestionTypeMapForTest({ testId, includeInactive: true })
	const violation = findAnswerViolation({
		answers,
		questions: questionRows.map((q) => ({ id: q.id, template: questionTypesMap[q.type]?.uiTemplate ?? null })),
	})
	if (violation) return { ok: false, reason: 'answers_invalid', violation }

	const keyRows = await db
		.select({
			questionId: answerKeys.questionId,
			correctAnswer: answerKeys.correctAnswer,
			version: answerKeys.version,
		})
		.from(answerKeys)
		.where(
			and(
				inArray(
					answerKeys.questionId,
					questionRows.map((q) => q.id)
				),
				eq(answerKeys.isActive, true)
			)
		)
	const keys = new Map(keyRows.map((row) => [row.questionId, row]))

	const warn = (info: Parameters<Parameters<typeof toStorableFact>[1]>[0]) =>
		logger.warn({ testId, ...info }, 'scored fact failed schema')

	const explanations = await mapBounded(questionRows, PROMPT_READ_CONCURRENCY, (q) =>
		q.explanationPath ? readExplanation({ id: q.id, explanationPath: q.explanationPath }) : Promise.resolve(null)
	)

	const facts: ScoredQuestionFact[] = []

	for (const [index, q] of questionRows.entries()) {
		const typeConfig = questionTypesMap[q.type]!
		const keyRow = keys.get(q.id)
		const rawKey = keyRow?.correctAnswer ?? null
		const userAnswer = answers[q.id] ?? null
		const scored = scoreQuestionFacts({
			typeConfig,
			rawKey,
			userAnswer,
			fallbackMaxPoints: Number(q.points ?? 0),
			content: readContent(q),
		})

		const explanationText = explanations[index] ?? null

		facts.push(
			toStorableFact(
				{
					questionId: q.id,
					template: scored.template,
					metric: scored.metric,
					points: scored.points,
					earnedPoints: scored.earnedPoints,
					isCorrect: scored.isCorrect,
					mistakes: scored.mistakes,
					key: scored.key,
					keyVersion: rawKey == null ? null : (keyRow?.version ?? null),
					verdicts: scored.verdicts,
					userAnswer,
					explanationText,
				},
				warn
			)
		)
	}

	const outcome = computeAttemptOutcome({ facts, finalScores: new Map(), passingScore })
	const { earnedPoints, totalPoints, scorePercentage, passed } = outcome.submitted

	return { ok: true, facts, outcome, passingScore, earnedPoints, totalPoints, scorePercentage, passed }
}
