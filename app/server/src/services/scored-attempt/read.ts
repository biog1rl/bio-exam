import {
	AdminAttemptViewSchema,
	AttemptFactsSchema,
	LegacyAttemptResultsSchema,
	type AdminAttemptView,
	type AttemptView,
	type LegacyAttemptResultItem,
	type OutcomeFact,
	type ReviewStatus,
	type ScoredQuestionFact,
} from '@bio-exam/exam-core'

import { eq } from 'drizzle-orm'

import { db } from '../../db/index.js'
import { testAttempts } from '../../db/schema.js'
import { attemptResultColumns } from './columns.js'
import { readLegacyFacts } from './legacy.js'
import { buildAttemptView, type AttemptSummary, type AttemptViewer, type ReadableFact } from './view.js'

export class AttemptResultsShapeError extends Error {
	constructor(readonly attemptId: string | null) {
		super(`attempt ${attemptId ?? 'unknown'}: results do not match the schema of their version`)
		this.name = 'AttemptResultsShapeError'
	}
}

type ParsedResults = { version: 2; facts: ScoredQuestionFact[] } | { version: 1; items: LegacyAttemptResultItem[] }

function parseResults(results: unknown, resultsVersion: number): ParsedResults {
	if (resultsVersion === 2) return { version: 2, facts: AttemptFactsSchema.parse(results) }
	if (resultsVersion === 1) return { version: 1, items: LegacyAttemptResultsSchema.parse(results) }
	throw new Error(`unknown results version ${resultsVersion}`)
}

function readableFromStored(fact: ScoredQuestionFact): ReadableFact {
	return {
		questionId: fact.questionId,
		template: fact.template,
		points: fact.points,
		earnedPoints: fact.earnedPoints,
		isCorrect: fact.isCorrect,
		userAnswer: fact.userAnswer,
		explanationText: fact.explanationText,
		key: fact.key,
		verdicts: fact.verdicts,
		mistakes: fact.mistakes,
	}
}

export async function readFacts(row: {
	attemptId: string
	testId: string
	results: unknown
	resultsVersion: number
}): Promise<ReadableFact[]> {
	let parsed: ParsedResults
	try {
		parsed = parseResults(row.results, row.resultsVersion)
	} catch {
		throw new AttemptResultsShapeError(row.attemptId)
	}
	if (parsed.version === 2) return parsed.facts.map(readableFromStored)
	return readLegacyFacts({ attemptId: row.attemptId, testId: row.testId, items: parsed.items })
}

export function readOutcomeFacts(row: { attemptId: string; results: unknown; resultsVersion: number }): OutcomeFact[] {
	let parsed: ParsedResults
	try {
		parsed = parseResults(row.results, row.resultsVersion)
	} catch {
		throw new AttemptResultsShapeError(row.attemptId)
	}
	if (parsed.version === 2) {
		return parsed.facts.map((fact) => ({
			questionId: fact.questionId,
			template: fact.template,
			points: fact.points,
			earnedPoints: fact.earnedPoints,
		}))
	}
	return parsed.items.map((item) => ({
		questionId: item.questionId,
		points: item.points,
		earnedPoints: item.earnedPoints,
	}))
}

async function readAttemptRow(attemptId: string) {
	const [row] = await db
		.select({
			id: testAttempts.id,
			testId: testAttempts.testId,
			userId: testAttempts.userId,
			answers: testAttempts.answers,
			submittedAt: testAttempts.submittedAt,
			...attemptResultColumns,
			results: testAttempts.results,
			resultsVersion: testAttempts.resultsVersion,
			telemetry: testAttempts.telemetry,
		})
		.from(testAttempts)
		.where(eq(testAttempts.id, attemptId))
		.limit(1)
	return row ?? null
}

type AttemptRow = NonNullable<Awaited<ReturnType<typeof readAttemptRow>>>

function summaryOf(row: AttemptRow): AttemptSummary {
	return {
		id: row.id,
		submittedAt: row.submittedAt.toISOString(),
		reviewStatus: row.reviewStatus as ReviewStatus,
		earnedPoints: row.earnedPoints,
		totalPoints: row.totalPoints,
		scorePercentage: row.scorePercentage,
		passed: row.passed,
		autoEarnedPoints: row.autoEarnedPoints,
		autoTotalPoints: row.autoTotalPoints,
	}
}

async function factsOf(row: AttemptRow): Promise<ReadableFact[]> {
	return readFacts({ attemptId: row.id, testId: row.testId, results: row.results, resultsVersion: row.resultsVersion })
}

export async function readAttemptView(attemptId: string, viewer: AttemptViewer): Promise<AttemptView> {
	const row = await readAttemptRow(attemptId)
	if (!row) throw new Error(`readAttemptView: attempt ${attemptId} not found`)
	return buildAttemptView({ attempt: summaryOf(row), facts: await factsOf(row), viewer })
}

export async function readAdminAttemptView(attemptId: string): Promise<AdminAttemptView | null> {
	const row = await readAttemptRow(attemptId)
	if (!row) return null
	const view = buildAttemptView({ attempt: summaryOf(row), facts: await factsOf(row), viewer: { kind: 'admin' } })
	return AdminAttemptViewSchema.parse({
		...view,
		testId: row.testId,
		userId: row.userId,
		answers: row.answers,
		telemetry: row.telemetry ?? null,
	})
}
