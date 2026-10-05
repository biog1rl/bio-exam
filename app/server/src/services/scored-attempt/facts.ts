import {
	MatchingPairsSchema,
	OptionSchema,
	scoreQuestionFacts,
	type AnswerValue,
	type QuestionContent,
	type ScoredQuestionFact,
} from '@bio-exam/exam-core'

import { and, asc, eq, inArray } from 'drizzle-orm'

import { db } from '../../db/index.js'
import { answerKeys, questions } from '../../db/schema.js'
import { logger } from '../../lib/logger.js'
import { getQuestionTypeMapForTest } from '../../lib/tests/question-type-resolver.js'
import { mapBounded, PROMPT_READ_CONCURRENCY } from '../question-content/index.js'
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
			earnedPoints: number
			totalPoints: number
			scorePercentage: number
			passed: boolean
	  }
	| { ok: false; reason: 'no_questions' }
	| { ok: false; reason: 'type_not_configured'; type: string }

function readContent(row: { options: unknown; matchingPairs: unknown }): QuestionContent {
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
	for (const q of questionRows) {
		if (!questionTypesMap[q.type]) return { ok: false, reason: 'type_not_configured', type: q.type }
	}

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

	let totalPoints = 0
	let earnedPoints = 0
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

		totalPoints += scored.points
		earnedPoints += scored.earnedPoints

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

	const scorePercentage = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0
	const passed = passingScore == null ? true : scorePercentage >= Number(passingScore)

	return { ok: true, facts, earnedPoints, totalPoints, scorePercentage, passed }
}
