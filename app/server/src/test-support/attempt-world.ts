import assert from 'node:assert/strict'

import { call, seedUser, type AuthApp, type Reply } from './auth-app.js'
import { sessionCookieFor } from './http.js'

type Json = Record<string, unknown>

export type AttemptQuestionType = 'radio' | 'checkbox' | 'matching' | 'short_answer' | 'sequence'

const OPTIONS = [
	{ id: 'a', text: 'Митоз' },
	{ id: 'b', text: 'Мейоз' },
	{ id: 'c', text: 'Амитоз' },
]

const MATCHING_PAIRS = {
	left: [
		{ id: 'l1', text: 'Хлоропласт' },
		{ id: 'l2', text: 'Митохондрия' },
		{ id: 'l3', text: 'Рибосома' },
	],
	right: [
		{ id: 'r1', text: 'Фотосинтез' },
		{ id: 'r2', text: 'Дыхание' },
		{ id: 'r3', text: 'Синтез белка' },
	],
}

export const ATTEMPT_QUESTIONS: Record<AttemptQuestionType, Json> = {
	radio: {
		type: 'radio',
		promptText: 'Как делится половая клетка?',
		options: OPTIONS,
		correct: 'b',
		points: 1,
	},
	checkbox: {
		type: 'checkbox',
		promptText: 'Выберите способы деления соматической клетки',
		options: [...OPTIONS, { id: 'd', text: 'Эндомитоз' }],
		correct: ['a', 'c'],
		points: 1,
	},
	matching: {
		type: 'matching',
		promptText: 'Сопоставьте органоид и функцию',
		matchingPairs: MATCHING_PAIRS,
		correct: { l1: 'r1', l2: 'r2', l3: 'r3' },
		points: 1,
	},
	short_answer: {
		type: 'short_answer',
		promptText: 'Назовите деление соматической клетки',
		correct: 'Митоз',
		points: 1,
	},
	sequence: {
		type: 'sequence',
		promptText: 'Расположите стадии по порядку',
		correct: '2314',
		points: 1,
	},
}

export type AttemptWorld = {
	ctx: AuthApp
	topicId: string
	topicSlug: string
	adminId: string
	adminCookie: string
	password: string
}

export async function seedAttemptWorld(ctx: AuthApp, prefix: string): Promise<AttemptWorld> {
	const password = `${prefix}-password-1`
	const adminId = await seedUser(ctx, { login: `${prefix}_admin`, roles: ['admin'], password })
	const { db, schema } = ctx
	const [topic] = await db
		.insert(schema.topics)
		.values({ slug: `${prefix}-topic`, title: `Тема ${prefix}`, isActive: true })
		.returning({ id: schema.topics.id, slug: schema.topics.slug })
	assert.ok(topic, 'seedAttemptWorld: topic was not created')
	const adminCookie = await sessionCookieFor({ id: adminId })
	return { ctx, topicId: topic.id, topicSlug: topic.slug, adminId, adminCookie, password }
}

export async function seedStudent(
	world: AttemptWorld,
	login: string,
	options: { roles?: string[] } = {}
): Promise<{ id: string; cookie: string }> {
	const id = await seedUser(world.ctx, { login, roles: options.roles ?? ['user'], password: world.password })
	const cookie = await sessionCookieFor({ id, login })
	return { id, cookie }
}

export async function createAttemptTest(
	world: AttemptWorld,
	options: { slug: string; timeLimitMinutes?: number | null; showCorrectAnswer?: boolean; isPublished?: boolean }
): Promise<string> {
	const { db, schema } = world.ctx
	const [created] = await db
		.insert(schema.tests)
		.values({
			topicId: world.topicId,
			slug: options.slug,
			title: `Тест ${options.slug}`,
			isPublished: options.isPublished ?? true,
			showCorrectAnswer: options.showCorrectAnswer ?? true,
			timeLimitMinutes: options.timeLimitMinutes ?? null,
		})
		.returning({ id: schema.tests.id })
	assert.ok(created, `createAttemptTest: test ${options.slug} was not created`)
	return created.id
}

export async function addQuestion(
	world: AttemptWorld,
	testId: string,
	type: AttemptQuestionType,
	overrides: Json = {}
): Promise<string> {
	const reply = await call(world.ctx, 'POST', `/api/tests/${testId}/questions`, {
		cookies: world.adminCookie,
		body: { ...ATTEMPT_QUESTIONS[type], ...overrides },
	})
	assert.equal(reply.status, 201, `addQuestion ${type}: ${JSON.stringify(reply.body)}`)
	const questionId = reply.body.questionId
	assert.equal(typeof questionId, 'string', 'addQuestion: no questionId in reply')
	return questionId as string
}

export async function assignTest(world: AttemptWorld, testId: string, userId: string): Promise<void> {
	const { db, schema } = world.ctx
	await db.insert(schema.testAssignments).values({ testId, userId, assignedBy: world.adminId })
}

export async function insertOpenSession(world: AttemptWorld, testId: string, userId: string): Promise<string> {
	const { db, schema } = world.ctx
	const [session] = await db
		.insert(schema.testSessions)
		.values({ testId, userId })
		.returning({ id: schema.testSessions.id })
	assert.ok(session, 'insertOpenSession: session was not created')
	return session.id
}

export function startSession(world: AttemptWorld, cookie: string, testId: string): Promise<Reply> {
	return call(world.ctx, 'POST', `/api/tests/public/tests/${testId}/start`, { cookies: cookie })
}

export function saveDraft(
	world: AttemptWorld,
	cookie: string,
	testId: string,
	sessionId: string,
	body: Json
): Promise<Reply> {
	return call(world.ctx, 'PATCH', `/api/tests/public/tests/${testId}/sessions/${sessionId}/answers`, {
		cookies: cookie,
		body,
	})
}

export function submitAttempt(world: AttemptWorld, cookie: string, testId: string, body: Json): Promise<Reply> {
	return call(world.ctx, 'POST', `/api/tests/public/tests/${testId}/submit`, { cookies: cookie, body })
}

export function adminReview(world: AttemptWorld, attemptId: string): Promise<Reply> {
	return call(world.ctx, 'GET', `/api/tests/admin/attempts/${attemptId}`, { cookies: world.adminCookie })
}

export async function countRows(world: AttemptWorld, text: string, params: unknown[] = []): Promise<number> {
	const result = await world.ctx.pgPool.query<{ count: number | string }>(text, params)
	return Number(result.rows[0]?.count ?? 0)
}
