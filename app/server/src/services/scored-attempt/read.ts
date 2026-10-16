import {
	AdminAttemptViewSchema,
	AttemptFactsSchema,
	LegacyAttemptResultsSchema,
	type AdminAttemptView,
	type AttemptSubmitSource,
	type AttemptView,
	type LegacyAttemptResultItem,
	type OutcomeFact,
	type ReviewStatus,
	type ScoredQuestionFact,
} from '@bio-exam/exam-core'

import { eq, sql } from 'drizzle-orm'

import { db } from '../../db/index.js'
import { testAttempts } from '../../db/schema.js'
import { listAttemptAnswerPhotos } from '../answer-photos/attempt-photos.js'
import { attemptResultColumns } from './columns.js'
import { readLegacyFacts } from './legacy.js'
import type { DbTransaction } from './outcome.js'
import { reviewReady } from './review-ready.js'
import {
	buildAttemptView,
	type AttemptSummary,
	type AttemptViewer,
	type OpenAnswerContext,
	type OpenReviewRecord,
	type ReadableFact,
} from './view.js'

export type LoadAttemptReviews = (attemptId: string) => Promise<ReadonlyMap<string, OpenReviewRecord>>

export type AnsweredOutcomeFact = OutcomeFact & { userAnswer: unknown }

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

export function readOutcomeFacts(row: {
	attemptId: string
	results: unknown
	resultsVersion: number
}): AnsweredOutcomeFact[] {
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
			userAnswer: fact.userAnswer,
		}))
	}
	return parsed.items.map((item) => ({
		questionId: item.questionId,
		points: item.points,
		earnedPoints: item.earnedPoints,
		userAnswer: item.userAnswer,
	}))
}

export type LockedAttemptFacts = {
	id: string
	userId: string
	testId: string
	sessionId: string | null
	ready: boolean
	facts: AnsweredOutcomeFact[]
}

export async function lockAttemptFacts(tx: DbTransaction, attemptId: string): Promise<LockedAttemptFacts | null> {
	const [row] = await tx
		.select({
			id: testAttempts.id,
			userId: testAttempts.userId,
			testId: testAttempts.testId,
			sessionId: testAttempts.sessionId,
			results: testAttempts.results,
			resultsVersion: testAttempts.resultsVersion,
			ready: sql<boolean>`${reviewReady}`,
		})
		.from(testAttempts)
		.where(eq(testAttempts.id, attemptId))
		.for('update')
	if (!row) return null
	return {
		id: row.id,
		userId: row.userId,
		testId: row.testId,
		sessionId: row.sessionId,
		ready: row.ready,
		facts: readOutcomeFacts({ attemptId: row.id, results: row.results, resultsVersion: row.resultsVersion }),
	}
}

async function readAttemptRow(attemptId: string) {
	const [row] = await db
		.select({
			id: testAttempts.id,
			testId: testAttempts.testId,
			userId: testAttempts.userId,
			sessionId: testAttempts.sessionId,
			answers: testAttempts.answers,
			submittedAt: testAttempts.submittedAt,
			uploadClosesAt: testAttempts.uploadClosesAt,
			submitSource: testAttempts.submitSource,
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
		uploadClosesAt: row.uploadClosesAt?.toISOString() ?? null,
		submitSource: row.submitSource as AttemptSubmitSource,
	}
}

async function factsOf(row: AttemptRow): Promise<ReadableFact[]> {
	return readFacts({ attemptId: row.id, testId: row.testId, results: row.results, resultsVersion: row.resultsVersion })
}

const NO_OPEN_ANSWERS: OpenAnswerContext = { reviews: new Map(), photos: new Map() }

function openQuestionIdsOf(facts: ReadonlyArray<ReadableFact>): string[] {
	return facts.filter((fact) => fact.template === 'open').map((fact) => fact.questionId)
}

export async function readAttemptView(
	attemptId: string,
	viewer: AttemptViewer,
	loadReviews: LoadAttemptReviews
): Promise<AttemptView> {
	const row = await readAttemptRow(attemptId)
	if (!row) throw new Error(`readAttemptView: attempt ${attemptId} not found`)
	const facts = await factsOf(row)
	const open: OpenAnswerContext =
		viewer.kind === 'student' && row.reviewStatus === 'graded' && openQuestionIdsOf(facts).length > 0
			? { reviews: await loadReviews(row.id), photos: new Map() }
			: NO_OPEN_ANSWERS
	return buildAttemptView({ attempt: summaryOf(row), facts, viewer, open })
}

export async function readAdminAttemptView(
	attemptId: string,
	loadReviews: LoadAttemptReviews
): Promise<AdminAttemptView | null> {
	const row = await readAttemptRow(attemptId)
	if (!row) return null
	const facts = await factsOf(row)
	const openIds = openQuestionIdsOf(facts)
	const open: OpenAnswerContext =
		openIds.length === 0
			? NO_OPEN_ANSWERS
			: {
					reviews: await loadReviews(row.id),
					photos: await listAttemptAnswerPhotos({ attemptId: row.id, sessionId: row.sessionId, questionIds: openIds }),
				}
	const view = buildAttemptView({ attempt: summaryOf(row), facts, viewer: { kind: 'admin' }, open })
	return AdminAttemptViewSchema.parse({
		...view,
		testId: row.testId,
		userId: row.userId,
		answers: row.answers,
		telemetry: row.telemetry ?? null,
	})
}
