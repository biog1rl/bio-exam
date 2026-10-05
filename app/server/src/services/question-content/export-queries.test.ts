import assert from 'node:assert/strict'
import { afterAll, beforeAll, describe, test } from 'vitest'

import { instrumentPool, type PoolProbe } from '../../scripts/bench/probes.js'
import { call, login, seedUser, startAuthApp, type AuthApp, type CookieJar } from '../../test-support/auth-app.js'

type QuestionContentModule = typeof import('./index.js')
type ReferenceModule = typeof import('../../test-support/export-reference.js')

type Json = Record<string, unknown>

const PASSWORD = 'qcon-export-queries-password-1'
const MISSING_ID = '00000000-0000-4000-8000-000000000000'
const OPTIONS = [
	{ id: 'a', text: 'Хлоропласт' },
	{ id: 'b', text: 'Митохондрия' },
]

let ctx: AuthApp
let qc: QuestionContentModule
let reference: ReferenceModule
let probe: PoolProbe
let adminJar: CookieJar
let counter = 0

const fixture = { smallTest: '', largeTest: '', smallTopic: '', largeTopic: '' }

function nextSlug(name: string): string {
	counter += 1
	return `qcon-q-${name}-${counter}`
}

function questions(count: number): Json[] {
	return Array.from({ length: count }, (_, order) => ({
		type: 'radio',
		promptText: `Вопрос ${order + 1}`,
		explanationText: `Пояснение ${order + 1}`,
		options: OPTIONS,
		correct: 'b',
		points: 1,
		order,
	}))
}

async function createTopic(slug: string): Promise<string> {
	const reply = await call(ctx, 'POST', '/api/tests/topics', {
		cookies: adminJar,
		body: { slug, title: `Тема ${slug}` },
	})
	assert.equal(reply.status, 201, JSON.stringify(reply.body))
	return (reply.body.topic as Json).id as string
}

async function saveTest(topicId: string, count: number): Promise<string> {
	const slug = nextSlug('test')
	const reply = await call(ctx, 'POST', '/api/tests/save', {
		cookies: adminJar,
		body: { topicId, title: `Тест ${slug}`, slug, isPublished: true, questions: questions(count) },
	})
	assert.equal(reply.status, 201, JSON.stringify(reply.body))
	return (reply.body.test as Json).id as string
}

async function seedTopic(questionCounts: number[]): Promise<string> {
	const slug = nextSlug('topic')
	const topicId = await createTopic(slug)
	for (const count of questionCounts) await saveTest(topicId, count)
	return slug
}

async function queriesOf(run: () => Promise<unknown>): Promise<number> {
	probe.reset()
	await run()
	return probe.snapshot().queries
}

async function rejection(promise: Promise<unknown>): Promise<{ statusCode?: number; message?: string }> {
	try {
		await promise
	} catch (error) {
		return error as { statusCode?: number; message?: string }
	}
	assert.fail('expected rejection')
}

beforeAll(async () => {
	ctx = await startAuthApp('test_qcon_export_queries')
	await seedUser(ctx, { login: 'qcon_q_admin', roles: ['admin'], password: PASSWORD })
	const admin = await login(ctx, 'qcon_q_admin', PASSWORD)
	assert.equal(admin.status, 200)
	adminJar = admin.jar
	qc = await import('./index.js')
	reference = await import('../../test-support/export-reference.js')
	const smallTopicId = await createTopic(nextSlug('topic'))
	fixture.smallTest = await saveTest(smallTopicId, 3)
	fixture.largeTest = await saveTest(smallTopicId, 30)
	fixture.smallTopic = await seedTopic([1, 2])
	fixture.largeTopic = await seedTopic([1, 4, 2, 6, 3])
	probe = instrumentPool(ctx.pgPool)
}, 120_000)

afterAll(async () => {
	probe?.restore()
	await ctx?.stop()
})

describe('число запросов экспорта не зависит от числа тестов и вопросов', () => {
	test('prepareTestArchive: тест с 3 и с 30 вопросами — одинаковое число запросов', async () => {
		for (const withAnswers of [true, false]) {
			const small = await queriesOf(() => qc.prepareTestArchive({ testId: fixture.smallTest, withAnswers }))
			const large = await queriesOf(() => qc.prepareTestArchive({ testId: fixture.largeTest, withAnswers }))
			const smallBefore = await queriesOf(() =>
				reference.referenceBuildTestArchive({ testId: fixture.smallTest, withAnswers })
			)
			const largeBefore = await queriesOf(() =>
				reference.referenceBuildTestArchive({ testId: fixture.largeTest, withAnswers })
			)
			console.info(
				`export queries test withAnswers=${withAnswers}: before 3q=${smallBefore} 30q=${largeBefore}; after 3q=${small} 30q=${large}`
			)
			assert.equal(small, large)
			assert.ok(small > 0)
			assert.ok(small <= smallBefore)
		}
	})

	test('prepareTopicArchive: тема из 2 и из 5 тестов — одинаковое число запросов', async () => {
		for (const withAnswers of [true, false]) {
			const scope = { all: true as const }
			const small = await queriesOf(() => qc.prepareTopicArchive({ topicSlug: fixture.smallTopic, withAnswers, scope }))
			const large = await queriesOf(() => qc.prepareTopicArchive({ topicSlug: fixture.largeTopic, withAnswers, scope }))
			const smallBefore = await queriesOf(() =>
				reference.referenceBuildTopicArchive({ topicSlug: fixture.smallTopic, withAnswers, scope })
			)
			const largeBefore = await queriesOf(() =>
				reference.referenceBuildTopicArchive({ topicSlug: fixture.largeTopic, withAnswers, scope })
			)
			console.info(
				`export queries topic withAnswers=${withAnswers}: before 2t=${smallBefore} 5t=${largeBefore}; after 2t=${small} 5t=${large}`
			)
			assert.notEqual(smallBefore, largeBefore)
			assert.equal(small, large)
			assert.ok(small > 0)
		}
	})

	test('тема вне scope → 403 после одного запроса темы, до загрузки тестов и вопросов', async () => {
		let error: { statusCode?: number; message?: string } = {}
		const queries = await queriesOf(async () => {
			error = await rejection(
				qc.prepareTopicArchive({
					topicSlug: fixture.largeTopic,
					withAnswers: true,
					scope: { all: false, topicIds: [MISSING_ID] },
				})
			)
		})
		assert.equal(error.statusCode, 403)
		assert.equal(error.message, 'Forbidden')
		assert.equal(queries, 1)
	})

	test('нет темы или теста → 404', async () => {
		const topic = await rejection(
			qc.prepareTopicArchive({ topicSlug: 'qcon-q-no-such-topic', withAnswers: false, scope: { all: true } })
		)
		assert.equal(topic.statusCode, 404)
		const missingTest = await rejection(qc.prepareTestArchive({ testId: MISSING_ID, withAnswers: false }))
		assert.equal(missingTest.statusCode, 404)
	})
})
