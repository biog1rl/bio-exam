import { AttemptSessionSchema } from '@bio-exam/exam-core'

import assert from 'node:assert/strict'
import { afterAll, beforeAll, describe, test } from 'vitest'

import {
	addQuestion,
	assignTest,
	createAttemptTest,
	seedAttemptWorld,
	seedStudent,
	startSession,
	type AttemptWorld,
} from '../../test-support/attempt-world.js'
import { startAuthApp, type AuthApp } from '../../test-support/auth-app.js'

type Student = { id: string; cookie: string }

let ctx: AuthApp
let world: AttemptWorld
let student: Student

beforeAll(async () => {
	ctx = await startAuthApp('test_attempt_deadline', { env: { PG_POOL_MAX: '12' } })
	world = await seedAttemptWorld(ctx, 'deadline')
	student = await seedStudent(world, 'deadline_student')
}, 60_000)

afterAll(async () => {
	await ctx?.stop()
})

async function databaseNowMs(): Promise<number> {
	const result = await ctx.pgPool.query<{ now: Date }>('SELECT clock_timestamp() AS now')
	return result.rows[0]!.now.getTime()
}

describe('serverNow у /start', () => {
	test('новая и повторно открытая сессия несут время базы, тело проходит AttemptSessionSchema', async () => {
		const testId = await createAttemptTest(world, { slug: 'deadline-server-now', timeLimitMinutes: 30 })
		await addQuestion(world, testId, 'radio')
		await assignTest(world, testId, student.id)

		for (const attempt of ['first', 'repeat']) {
			const reply = await startSession(world, student.cookie, testId)
			assert.equal(reply.status, 200, `${attempt}: ${JSON.stringify(reply.body)}`)
			const serverNow = reply.body.serverNow
			assert.equal(typeof serverNow, 'string', attempt)
			const parsed = Date.parse(serverNow as string)
			assert.ok(!Number.isNaN(parsed), attempt)
			assert.ok(Math.abs((await databaseNowMs()) - parsed) <= 5000, attempt)
			assert.equal(AttemptSessionSchema.safeParse(reply.body).success, true, attempt)
		}
	})
})
