import { and, eq } from 'drizzle-orm'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { afterAll, beforeAll, describe, test } from 'vitest'

import {
	addQuestion,
	countRows,
	createAttemptTest,
	saveDraft,
	seedAttemptWorld,
	startSession,
	submitAttempt,
	type AttemptWorld,
} from '../../test-support/attempt-world.js'
import { cookieHeader, login, seedUser, startAuthApp, type AuthApp } from '../../test-support/auth-app.js'

let ctx: AuthApp
let world: AttemptWorld

beforeAll(async () => {
	ctx = await startAuthApp('test_attempt_revoke')
	world = await seedAttemptWorld(ctx, 'revoke')
}, 60_000)

afterAll(async () => {
	await ctx?.stop()
})

async function loginAs(userLogin: string): Promise<string> {
	const reply = await login(ctx, userLogin, world.password)
	assert.equal(reply.status, 200, `login ${userLogin}`)
	return cookieHeader(reply.jar)
}

async function startedAttempt(cookies: string, testId: string, questionId: string): Promise<string> {
	const started = await startSession(world, cookies, testId)
	assert.equal(started.status, 200, JSON.stringify(started.body))
	const sessionId = started.body.sessionId
	assert.equal(typeof sessionId, 'string')
	const saved = await saveDraft(world, cookies, testId, sessionId as string, { questionId, value: 'a' })
	assert.equal(saved.status, 200, `черновик до отзыва: ${JSON.stringify(saved.body)}`)
	return sessionId as string
}

async function assertBlockedAfterRevoke(
	cookies: string,
	testId: string,
	questionId: string,
	sessionId: string,
	userId: string
): Promise<void> {
	const patched = await saveDraft(world, cookies, testId, sessionId, { questionId, value: 'c' })
	assert.equal(patched.status, 403, `PATCH после отзыва: ${JSON.stringify(patched.body)}`)
	const submitted = await submitAttempt(world, cookies, testId, {
		sessionId,
		clientAttemptId: crypto.randomUUID(),
		answers: { [questionId]: 'b' },
	})
	assert.equal(submitted.status, 403, `submit после отзыва: ${JSON.stringify(submitted.body)}`)
	assert.equal(
		await countRows(world, 'SELECT count(*)::int AS count FROM test_attempts WHERE test_id = $1 AND user_id = $2', [
			testId,
			userId,
		]),
		0
	)
}

describe('ATT-01: доступ проверяется по текущей БД посреди попытки', () => {
	test('снятие назначения после /start: PATCH черновика и submit → 403, попытка не записана', async () => {
		const { db, schema } = ctx
		const testId = await createAttemptTest(world, { slug: 'revoke-assignment' })
		const questionId = await addQuestion(world, testId, 'radio')
		const userId = await seedUser(ctx, { login: 'revoke_student', roles: ['user'], password: world.password })
		await db.insert(schema.testAssignments).values({ testId, userId, assignedBy: world.adminId })
		const cookies = await loginAs('revoke_student')
		const sessionId = await startedAttempt(cookies, testId, questionId)

		await db
			.delete(schema.testAssignments)
			.where(and(eq(schema.testAssignments.testId, testId), eq(schema.testAssignments.userId, userId)))

		await assertBlockedAfterRevoke(cookies, testId, questionId, sessionId, userId)
	})

	test('отзыв права tests.read после /start: PATCH черновика и submit → 403, попытка не записана', async () => {
		const { db, schema } = ctx
		const testId = await createAttemptTest(world, { slug: 'revoke-grant' })
		const questionId = await addQuestion(world, testId, 'radio')
		const userId = await seedUser(ctx, { login: 'revoke_reader', roles: ['user'], password: world.password })
		await db.insert(schema.rbacUserGrants).values([
			{ userId, domain: 'tests', action: 'read', allow: true },
			{ userId, domain: 'zone', action: 'all', allow: true },
		])
		const cookies = await loginAs('revoke_reader')
		const sessionId = await startedAttempt(cookies, testId, questionId)

		await db
			.delete(schema.rbacUserGrants)
			.where(
				and(
					eq(schema.rbacUserGrants.userId, userId),
					eq(schema.rbacUserGrants.domain, 'tests'),
					eq(schema.rbacUserGrants.action, 'read')
				)
			)

		await assertBlockedAfterRevoke(cookies, testId, questionId, sessionId, userId)
	})

	test('явный запрет tests.read у админа после /start: PATCH черновика и submit → 403', async () => {
		const { db, schema } = ctx
		const testId = await createAttemptTest(world, { slug: 'revoke-admin-deny' })
		const questionId = await addQuestion(world, testId, 'radio')
		const userId = await seedUser(ctx, { login: 'revoke_staff_admin', roles: ['admin'], password: world.password })
		const cookies = await loginAs('revoke_staff_admin')
		const sessionId = await startedAttempt(cookies, testId, questionId)

		await db.insert(schema.rbacUserGrants).values({ userId, domain: 'tests', action: 'read', allow: false })

		await assertBlockedAfterRevoke(cookies, testId, questionId, sessionId, userId)
	})
})
