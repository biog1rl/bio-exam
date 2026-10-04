import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { afterAll, beforeAll, describe, test } from 'vitest'

import {
	addQuestion,
	adminReview,
	assignTest,
	ATTEMPT_QUESTIONS,
	countRows,
	createAttemptTest,
	insertOpenSession,
	saveDraft,
	seedAttemptWorld,
	seedStudent,
	startSession,
	submitAttempt,
	type AttemptWorld,
} from '../../test-support/attempt-world.js'
import { call, startAuthApp, type AuthApp } from '../../test-support/auth-app.js'

const KNOWN_DEFECTS = new Set<string>([
	'ATT-01-unassigned-start',
	'ATT-01-unassigned-patch',
	'ATT-01-unassigned-submit',
	'ATT-02-expired-restart',
	'ATT-02-no-session',
	'ATT-04-double-attempt',
	'SCORE-03-d1-key-change',
])

type Student = { id: string; cookie: string }

let ctx: AuthApp
let world: AttemptWorld
let student: Student
let stranger: Student

function defectTest(id: string, title: string, fn: () => Promise<void>): void {
	const name = `${id}: ${title}`
	if (KNOWN_DEFECTS.has(id)) test.fails(name, fn)
	else test(name, fn)
}

async function sessionsOf(testId: string, userId: string): Promise<number> {
	return countRows(world, 'SELECT count(*)::int AS count FROM test_sessions WHERE test_id = $1 AND user_id = $2', [
		testId,
		userId,
	])
}

async function attemptsOf(testId: string, userId: string): Promise<number> {
	return countRows(world, 'SELECT count(*)::int AS count FROM test_attempts WHERE test_id = $1 AND user_id = $2', [
		testId,
		userId,
	])
}

async function prepareAssignedRadio(slug: string, options: { timeLimitMinutes?: number | null } = {}) {
	const testId = await createAttemptTest(world, { slug, timeLimitMinutes: options.timeLimitMinutes ?? null })
	const questionId = await addQuestion(world, testId, 'radio')
	await assignTest(world, testId, student.id)
	return { testId, questionId }
}

beforeAll(async () => {
	ctx = await startAuthApp('test_attempt_defects')
	world = await seedAttemptWorld(ctx, 'defects')
	student = await seedStudent(world, 'defects_student')
	stranger = await seedStudent(world, 'defects_stranger')
}, 60_000)

afterAll(async () => {
	await ctx?.stop()
})

describe('ATT-01: доступ к попытке неназначенного пользователя', () => {
	test('подготовка ATT-01-unassigned-start: назначенный студент получает 200 на /start', async () => {
		const { testId } = await prepareAssignedRadio('att01-start-ok')
		const reply = await startSession(world, student.cookie, testId)
		assert.equal(reply.status, 200)
		assert.equal(typeof reply.body.sessionId, 'string')
		assert.equal(await sessionsOf(testId, student.id), 1)
	})

	defectTest(
		'ATT-01-unassigned-start',
		'неназначенный пользователь получает 403 на /start и сессия не создаётся',
		async () => {
			const { testId } = await prepareAssignedRadio('att01-start')
			const reply = await startSession(world, stranger.cookie, testId)
			assert.equal(reply.status, 403)
			assert.equal(await sessionsOf(testId, stranger.id), 0)
		}
	)
})

describe('ATT-01: черновик и отправка неназначенного пользователя', () => {
	test('подготовка ATT-01-unassigned-patch: назначенный студент сохраняет черновик в свою сессию', async () => {
		const { testId, questionId } = await prepareAssignedRadio('att01-patch-ok')
		const started = await startSession(world, student.cookie, testId)
		assert.equal(started.status, 200)
		const reply = await saveDraft(world, student.cookie, testId, started.body.sessionId as string, {
			questionId,
			value: 'a',
		})
		assert.equal(reply.status, 200)
	})

	defectTest(
		'ATT-01-unassigned-patch',
		'неназначенный пользователь получает 403 на PATCH черновика и черновик не пишется',
		async () => {
			const { testId, questionId } = await prepareAssignedRadio('att01-patch')
			const sessionId = await insertOpenSession(world, testId, stranger.id)
			const reply = await saveDraft(world, stranger.cookie, testId, sessionId, { questionId, value: 'a' })
			assert.equal(reply.status, 403)
			assert.equal(
				await countRows(
					world,
					'SELECT count(*)::int AS count FROM test_sessions WHERE id = $1 AND draft_answers IS NULL',
					[sessionId]
				),
				1
			)
		}
	)

	test('подготовка ATT-01-unassigned-submit: назначенный студент отправляет попытку', async () => {
		const { testId, questionId } = await prepareAssignedRadio('att01-submit-ok')
		const started = await startSession(world, student.cookie, testId)
		assert.equal(started.status, 200)
		const reply = await submitAttempt(world, student.cookie, testId, {
			sessionId: started.body.sessionId,
			clientAttemptId: crypto.randomUUID(),
			answers: { [questionId]: 'b' },
		})
		assert.equal(reply.status, 200)
		assert.equal(await attemptsOf(testId, student.id), 1)
	})

	defectTest(
		'ATT-01-unassigned-submit',
		'неназначенный пользователь получает 403 на submit и попытка не пишется',
		async () => {
			const { testId, questionId } = await prepareAssignedRadio('att01-submit')
			const sessionId = await insertOpenSession(world, testId, stranger.id)
			const reply = await submitAttempt(world, stranger.cookie, testId, {
				sessionId,
				clientAttemptId: crypto.randomUUID(),
				answers: { [questionId]: 'b' },
			})
			assert.equal(reply.status, 403)
			assert.equal(await attemptsOf(testId, stranger.id), 0)
		}
	)
})

describe('ATT-02: сессия с лимитом времени', () => {
	async function startExpiredSession(slug: string) {
		const { testId } = await prepareAssignedRadio(slug, { timeLimitMinutes: 10 })
		const first = await startSession(world, student.cookie, testId)
		assert.equal(first.status, 200)
		const firstSessionId = first.body.sessionId as string
		assert.equal(
			await countRows(world, 'SELECT count(*)::int AS count FROM test_sessions WHERE id = $1', [firstSessionId]),
			1
		)
		await ctx.pgPool.query("UPDATE test_sessions SET started_at = now() - interval '13 minutes' WHERE id = $1", [
			firstSessionId,
		])
		return { testId, firstSessionId }
	}

	test('подготовка ATT-02-expired-restart: первый /start отдаёт 200 и создаёт сессию', async () => {
		await startExpiredSession('att02-restart-ok')
	})

	defectTest('ATT-02-expired-restart', 'после просрочки /start открывает новую сессию', async () => {
		const { testId, firstSessionId } = await startExpiredSession('att02-restart')
		const second = await startSession(world, student.cookie, testId)
		assert.equal(second.status, 200)
		assert.notEqual(second.body.sessionId, firstSessionId)
	})

	test('подготовка ATT-02-no-session: назначенный студент читает тест с лимитом', async () => {
		const { testId } = await prepareAssignedRadio('att02-nosession-ok', { timeLimitMinutes: 10 })
		const reply = await call(ctx, 'GET', `/api/tests/public/tests/${testId}`, { cookies: student.cookie })
		assert.equal(reply.status, 200)
	})

	defectTest(
		'ATT-02-no-session',
		'submit теста с лимитом без открытой сессии получает 404 и попытка не пишется',
		async () => {
			const { testId, questionId } = await prepareAssignedRadio('att02-nosession', { timeLimitMinutes: 10 })
			const reply = await submitAttempt(world, student.cookie, testId, {
				sessionId: crypto.randomUUID(),
				clientAttemptId: crypto.randomUUID(),
				answers: { [questionId]: 'b' },
			})
			assert.equal(reply.status, 404)
			assert.equal(await attemptsOf(testId, student.id), 0)
		}
	)
})

describe('ATT-04: вторая попытка в той же сессии', () => {
	async function submitFirst(slug: string) {
		const { testId, questionId } = await prepareAssignedRadio(slug)
		const started = await startSession(world, student.cookie, testId)
		assert.equal(started.status, 200)
		const sessionId = started.body.sessionId as string
		const first = await submitAttempt(world, student.cookie, testId, {
			sessionId,
			clientAttemptId: crypto.randomUUID(),
			answers: { [questionId]: 'b' },
		})
		assert.equal(first.status, 200)
		assert.equal(typeof first.body.attemptId, 'string')
		return { testId, questionId, sessionId, firstAttemptId: first.body.attemptId as string }
	}

	test('подготовка ATT-04-double-attempt: первая отправка сессии отдаёт 200', async () => {
		const { testId } = await submitFirst('att04-double-ok')
		assert.equal(await attemptsOf(testId, student.id), 1)
	})

	defectTest(
		'ATT-04-double-attempt',
		'вторая отправка той же сессии с другим clientAttemptId получает 409',
		async () => {
			const { testId, questionId, sessionId, firstAttemptId } = await submitFirst('att04-double')
			const second = await submitAttempt(world, student.cookie, testId, {
				sessionId,
				clientAttemptId: crypto.randomUUID(),
				answers: { [questionId]: 'a' },
			})
			assert.equal(second.status, 409)
			assert.equal(second.body.error, 'ATTEMPT_ALREADY_SUBMITTED')
			assert.equal(second.body.attemptId, firstAttemptId)
			assert.equal(await attemptsOf(testId, student.id), 1)
		}
	)
})

describe('SCORE-03: разбор администратора после правки ключа', () => {
	async function reviewAndChangeKey(slug: string) {
		const testId = await createAttemptTest(world, { slug, showCorrectAnswer: true })
		const questionId = await addQuestion(world, testId, 'radio')
		await assignTest(world, testId, student.id)
		const started = await startSession(world, student.cookie, testId)
		assert.equal(started.status, 200)
		const submitted = await submitAttempt(world, student.cookie, testId, {
			sessionId: started.body.sessionId,
			clientAttemptId: crypto.randomUUID(),
			answers: { [questionId]: 'b' },
		})
		assert.equal(submitted.status, 200)
		const attemptId = submitted.body.attemptId as string
		const before = await adminReview(world, attemptId)
		assert.equal(before.status, 200)
		const patched = await call(ctx, 'PATCH', `/api/tests/${testId}/questions/${questionId}`, {
			cookies: world.adminCookie,
			body: { ...ATTEMPT_QUESTIONS.radio, correct: 'a' },
		})
		assert.equal(patched.status, 200)
		return { questionId, attemptId, before }
	}

	test('подготовка SCORE-03-d1-key-change: разбор 200, правка ключа 200 и активная версия 2 со значением a', async () => {
		const { questionId } = await reviewAndChangeKey('score03-key-ok')
		const keys = await ctx.pgPool.query<{ version: number; correct_answer: unknown }>(
			'SELECT version, correct_answer FROM answer_keys WHERE question_id = $1 AND is_active',
			[questionId]
		)
		assert.deepEqual(keys.rows, [{ version: 2, correct_answer: 'a' }])
	})

	defectTest('SCORE-03-d1-key-change', 'разбор администратора не меняется после правки ключа', async () => {
		const { attemptId, before } = await reviewAndChangeKey('score03-key')
		const after = await adminReview(world, attemptId)
		assert.equal(after.status, 200)
		const beforeAttempt = before.body.attempt as Record<string, unknown>
		const afterAttempt = after.body.attempt as Record<string, unknown>
		assert.deepEqual(afterAttempt.results, beforeAttempt.results)
	})
})

describe('SCORE-02: повтор submit', () => {
	test('повтор submit с тем же clientAttemptId отдаёт то же тело и не раскрывает скрытый ключ', async () => {
		const testId = await createAttemptTest(world, { slug: 'score02-replay', showCorrectAnswer: false })
		const questionId = await addQuestion(world, testId, 'sequence')
		await assignTest(world, testId, student.id)
		const started = await startSession(world, student.cookie, testId)
		assert.equal(started.status, 200)
		const clientAttemptId = crypto.randomUUID()
		const body = { sessionId: started.body.sessionId, clientAttemptId, answers: { [questionId]: '2315' } }
		const first = await submitAttempt(world, student.cookie, testId, body)
		const second = await submitAttempt(world, student.cookie, testId, body)
		assert.equal(first.status, 200)
		assert.equal(second.status, 200)
		assert.deepEqual(second.body, first.body)
		assert.equal(JSON.stringify(first.body).includes('"2314"'), false)
		assert.equal(JSON.stringify(second.body).includes('"2314"'), false)
		assert.equal(
			await countRows(world, 'SELECT count(*)::int AS count FROM test_attempts WHERE client_attempt_id = $1', [
				clientAttemptId,
			]),
			1
		)
	})
})
