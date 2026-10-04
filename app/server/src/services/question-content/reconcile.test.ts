import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, test, vi } from 'vitest'

import { call, login, seedUser, startAuthApp, type AuthApp, type CookieJar } from '../../test-support/auth-app.js'
import { memoryStorage } from '../../test-support/storage.js'
import type { MemoryStorageAdapter } from '../storage/adapters/memory.js'

type Json = Record<string, unknown>

type ReconcileModule = typeof import('./reconcile.js')

type Fixture = {
	topicSlug: string
	testSlug: string
	testId: string
	questionIds: string[]
	prefix: string
}

const PASSWORD = 'storage-reconcile-password-1'
const TOPIC_SLUG = 'storage-reconcile-topic'
const HOUR = 60 * 60 * 1000

const OPTIONS = [
	{ id: 'a', text: 'Клетка' },
	{ id: 'b', text: 'Ткань' },
]

let ctx: AuthApp
let mem: MemoryStorageAdapter
let adminJar: CookieJar
let rc: ReconcileModule
let topicId = ''
let slugCounter = 0

function radio(promptText: string, order: number, overrides: Json = {}): Json {
	return { type: 'radio', promptText, options: OPTIONS, correct: 'a', points: 1, order, ...overrides }
}

async function createFixture(name: string, questions: Json[]): Promise<Fixture> {
	slugCounter += 1
	const testSlug = `reconcile-${name}-${slugCounter}`
	const reply = await call(ctx, 'POST', '/api/tests/save', {
		cookies: adminJar,
		body: { topicId, title: `Тест ${testSlug}`, slug: testSlug, isPublished: true, questions },
	})
	assert.equal(reply.status, 201, JSON.stringify(reply.body))
	const testId = (reply.body.test as Json).id as string
	const { rows } = await ctx.pgPool.query<{ id: string }>(
		'SELECT id FROM questions WHERE test_id = $1 ORDER BY "order", id',
		[testId]
	)
	return {
		topicSlug: TOPIC_SLUG,
		testSlug,
		testId,
		questionIds: rows.map((row) => row.id),
		prefix: `topics/${TOPIC_SLUG}/${testSlug}`,
	}
}

function questionDir(fixture: Fixture, questionId: string): string {
	return `${fixture.prefix}/questions/${questionId}`
}

async function promptPathOf(questionId: string): Promise<string | null> {
	const { rows } = await ctx.pgPool.query<{ prompt_path: string | null }>(
		'SELECT prompt_path FROM questions WHERE id = $1',
		[questionId]
	)
	return rows[0]?.prompt_path ?? null
}

async function explanationPathOf(questionId: string): Promise<string | null> {
	const { rows } = await ctx.pgPool.query<{ explanation_path: string | null }>(
		'SELECT explanation_path FROM questions WHERE id = $1',
		[questionId]
	)
	return rows[0]?.explanation_path ?? null
}

function under(keys: string[], fixture: Fixture): string[] {
	return keys.filter((key) => key.startsWith(`${fixture.prefix}/`)).sort()
}

beforeAll(async () => {
	ctx = await startAuthApp('test_storage_reconcile')
	await seedUser(ctx, { login: 'storage_reconcile_admin', roles: ['admin'], password: PASSWORD })
	const admin = await login(ctx, 'storage_reconcile_admin', PASSWORD)
	assert.equal(admin.status, 200)
	adminJar = admin.jar
	mem = await memoryStorage()
	rc = await import('./reconcile.js')
	const topic = await call(ctx, 'POST', '/api/tests/topics', {
		cookies: adminJar,
		body: { slug: TOPIC_SLUG, title: 'Тема сверки хранилища' },
	})
	assert.equal(topic.status, 201)
	topicId = (topic.body.topic as Json).id as string
}, 60_000)

afterEach(() => {
	vi.restoreAllMocks()
	mem?.clearFailures()
})

afterAll(async () => {
	await ctx?.stop()
})

describe('отчёт сверки хранилища (D-27)', () => {
	test('сирота под questions/ попадает в orphans, указатель и кандидаты вопросов — нет', async () => {
		const fixture = await createFixture('orphans', [
			radio('Первый вопрос', 0, { explanationText: 'Пояснение' }),
			radio('Второй вопрос', 1),
		])
		const [first, second] = fixture.questionIds
		assert.ok(first && second)
		const pointer = await promptPathOf(first)
		const explanation = await explanationPathOf(first)
		assert.ok(pointer && explanation)
		const stale = `${questionDir(fixture, first)}/prompt-old.md`
		const foreign = `${fixture.prefix}/questions/${crypto.randomUUID()}/prompt.md`
		const legacyFirst = `${questionDir(fixture, first)}/prompt.md`
		const legacyExplanation = `${questionDir(fixture, second)}/explanation.md`
		const legacySecond = `${questionDir(fixture, second)}/prompt.md`
		mem.put(stale, 'старый промпт', 'text/markdown')
		mem.put(foreign, 'промпт удалённого вопроса', 'text/markdown')
		mem.put(legacyFirst, 'промпт по старому пути', 'text/markdown')
		mem.put(legacyExplanation, 'пояснение по старому пути', 'text/markdown')
		await ctx.pgPool.query('UPDATE questions SET prompt_path = NULL WHERE id = $1', [second])
		mem.put(legacySecond, 'промпт без указателя', 'text/markdown')

		const report = await rc.reconcileStorage({ minAgeMs: 0 })
		const orphans = under(report.orphans, fixture)
		assert.ok(orphans.includes(stale), orphans.join('\n'))
		assert.ok(orphans.includes(foreign), orphans.join('\n'))
		for (const kept of [pointer, explanation, legacyFirst, legacyExplanation, legacySecond]) {
			assert.ok(!orphans.includes(kept), kept)
		}
		assert.deepEqual(under(report.recentOrphans, fixture), [])
	})

	test('указатель на отсутствующий объект без найденного кандидата попадает в missingPointers', async () => {
		const fixture = await createFixture('missing', [radio('Первый вопрос', 0), radio('Второй вопрос', 1)])
		const [first, second] = fixture.questionIds
		assert.ok(first && second)
		const deadFirst = `${questionDir(fixture, first)}/prompt-000000000000.md`
		const deadSecond = `${questionDir(fixture, second)}/prompt-000000000000.md`
		await ctx.pgPool.query('UPDATE questions SET prompt_path = $1 WHERE id = $2', [deadFirst, first])
		await ctx.pgPool.query('UPDATE questions SET prompt_path = $1 WHERE id = $2', [deadSecond, second])
		mem.put(`${questionDir(fixture, second)}/prompt.md`, 'промпт по старому пути', 'text/markdown')

		const report = await rc.reconcileStorage()
		const own = report.missingPointers.filter((item) => item.key.startsWith(`${fixture.prefix}/`))
		assert.deepEqual(own, [{ questionId: first, kind: 'prompt', key: deadFirst }])
	})

	test('answer_keys.json и settings.json — в legacyJson, assets/ — только в счётчике', async () => {
		const fixture = await createFixture('legacy', [radio('Вопрос', 0)])
		const answerKeys = `${fixture.prefix}/answer_keys.json`
		const settings = `${fixture.prefix}/settings.json`
		const asset = `${fixture.prefix}/assets/a.png`
		const before = (await rc.reconcileStorage()).assetsCount
		mem.put(answerKeys, '{}', 'application/json')
		mem.put(settings, '{}', 'application/json')
		mem.put(asset, Buffer.from([1, 2, 3]), 'image/png')

		const report = await rc.reconcileStorage({ minAgeMs: 0 })
		assert.deepEqual(under(report.legacyJson, fixture), [answerKeys, settings])
		assert.equal(report.assetsCount, before + 1)
		for (const list of [report.orphans, report.recentOrphans, report.legacyJson, report.unknown]) {
			assert.ok(!list.includes(asset), asset)
		}
	})

	test('без флагов множество ключей хранилища не меняется', async () => {
		const fixture = await createFixture('report-only', [radio('Вопрос', 0)])
		const [questionId] = fixture.questionIds
		assert.ok(questionId)
		mem.put(`${questionDir(fixture, questionId)}/prompt-old.md`, 'старый промпт', 'text/markdown')
		mem.put(`${fixture.prefix}/answer_keys.json`, '{}', 'application/json')
		const before = mem.keys().sort()

		const report = await rc.reconcileStorage({ minAgeMs: 0 })
		assert.ok(report.orphans.length > 0)
		assert.ok(report.legacyJson.length > 0)
		assert.deepEqual(report.deleted, { orphans: [], legacyJson: [] })
		assert.deepEqual(mem.keys().sort(), before)
	})
})

describe('удаление по флагам (D-27, T-7-46)', () => {
	async function seedCategories(name: string) {
		const fixture = await createFixture(name, [radio('Вопрос', 0)])
		const [questionId] = fixture.questionIds
		assert.ok(questionId)
		const pointer = await promptPathOf(questionId)
		assert.ok(pointer)
		const keys = {
			pointer,
			orphan: `${questionDir(fixture, questionId)}/prompt-old.md`,
			answerKeys: `${fixture.prefix}/answer_keys.json`,
			settings: `${fixture.prefix}/settings.json`,
			asset: `${fixture.prefix}/assets/a.png`,
			nestedImage: `${questionDir(fixture, questionId)}/images/b.png`,
			testImage: `${fixture.prefix}/images/c.png`,
			image: `images/reconcile-${name}.webp`,
		}
		mem.put(keys.orphan, 'старый промпт', 'text/markdown')
		mem.put(keys.answerKeys, '{}', 'application/json')
		mem.put(keys.settings, '{}', 'application/json')
		mem.put(keys.asset, Buffer.from([1]), 'image/png')
		mem.put(keys.nestedImage, Buffer.from([2]), 'image/png')
		mem.put(keys.testImage, Buffer.from([3]), 'image/png')
		mem.put(keys.image, Buffer.from([4]), 'image/webp')
		return { fixture, keys }
	}

	function present(key: string): boolean {
		return mem.get(key) !== null
	}

	test('deleteOrphans удаляет только сирот', async () => {
		const { keys } = await seedCategories('delete-orphans')
		const report = await rc.reconcileStorage({ deleteOrphans: true, minAgeMs: 0 })
		assert.ok(report.deleted.orphans.includes(keys.orphan))
		assert.deepEqual(report.deleted.legacyJson, [])
		assert.equal(present(keys.orphan), false)
		for (const key of [keys.pointer, keys.answerKeys, keys.settings, keys.asset, keys.nestedImage, keys.testImage]) {
			assert.equal(present(key), true, key)
		}
		assert.equal(present(keys.image), true)
	})

	test('deleteLegacyJson удаляет только answer_keys.json и settings.json', async () => {
		const { keys } = await seedCategories('delete-json')
		const report = await rc.reconcileStorage({ deleteLegacyJson: true, minAgeMs: 0 })
		assert.ok(report.deleted.legacyJson.includes(keys.answerKeys))
		assert.ok(report.deleted.legacyJson.includes(keys.settings))
		assert.deepEqual(report.deleted.orphans, [])
		assert.equal(present(keys.answerKeys), false)
		assert.equal(present(keys.settings), false)
		for (const key of [keys.pointer, keys.orphan, keys.asset, keys.nestedImage, keys.testImage, keys.image]) {
			assert.equal(present(key), true, key)
		}
	})

	test('оба флага не трогают assets/ и images/', async () => {
		const { keys } = await seedCategories('delete-both')
		await rc.reconcileStorage({ deleteOrphans: true, deleteLegacyJson: true, minAgeMs: 0 })
		for (const key of [keys.pointer, keys.asset, keys.nestedImage, keys.testImage, keys.image]) {
			assert.equal(present(key), true, key)
		}
		for (const key of [keys.orphan, keys.answerKeys, keys.settings]) {
			assert.equal(present(key), false, key)
		}
	})

	test('свежая сирота моложе ORPHAN_MIN_AGE_MS не удаляется и идёт в recentOrphans, при minAgeMs 0 удаляется', async () => {
		assert.equal(rc.ORPHAN_MIN_AGE_MS, HOUR)
		const fixture = await createFixture('recent', [radio('Вопрос', 0)])
		const [questionId] = fixture.questionIds
		assert.ok(questionId)
		const fresh = await promptPathOf(questionId)
		assert.ok(fresh)
		await ctx.pgPool.query('UPDATE questions SET prompt_path = $1 WHERE id = $2', [
			`${questionDir(fixture, questionId)}/prompt-000000000000.md`,
			questionId,
		])

		const kept = await rc.reconcileStorage({ deleteOrphans: true })
		assert.ok(kept.recentOrphans.includes(fresh), kept.recentOrphans.join('\n'))
		assert.ok(!kept.orphans.includes(fresh))
		assert.ok(!kept.deleted.orphans.includes(fresh))
		assert.equal(present(fresh), true)

		const later = await rc.reconcileStorage({ deleteOrphans: true, now: () => Date.now() + 2 * HOUR })
		assert.ok(later.deleted.orphans.includes(fresh))
		assert.equal(present(fresh), false)
	})

	test('свежая сирота при minAgeMs 0 удаляется', async () => {
		const fixture = await createFixture('recent-zero', [radio('Вопрос', 0)])
		const [questionId] = fixture.questionIds
		assert.ok(questionId)
		const fresh = `${questionDir(fixture, questionId)}/prompt-${crypto.randomBytes(6).toString('hex')}.md`
		mem.put(fresh, 'правка без указателя', 'text/markdown')
		const report = await rc.reconcileStorage({ deleteOrphans: true, minAgeMs: 0 })
		assert.ok(report.deleted.orphans.includes(fresh))
		assert.equal(present(fresh), false)
	})

	test('объект, ставший указателем после первого чтения указателей, не удаляется (R6)', async () => {
		const fixture = await createFixture('reread', [radio('Вопрос', 0)])
		const [questionId] = fixture.questionIds
		assert.ok(questionId)
		const committed = `${questionDir(fixture, questionId)}/prompt-${crypto.randomBytes(6).toString('hex')}.md`
		mem.put(committed, 'правка, указатель которой ещё не записан', 'text/markdown')
		const original = mem.list.bind(mem)
		vi.spyOn(mem, 'list').mockImplementation(async (prefix, options) => {
			const result = await original(prefix, options)
			await ctx.pgPool.query('UPDATE questions SET prompt_path = $1 WHERE id = $2', [committed, questionId])
			return result
		})

		const report = await rc.reconcileStorage({ deleteOrphans: true, minAgeMs: 0 })
		assert.ok(report.orphans.includes(committed), report.orphans.join('\n'))
		assert.ok(!report.deleted.orphans.includes(committed))
		assert.equal(present(committed), true)
		assert.equal(await promptPathOf(questionId), committed)
	})
})
