import { mergeTelemetryMaps, type TelemetryMap } from '@bio-exam/exam-core'

import assert from 'node:assert/strict'
import { afterAll, beforeAll, describe, test } from 'vitest'

import {
	addQuestion,
	assignTest,
	countRows,
	createAttemptTest,
	saveDraft,
	seedAttemptWorld,
	seedStudent,
	startSession,
	type AttemptWorld,
} from '../../test-support/attempt-world.js'
import { startAuthApp, type AuthApp } from '../../test-support/auth-app.js'

type Student = { id: string; cookie: string }

const ROUNDS = 5
const PARALLEL_STARTS = 8
const DRAFT_QUESTIONS = 6
const TELEMETRY_PATCHES = 3
const VALUES = ['a', 'b', 'c']

let ctx: AuthApp
let world: AttemptWorld
let student: Student

async function openSessionsOf(testId: string, userId: string): Promise<number> {
	return countRows(
		world,
		'SELECT count(*)::int AS count FROM test_sessions WHERE test_id = $1 AND user_id = $2 AND submitted_at IS NULL AND closed_at IS NULL',
		[testId, userId]
	)
}

async function allSessionsOf(testId: string, userId: string): Promise<number> {
	return countRows(world, 'SELECT count(*)::int AS count FROM test_sessions WHERE test_id = $1 AND user_id = $2', [
		testId,
		userId,
	])
}

async function prepareTest(slug: string, options: { timeLimitMinutes?: number | null; questions?: number } = {}) {
	const testId = await createAttemptTest(world, { slug, timeLimitMinutes: options.timeLimitMinutes ?? null })
	const questionIds: string[] = []
	for (let i = 0; i < (options.questions ?? 1); i++) questionIds.push(await addQuestion(world, testId, 'radio'))
	await assignTest(world, testId, student.id)
	return { testId, questionIds }
}

async function parallelStarts(testId: string): Promise<string[]> {
	const replies = await Promise.all(
		Array.from({ length: PARALLEL_STARTS }, () => startSession(world, student.cookie, testId))
	)
	for (const reply of replies) assert.equal(reply.status, 200, JSON.stringify(reply.body))
	return replies.map((reply) => reply.body.sessionId as string)
}

function telemetryFor(questionIds: string[], patch: number): TelemetryMap {
	const map: TelemetryMap = {}
	questionIds.forEach((questionId, index) => {
		map[questionId] = {
			timeSpentMs: (((patch + index) % TELEMETRY_PATCHES) + 1) * 1000,
			focusLossCount: (patch + 2 * index) % TELEMETRY_PATCHES,
			visitCount: ((2 * patch + index) % TELEMETRY_PATCHES) + 1,
		}
	})
	return map
}

beforeAll(async () => {
	ctx = await startAuthApp('test_attempt_races', { env: { PG_POOL_MAX: '12' } })
	world = await seedAttemptWorld(ctx, 'races')
	student = await seedStudent(world, 'races_student')
}, 60_000)

afterAll(async () => {
	await ctx?.stop()
})

describe('гонки /start', () => {
	test('параллельные /start одной пары дают один sessionId и одну открытую сессию', async () => {
		for (let round = 0; round < ROUNDS; round++) {
			const { testId } = await prepareTest(`races-start-${round}`)
			const ids = await parallelStarts(testId)
			assert.equal(new Set(ids).size, 1, `round ${round}: ${ids.join(', ')}`)
			assert.equal(typeof ids[0], 'string')
			assert.equal(await openSessionsOf(testId, student.id), 1, `round ${round}`)
			assert.equal(await allSessionsOf(testId, student.id), 1, `round ${round}`)
		}
	})

	test('прямая вставка второй открытой сессии пары падает на уникальном индексе', async () => {
		const { testId } = await prepareTest('races-unique')
		const [sessionId] = await parallelStarts(testId)
		assert.equal(typeof sessionId, 'string')
		await assert.rejects(
			ctx.pgPool.query('INSERT INTO test_sessions (test_id, user_id) VALUES ($1, $2)', [testId, student.id]),
			(error: { code?: string }) => error.code === '23505'
		)
		assert.equal(await openSessionsOf(testId, student.id), 1)
	})

	test('параллельные /start поверх просроченной сессии дают одну новую сессию и закрывают прежнюю как expired', async () => {
		for (let round = 0; round < ROUNDS; round++) {
			const { testId } = await prepareTest(`races-expired-${round}`, { timeLimitMinutes: 10 })
			const first = await startSession(world, student.cookie, testId)
			assert.equal(first.status, 200)
			const firstId = first.body.sessionId as string
			await ctx.pgPool.query("UPDATE test_sessions SET started_at = now() - interval '13 minutes' WHERE id = $1", [
				firstId,
			])

			const ids = await parallelStarts(testId)
			assert.equal(new Set(ids).size, 1, `round ${round}: ${ids.join(', ')}`)
			assert.notEqual(ids[0], firstId)

			const closed = await ctx.pgPool.query<{ closed_at: Date | null; close_reason: string | null }>(
				'SELECT closed_at, close_reason FROM test_sessions WHERE id = $1',
				[firstId]
			)
			assert.notEqual(closed.rows[0]?.closed_at, null)
			assert.equal(closed.rows[0]?.close_reason, 'expired')
			assert.equal(await openSessionsOf(testId, student.id), 1, `round ${round}`)
			assert.equal(await allSessionsOf(testId, student.id), 2, `round ${round}`)
		}
	})
})

describe('гонки PATCH черновика', () => {
	test('параллельные PATCH ответов и телеметрии не теряют ни одного поля', async () => {
		for (let round = 0; round < ROUNDS; round++) {
			const { testId, questionIds } = await prepareTest(`races-draft-${round}`, { questions: DRAFT_QUESTIONS })
			const [sessionId] = await parallelStarts(testId)
			assert.equal(typeof sessionId, 'string')

			const answers = Object.fromEntries(
				questionIds.map((questionId, index) => [questionId, VALUES[index % VALUES.length]])
			)
			const telemetries = Array.from({ length: TELEMETRY_PATCHES }, (_, patch) => telemetryFor(questionIds, patch))

			const replies = await Promise.all([
				...questionIds.map((questionId) =>
					saveDraft(world, student.cookie, testId, sessionId!, { questionId, value: answers[questionId] })
				),
				...telemetries.map((telemetry) => saveDraft(world, student.cookie, testId, sessionId!, { telemetry })),
			])
			for (const reply of replies) assert.equal(reply.status, 200, JSON.stringify(reply.body))

			const stored = await ctx.pgPool.query<{
				draft_answers: Record<string, unknown> | null
				draft_telemetry: TelemetryMap | null
				draft_last_question_id: string | null
			}>('SELECT draft_answers, draft_telemetry, draft_last_question_id FROM test_sessions WHERE id = $1', [sessionId])
			const row = stored.rows[0]
			assert.ok(row)
			assert.deepEqual(row.draft_answers, answers, `round ${round}`)
			assert.deepEqual(row.draft_telemetry, mergeTelemetryMaps(...telemetries), `round ${round}`)
			assert.ok(row.draft_last_question_id && questionIds.includes(row.draft_last_question_id))
		}
	})
})
